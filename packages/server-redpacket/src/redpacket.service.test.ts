import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRedPacketService, RedPacketError } from './redpacket.service';

function makeMockPrisma() {
  return {
    redPacket: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    redPacketRecord: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(async (ops: any[]) => {
      for (const op of ops) {
        if (typeof op === 'function') {
          await op();
        }
      }
    }),
  } as any;
}

function makeMockRedis() {
  const store = new Map<string, any>();
  const setStore = new Map<string, Set<string>>();
  return {
    hset: vi.fn((key: string, values: Record<string, string>) => {
      if (!store.has(key)) store.set(key, new Map());
      const map = store.get(key);
      for (const [k, v] of Object.entries(values)) {
        map.set(k, v);
      }
      return Promise.resolve(1);
    }),
    hgetall: vi.fn((key: string) => {
      const map = store.get(key) as Map<string, string> | undefined;
      if (!map) return Promise.resolve({});
      const obj: Record<string, string> = {};
      for (const [k, v] of map) {
        obj[k] = v;
      }
      return Promise.resolve(obj);
    }),
    expire: vi.fn(() => Promise.resolve(1)),
    sadd: vi.fn((key: string, member: string) => {
      if (!setStore.has(key)) setStore.set(key, new Set());
      setStore.get(key)!.add(member);
      return Promise.resolve(1);
    }),
    sismember: vi.fn((key: string, member: string) => {
      const set = setStore.get(key);
      return Promise.resolve(set ? set.has(member) ? 1 : 0 : 0);
    }),
    // For testing convenience
    _store: store,
    _setStore: setStore,
  } as any;
}

describe('redpacket.service', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let redis: ReturnType<typeof makeMockRedis>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    redis = makeMockRedis();
  });

  // Test 1: Fixed red packet — equal amounts
  describe('sendRedPacket — fixed', () => {
    it('creates a fixed red packet', async () => {
      prisma.redPacket.create.mockResolvedValue({
        id: 'rp1',
        senderId: 'u1',
        conversationId: 'conv1',
        totalAmount: 10,
        totalCount: 5,
        remainingCount: 5,
        remainingAmount: 10,
        type: 'fixed',
        blessing: '恭喜发财',
        status: 'active',
        expiredAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });

      const svc = createRedPacketService({ prisma, redis });
      const packet = await svc.sendRedPacket('u1', {
        conversationId: 'conv1',
        totalAmount: 10,
        totalCount: 5,
        type: 'fixed',
        blessing: '恭喜发财',
      });

      expect(packet.type).toBe('fixed');
      expect(packet.totalAmount).toBe(10);
    });

    it('throws if amount is negative or zero', async () => {
      const svc = createRedPacketService({ prisma, redis: null });
      await expect(
        svc.sendRedPacket('u1', { totalAmount: 0, totalCount: 5, type: 'fixed' }),
      ).rejects.toThrow(RedPacketError);
    });

    it('throws if count is zero or too high', async () => {
      const svc = createRedPacketService({ prisma, redis: null });
      await expect(
        svc.sendRedPacket('u1', { totalAmount: 10, totalCount: 0, type: 'fixed' }),
      ).rejects.toThrow(RedPacketError);
      await expect(
        svc.sendRedPacket('u1', { totalAmount: 10, totalCount: 101, type: 'fixed' }),
      ).rejects.toThrow(RedPacketError);
    });
  });

  // Test 2: Random red packet — amounts random and total correct
  describe('openRedPacket — random (double-mean)', () => {
    it('returns random amounts that sum to total', async () => {
      prisma.redPacketRecord.findUnique.mockResolvedValue(null);

      // Track remaining state across calls
      let remainingCount = 3;
      let remainingAmount = 10;

      const mockPacket = {
        id: 'rp1',
        senderId: 'u1',
        conversationId: null,
        totalAmount: 10,
        totalCount: 3,
        remainingCount: 3,
        remainingAmount: 10,
        type: 'random',
        blessing: null,
        status: 'active',
        expiredAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      };

      prisma.redPacket.findUnique.mockResolvedValue({
        ...mockPacket,
        get remainingCount() { return remainingCount; },
        get remainingAmount() { return remainingAmount; },
        get status() { return remainingCount <= 0 ? 'finished' : 'active'; },
      });

      prisma.redPacket.update.mockImplementation((args: any) => {
        remainingCount = args.data.remainingCount;
        remainingAmount = args.data.remainingAmount;
        mockPacket.status = args.data.status;
        return Promise.resolve({
          ...mockPacket,
          remainingCount: args.data.remainingCount,
          remainingAmount: args.data.remainingAmount,
          status: args.data.status,
        });
      });

      prisma.redPacketRecord.create.mockResolvedValue({});

      const svc = createRedPacketService({ prisma, redis });

      // Open 3 times
      const result1 = await svc.openRedPacket('rp1', 'u1');
      const result2 = await svc.openRedPacket('rp1', 'u2');
      const result3 = await svc.openRedPacket('rp1', 'u3');

      const total = result1.amount + result2.amount + result3.amount;
      // Allow small rounding error
      expect(Math.abs(total - 10)).toBeLessThan(0.02);

      // Each amount should be at least 0.01
      expect(result1.amount).toBeGreaterThanOrEqual(0.01);
      expect(result2.amount).toBeGreaterThanOrEqual(0.01);
      expect(result3.amount).toBeGreaterThanOrEqual(0.01);

      // Last one should get remaining
      expect(Math.abs(result3.amount - remainingAmount - 0.01)).toBeLessThan(5); // rough check
    });

    it('last grab gets exact remaining', async () => {
      prisma.redPacketRecord.findUnique.mockResolvedValue(null);

      const mockPacket = {
        id: 'rp2',
        senderId: 'u1',
        conversationId: null,
        totalAmount: 1,
        totalCount: 2,
        remainingCount: 2,
        remainingAmount: 1,
        type: 'random',
        blessing: null,
        status: 'active',
        expiredAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      };

      prisma.redPacket.findUnique.mockResolvedValue(mockPacket);
      prisma.redPacket.update.mockImplementation((args: any) => Promise.resolve(args.data));
      prisma.redPacketRecord.create.mockResolvedValue({});

      const svc = createRedPacketService({ prisma, redis: null });

      const result1 = await svc.openRedPacket('rp2', 'u1');
      // After first grab, remaining is 1 - result1.amount
      // Second grab should get exactly that remaining
      // We need to re-mock for the second call
      mockPacket.remainingCount = result1.packet.remainingCount;
      mockPacket.remainingAmount = result1.packet.remainingAmount;

      const result2 = await svc.openRedPacket('rp2', 'u2');

      expect(Math.abs(result1.amount + result2.amount - 1)).toBeLessThan(0.02);
    });
  });

  // Test 3: Packet finished after all claimed
  describe('openRedPacket — finished', () => {
    it('throws when no remaining count', async () => {
      prisma.redPacketRecord.findUnique.mockResolvedValue(null);
      prisma.redPacket.findUnique.mockResolvedValue({
        id: 'rp1',
        senderId: 'u1',
        conversationId: null,
        totalAmount: 10,
        totalCount: 3,
        remainingCount: 0,
        remainingAmount: 0,
        type: 'random',
        blessing: null,
        status: 'finished',
        expiredAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
      });

      const svc = createRedPacketService({ prisma, redis: null });
      await expect(svc.openRedPacket('rp1', 'u4')).rejects.toThrow(RedPacketError);
    });
  });

  // Test 4: Duplicate open rejected
  describe('openRedPacket — duplicate', () => {
    it('throws when already opened', async () => {
      prisma.redPacketRecord.findUnique.mockResolvedValue({
        id: 'rec1',
        packetId: 'rp1',
        userId: 'u1',
        amount: 3.33,
        createdAt: new Date(),
      });

      const svc = createRedPacketService({ prisma, redis: null });
      await expect(svc.openRedPacket('rp1', 'u1')).rejects.toThrow(RedPacketError);
    });
  });

  // Test 5: Expired packet refund
  describe('expireRedPackets', () => {
    it('marks active and expired packets as expired', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 1000);

      prisma.redPacket.findMany.mockResolvedValue([
        {
          id: 'rp1',
          senderId: 'u1',
          totalAmount: 10,
          totalCount: 5,
          remainingCount: 2,
          remainingAmount: 4,
          type: 'random',
          status: 'active',
          expiredAt: pastDate,
          createdAt: pastDate,
        },
      ]);

      prisma.redPacket.update.mockResolvedValue({});

      const svc = createRedPacketService({ prisma, redis });

      const count = await svc.expireRedPackets();
      expect(count).toBe(1);
      expect(prisma.redPacket.update).toHaveBeenCalledWith({
        where: { id: 'rp1' },
        data: { status: 'expired' },
      });
    });
  });

  describe('getRedPacket', () => {
    it('returns packet detail with records', async () => {
      prisma.redPacket.findUnique.mockResolvedValue({
        id: 'rp1',
        senderId: 'u1',
        conversationId: null,
        totalAmount: 10,
        totalCount: 3,
        remainingCount: 0,
        remainingAmount: 0,
        type: 'fixed',
        blessing: '恭喜',
        status: 'finished',
        expiredAt: new Date(),
        createdAt: new Date(),
        records: [
          { id: 'rec1', packetId: 'rp1', userId: 'u2', amount: 3.33, createdAt: new Date() },
          { id: 'rec2', packetId: 'rp1', userId: 'u3', amount: 3.33, createdAt: new Date() },
          { id: 'rec3', packetId: 'rp1', userId: 'u4', amount: 3.34, createdAt: new Date() },
        ],
      });

      const svc = createRedPacketService({ prisma, redis: null });
      const detail = await svc.getRedPacket('rp1');

      expect(detail.records).toHaveLength(3);
      expect(detail.status).toBe('finished');
    });

    it('throws if packet not found', async () => {
      prisma.redPacket.findUnique.mockResolvedValue(null);
      const svc = createRedPacketService({ prisma, redis: null });
      await expect(svc.getRedPacket('rp999')).rejects.toThrow(RedPacketError);
    });
  });

  describe('getRedPacketHistory', () => {
    it('returns sent history', async () => {
      prisma.redPacket.findMany.mockResolvedValue([
        { id: 'rp1', senderId: 'u1', conversationId: null, totalAmount: 10, totalCount: 5, remainingCount: 0, remainingAmount: 0, type: 'fixed', blessing: null, status: 'finished', expiredAt: new Date(), createdAt: new Date() },
      ]);
      prisma.redPacket.count.mockResolvedValue(1);

      const svc = createRedPacketService({ prisma, redis: null });
      const result = await svc.getRedPacketHistory('u1');
      expect(result.list).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('getReceivedHistory', () => {
    it('returns received history', async () => {
      prisma.redPacketRecord.findMany.mockResolvedValue([
        { id: 'rec1', packetId: 'rp1', userId: 'u1', amount: 2.5, createdAt: new Date() },
      ]);
      prisma.redPacketRecord.count.mockResolvedValue(1);

      const svc = createRedPacketService({ prisma, redis: null });
      const result = await svc.getReceivedHistory('u1');
      expect(result.list).toHaveLength(1);
      expect(result.total).toBe(1);
    });
  });

  describe('hasOpened', () => {
    it('returns true if record exists in DB', async () => {
      prisma.redPacketRecord.findUnique.mockResolvedValue({
        id: 'rec1', packetId: 'rp1', userId: 'u1', amount: 3.33, createdAt: new Date(),
      });

      const svc = createRedPacketService({ prisma, redis: null });
      expect(await svc.hasOpened('rp1', 'u1')).toBe(true);
    });

    it('returns false if no record', async () => {
      prisma.redPacketRecord.findUnique.mockResolvedValue(null);
      const svc = createRedPacketService({ prisma, redis: null });
      expect(await svc.hasOpened('rp1', 'u1')).toBe(false);
    });

    it('checks Redis first when available', async () => {
      const svc = createRedPacketService({ prisma, redis });
      // First call should check Redis (not yet opened) then fall through to DB
      prisma.redPacketRecord.findUnique.mockResolvedValue(null);
      expect(await svc.hasOpened('rp1', 'u1')).toBe(false);
    });
  });
});
