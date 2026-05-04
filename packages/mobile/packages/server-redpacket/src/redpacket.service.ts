import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { ErrorCode } from '@wechat-clone/shared';
import { RedisKeys } from '@wechat-clone/shared/db/redis-keys';
import type {
  RedPacketInfo,
  RedPacketDetail,
  RedPacketRecord,
  SendRedPacketInput,
  OpenRedPacketResult,
} from '@wechat-clone/shared';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface RedPacketServiceDeps {
  prisma: PrismaClient;
  redis: Redis | null;
}

export class RedPacketError extends Error {
  override name = 'RedPacketError';
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function mapToRedPacketInfo(packet: any): RedPacketInfo {
  return {
    id: packet.id,
    senderId: packet.senderId,
    conversationId: packet.conversationId ?? undefined,
    totalAmount: packet.totalAmount,
    totalCount: packet.totalCount,
    remainingCount: packet.remainingCount,
    remainingAmount: packet.remainingAmount,
    type: packet.type as RedPacketInfo['type'],
    blessing: packet.blessing ?? undefined,
    status: packet.status as RedPacketInfo['status'],
    expiredAt: packet.expiredAt instanceof Date ? packet.expiredAt.toISOString() : packet.expiredAt,
    createdAt: packet.createdAt instanceof Date ? packet.createdAt.toISOString() : packet.createdAt,
  };
}

/** Double-mean algorithm for random red packet amount */
function randomAmount(remainingAmount: number, remainingCount: number): number {
  if (remainingCount <= 1) {
    return Math.round(remainingAmount * 100) / 100;
  }
  const max = (remainingAmount / remainingCount) * 2;
  const amount = Math.random() * max;
  // Ensure at least 0.01
  const clamped = Math.max(0.01, Math.min(amount, remainingAmount - (remainingCount - 1) * 0.01));
  return Math.round(clamped * 100) / 100;
}

// ─── Service Factory ────────────────────────────────────────────────────────

export function createRedPacketService(deps: RedPacketServiceDeps) {
  const { prisma, redis } = deps;

  // ─── Send Red Packet ────────────────────────────────────────────────────

  async function sendRedPacket(
    senderId: string,
    input: SendRedPacketInput,
  ): Promise<RedPacketInfo> {
    if (input.totalAmount <= 0) {
      throw new RedPacketError(ErrorCode.INVALID_PARAM, '红包金额必须大于0');
    }
    if (input.totalCount <= 0 || input.totalCount > 100) {
      throw new RedPacketError(ErrorCode.INVALID_PARAM, '红包个数必须在1-100之间');
    }
    if (input.blessing && input.blessing.length > 100) {
      throw new RedPacketError(ErrorCode.INVALID_PARAM, '祝福语不能超过100个字符');
    }

    // Fixed: each person gets totalAmount / totalCount
    if (input.type === 'fixed') {
      const perAmount = input.totalAmount / input.totalCount;
      if (perAmount < 0.01) {
        throw new RedPacketError(ErrorCode.INVALID_PARAM, '每人领取金额不能小于0.01');
      }
    } else {
      // Random: ensure at least 0.01 per person
      if (input.totalAmount / input.totalCount < 0.01) {
        throw new RedPacketError(ErrorCode.INVALID_PARAM, '人均金额不能小于0.01');
      }
    }

    const expiredAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const packet = await prisma.redPacket.create({
      data: {
        senderId,
        conversationId: input.conversationId ?? null,
        totalAmount: Math.round(input.totalAmount * 100) / 100,
        totalCount: input.totalCount,
        remainingCount: input.totalCount,
        remainingAmount: Math.round(input.totalAmount * 100) / 100,
        type: input.type,
        blessing: input.blessing ?? null,
        status: 'active',
        expiredAt,
      },
    });

    // Cache in Redis
    if (redis) {
      const key = RedisKeys.redPacket(packet.id);
      await redis.hset(key, {
        remainingCount: String(input.totalCount),
        remainingAmount: String(Math.round(input.totalAmount * 100) / 100),
        status: 'active',
      });
      await redis.expire(key, RedisKeys.RED_PACKET_TTL);
    }

    return mapToRedPacketInfo(packet);
  }

  // ─── Open Red Packet ────────────────────────────────────────────────────

  async function openRedPacket(
    packetId: string,
    userId: string,
  ): Promise<OpenRedPacketResult> {
    // Check Redis for opened users first
    if (redis) {
      const alreadyOpened = await redis.sismember(RedisKeys.redPacketOpened(packetId), userId);
      if (alreadyOpened) {
        throw new RedPacketError(ErrorCode.RED_PACKET_ALREADY_OPENED, '已领取过该红包');
      }

      // Check Redis cache for status
      const cached = await redis.hgetall(RedisKeys.redPacket(packetId));
      if (cached && cached.status) {
        if (cached.status === 'finished') {
          throw new RedPacketError(ErrorCode.RED_PACKET_FINISHED, '红包已抢完');
        }
        if (cached.status === 'expired') {
          throw new RedPacketError(ErrorCode.RED_PACKET_EXPIRED, '红包已过期');
        }
      }
    }

    // Fetch from DB
    const packet = await prisma.redPacket.findUnique({
      where: { id: packetId },
    });

    if (!packet) {
      throw new RedPacketError(ErrorCode.RED_PACKET_NOT_FOUND, '红包不存在');
    }

    // Check if already opened in DB
    const existingRecord = await prisma.redPacketRecord.findUnique({
      where: { packetId_userId: { packetId, userId } },
    });
    if (existingRecord) {
      throw new RedPacketError(ErrorCode.RED_PACKET_ALREADY_OPENED, '已领取过该红包');
    }

    // Check status
    if (packet.status === 'finished') {
      throw new RedPacketError(ErrorCode.RED_PACKET_FINISHED, '红包已抢完');
    }
    if (packet.status === 'expired') {
      throw new RedPacketError(ErrorCode.RED_PACKET_EXPIRED, '红包已过期');
    }

    // Check expiration
    if (packet.expiredAt < new Date()) {
      // Mark as expired
      await prisma.redPacket.update({
        where: { id: packetId },
        data: { status: 'expired' },
      });
      if (redis) {
        await redis.hset(RedisKeys.redPacket(packetId), 'status', 'expired');
      }
      throw new RedPacketError(ErrorCode.RED_PACKET_EXPIRED, '红包已过期');
    }

    // Check remaining
    if (packet.remainingCount <= 0) {
      throw new RedPacketError(ErrorCode.RED_PACKET_FINISHED, '红包已抢完');
    }

    // Calculate amount
    let amount: number;
    if (packet.type === 'fixed') {
      amount = Math.round((packet.totalAmount / packet.totalCount) * 100) / 100;
    } else {
      amount = randomAmount(packet.remainingAmount, packet.remainingCount);
    }

    const newRemainingCount = packet.remainingCount - 1;
    const newRemainingAmount = Math.round((packet.remainingAmount - amount) * 100) / 100;
    const isLast = newRemainingCount === 0;

    // Write record and update packet atomically
    await prisma.$transaction([
      prisma.redPacketRecord.create({
        data: { packetId, userId, amount },
      }),
      prisma.redPacket.update({
        where: { id: packetId },
        data: {
          remainingCount: newRemainingCount,
          remainingAmount: newRemainingAmount,
          status: isLast ? 'finished' : 'active',
        },
      }),
    ]);

    // Update Redis
    if (redis) {
      const key = RedisKeys.redPacket(packetId);
      await redis.sadd(RedisKeys.redPacketOpened(packetId), userId);
      await redis.expire(RedisKeys.redPacketOpened(packetId), RedisKeys.RED_PACKET_TTL);
      await redis.hset(key, {
        remainingCount: String(newRemainingCount),
        remainingAmount: String(newRemainingAmount),
        status: isLast ? 'finished' : 'active',
      });
    }

    const updatedPacket = mapToRedPacketInfo({
      ...packet,
      remainingCount: newRemainingCount,
      remainingAmount: newRemainingAmount,
      status: isLast ? 'finished' : 'active',
    });

    return { amount, packet: updatedPacket };
  }

  // ─── Get Red Packet Detail ──────────────────────────────────────────────

  async function getRedPacket(packetId: string): Promise<RedPacketDetail> {
    const packet = await prisma.redPacket.findUnique({
      where: { id: packetId },
      include: {
        records: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!packet) {
      throw new RedPacketError(ErrorCode.RED_PACKET_NOT_FOUND, '红包不存在');
    }

    return {
      ...mapToRedPacketInfo(packet),
      records: packet.records.map((r) => ({
        id: r.id,
        packetId: r.packetId,
        userId: r.userId,
        amount: r.amount,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      })),
    };
  }

  // ─── Get Red Packet History ─────────────────────────────────────────────

  async function getRedPacketHistory(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ list: RedPacketInfo[]; total: number }> {
    const [packets, total] = await Promise.all([
      prisma.redPacket.findMany({
        where: { senderId: userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.redPacket.count({ where: { senderId: userId } }),
    ]);

    return {
      list: packets.map(mapToRedPacketInfo),
      total,
    };
  }

  // ─── Get Received History ───────────────────────────────────────────────

  async function getReceivedHistory(
    userId: string,
    page = 1,
    pageSize = 20,
  ): Promise<{ list: RedPacketRecord[]; total: number }> {
    const [records, total] = await Promise.all([
      prisma.redPacketRecord.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.redPacketRecord.count({ where: { userId } }),
    ]);

    return {
      list: records.map((r) => ({
        id: r.id,
        packetId: r.packetId,
        userId: r.userId,
        amount: r.amount,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      })) as unknown as RedPacketRecord[],
      total,
    };
  }

  // ─── Expire Red Packets (Cron) ──────────────────────────────────────────

  async function expireRedPackets(): Promise<number> {
    const now = new Date();

    const expiredPackets = await prisma.redPacket.findMany({
      where: {
        status: 'active',
        expiredAt: { lte: now },
      },
    });

    let count = 0;
    for (const packet of expiredPackets) {
      if (packet.remainingAmount > 0 && packet.remainingCount < packet.totalCount) {
        // Refund remaining amount to sender (simulate)
        // In production: call payment service to refund
      }

      await prisma.redPacket.update({
        where: { id: packet.id },
        data: { status: 'expired' },
      });

      // Update Redis
      if (redis) {
        await redis.hset(RedisKeys.redPacket(packet.id), 'status', 'expired');
      }

      count++;
    }

    return count;
  }

  // ─── Check if user has opened ───────────────────────────────────────────

  async function hasOpened(packetId: string, userId: string): Promise<boolean> {
    if (redis) {
      const opened = await redis.sismember(RedisKeys.redPacketOpened(packetId), userId);
      if (opened) return true;
    }

    const record = await prisma.redPacketRecord.findUnique({
      where: { packetId_userId: { packetId, userId } },
    });
    return !!record;
  }

  return {
    sendRedPacket,
    openRedPacket,
    getRedPacket,
    getRedPacketHistory,
    getReceivedHistory,
    expireRedPackets,
    hasOpened,
  };
}
