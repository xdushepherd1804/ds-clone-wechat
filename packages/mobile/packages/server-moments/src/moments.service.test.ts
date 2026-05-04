import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMomentsService, MomentError } from './moments.service';

function makeMockRedis() {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    mget: vi.fn(async (keys: string[]) => keys.map((k) => store.get(k) ?? null)),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }),
    del: vi.fn(async (key: string) => { store.delete(key); return 1; }),
    pipeline: vi.fn(() => ({
      zadd: vi.fn(function (this: any) { return this; }),
      zrem: vi.fn(function (this: any) { return this; }),
      exec: vi.fn(async () => []),
    })),
    zadd: vi.fn(async () => {}),
    zrem: vi.fn(async () => {}),
    zrevrange: vi.fn(async () => []),
    _store: store,
  } as any;
}

const u1 = { id: 'u1', nickname: 'Alice', avatar: null };
const u2 = { id: 'u2', nickname: 'Bob', avatar: null };
const u3 = { id: 'u3', nickname: 'Charlie', avatar: null };

function makeMockPrisma() {
  return {
    moment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    momentLike: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    momentComment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    contact: {
      findUnique: vi.fn(),
      findMany: vi.fn(async () => []),
    },
    $transaction: vi.fn(),
  } as any;
}

function setupFriends(prisma: ReturnType<typeof makeMockPrisma>, userId: string, friendIds: string[]) {
  prisma.contact.findMany.mockImplementation(async (args: any) => {
    if (args?.where?.userId === userId && args?.where?.status === 'active') {
      return friendIds.map((fid) => ({ contactId: fid }));
    }
    if (args?.where?.contactId && args?.where?.status === 'active') {
      return friendIds.map((fid) => ({ userId: fid }));
    }
    return [];
  });

  prisma.contact.findUnique.mockImplementation(async (args: any) => {
    const w = args?.where?.userId_contactId;
    if (w && w.userId === userId && friendIds.includes(w.contactId)) {
      return { status: 'active' };
    }
    return null;
  });
}

function setupUsers(prisma: ReturnType<typeof makeMockPrisma>) {
  prisma.user.findMany.mockImplementation(async (args: any) => {
    const ids: string[] = args?.where?.id?.in ?? [];
    return ids.map((id: string) => {
      if (id === 'u1') return u1;
      if (id === 'u2') return u2;
      if (id === 'u3') return u3;
      return { id, nickname: 'User' + id, avatar: null };
    });
  });
  prisma.user.findUnique.mockImplementation(async (args: any) => {
    const id = args?.where?.id;
    if (id === 'u1') return u1;
    if (id === 'u2') return u2;
    if (id === 'u3') return u3;
    return null;
  });
}

function makeMoment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    userId: 'u1',
    content: 'Hello world!',
    images: [],
    location: null,
    visibility: 'public',
    likes: [],
    comments: [],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('moments.service', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let redis: ReturnType<typeof makeMockRedis>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    redis = makeMockRedis();
    setupUsers(prisma);
  });

  // ─── createMoment ───────────────────────────────────────────────────────

  describe('createMoment', () => {
    it('throws if both content and images are empty', async () => {
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.createMoment({
        userId: 'u1', content: '', images: [],
      })).rejects.toThrow(MomentError);
    });

    it('throws if content is too long', async () => {
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.createMoment({
        userId: 'u1', content: 'x'.repeat(2001),
      })).rejects.toThrow(MomentError);
    });

    it('throws if too many images', async () => {
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.createMoment({
        userId: 'u1', content: 'test', images: Array(10).fill('img.jpg'),
      })).rejects.toThrow(MomentError);
    });

    it('throws if visibility is invalid', async () => {
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.createMoment({
        userId: 'u1', content: 'test', visibility: 'secret',
      })).rejects.toThrow(MomentError);
    });

    it('creates moment with content only', async () => {
      prisma.moment.create.mockResolvedValue(makeMoment());
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.createMoment({ userId: 'u1', content: 'Hello world!' });
      expect(result.id).toBe('m1');
      expect(result.content).toBe('Hello world!');
      expect(result.likeCount).toBe(0);
      expect(result.commentCount).toBe(0);
      expect(result.user.nickname).toBe('Alice');
    });

    it('creates moment with images', async () => {
      prisma.moment.create.mockResolvedValue(makeMoment({
        content: null, images: ['img1.jpg', 'img2.jpg'],
      }));
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.createMoment({ userId: 'u1', images: ['img1.jpg', 'img2.jpg'] });
      expect(result.images).toHaveLength(2);
    });

    it('creates moment with location', async () => {
      prisma.moment.create.mockResolvedValue(makeMoment({
        content: 'At the park', location: 'Central Park',
      }));
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.createMoment({
        userId: 'u1', content: 'At the park', location: 'Central Park',
      });
      expect(result.location).toBe('Central Park');
    });

    it('creates private moment', async () => {
      prisma.moment.create.mockResolvedValue(makeMoment({
        content: 'Private thought', visibility: 'private',
      }));
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.createMoment({
        userId: 'u1', content: 'Private thought', visibility: 'private',
      });
      expect(result.visibility).toBe('private');
    });

    it('creates friends-only moment', async () => {
      prisma.moment.create.mockResolvedValue(makeMoment({
        content: 'Friends only', visibility: 'friends',
      }));
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.createMoment({
        userId: 'u1', content: 'Friends only', visibility: 'friends',
      });
      expect(result.visibility).toBe('friends');
    });
  });

  // ─── deleteMoment ──────────────────────────────────────────────────────

  describe('deleteMoment', () => {
    it('throws if moment not found', async () => {
      prisma.moment.findUnique.mockResolvedValue(null);
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.deleteMoment({ momentId: 'm999', userId: 'u1' }))
        .rejects.toThrow(MomentError);
    });

    it('throws if user is not the author', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1', userId: 'u2' });
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.deleteMoment({ momentId: 'm1', userId: 'u1' }))
        .rejects.toThrow(MomentError);
    });

    it('deletes own moment', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1', userId: 'u1' });
      prisma.moment.delete.mockResolvedValue({});
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.deleteMoment({ momentId: 'm1', userId: 'u1' }))
        .resolves.toBeUndefined();
    });
  });

  // ─── getMomentById ──────────────────────────────────────────────────────

  describe('getMomentById', () => {
    it('throws if moment not found', async () => {
      prisma.moment.findUnique.mockResolvedValue(null);
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.getMomentById('m999', 'u1'))
        .rejects.toThrow(MomentError);
    });

    it('returns own moment even if private', async () => {
      prisma.moment.findUnique.mockResolvedValue(makeMoment({ visibility: 'private' }));
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.getMomentById('m1', 'u1');
      expect(result.id).toBe('m1');
      expect(result.visibility).toBe('private');
    });

    it('returns public moment to anyone', async () => {
      prisma.moment.findUnique.mockResolvedValue(makeMoment({ userId: 'u2', visibility: 'public' }));
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.getMomentById('m1', 'u3');
      expect(result.id).toBe('m1');
    });

    it('denies non-friend viewing friends-only moment', async () => {
      prisma.moment.findUnique.mockResolvedValue(makeMoment({ userId: 'u2', visibility: 'friends' }));
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.getMomentById('m1', 'u3'))
        .rejects.toThrow(MomentError);
    });

    it('allows friend viewing friends-only moment', async () => {
      setupFriends(prisma, 'u1', ['u2']);
      prisma.moment.findUnique.mockResolvedValue(makeMoment({ userId: 'u2', visibility: 'friends' }));
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.getMomentById('m1', 'u1');
      expect(result.id).toBe('m1');
    });

    it('denies non-friend viewing private moment', async () => {
      prisma.moment.findUnique.mockResolvedValue(makeMoment({ userId: 'u2', visibility: 'private' }));
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.getMomentById('m1', 'u3'))
        .rejects.toThrow(MomentError);
    });
  });

  // ─── getUserMoments ─────────────────────────────────────────────────────

  describe('getUserMoments', () => {
    it('returns all moments when viewing own profile', async () => {
      prisma.moment.findMany.mockResolvedValue([
        makeMoment({ id: 'm1', visibility: 'public' }),
        makeMoment({ id: 'm2', visibility: 'friends' }),
        makeMoment({ id: 'm3', visibility: 'private' }),
      ]);
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.getUserMoments('u1', { userId: 'u1' });
      expect(result).toHaveLength(3);
    });

    it('returns public + friends moments for a friend', async () => {
      setupFriends(prisma, 'u1', ['u2']);
      prisma.moment.findMany.mockResolvedValue([
        makeMoment({ id: 'm1', userId: 'u2', visibility: 'public' }),
        makeMoment({ id: 'm2', userId: 'u2', visibility: 'friends' }),
      ]);
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.getUserMoments('u2', { userId: 'u1' });
      expect(result).toHaveLength(2);
    });

    it('returns only public moments for a stranger', async () => {
      prisma.moment.findMany.mockResolvedValue([
        makeMoment({ id: 'm1', userId: 'u2', visibility: 'public' }),
      ]);
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.getUserMoments('u2', { userId: 'u1' });
      expect(result).toHaveLength(1);
      expect(result[0].visibility).toBe('public');
    });

    it('supports cursor-based pagination', async () => {
      prisma.moment.findMany.mockResolvedValue([]);
      const svc = createMomentsService({ prisma, redis });
      await svc.getUserMoments('u1', { userId: 'u1', before: '2025-01-01T00:00:00Z' });
      expect(prisma.moment.findMany).toHaveBeenCalled();
    });
  });

  // ─── getTimeline ────────────────────────────────────────────────────────

  describe('getTimeline', () => {
    it('returns own moments and friends moments', async () => {
      setupFriends(prisma, 'u1', ['u2', 'u3']);
      prisma.moment.findMany.mockResolvedValue([
        makeMoment({ id: 'm1', userId: 'u1', content: 'My post' }),
        makeMoment({ id: 'm2', userId: 'u2', content: 'Friend post', visibility: 'public' }),
        makeMoment({ id: 'm3', userId: 'u3', content: 'Friend post 2', visibility: 'friends' }),
      ]);
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.getTimeline({ userId: 'u1' });
      expect(result).toHaveLength(3);
    });

    it('includes own private moments in timeline', async () => {
      setupFriends(prisma, 'u1', []);
      prisma.moment.findMany.mockResolvedValue([
        makeMoment({ id: 'm1', userId: 'u1', visibility: 'private' }),
      ]);
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.getTimeline({ userId: 'u1' });
      expect(result).toHaveLength(1);
    });

    it('respects limit parameter', async () => {
      setupFriends(prisma, 'u1', []);
      prisma.moment.findMany.mockResolvedValue([]);
      const svc = createMomentsService({ prisma, redis });
      await svc.getTimeline({ userId: 'u1', limit: 5 });
      expect(prisma.moment.findMany).toHaveBeenCalled();
    });

    it('supports cursor-based pagination', async () => {
      setupFriends(prisma, 'u1', []);
      prisma.moment.findMany.mockResolvedValue([]);
      const svc = createMomentsService({ prisma, redis });
      await svc.getTimeline({ userId: 'u1', before: '2025-01-01T00:00:00Z' });
      expect(prisma.moment.findMany).toHaveBeenCalled();
    });

    it('populates user info for authors and likers', async () => {
      setupFriends(prisma, 'u1', ['u2']);
      prisma.moment.findMany.mockResolvedValue([
        makeMoment({
          id: 'm1',
          userId: 'u2',
          content: 'Hello',
          visibility: 'public',
          likes: [{ id: 'l1', momentId: 'm1', userId: 'u1', createdAt: new Date() }],
          comments: [],
        }),
      ]);
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.getTimeline({ userId: 'u1' });
      expect(result[0].user.nickname).toBe('Bob');
      expect(result[0].likes[0].user.nickname).toBe('Alice');
    });
  });

  // ─── toggleLikeMoment ───────────────────────────────────────────────────

  describe('toggleLikeMoment', () => {
    it('throws if moment not found', async () => {
      prisma.moment.findUnique.mockResolvedValue(null);
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.toggleLikeMoment({ momentId: 'm999', userId: 'u1' }))
        .rejects.toThrow(MomentError);
    });

    it('creates a like on first toggle (liked=true)', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.momentLike.findUnique.mockResolvedValue(null);
      prisma.momentLike.create.mockResolvedValue({
        id: 'l1', momentId: 'm1', userId: 'u1', createdAt: new Date(),
      });
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.toggleLikeMoment({ momentId: 'm1', userId: 'u1' });
      expect(result.liked).toBe(true);
    });

    it('removes a like on second toggle (liked=false)', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.momentLike.findUnique.mockResolvedValue({ id: 'l1' });
      prisma.momentLike.delete.mockResolvedValue({});
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.toggleLikeMoment({ momentId: 'm1', userId: 'u1' });
      expect(result.liked).toBe(false);
    });

    it('can be toggled back and forth', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1' });
      const svc = createMomentsService({ prisma, redis });

      // First toggle: like
      prisma.momentLike.findUnique.mockResolvedValue(null);
      prisma.momentLike.create.mockResolvedValue({ id: 'l1', momentId: 'm1', userId: 'u1', createdAt: new Date() });
      let result = await svc.toggleLikeMoment({ momentId: 'm1', userId: 'u1' });
      expect(result.liked).toBe(true);

      // Second toggle: unlike
      prisma.momentLike.findUnique.mockResolvedValue({ id: 'l1' });
      prisma.momentLike.delete.mockResolvedValue({});
      result = await svc.toggleLikeMoment({ momentId: 'm1', userId: 'u1' });
      expect(result.liked).toBe(false);

      // Third toggle: like again
      prisma.momentLike.findUnique.mockResolvedValue(null);
      prisma.momentLike.create.mockResolvedValue({ id: 'l2', momentId: 'm1', userId: 'u1', createdAt: new Date() });
      result = await svc.toggleLikeMoment({ momentId: 'm1', userId: 'u1' });
      expect(result.liked).toBe(true);
    });
  });

  // ─── likeMoment (backward compat) ───────────────────────────────────────

  describe('likeMoment', () => {
    it('throws if moment not found', async () => {
      prisma.moment.findUnique.mockResolvedValue(null);
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.likeMoment({ momentId: 'm999', userId: 'u1' }))
        .rejects.toThrow(MomentError);
    });

    it('throws if already liked', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.momentLike.findUnique.mockResolvedValue({ id: 'l1' });
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.likeMoment({ momentId: 'm1', userId: 'u1' }))
        .rejects.toThrow(MomentError);
    });

    it('creates a like with user info', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.momentLike.findUnique.mockResolvedValue(null);
      prisma.momentLike.create.mockResolvedValue({
        id: 'l1', momentId: 'm1', userId: 'u1', createdAt: new Date(),
      });
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.likeMoment({ momentId: 'm1', userId: 'u1' });
      expect(result.momentId).toBe('m1');
      expect(result.userId).toBe('u1');
      expect(result.user.nickname).toBe('Alice');
    });
  });

  // ─── unlikeMoment (backward compat) ─────────────────────────────────────

  describe('unlikeMoment', () => {
    it('throws if not liked', async () => {
      prisma.momentLike.findUnique.mockResolvedValue(null);
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.unlikeMoment({ momentId: 'm1', userId: 'u1' }))
        .rejects.toThrow(MomentError);
    });

    it('removes the like', async () => {
      prisma.momentLike.findUnique.mockResolvedValue({ id: 'l1' });
      prisma.momentLike.delete.mockResolvedValue({});
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.unlikeMoment({ momentId: 'm1', userId: 'u1' }))
        .resolves.toBeUndefined();
    });
  });

  // ─── addComment ─────────────────────────────────────────────────────────

  describe('addComment', () => {
    it('throws if moment not found', async () => {
      prisma.moment.findUnique.mockResolvedValue(null);
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.addComment({ momentId: 'm999', userId: 'u1', content: 'Nice!' }))
        .rejects.toThrow(MomentError);
    });

    it('throws if content is empty', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1' });
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.addComment({ momentId: 'm1', userId: 'u1', content: '' }))
        .rejects.toThrow(MomentError);
    });

    it('throws if content too long', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1' });
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.addComment({ momentId: 'm1', userId: 'u1', content: 'x'.repeat(501) }))
        .rejects.toThrow(MomentError);
    });

    it('throws if replyTo comment is not in the moment', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.momentComment.findUnique.mockResolvedValue({ id: 'c1', momentId: 'm2' });
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.addComment({
        momentId: 'm1', userId: 'u1', content: 'Reply', replyToId: 'c1',
      })).rejects.toThrow(MomentError);
    });

    it('adds a comment with user info', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.momentComment.create.mockResolvedValue({
        id: 'c1', momentId: 'm1', userId: 'u1',
        replyToId: null, content: 'Great post!',
        createdAt: new Date(),
      });
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.addComment({ momentId: 'm1', userId: 'u1', content: 'Great post!' });
      expect(result.content).toBe('Great post!');
      expect(result.momentId).toBe('m1');
      expect(result.user.nickname).toBe('Alice');
    });

    it('adds a reply comment with replyTo info', async () => {
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1' });
      prisma.momentComment.findUnique.mockResolvedValue({ id: 'c1', momentId: 'm1', userId: 'u1' });
      prisma.momentComment.create.mockResolvedValue({
        id: 'c2', momentId: 'm1', userId: 'u2',
        replyToId: 'c1', content: 'Thanks!',
        createdAt: new Date(),
      });
      const svc = createMomentsService({ prisma, redis });
      const result = await svc.addComment({
        momentId: 'm1', userId: 'u2', content: 'Thanks!', replyToId: 'c1',
      });
      expect(result.replyToId).toBe('c1');
      expect(result.replyTo?.nickname).toBe('Alice');
    });
  });

  // ─── deleteComment ──────────────────────────────────────────────────────

  describe('deleteComment', () => {
    it('throws if comment not found', async () => {
      prisma.momentComment.findUnique.mockResolvedValue(null);
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.deleteComment({ momentId: 'm1', commentId: 'c999', userId: 'u1' }))
        .rejects.toThrow(MomentError);
    });

    it('throws if comment does not belong to the moment', async () => {
      prisma.momentComment.findUnique.mockResolvedValue({ id: 'c1', momentId: 'm2', userId: 'u2' });
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.deleteComment({ momentId: 'm1', commentId: 'c1', userId: 'u1' }))
        .rejects.toThrow(MomentError);
    });

    it('allows comment author to delete', async () => {
      prisma.momentComment.findUnique.mockResolvedValue({ id: 'c1', momentId: 'm1', userId: 'u1' });
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1', userId: 'u2' });
      prisma.momentComment.delete.mockResolvedValue({});
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.deleteComment({ momentId: 'm1', commentId: 'c1', userId: 'u1' }))
        .resolves.toBeUndefined();
    });

    it('allows moment author to delete any comment', async () => {
      prisma.momentComment.findUnique.mockResolvedValue({ id: 'c1', momentId: 'm1', userId: 'u2' });
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1', userId: 'u1' });
      prisma.momentComment.delete.mockResolvedValue({});
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.deleteComment({ momentId: 'm1', commentId: 'c1', userId: 'u1' }))
        .resolves.toBeUndefined();
    });

    it('denies non-author, non-owner from deleting', async () => {
      prisma.momentComment.findUnique.mockResolvedValue({ id: 'c1', momentId: 'm1', userId: 'u2' });
      prisma.moment.findUnique.mockResolvedValue({ id: 'm1', userId: 'u2' });
      const svc = createMomentsService({ prisma, redis });
      await expect(svc.deleteComment({ momentId: 'm1', commentId: 'c1', userId: 'u3' }))
        .rejects.toThrow(MomentError);
    });
  });

  // ─── Redis integration ──────────────────────────────────────────────────

  describe('Redis integration', () => {
    it('works when redis is null (graceful degradation)', async () => {
      prisma.moment.create.mockResolvedValue(makeMoment());
      const svc = createMomentsService({ prisma });
      const result = await svc.createMoment({ userId: 'u1', content: 'Hello world!' });
      expect(result.content).toBe('Hello world!');
    });

    it('has all required methods when created without redis', async () => {
      const svc = createMomentsService({ prisma });
      expect(svc.createMoment).toBeDefined();
      expect(svc.getTimeline).toBeDefined();
      expect(svc.toggleLikeMoment).toBeDefined();
      expect(svc.getMomentById).toBeDefined();
      expect(svc.getUserMoments).toBeDefined();
      expect(svc.addComment).toBeDefined();
      expect(svc.deleteComment).toBeDefined();
    });
  });
});
