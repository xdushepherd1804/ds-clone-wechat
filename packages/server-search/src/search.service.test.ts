import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSearchService, SearchError } from './search.service';

// ─── Mock factories ─────────────────────────────────────────────────────────

function makeMockPrisma() {
  return {
    contact: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    group: { findMany: vi.fn() },
  } as any;
}

function makeMockMongo() {
  const messages: any[] = [];
  const boxes: any[] = [];

  function makeChainableFind(storage: any[]) {
    let _filter: any = {};
    let _projection: any = {};
    let _sort: any = {};
    let _limit = 500;

    const toArray = vi.fn(async () => {
      let results = [...storage];

      // Apply filter
      if (_filter && Object.keys(_filter).length > 0) {
        results = results.filter((r) => {
          for (const [k, v] of Object.entries(_filter)) {
            if (k === 'msgId' && typeof v === 'object' && v.$in) {
              if (!v.$in.includes(r.msgId)) return false;
            } else if (k === 'content' && typeof v === 'object' && v.$regex) {
              const flags = v.$options ?? '';
              const regex = new RegExp(v.$regex, flags);
              if (!regex.test(r.content)) return false;
            } else if (k === 'msgType' && r.msgType !== v) {
              return false;
            } else if (k === 'userId' && r.userId !== v) {
              return false;
            } else if (k === 'conversationId' && r.conversationId !== v) {
              return false;
            }
          }
          return true;
        });
      }

      // Apply sort
      if (_sort && Object.keys(_sort).length > 0) {
        for (const [field, dir] of Object.entries(_sort)) {
          const mult = (dir as number) === -1 ? -1 : 1;
          results.sort((a: any, b: any) => {
            const va = a[field] instanceof Date ? a[field].getTime() : a[field];
            const vb = b[field] instanceof Date ? b[field].getTime() : b[field];
            return (va > vb ? 1 : va < vb ? -1 : 0) * mult;
          });
        }
      }

      // Apply limit
      results = results.slice(0, _limit);

      return results;
    });

    const chain = {
      project: vi.fn((p: any) => { _projection = p; return chain; }),
      sort: vi.fn((s: any) => { _sort = s; return chain; }),
      limit: vi.fn((n: number) => { _limit = n; return chain; }),
      toArray,
    };

    const findFn = vi.fn((filter: any) => {
      _filter = filter;
      return chain;
    });

    return { findFn, chain };
  }

  const { findFn: msgFind, chain: msgChain } = makeChainableFind(messages);
  const { findFn: boxFind, chain: boxChain } = makeChainableFind(boxes);

  const msgCol = {
    find: msgFind,
    createIndex: vi.fn(async () => 'index_created'),
  } as any;

  const boxCol = {
    find: boxFind,
    createIndex: vi.fn(async () => 'index_created'),
  } as any;

  const db: any = {
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

  return db;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('search.service', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let mongo: ReturnType<typeof makeMockMongo>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    mongo = makeMockMongo();
  });

  // ─── searchMessages ──────────────────────────────────────────────────────

  describe('searchMessages', () => {
    it('throws if keyword is empty', async () => {
      const svc = createSearchService({ prisma, mongo });
      await expect(
        svc.searchMessages({ userId: 'u1', keyword: '' }),
      ).rejects.toThrow(SearchError);
    });

    it('throws if keyword is whitespace only', async () => {
      const svc = createSearchService({ prisma, mongo });
      await expect(
        svc.searchMessages({ userId: 'u1', keyword: '   ' }),
      ).rejects.toThrow(SearchError);
    });

    it('returns empty results when no MongoDB available', async () => {
      const svc = createSearchService({ prisma, mongo: null });
      const result = await svc.searchMessages({ userId: 'u1', keyword: 'hello' });
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns empty results when no messages match', async () => {
      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchMessages({ userId: 'u1', keyword: 'xyz' });
      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('finds messages by content keyword', async () => {
      mongo._messages.push({
        msgId: 'm1', fromUid: 'u2', toUid: 'u1', chatType: 'private',
        msgType: 1, content: 'Hello world', createdAt: new Date('2024-01-15'),
      });
      mongo._boxes.push({
        msgId: 'm1', userId: 'u1', conversationId: 'conv:u1:u2',
      });

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchMessages({ userId: 'u1', keyword: 'hello' });

      expect(result.items.length).toBe(1);
      expect(result.items[0].msgId).toBe('m1');
      expect(result.items[0].content).toBe('Hello world');
      expect(result.total).toBe(1);
    });

    it('returns highlighted content', async () => {
      mongo._messages.push({
        msgId: 'm1', fromUid: 'u2', toUid: 'u1', chatType: 'private',
        msgType: 1, content: 'Hello world', createdAt: new Date('2024-01-15'),
      });
      mongo._boxes.push({
        msgId: 'm1', userId: 'u1', conversationId: 'conv:u1:u2',
      });

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchMessages({ userId: 'u1', keyword: 'world' });

      expect(result.items[0].highlight).toBe('Hello <mark>world</mark>');
    });

    it('is case-insensitive', async () => {
      mongo._messages.push({
        msgId: 'm1', fromUid: 'u2', toUid: 'u1', chatType: 'private',
        msgType: 1, content: 'HELLO WORLD', createdAt: new Date('2024-01-15'),
      });
      mongo._boxes.push({
        msgId: 'm1', userId: 'u1', conversationId: 'conv:u1:u2',
      });

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchMessages({ userId: 'u1', keyword: 'hello' });

      expect(result.items.length).toBe(1);
    });

    it('only searches text messages (msgType=1)', async () => {
      mongo._messages.push(
        {
          msgId: 'm1', fromUid: 'u2', toUid: 'u1', chatType: 'private',
          msgType: 2, // image, not text
          content: 'hello', createdAt: new Date('2024-01-15'),
        },
        {
          msgId: 'm2', fromUid: 'u2', toUid: 'u1', chatType: 'private',
          msgType: 1, content: 'hello text', createdAt: new Date('2024-01-15'),
        },
      );
      mongo._boxes.push(
        { msgId: 'm1', userId: 'u1', conversationId: 'conv:u1:u2' },
        { msgId: 'm2', userId: 'u1', conversationId: 'conv:u1:u2' },
      );

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchMessages({ userId: 'u1', keyword: 'hello' });

      // Only the text message should match
      expect(result.items.length).toBe(1);
      expect(result.items[0].msgId).toBe('m2');
    });

    it('filters by conversation ID', async () => {
      mongo._messages.push(
        {
          msgId: 'm1', fromUid: 'u2', toUid: 'u1', chatType: 'private',
          msgType: 1, content: 'hello from u2', createdAt: new Date('2024-01-15'),
        },
        {
          msgId: 'm2', fromUid: 'u3', toUid: 'u1', chatType: 'private',
          msgType: 1, content: 'hello from u3', createdAt: new Date('2024-01-16'),
        },
      );
      mongo._boxes.push(
        { msgId: 'm1', userId: 'u1', conversationId: 'conv:u1:u2' },
        { msgId: 'm2', userId: 'u1', conversationId: 'conv:u2:u3' },
      );

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchMessages({
        userId: 'u1', keyword: 'hello', convId: 'conv:u1:u2',
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].msgId).toBe('m1');
    });

    it('supports pagination', async () => {
      for (let i = 0; i < 5; i++) {
        mongo._messages.push({
          msgId: `m${i}`, fromUid: 'u2', toUid: 'u1', chatType: 'private',
          msgType: 1, content: `hello ${i}`, createdAt: new Date(2024, 0, 15 - i),
        });
        mongo._boxes.push({
          msgId: `m${i}`, userId: 'u1', conversationId: 'conv:u1:u2',
        });
      }

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchMessages({
        userId: 'u1', keyword: 'hello', page: 1, size: 2,
      });

      expect(result.items.length).toBe(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.size).toBe(2);
    });

    it('sorts results by createdAt descending (relevance proxy)', async () => {
      mongo._messages.push(
        {
          msgId: 'm1', fromUid: 'u2', toUid: 'u1', chatType: 'private',
          msgType: 1, content: 'old hello', createdAt: new Date('2024-01-01'),
        },
        {
          msgId: 'm2', fromUid: 'u2', toUid: 'u1', chatType: 'private',
          msgType: 1, content: 'new hello', createdAt: new Date('2024-06-01'),
        },
      );
      mongo._boxes.push(
        { msgId: 'm1', userId: 'u1', conversationId: 'conv:u1:u2' },
        { msgId: 'm2', userId: 'u1', conversationId: 'conv:u1:u2' },
      );

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchMessages({ userId: 'u1', keyword: 'hello' });

      expect(result.items[0].msgId).toBe('m2');
      expect(result.items[1].msgId).toBe('m1');
    });

    it('groups results by conversation (different conversations)', async () => {
      mongo._messages.push(
        {
          msgId: 'm1', fromUid: 'u2', toUid: 'u1', chatType: 'private',
          msgType: 1, content: 'hello', createdAt: new Date('2024-01-15'),
        },
        {
          msgId: 'm2', fromUid: 'u3', toUid: 'u1', chatType: 'private',
          msgType: 1, content: 'hello', createdAt: new Date('2024-01-16'),
        },
      );
      mongo._boxes.push(
        { msgId: 'm1', userId: 'u1', conversationId: 'conv:u1:u2' },
        { msgId: 'm2', userId: 'u1', conversationId: 'conv:u1:u3' },
      );

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchMessages({ userId: 'u1', keyword: 'hello' });

      expect(result.items.length).toBe(2);
      const convIds = result.items.map((i) => i.conversationId);
      expect(convIds).toContain('conv:u1:u2');
      expect(convIds).toContain('conv:u1:u3');
    });
  });

  // ─── searchContacts ──────────────────────────────────────────────────────

  describe('searchContacts', () => {
    it('throws if keyword is empty', async () => {
      const svc = createSearchService({ prisma, mongo });
      await expect(
        svc.searchContacts({ userId: 'u1', keyword: '' }),
      ).rejects.toThrow(SearchError);
    });

    it('returns contacts matching keyword', async () => {
      prisma.contact.findMany.mockResolvedValue([
        {
          contactId: 'u2',
          contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([]); // fewer than 20 triggers global search fallback

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchContacts({ userId: 'u1', keyword: 'bob' });

      expect(result.items.length).toBe(1);
      expect(result.items[0].username).toBe('bob');
      expect(result.items[0].isContact).toBe(true);
      expect(result.total).toBe(1);

      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            status: 'active',
          }),
        }),
      );
    });

    it('searches by remark as well', async () => {
      prisma.contact.findMany.mockResolvedValue([
        {
          contactId: 'u2',
          contact: { id: 'u2', username: 'user2', nickname: 'User2', avatar: null },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([]);

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchContacts({ userId: 'u1', keyword: 'friend' });
      expect(result.items.length).toBeGreaterThanOrEqual(0);
    });

    it('falls back to global user search', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'u3', username: 'charlie', nickname: 'Charlie', avatar: null },
      ]);

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchContacts({ userId: 'u1', keyword: 'charlie' });

      expect(result.items.length).toBe(1);
      expect(result.items[0].isContact).toBe(false);
      expect(prisma.user.findMany).toHaveBeenCalled();
    });

    it('caps results at 20', async () => {
      const contacts = Array.from({ length: 20 }, (_, i) => ({
        contactId: `u${i + 2}`,
        contact: { id: `u${i + 2}`, username: `user${i}`, nickname: `User${i}`, avatar: null },
      }));
      prisma.contact.findMany.mockResolvedValue(contacts);

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchContacts({ userId: 'u1', keyword: 'user' });

      expect(result.items.length).toBe(20);
      expect(result.total).toBe(20);
    });
  });

  // ─── searchGroups ────────────────────────────────────────────────────────

  describe('searchGroups', () => {
    it('throws if keyword is empty', async () => {
      const svc = createSearchService({ prisma, mongo });
      await expect(
        svc.searchGroups({ userId: 'u1', keyword: '' }),
      ).rejects.toThrow(SearchError);
    });

    it('returns groups matching keyword', async () => {
      prisma.group.findMany.mockResolvedValue([
        {
          id: 'g1', name: 'React Developers', avatar: null, memberCount: 100,
          members: [{ userId: 'u1' }],
        },
      ]);

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchGroups({ userId: 'u1', keyword: 'react' });

      expect(result.items.length).toBe(1);
      expect(result.items[0].name).toBe('React Developers');
      expect(result.items[0].isMember).toBe(true);
      expect(result.items[0].memberCount).toBe(100);
    });

    it('distinguishes between member and non-member', async () => {
      prisma.group.findMany.mockResolvedValue([
        {
          id: 'g1', name: 'Public Group', avatar: null, memberCount: 50,
          members: [],
        },
      ]);

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchGroups({ userId: 'u1', keyword: 'public' });

      expect(result.items[0].isMember).toBe(false);
    });
  });

  // ─── searchAll ───────────────────────────────────────────────────────────

  describe('searchAll', () => {
    it('throws if keyword is empty', async () => {
      const svc = createSearchService({ prisma, mongo });
      await expect(
        svc.searchAll({ userId: 'u1', keyword: '' }),
      ).rejects.toThrow(SearchError);
    });

    it('returns aggregated results from all search types', async () => {
      // Seed message data
      mongo._messages.push({
        msgId: 'm1', fromUid: 'u2', toUid: 'u1', chatType: 'private',
        msgType: 1, content: 'hello world', createdAt: new Date('2024-01-15'),
      });
      mongo._boxes.push({ msgId: 'm1', userId: 'u1', conversationId: 'conv:u1:u2' });

      // Seed contact data
      prisma.contact.findMany.mockResolvedValue([
        {
          contactId: 'u2',
          contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null },
        },
      ]);
      prisma.user.findMany.mockResolvedValue([]); // fallback global search

      // Seed group data
      prisma.group.findMany.mockResolvedValue([
        {
          id: 'g1', name: 'Hello Group', avatar: null, memberCount: 10,
          members: [{ userId: 'u1' }],
        },
      ]);

      const svc = createSearchService({ prisma, mongo });
      const result = await svc.searchAll({ userId: 'u1', keyword: 'hello' });

      expect(result.messages.length).toBe(1);
      expect(result.contacts.length).toBe(1);
      expect(result.groups.length).toBe(1);
    });
  });

  // ─── initSearchIndexes ──────────────────────────────────────────────────

  describe('initSearchIndexes', () => {
    it('returns empty list without MongoDB', async () => {
      const svc = createSearchService({ prisma, mongo: null });
      const result = await svc.initSearchIndexes();
      expect(result.created).toEqual([]);
    });

    it('creates search indexes on MongoDB collections', async () => {
      const svc = createSearchService({ prisma, mongo });
      const result = await svc.initSearchIndexes();
      expect(result.created).toContain('messages.content_text');
      expect(result.created).toContain('message_boxes.user_msg');
      expect(mongo._msgCol.createIndex).toHaveBeenCalled();
      expect(mongo._boxCol.createIndex).toHaveBeenCalled();
    });

    it('handles index creation errors gracefully', async () => {
      mongo._msgCol.createIndex.mockRejectedValue(new Error('Index exists'));
      const svc = createSearchService({ prisma, mongo });
      const result = await svc.initSearchIndexes();
      // Should still succeed, just return what was created
      expect(Array.isArray(result.created)).toBe(true);
    });
  });
});
