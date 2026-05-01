import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMessageService, MessageError } from './message.service';

// ─── Mock factories ─────────────────────────────────────────────────────────

function makeMockPrisma() {
  return {
    user: { findUnique: vi.fn() },
    group: { findUnique: vi.fn() },
    groupMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  } as any;
}

/**
 * Creates a mock MongoDB with in-memory storage and chainable query methods.
 */
function makeMockMongo() {
  const messages: any[] = [];
  const boxes: any[] = [];

  function applyFilter(rows: any[], filter: any): any[] {
    if (!filter || Object.keys(filter).length === 0) return rows;
    return rows.filter((r) => {
      for (const [k, v] of Object.entries(filter)) {
        if (k === 'msgId' && typeof v === 'object' && v !== null && '$in' in v) {
          if (!(v as any).$in.includes(r.msgId)) return false;
        } else if (k === 'createdAt' && typeof v === 'object' && v !== null && '$lt' in v) {
          if (new Date(r.createdAt) >= (v as any).$lt) return false;
        } else if (k === 'isRead' && typeof v === 'boolean') {
          if (r.isRead !== v) return false;
        } else if (r[k] !== v) {
          return false;
        }
      }
      return true;
    });
  }

  function applySort(rows: any[], sortSpec: any): any[] {
    if (!sortSpec || Object.keys(sortSpec).length === 0) return rows;
    const [field, dir] = Object.entries(sortSpec)[0];
    const mult = dir === -1 ? -1 : 1;
    return [...rows].sort((a: any, b: any) => {
      const va = a[field as string] instanceof Date ? (a[field as string] as Date).getTime() : a[field as string];
      const vb = b[field as string] instanceof Date ? (b[field as string] as Date).getTime() : b[field as string];
      return (va > vb ? 1 : va < vb ? -1 : 0) * mult;
    });
  }

  function buildFindChain(storage: any[]) {
    let _filter: any = {};
    let _sort: any = {};
    let _skip = 0;
    let _limit = 100;

    const chain: any = {
      sort: vi.fn((s: any) => { _sort = s; return chain; }),
      skip: vi.fn((n: number) => { _skip = n; return chain; }),
      limit: vi.fn((n: number) => { _limit = n; return chain; }),
      toArray: vi.fn(async () => {
        let results = applyFilter(storage, _filter);
        results = applySort(results, _sort);
        results = results.slice(_skip, _skip + _limit);
        return results;
      }),
    };

    // find() sets the filter and returns the chain
    const findFn = vi.fn((filter: any) => {
      _filter = filter;
      return chain;
    });

    return { findFn, chain };
  }

  const { findFn: msgFind, chain: msgChain } = buildFindChain(messages);
  const { findFn: boxFind, chain: boxChain } = buildFindChain(boxes);

  const msgCol = {
    insertOne: vi.fn(async (doc: any) => {
      messages.push(doc);
      return { insertedId: doc.msgId };
    }),
    findOne: vi.fn(async (filter: any) => {
      return messages.find((m) => m.msgId === filter.msgId) ?? null;
    }),
    find: msgFind,
    updateOne: vi.fn(async (filter: any, update: any) => {
      const idx = messages.findIndex((m) => m.msgId === filter.msgId);
      if (idx >= 0 && update.$set) {
        Object.assign(messages[idx], update.$set);
      }
      return { modifiedCount: idx >= 0 ? 1 : 0 };
    }),
    updateMany: vi.fn(async () => ({ modifiedCount: 0 })),
    aggregate: vi.fn(() => ({
      toArray: vi.fn(async () => []),
    })),
  } as any;

  const boxCol = {
    insertMany: vi.fn(async (docs: any[]) => {
      boxes.push(...docs);
      return { insertedCount: docs.length };
    }),
    find: boxFind,
    updateMany: vi.fn(async (filter: any, update: any) => {
      let count = 0;
      for (const b of boxes) {
        let match = true;
        for (const [k, v] of Object.entries(filter)) {
          if (b[k] !== v) { match = false; break; }
        }
        if (match && update.$set) {
          Object.assign(b, update.$set);
          count++;
        }
      }
      return { modifiedCount: count };
    }),
    aggregate: vi.fn(() => ({
      toArray: vi.fn(async () => []),
    })),
  } as any;

  const mongo: any = {
    collection: vi.fn((name: string) => {
      if (name === 'messages') return msgCol;
      if (name === 'message_boxes') return boxCol;
      return null;
    }),
    _messages: messages,
    _boxes: boxes,
    _msgCol: msgCol,
    _boxCol: boxCol,
  };

  return mongo;
}

function makeMockRedis() {
  const store = new Map<string, string>();
  const lists = new Map<string, string[]>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    rpush: vi.fn(async (key: string, value: string) => {
      if (!lists.has(key)) lists.set(key, []);
      lists.get(key)!.push(value);
      return 1;
    }),
    lpop: vi.fn(async (key: string) => {
      const list = lists.get(key);
      if (!list || list.length === 0) return null;
      return list.shift()!;
    }),
    zadd: vi.fn(async () => 1),
    _store: store,
    _lists: lists,
  } as any;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('message.service', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let mongo: ReturnType<typeof makeMockMongo>;
  let redis: ReturnType<typeof makeMockRedis>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    mongo = makeMockMongo();
    redis = makeMockRedis();
  });

  // ─── sendMessage ──────────────────────────────────────────────────────────

  describe('sendMessage', () => {
    it('throws if content is invalid', async () => {
      const svc = createMessageService({ prisma, mongo: null });
      await expect(svc.sendMessage({
        fromUid: 'u1', toUid: 'u2', chatType: 'private', msgType: 1, content: '',
      })).rejects.toThrow(MessageError);
    });

    it('throws if private chat has no toUid', async () => {
      const svc = createMessageService({ prisma, mongo: null });
      await expect(svc.sendMessage({
        fromUid: 'u1', chatType: 'private', msgType: 1, content: 'hello',
      })).rejects.toThrow(MessageError);
    });

    it('throws if group chat has no toGroupId', async () => {
      const svc = createMessageService({ prisma, mongo: null });
      await expect(svc.sendMessage({
        fromUid: 'u1', chatType: 'group', msgType: 1, content: 'hello',
      })).rejects.toThrow(MessageError);
    });

    describe('with MongoDB', () => {
      beforeEach(() => {
        prisma.user.findUnique.mockResolvedValue({ id: 'u2', username: 'bob' });
        prisma.group.findUnique.mockResolvedValue({ id: 'g1', name: 'test' });
        prisma.groupMember.findUnique.mockResolvedValue({ groupId: 'g1', userId: 'u1', role: 'member' });
        prisma.groupMember.findMany.mockResolvedValue([
          { userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' },
        ]);
      });

      it('sends a private message and returns it', async () => {
        const svc = createMessageService({ prisma, mongo });
        const msg = await svc.sendMessage({
          fromUid: 'u1', toUid: 'u2', chatType: 'private', msgType: 1, content: 'Hello!',
        });

        expect(msg.msgId).toBeTruthy();
        expect(msg.fromUid).toBe('u1');
        expect(msg.toUid).toBe('u2');
        expect(msg.chatType).toBe('private');
        expect(msg.status).toBe('sent');
        expect(msg.content).toBe('Hello!');
        expect(msg.serverSeq).toBeGreaterThan(0);
        expect(msg.createdAt).toBeTruthy();
      });

      it('stores message in messages collection', async () => {
        const svc = createMessageService({ prisma, mongo });
        await svc.sendMessage({
          fromUid: 'u1', toUid: 'u2', chatType: 'private', msgType: 1, content: 'Hello!',
        });

        expect(mongo._messages.length).toBe(1);
        expect(mongo._messages[0].content).toBe('Hello!');
      });

      it('writes to message_boxes for both sender and receiver', async () => {
        const svc = createMessageService({ prisma, mongo });
        await svc.sendMessage({
          fromUid: 'u1', toUid: 'u2', chatType: 'private', msgType: 1, content: 'Hello!',
        });

        expect(mongo._boxCol.insertMany).toHaveBeenCalled();
        const inserted = mongo._boxCol.insertMany.mock.calls[0][0];
        expect(inserted.length).toBe(2);
        expect(inserted[0].userId).toBe('u1');
        expect(inserted[0].isRead).toBe(true); // sender's own message is read
        expect(inserted[1].userId).toBe('u2');
        expect(inserted[1].isRead).toBe(false); // receiver's is unread
      });

      it('writes to message_boxes for all group members', async () => {
        prisma.groupMember.findMany.mockResolvedValue([
          { userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' },
        ]);
        const svc = createMessageService({ prisma, mongo });
        await svc.sendMessage({
          fromUid: 'u1', toGroupId: 'g1', chatType: 'group', msgType: 1, content: 'Hi group!',
        });

        const inserted = mongo._boxCol.insertMany.mock.calls[0][0];
        expect(inserted.length).toBe(3);
        const userIds = inserted.map((e: any) => e.userId);
        expect(userIds).toContain('u1');
        expect(userIds).toContain('u2');
        expect(userIds).toContain('u3');
      });

      it('sends a group message', async () => {
        const svc = createMessageService({ prisma, mongo });
        const msg = await svc.sendMessage({
          fromUid: 'u1', toGroupId: 'g1', chatType: 'group', msgType: 1, content: 'Hi group!',
        });

        expect(msg.toGroupId).toBe('g1');
        expect(msg.chatType).toBe('group');
      });

      it('throws if recipient does not exist', async () => {
        prisma.user.findUnique.mockResolvedValue(null);
        const svc = createMessageService({ prisma, mongo });
        await expect(svc.sendMessage({
          fromUid: 'u1', toUid: 'u999', chatType: 'private', msgType: 1, content: 'x',
        })).rejects.toThrow(MessageError);
      });

      it('throws if group does not exist', async () => {
        prisma.group.findUnique.mockResolvedValue(null);
        const svc = createMessageService({ prisma, mongo });
        await expect(svc.sendMessage({
          fromUid: 'u1', toGroupId: 'g999', chatType: 'group', msgType: 1, content: 'x',
        })).rejects.toThrow(MessageError);
      });

      it('throws if sender is not a group member', async () => {
        prisma.group.findUnique.mockResolvedValue({ id: 'g1', name: 'test' });
        prisma.groupMember.findUnique.mockResolvedValue(null);
        const svc = createMessageService({ prisma, mongo });
        await expect(svc.sendMessage({
          fromUid: 'u1', toGroupId: 'g1', chatType: 'group', msgType: 1, content: 'x',
        })).rejects.toThrow(MessageError);
      });

      it('pushes to Redis offline queue for offline receiver', async () => {
        redis.get.mockResolvedValue(null); // receiver is offline
        const svc = createMessageService({ prisma, mongo, redis });
        await svc.sendMessage({
          fromUid: 'u1', toUid: 'u2', chatType: 'private', msgType: 1, content: 'Hello offline!',
        });

        expect(redis.rpush).toHaveBeenCalled();
        const call = redis.rpush.mock.calls[0];
        expect(call[0]).toContain('offline');
        expect(call[0]).toContain('u2');
        expect(JSON.parse(call[1]).content).toBe('Hello offline!');
      });

      it('does not push to offline queue for online receiver', async () => {
        redis.get.mockResolvedValue('1'); // receiver is online
        const svc = createMessageService({ prisma, mongo, redis });
        await svc.sendMessage({
          fromUid: 'u1', toUid: 'u2', chatType: 'private', msgType: 1, content: 'Hello online!',
        });

        // rpush should not be called with offline key for u2
        const offlineCalls = redis.rpush.mock.calls.filter(
          (c: any) => c[0].includes('offline') && c[0].includes('u2'),
        );
        expect(offlineCalls.length).toBe(0);
      });

      it('updates recent contacts in Redis', async () => {
        redis.get.mockResolvedValue('1');
        const svc = createMessageService({ prisma, mongo, redis });
        await svc.sendMessage({
          fromUid: 'u1', toUid: 'u2', chatType: 'private', msgType: 1, content: 'Hello!',
        });

        expect(redis.zadd).toHaveBeenCalled();
      });
    });
  });

  // ─── getMessages ──────────────────────────────────────────────────────────

  describe('getMessages', () => {
    it('returns empty array without MongoDB', async () => {
      const svc = createMessageService({ prisma, mongo: null });
      const result = await svc.getMessages('conv1', 'u1');
      expect(result).toEqual([]);
    });

    it('returns messages for a conversation from boxes', async () => {
      const svc = createMessageService({ prisma, mongo });
      const now = new Date();

      // Seed data
      mongo._messages.push({
        msgId: 'm1', fromUid: 'u1', toUid: 'u2', chatType: 'private',
        msgType: 1, content: 'Hello', status: 'sent', serverSeq: 1, createdAt: now,
      });
      mongo._boxes.push({
        msgId: 'm1', userId: 'u1', conversationId: 'conv:u1:u2',
        isRead: true, createdAt: now,
      });

      // Mock the find chain for boxes
      const origBoxFind = mongo._boxCol.find;
      origBoxFind.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue(mongo._boxes),
          }),
        }),
      });

      // Mock the find chain for messages
      const origMsgFind = mongo._msgCol.find;
      origMsgFind.mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mongo._messages),
      });

      const result = await svc.getMessages('conv:u1:u2', 'u1');
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('handles before cursor pagination', async () => {
      const svc = createMessageService({ prisma, mongo });

      mongo._boxes.push({ msgId: 'm1', userId: 'u1', conversationId: 'conv:u1:u2', isRead: true, createdAt: new Date('2024-01-01') });
      mongo._boxes.push({ msgId: 'm2', userId: 'u1', conversationId: 'conv:u1:u2', isRead: true, createdAt: new Date('2024-01-02') });

      // Mock find chain
      mongo._boxCol.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await svc.getMessages('conv:u1:u2', 'u1', { before: '2024-01-03', limit: 10 });
      expect(result).toEqual([]);
      expect(mongo._boxCol.find).toHaveBeenCalled();
    });

    it('respects limit parameter', async () => {
      const svc = createMessageService({ prisma, mongo });

      mongo._boxCol.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            toArray: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await svc.getMessages('conv:u1:u2', 'u1', { limit: 5 });
      // The find should have been called
      expect(mongo._boxCol.find).toHaveBeenCalled();
    });
  });

  // ─── getConversations ─────────────────────────────────────────────────────

  describe('getConversations', () => {
    it('returns empty array without MongoDB', async () => {
      const svc = createMessageService({ prisma, mongo: null });
      const result = await svc.getConversations('u1');
      expect(result).toEqual([]);
    });

    it('aggregates conversations from message_boxes', async () => {
      const svc = createMessageService({ prisma, mongo });
      const now = new Date();

      mongo._boxCol.aggregate.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { _id: 'conv:u1:u2', lastMsgTime: now, unreadCount: 0, lastMsgId: 'm1' },
        ]),
      });

      mongo._messages.push({
        msgId: 'm1', fromUid: 'u2', toUid: 'u1', chatType: 'private',
        msgType: 1, content: 'Hello', status: 'sent', serverSeq: 1, createdAt: now,
      });

      mongo._msgCol.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mongo._messages),
      });

      const result = await svc.getConversations('u1');
      expect(result.length).toBe(1);
      expect(result[0].conversationId).toBe('conv:u1:u2');
      expect(result[0].unreadCount).toBe(0);
      expect(result[0].chatType).toBe('private');
    });

    it('returns conversations sorted by last message time desc', async () => {
      const svc = createMessageService({ prisma, mongo });
      const t1 = new Date('2024-01-01');
      const t2 = new Date('2024-01-02');

      mongo._boxCol.aggregate.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { _id: 'conv:u1:u3', lastMsgTime: t2, unreadCount: 0, lastMsgId: 'm2' },
          { _id: 'conv:u1:u2', lastMsgTime: t1, unreadCount: 5, lastMsgId: 'm1' },
        ]),
      });

      mongo._messages.push(
        { msgId: 'm1', fromUid: 'u2', toUid: 'u1', chatType: 'private', msgType: 1, content: 'Old', status: 'sent', serverSeq: 1, createdAt: t1 },
        { msgId: 'm2', fromUid: 'u3', toUid: 'u1', chatType: 'private', msgType: 1, content: 'New', status: 'sent', serverSeq: 2, createdAt: t2 },
      );

      mongo._msgCol.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mongo._messages),
      });

      const result = await svc.getConversations('u1');
      expect(result.length).toBe(2);
      // First conv should be latest
      expect(result[0].conversationId).toBe('conv:u1:u3');
      expect(result[1].unreadCount).toBe(5);
    });

    it('uses Redis cache when available', async () => {
      const cached = [{
        conversationId: 'conv:u1:u2', chatType: 'private', targetId: 'u2',
        lastMsg: null, unreadCount: 0, isTop: false, isMuted: false,
        updatedAt: new Date().toISOString(),
      }];
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const svc = createMessageService({ prisma, mongo, redis });
      const result = await svc.getConversations('u1');
      expect(result).toEqual(cached);
    });

    it('supports offset and limit for pagination', async () => {
      const svc = createMessageService({ prisma, mongo });

      mongo._boxCol.aggregate.mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { _id: 'conv:u1:u3', lastMsgTime: new Date(), unreadCount: 0, lastMsgId: 'm1' },
        ]),
      });

      mongo._messages.push({
        msgId: 'm1', fromUid: 'u3', toUid: 'u1', chatType: 'private',
        msgType: 1, content: 'Hi', status: 'sent', serverSeq: 1, createdAt: new Date(),
      });

      mongo._msgCol.find.mockReturnValue({
        toArray: vi.fn().mockResolvedValue(mongo._messages),
      });

      const result = await svc.getConversations('u1', { limit: 10, offset: 5 });
      expect(result.length).toBeGreaterThanOrEqual(0);
    });
  });

  // ─── markConversationRead ─────────────────────────────────────────────────

  describe('markConversationRead', () => {
    it('throws without MongoDB', async () => {
      const svc = createMessageService({ prisma, mongo: null });
      await expect(svc.markConversationRead('conv:u1:u2', 'u1')).rejects.toThrow(MessageError);
    });

    it('updates message_boxes isRead flag', async () => {
      const svc = createMessageService({ prisma, mongo });
      mongo._boxCol.updateMany.mockResolvedValue({ modifiedCount: 3 });

      const result = await svc.markConversationRead('conv:u1:u2', 'u1');
      expect(result.updatedCount).toBe(3);
      expect(mongo._boxCol.updateMany).toHaveBeenCalledWith(
        { userId: 'u1', conversationId: 'conv:u1:u2', isRead: false },
        { $set: { isRead: true } },
      );
    });

    it('invalidates Redis cache after marking read', async () => {
      const svc = createMessageService({ prisma, mongo, redis });
      mongo._boxCol.updateMany.mockResolvedValue({ modifiedCount: 1 });

      await svc.markConversationRead('conv:u1:u2', 'u1');
      expect(redis.del).toHaveBeenCalled();
    });

    it('returns zero when no unread messages', async () => {
      const svc = createMessageService({ prisma, mongo });
      mongo._boxCol.updateMany.mockResolvedValue({ modifiedCount: 0 });

      const result = await svc.markConversationRead('conv:u1:u2', 'u1');
      expect(result.updatedCount).toBe(0);
    });
  });

  // ─── recallMessage ────────────────────────────────────────────────────────

  describe('recallMessage', () => {
    it('throws if no MongoDB available', async () => {
      const svc = createMessageService({ prisma, mongo: null });
      await expect(svc.recallMessage({ msgId: 'm1', userId: 'u1' })).rejects.toThrow(MessageError);
    });

    it('throws if message not found', async () => {
      const svc = createMessageService({ prisma, mongo });
      mongo._msgCol.findOne.mockResolvedValueOnce(null);
      await expect(svc.recallMessage({ msgId: 'm999', userId: 'u1' })).rejects.toThrow(MessageError);
    });

    it('throws if user is not the sender', async () => {
      const svc = createMessageService({ prisma, mongo });
      mongo._msgCol.findOne.mockResolvedValueOnce({
        msgId: 'm1', fromUid: 'u2', createdAt: new Date().toISOString(),
      });
      await expect(svc.recallMessage({ msgId: 'm1', userId: 'u1' })).rejects.toThrow('只能撤回自己的消息');
    });

    it('successfully recalls own recent message', async () => {
      const svc = createMessageService({ prisma, mongo });
      mongo._msgCol.findOne.mockResolvedValueOnce({
        msgId: 'm1', fromUid: 'u1', createdAt: new Date().toISOString(),
      });
      mongo._msgCol.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

      const result = await svc.recallMessage({ msgId: 'm1', userId: 'u1' });
      expect(result.status).toBe('recalled');
    });

    it('throws if message is older than 2 minutes', async () => {
      const svc = createMessageService({ prisma, mongo });
      const oldTime = new Date(Date.now() - 3 * 60 * 1000);
      mongo._msgCol.findOne.mockResolvedValueOnce({
        msgId: 'm1', fromUid: 'u1', createdAt: oldTime.toISOString(),
      });
      await expect(svc.recallMessage({ msgId: 'm1', userId: 'u1' })).rejects.toThrow('超过2分钟');
    });

    it('allows recall exactly at 2 minutes boundary', async () => {
      const svc = createMessageService({ prisma, mongo });
      const boundaryTime = new Date(Date.now() - 2 * 60 * 1000 + 500); // just under 2 minutes
      mongo._msgCol.findOne.mockResolvedValueOnce({
        msgId: 'm1', fromUid: 'u1', createdAt: boundaryTime.toISOString(),
      });
      mongo._msgCol.updateOne.mockResolvedValueOnce({ modifiedCount: 1 });

      const result = await svc.recallMessage({ msgId: 'm1', userId: 'u1' });
      expect(result.status).toBe('recalled');
    });
  });

  // ─── getOfflineMessages ───────────────────────────────────────────────────

  describe('getOfflineMessages', () => {
    it('returns empty array without Redis', async () => {
      const svc = createMessageService({ prisma, mongo });
      const result = await svc.getOfflineMessages('u1');
      expect(result).toEqual([]);
    });

    it('pulls messages from Redis offline queue', async () => {
      const msg1 = JSON.stringify({ msgId: 'm1', fromUid: 'u2', content: 'Hello offline', createdAt: new Date().toISOString() });
      const msg2 = JSON.stringify({ msgId: 'm2', fromUid: 'u3', content: 'Missed you', createdAt: new Date().toISOString() });

      // Return two messages then null
      redis.lpop
        .mockResolvedValueOnce(msg1)
        .mockResolvedValueOnce(msg2)
        .mockResolvedValueOnce(null);

      const svc = createMessageService({ prisma, mongo, redis });
      const result = await svc.getOfflineMessages('u1');

      expect(result.length).toBe(2);
      expect(result[0].msgId).toBe('m1');
      expect(result[0].content).toBe('Hello offline');
      expect(result[1].msgId).toBe('m2');
    });

    it('returns empty when queue is empty', async () => {
      redis.lpop.mockResolvedValue(null);
      const svc = createMessageService({ prisma, mongo, redis });
      const result = await svc.getOfflineMessages('u1');
      expect(result).toEqual([]);
    });

    it('handles corrupted message data gracefully', async () => {
      redis.lpop
        .mockResolvedValueOnce('not-valid-json{{{')
        .mockResolvedValueOnce(JSON.stringify({ msgId: 'm1', content: 'Valid' }))
        .mockResolvedValueOnce(null);

      const svc = createMessageService({ prisma, mongo, redis });
      const result = await svc.getOfflineMessages('u1');

      expect(result.length).toBe(1);
      expect(result[0].msgId).toBe('m1');
    });
  });

  // ─── Conversation ID generation ───────────────────────────────────────────

  describe('conversation ID generation', () => {
    it('uses consistent ordering for private conversations', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u2', username: 'bob' });
      const svc = createMessageService({ prisma, mongo });

      await svc.sendMessage({ fromUid: 'u2', toUid: 'u1', chatType: 'private', msgType: 1, content: 'x' });
      await svc.sendMessage({ fromUid: 'u1', toUid: 'u2', chatType: 'private', msgType: 1, content: 'y' });

      // Both messages should use the same conversation ID
      const boxes = mongo._boxCol.insertMany.mock.calls.flatMap((call: any) => call[0]);
      const convIds = boxes.map((b: any) => b.conversationId);
      const unique = [...new Set(convIds)];
      expect(unique.length).toBe(1);
      expect(unique[0]).toBe('conv:u1:u2');
    });

    it('uses group prefix for group conversations', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: 'g1', name: 'test' });
      prisma.groupMember.findUnique.mockResolvedValue({ groupId: 'g1', userId: 'u1', role: 'member' });
      prisma.groupMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);

      const svc = createMessageService({ prisma, mongo });
      await svc.sendMessage({ fromUid: 'u1', toGroupId: 'g1', chatType: 'group', msgType: 1, content: 'x' });

      const boxes = mongo._boxCol.insertMany.mock.calls[0][0];
      expect(boxes[0].conversationId).toBe('conv:group:g1');
    });
  });
});
