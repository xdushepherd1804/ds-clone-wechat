import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContactService, ContactError } from './contact.service';

function makeMockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    mget: vi.fn(async (keys: string[]) => keys.map((k) => store.get(k) ?? null)),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }),
    del: vi.fn(async (key: string) => { store.delete(key); return 1; }),
    _store: store,
  } as any;
}

function makeMockPrisma() {
  return {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    contact: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(async (opsOrFn: any) => {
      if (typeof opsOrFn === 'function') {
        return opsOrFn({
          contact: {
            findUnique: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            deleteMany: vi.fn(),
          },
        });
      }
      for (const op of opsOrFn) {
        if (typeof op === 'function') await op();
      }
    }),
  } as any;
}

describe('contact.service', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let redis: ReturnType<typeof makeMockRedis>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    redis = makeMockRedis();
  });

  // ─── getContacts ────────────────────────────────────────────────────────

  describe('getContacts', () => {
    it('returns active contacts with nested contact object', async () => {
      prisma.contact.findMany.mockResolvedValue([
        {
          id: 'c1', userId: 'u1', contactId: 'u2', remark: null, tags: [],
          status: 'active', createdAt: new Date('2025-01-01'),
          contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null },
        },
      ]);

      const svc = createContactService({ prisma, redis });
      const result = await svc.getContacts('u1');

      expect(result).toHaveLength(1);
      expect(result[0].contact.id).toBe('u2');
      expect(result[0].contact.username).toBe('bob');
      expect(result[0].contact.nickname).toBe('Bob');
      expect(result[0].contact.status).toBe('offline');
      expect(result[0].status).toBe('active');
      expect(result[0].createdAt).toBeDefined();
    });

    it('marks contacts online when Redis reports online', async () => {
      prisma.contact.findMany.mockResolvedValue([
        {
          id: 'c1', userId: 'u1', contactId: 'u2', remark: null, tags: [],
          status: 'active', createdAt: new Date(),
          contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null },
        },
      ]);
      redis._store.set('wc:user:online:u2', '1');

      const svc = createContactService({ prisma, redis });
      const result = await svc.getContacts('u1');
      expect(result[0].contact.status).toBe('online');
    });

    it('returns empty array when no contacts', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      const svc = createContactService({ prisma, redis });
      const result = await svc.getContacts('u1');
      expect(result).toEqual([]);
    });

    it('works without redis (null)', async () => {
      prisma.contact.findMany.mockResolvedValue([
        {
          id: 'c1', userId: 'u1', contactId: 'u2', remark: null, tags: [],
          status: 'active', createdAt: new Date(),
          contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null },
        },
      ]);

      const svc = createContactService({ prisma, redis: null });
      const result = await svc.getContacts('u1');
      expect(result[0].contact.status).toBe('offline');
    });

    it('excludes pending and blocked contacts', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      const svc = createContactService({ prisma });
      await svc.getContacts('u1');
      // Should query with status: 'active'
      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'u1', status: 'active' } }),
      );
    });
  });

  // ─── sendFriendRequest ──────────────────────────────────────────────────

  describe('sendFriendRequest', () => {
    it('throws when sending to self', async () => {
      const svc = createContactService({ prisma });
      await expect(svc.sendFriendRequest({
        fromUid: 'u1', toUid: 'u1',
      })).rejects.toThrow('不能向自己发送好友请求');
    });

    it('throws when target does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const svc = createContactService({ prisma });
      await expect(svc.sendFriendRequest({
        fromUid: 'u1', toUid: 'u999',
      })).rejects.toThrow(ContactError);
    });

    it('throws when already friends', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'u2', username: 'bob' });
      prisma.contact.findUnique.mockResolvedValue({ id: 'c1', status: 'active' });
      const svc = createContactService({ prisma });
      await expect(svc.sendFriendRequest({
        fromUid: 'u1', toUid: 'u2',
      })).rejects.toThrow('已是好友');
    });

    it('creates a pending friend request', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'u2', username: 'bob', nickname: 'Bob', avatar: null }) // target
        .mockResolvedValueOnce({ id: 'u1', username: 'alice', nickname: 'Alice', avatar: null }); // sender
      prisma.contact.findUnique.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({
        id: 'r1', userId: 'u2', contactId: 'u1', remark: 'Hello!', status: 'pending',
        contact: { username: 'alice', nickname: 'Alice', avatar: null },
        createdAt: new Date(),
      });

      const svc = createContactService({ prisma });
      const result = await svc.sendFriendRequest({
        fromUid: 'u1', toUid: 'u2', message: 'Hello!',
      });

      expect(result.status).toBe('pending');
      expect(result.message).toBe('Hello!');
      expect(result.fromUid).toBe('u1');
      expect(result.toUid).toBe('u2');
      expect(result.fromUser.nickname).toBe('Alice');
    });
  });

  // ─── handleFriendRequest ────────────────────────────────────────────────

  describe('handleFriendRequest', () => {
    it('throws when request not found', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      const svc = createContactService({ prisma });
      await expect(svc.handleFriendRequest({
        requestId: 'r999', action: 'accept', userId: 'u2',
      })).rejects.toThrow('好友请求不存在或已处理');
    });

    it('accepts request and creates reciprocal contact', async () => {
      const txContactMocks = {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      };
      prisma.contact.findFirst.mockResolvedValue({
        id: 'r1', userId: 'u2', contactId: 'u1', status: 'pending',
      });
      prisma.$transaction.mockImplementation(async (fn: any) => fn({ contact: txContactMocks }));

      const svc = createContactService({ prisma });
      await expect(svc.handleFriendRequest({
        requestId: 'r1', action: 'accept', userId: 'u2',
      })).resolves.toBeUndefined();

      expect(txContactMocks.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'active' } }),
      );
      expect(txContactMocks.create).toHaveBeenCalled();
    });

    it('rejects request by deleting it', async () => {
      prisma.contact.findFirst.mockResolvedValue({
        id: 'r1', userId: 'u2', contactId: 'u1', status: 'pending',
      });
      prisma.contact.delete.mockResolvedValue({});

      const svc = createContactService({ prisma });
      await expect(svc.handleFriendRequest({
        requestId: 'r1', action: 'reject', userId: 'u2',
      })).resolves.toBeUndefined();

      expect(prisma.contact.delete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'r1' } }),
      );
    });

    it('skips reciprocal contact creation if already exists', async () => {
      const txContactMocks = {
        findUnique: vi.fn().mockResolvedValue({ id: 'c_existing' }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
      };
      prisma.contact.findFirst.mockResolvedValue({
        id: 'r1', userId: 'u2', contactId: 'u1', status: 'pending',
      });
      prisma.$transaction.mockImplementation(async (fn: any) => fn({ contact: txContactMocks }));

      const svc = createContactService({ prisma });
      await svc.handleFriendRequest({
        requestId: 'r1', action: 'accept', userId: 'u2',
      });

      expect(txContactMocks.create).not.toHaveBeenCalled();
    });
  });

  // ─── deleteContact ──────────────────────────────────────────────────────

  describe('deleteContact', () => {
    it('throws when contact not found', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      const svc = createContactService({ prisma });
      await expect(svc.deleteContact('u1', 'u999')).rejects.toThrow(ContactError);
    });

    it('deletes both directions', async () => {
      prisma.contact.findUnique.mockResolvedValue({ id: 'c1', userId: 'u1', contactId: 'u2' });
      prisma.contact.delete.mockResolvedValue({});
      prisma.contact.deleteMany.mockResolvedValue({ count: 1 });

      const svc = createContactService({ prisma });
      await expect(svc.deleteContact('u1', 'u2')).resolves.toBeUndefined();

      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─── updateRemark ───────────────────────────────────────────────────────

  describe('updateRemark', () => {
    it('throws when contact not found', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      const svc = createContactService({ prisma });
      await expect(svc.updateRemark('u1', 'u999', 'New')).rejects.toThrow(ContactError);
    });

    it('updates remark on a contact', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'c1', userId: 'u1', contactId: 'u2',
      });
      prisma.contact.update.mockResolvedValue({
        id: 'c1', userId: 'u1', contactId: 'u2', remark: 'Best Friend', tags: [],
        status: 'active', createdAt: new Date(),
        contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null },
      });

      const svc = createContactService({ prisma });
      const result = await svc.updateRemark('u1', 'u2', 'Best Friend');
      expect(result.remark).toBe('Best Friend');
    });
  });

  // ─── updateTags ─────────────────────────────────────────────────────────

  describe('updateTags', () => {
    it('throws when contact not found', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      const svc = createContactService({ prisma });
      await expect(svc.updateTags('u1', 'u999', ['friend'])).rejects.toThrow(ContactError);
    });

    it('updates tags on a contact', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'c1', userId: 'u1', contactId: 'u2',
      });
      prisma.contact.update.mockResolvedValue({
        id: 'c1', userId: 'u1', contactId: 'u2', remark: null, tags: ['friend', 'work'],
        status: 'active', createdAt: new Date(),
        contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null },
      });

      const svc = createContactService({ prisma });
      const result = await svc.updateTags('u1', 'u2', ['friend', 'work']);
      expect(result.tags).toEqual(['friend', 'work']);
    });
  });

  // ─── getFriendRequests ──────────────────────────────────────────────────

  describe('getFriendRequests', () => {
    it('returns pending requests', async () => {
      prisma.contact.findMany.mockResolvedValue([
        {
          id: 'r1', userId: 'u2', contactId: 'u1', remark: null, status: 'pending',
          contact: { id: 'u1', username: 'alice', nickname: 'Alice', avatar: null },
          createdAt: new Date(),
        },
      ]);

      const svc = createContactService({ prisma });
      const result = await svc.getFriendRequests('u2');
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
      expect(result[0].fromUser.nickname).toBe('Alice');
    });

    it('returns empty array when no pending requests', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      const svc = createContactService({ prisma });
      const result = await svc.getFriendRequests('u1');
      expect(result).toEqual([]);
    });
  });

  // ─── blockUser ──────────────────────────────────────────────────────────

  describe('blockUser', () => {
    it('throws when blocking self', async () => {
      const svc = createContactService({ prisma });
      await expect(svc.blockUser('u1', 'u1')).rejects.toThrow('不能拉黑自己');
    });

    it('blocks an existing contact', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'c1', userId: 'u1', contactId: 'u2', status: 'active',
      });
      prisma.contact.update.mockResolvedValue({});

      const svc = createContactService({ prisma });
      await expect(svc.blockUser('u1', 'u2')).resolves.toBeUndefined();
      expect(prisma.contact.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'blocked' } }),
      );
    });

    it('blocks a non-contact user (creates blocked record)', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({});

      const svc = createContactService({ prisma });
      await expect(svc.blockUser('u1', 'u2')).resolves.toBeUndefined();
      expect(prisma.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'blocked' }) }),
      );
    });

    it('no-ops when already blocked', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'c1', userId: 'u1', contactId: 'u2', status: 'blocked',
      });

      const svc = createContactService({ prisma });
      await expect(svc.blockUser('u1', 'u2')).resolves.toBeUndefined();
      expect(prisma.contact.update).not.toHaveBeenCalled();
    });
  });

  // ─── unblockUser ────────────────────────────────────────────────────────

  describe('unblockUser', () => {
    it('throws when not blocked', async () => {
      prisma.contact.findUnique.mockResolvedValue(null);
      const svc = createContactService({ prisma });
      await expect(svc.unblockUser('u1', 'u2')).rejects.toThrow(ContactError);
    });

    it('throws when contact is active, not blocked', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'c1', userId: 'u1', contactId: 'u2', status: 'active',
      });
      const svc = createContactService({ prisma });
      await expect(svc.unblockUser('u1', 'u2')).rejects.toThrow('未拉黑该用户');
    });

    it('unblocks a blocked user', async () => {
      prisma.contact.findUnique.mockResolvedValue({
        id: 'c1', userId: 'u1', contactId: 'u2', status: 'blocked',
      });
      prisma.contact.delete.mockResolvedValue({});

      const svc = createContactService({ prisma });
      await expect(svc.unblockUser('u1', 'u2')).resolves.toBeUndefined();
    });
  });

  // ─── searchContacts ─────────────────────────────────────────────────────

  describe('searchContacts', () => {
    it('throws for empty keyword', async () => {
      const svc = createContactService({ prisma });
      await expect(svc.searchContacts({ userId: 'u1', keyword: '' })).rejects.toThrow(ContactError);
      await expect(svc.searchContacts({ userId: 'u1', keyword: '   ' })).rejects.toThrow(ContactError);
    });

    it('returns matching contacts with isContact=true', async () => {
      prisma.contact.findMany.mockResolvedValue([
        {
          id: 'c1', userId: 'u1', contactId: 'u2', remark: null,
          contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([]);

      const svc = createContactService({ prisma });
      const result = await svc.searchContacts({ userId: 'u1', keyword: 'bob' });
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('bob');
      expect(result[0].isContact).toBe(true);
      expect(result[0].avatar).toBe(null);
    });

    it('returns empty when no matches', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);

      const svc = createContactService({ prisma });
      const result = await svc.searchContacts({ userId: 'u1', keyword: 'zzz' });
      expect(result).toEqual([]);
    });

    it('includes global search results with isContact=false', async () => {
      // No friend matches
      prisma.contact.findMany.mockResolvedValue([]);
      // Global search finds a non-friend
      prisma.user.findMany.mockResolvedValue([
        { id: 'u99', username: 'stranger', nickname: 'Stranger', avatar: null },
      ]);

      const svc = createContactService({ prisma });
      const result = await svc.searchContacts({ userId: 'u1', keyword: 'stranger' });
      expect(result).toHaveLength(1);
      expect(result[0].isContact).toBe(false);
      expect(result[0].username).toBe('stranger');
    });

    it('searches by nickname', async () => {
      prisma.contact.findMany.mockResolvedValue([
        {
          id: 'c1', userId: 'u1', contactId: 'u2', remark: null,
          contact: { id: 'u2', username: 'bob123', nickname: 'Bob Marley', avatar: null },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([]);

      const svc = createContactService({ prisma });
      const result = await svc.searchContacts({ userId: 'u1', keyword: 'marley' });
      expect(result).toHaveLength(1);
    });
  });

  // ─── Integration: full friend request flow ──────────────────────────────

  describe('full friend request flow', () => {
    it('request → accept → both are friends', async () => {
      const svc = createContactService({ prisma });

      // Step 1: send request
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'u2', username: 'bob', nickname: 'Bob', avatar: null })
        .mockResolvedValueOnce({ id: 'u1', username: 'alice', nickname: 'Alice', avatar: null });
      prisma.contact.findUnique.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({
        id: 'r1', userId: 'u2', contactId: 'u1', remark: null, status: 'pending',
        contact: { username: 'alice', nickname: 'Alice', avatar: null },
        createdAt: new Date(),
      });

      const req = await svc.sendFriendRequest({ fromUid: 'u1', toUid: 'u2' });
      expect(req.status).toBe('pending');

      // Step 2: accept
      const txContactMocks = {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      };
      prisma.contact.findFirst.mockResolvedValue({
        id: 'r1', userId: 'u2', contactId: 'u1', status: 'pending',
      });
      prisma.$transaction.mockImplementation(async (fn: any) => fn({ contact: txContactMocks }));

      await svc.handleFriendRequest({ requestId: 'r1', action: 'accept', userId: 'u2' });

      // Step 3: verify both are friends via getContacts
      prisma.contact.findMany.mockResolvedValue([
        {
          id: 'c1', userId: 'u1', contactId: 'u2', remark: null, tags: [],
          status: 'active', createdAt: new Date(),
          contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null },
        },
      ]);

      const contacts = await svc.getContacts('u1');
      expect(contacts).toHaveLength(1);
      expect(contacts[0].contact.username).toBe('bob');
    });

    it('request → reject → contact list empty', async () => {
      const svc = createContactService({ prisma });

      // Step 1: send request
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'u2', username: 'bob', nickname: 'Bob', avatar: null })
        .mockResolvedValueOnce({ id: 'u1', username: 'alice', nickname: 'Alice', avatar: null });
      prisma.contact.findUnique.mockResolvedValue(null);
      prisma.contact.create.mockResolvedValue({
        id: 'r1', userId: 'u2', contactId: 'u1', remark: null, status: 'pending',
        contact: { username: 'alice', nickname: 'Alice', avatar: null },
        createdAt: new Date(),
      });
      await svc.sendFriendRequest({ fromUid: 'u1', toUid: 'u2' });

      // Step 2: reject
      prisma.contact.findFirst.mockResolvedValue({
        id: 'r1', userId: 'u2', contactId: 'u1', status: 'pending',
      });
      prisma.contact.delete.mockResolvedValue({});
      await svc.handleFriendRequest({ requestId: 'r1', action: 'reject', userId: 'u2' });

      // Step 3: no contacts
      prisma.contact.findMany.mockResolvedValue([]);
      const contacts = await svc.getContacts('u1');
      expect(contacts).toEqual([]);
    });
  });

  // ─── deleteContact bidirectional test ───────────────────────────────────

  describe('deleteContact bidirectional', () => {
    it('removes both sides when deleting a friend', async () => {
      prisma.contact.findUnique.mockResolvedValue({ id: 'c1', userId: 'u1', contactId: 'u2' });
      prisma.contact.delete.mockResolvedValue({});
      prisma.contact.deleteMany.mockResolvedValue({ count: 1 });

      const svc = createContactService({ prisma });
      await svc.deleteContact('u1', 'u2');

      // Verify transaction was called for bidirectional delete
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─── block prevents communication ───────────────────────────────────────

  describe('block prevents friend request', () => {
    it('blocked user cannot send friend request to blocker', async () => {
      const svc = createContactService({ prisma });

      // u2 tries to send friend request to u1
      // u1 has already blocked u2, so it should fail
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'u1', username: 'alice', nickname: 'Alice', avatar: null }) // target
        .mockResolvedValueOnce({ id: 'u2', username: 'bob', nickname: 'Bob', avatar: null }); // sender

      // No existing contact from u2's perspective
      prisma.contact.findUnique
        .mockResolvedValueOnce(null) // u2 doesn't have u1 as contact
        .mockResolvedValueOnce({ id: 'c_block', userId: 'u1', contactId: 'u2', status: 'blocked' }); // u1 has u2 blocked

      // No pending request either
      prisma.contact.findFirst.mockResolvedValue(null);

      await expect(svc.sendFriendRequest({
        fromUid: 'u2', toUid: 'u1',
      })).rejects.toThrow('对方已将你拉黑');
    });
  });
});
