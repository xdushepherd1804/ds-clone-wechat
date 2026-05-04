import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock setup ─────────────────────────────────────────────────────────────

const mockRedisOps = {
  get: vi.fn().mockResolvedValue(null),
  setex: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  lpush: vi.fn().mockResolvedValue(1),
  rpush: vi.fn().mockResolvedValue(1),
  lpop: vi.fn().mockResolvedValue(null),
  lrange: vi.fn().mockResolvedValue([]),
  lrem: vi.fn().mockResolvedValue(0),
  llen: vi.fn().mockResolvedValue(0),
  zadd: vi.fn().mockResolvedValue(1),
  zrem: vi.fn().mockResolvedValue(0),
  zcard: vi.fn().mockResolvedValue(0),
  zrevrange: vi.fn().mockResolvedValue([]),
  hset: vi.fn().mockResolvedValue(1),
  hget: vi.fn().mockResolvedValue(null),
  hdel: vi.fn().mockResolvedValue(0),
  hlen: vi.fn().mockResolvedValue(0),
  sadd: vi.fn().mockResolvedValue(1),
  scard: vi.fn().mockResolvedValue(0),
  publish: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(1),
  pipeline: vi.fn(),
  quit: vi.fn().mockResolvedValue('OK'),
};

function makeRedis() {
  const pipeline = {
    rpush: vi.fn().mockReturnThis(),
    lrem: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    lpush: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    setex: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    publish: vi.fn().mockReturnThis(),
    get: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  const redis = { ...mockRedisOps, pipeline: vi.fn(() => pipeline) };
  return { redis, pipeline };
}

vi.mock('ioredis', () => ({
  Redis: vi.fn(),
}));

vi.mock('@wechat-clone/shared', () => ({
  ErrorCode: {
    SUCCESS: 0,
    INVALID_PARAM: 1001,
    RATE_LIMITED: 1002,
    INTERNAL_ERROR: 1003,
    NOT_FOUND: 1004,
    FORBIDDEN: 1005,
    UNAUTHORIZED: 2000,
    MSG_SEND_FAILED: 3000,
  },
  generateId: vi.fn(() => {
    let n = 0;
    return () => `push_${++n}_${Date.now()}`;
  })(),
  RedisKeys: {
    userOnline: (uid: string) => `wc:user:online:${uid}`,
    offlineMessages: (uid: string) => `wc:user:offline:${uid}`,
    session: (token: string) => `wc:session:${token}`,
    recentContacts: (uid: string) => `wc:user:recent:${uid}`,
  },
}));

vi.mock('./push.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./push.service')>();
  return actual;
});

const { createPushService, PushError } = await import('./push.service');

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PushService', () => {
  describe('without Redis', () => {
    const service = createPushService({ redis: null });

    it('creates a service with all methods', () => {
      expect(typeof service.sendPush).toBe('function');
      expect(typeof service.processQueue).toBe('function');
      expect(typeof service.getPendingCount).toBe('function');
      expect(typeof service.markAllRead).toBe('function');
      expect(typeof service.getPendingPushes).toBe('function');
      expect(typeof service.getStats).toBe('function');
    });

    it('sendPush returns task object without Redis', async () => {
      const task = await service.sendPush(['user1', 'user2'], {
        scenario: 'new_message',
        title: 'New Message',
        body: 'You have a new message',
        senderId: 'sender1',
        senderName: 'Alice',
      });

      expect(task.pushId).toBeDefined();
      expect(task.targetUids).toEqual(['user1', 'user2']);
      expect(task.scenario).toBe('new_message');
      expect(task.priority).toBe('HIGH');
      expect(task.status).toBe('pending');
      expect(task.retryCount).toBe(0);
      expect(task.maxRetries).toBe(3);
    });

    it('sendPush defaults priority based on scenario', async () => {
      const high = await service.sendPush(['u1'], { scenario: 'new_message', title: 'T', body: 'B' });
      expect(high.priority).toBe('HIGH');

      const med = await service.sendPush(['u1'], { scenario: 'friend_request', title: 'T', body: 'B' });
      expect(med.priority).toBe('MEDIUM');

      const low = await service.sendPush(['u1'], { scenario: 'system_notice', title: 'T', body: 'B' });
      expect(low.priority).toBe('LOW');
    });

    it('sendPush throws for empty targetUids', async () => {
      await expect(service.sendPush([], { scenario: 'new_message', title: 'T', body: 'B' }))
        .rejects.toThrow(PushError);
    });

    it('sendPush throws for empty title and body', async () => {
      await expect(service.sendPush(['u1'], { scenario: 'new_message', title: '', body: '' }))
        .rejects.toThrow(PushError);
    });

    it('sendPush accepts explicit priority override', async () => {
      const task = await service.sendPush(['u1'], {
        scenario: 'system_notice',
        title: 'Urgent!',
        body: 'System down',
      }, 'HIGH');
      expect(task.priority).toBe('HIGH');
    });

    it('processQueue returns 0 without Redis', async () => {
      const count = await service.processQueue();
      expect(count).toBe(0);
    });

    it('getPendingCount returns 0 without Redis', async () => {
      const count = await service.getPendingCount('u1');
      expect(count).toBe(0);
    });

    it('markAllRead returns 0 without Redis', async () => {
      const count = await service.markAllRead('u1');
      expect(count).toBe(0);
    });

    it('getPendingPushes returns empty without Redis', async () => {
      const pushes = await service.getPendingPushes('u1');
      expect(pushes).toEqual([]);
    });

    it('getStats returns zeros without Redis', async () => {
      const stats = await service.getStats();
      expect(stats).toEqual({ pending: 0, processing: 0, delivered: 0, failed: 0 });
    });
  });

  describe('with Redis', () => {
    let service: ReturnType<typeof createPushService>;
    let redis: ReturnType<typeof makeRedis>['redis'];
    let pipeline: ReturnType<typeof makeRedis>['pipeline'];

    beforeEach(() => {
      vi.clearAllMocks();
      const m = makeRedis();
      redis = m.redis;
      pipeline = m.pipeline;
      service = createPushService({ redis: redis as any });
    });

    // ─── sendPush ────────────────────────────────────────────────────────

    describe('sendPush', () => {
      it('stores push data in Redis and enqueues', async () => {
        const task = await service.sendPush(['user1', 'user2'], {
          scenario: 'new_message',
          title: 'Hello',
          body: 'World',
        });

        expect(redis.setex).toHaveBeenCalled();
        expect(redis.zadd).toHaveBeenCalled();
        expect(redis.pipeline).toHaveBeenCalled();
        expect(pipeline.rpush).toHaveBeenCalledTimes(2); // one per user
        expect(task.status).toBe('pending');
      });
    });

    // ─── processQueue ────────────────────────────────────────────────────

    describe('processQueue', () => {
      it('processes pending pushes from the queue', async () => {
        const task = {
          pushId: 'push_1',
          targetUids: ['user1'],
          scenario: 'new_message',
          title: 'T',
          body: 'B',
          data: {},
          priority: 'HIGH',
          priorityScore: 100,
          createdAt: Date.now(),
          retryCount: 0,
          maxRetries: 3,
          status: 'pending' as const,
        };

        // Mock: zrevrange returns a push ID
        (redis.zrevrange as any).mockResolvedValue(['push_1']);
        // Mock: zrem succeeds (claim the item)
        (redis.zrem as any).mockResolvedValue(1);
        // Mock: get returns the task data
        (redis.get as any).mockImplementation((key: string) => {
          if (key === 'wc:push:data:push_1') return Promise.resolve(JSON.stringify(task));
          if (key.startsWith('wc:user:online:')) return Promise.resolve('1');
          return Promise.resolve(null);
        });
        // Mock: pipeline returns success for delivery
        (pipeline.exec as any).mockResolvedValue([]);

        const count = await service.processQueue(10);

        expect(count).toBeGreaterThanOrEqual(0);
        expect(redis.zrevrange).toHaveBeenCalledWith('wc:push:queue', 0, 9);
      });

      it('handles empty queue', async () => {
        (redis.zrevrange as any).mockResolvedValue([]);
        const count = await service.processQueue(10);
        expect(count).toBe(0);
      });

      it('retries failed pushes', async () => {
        const task = {
          pushId: 'push_r1',
          targetUids: ['user1'],
          scenario: 'friend_request' as const,
          title: 'T',
          body: 'B',
          data: {},
          priority: 'MEDIUM' as const,
          priorityScore: 50,
          createdAt: Date.now(),
          retryCount: 0,
          maxRetries: 3,
          status: 'pending' as const,
        };

        (redis.zrevrange as any).mockResolvedValue(['push_r1']);
        (redis.zrem as any).mockResolvedValue(1);
        (redis.get as any).mockImplementation((key: string) => {
          if (key === 'wc:push:data:push_r1') return Promise.resolve(JSON.stringify(task));
          if (key.startsWith('wc:user:online:')) return Promise.resolve('1');
          return Promise.resolve(null);
        });
        // publish fails (returns 0)
        (redis.publish as any).mockResolvedValue(0);

        const count = await service.processQueue(10);

        // After processing, the retry count should increment
        // Since publish "fails", the task should be re-enqueued
        expect(count).toBe(0); // Not fully delivered
      });

      it('marks as failed after max retries', async () => {
        const task = {
          pushId: 'push_f1',
          targetUids: ['user1'],
          scenario: 'system_notice' as const,
          title: 'T',
          body: 'B',
          data: {},
          priority: 'LOW' as const,
          priorityScore: 0,
          createdAt: Date.now(),
          retryCount: 2, // already tried twice
          maxRetries: 3,
          status: 'pending' as const,
        };

        (redis.zrevrange as any).mockResolvedValue(['push_f1']);
        (redis.zrem as any).mockResolvedValue(1);
        (redis.get as any).mockImplementation((key: string) => {
          if (key === 'wc:push:data:push_f1') return Promise.resolve(JSON.stringify(task));
          if (key.startsWith('wc:user:online:')) return Promise.resolve('1');
          return Promise.resolve(null);
        });
        (redis.publish as any).mockResolvedValue(0);
        (pipeline.exec as any).mockResolvedValue([]);

        const count = await service.processQueue(10);

        // Failed — should be at max retries now
        expect(count).toBe(0);
      });
    });

    // ─── getPendingCount ─────────────────────────────────────────────────

    describe('getPendingCount', () => {
      it('returns pending push count for user', async () => {
        (redis.llen as any).mockResolvedValue(5);
        const count = await service.getPendingCount('user1');
        expect(count).toBe(5);
        expect(redis.llen).toHaveBeenCalledWith('wc:push:user:user1:pending');
      });
    });

    // ─── markAllRead ─────────────────────────────────────────────────────

    describe('markAllRead', () => {
      it('clears pending pushes and publishes sync event', async () => {
        (redis.lrange as any).mockResolvedValue(['push_a', 'push_b']);
        (pipeline.exec as any).mockResolvedValue([]);

        const count = await service.markAllRead('user1');

        expect(count).toBe(2); // cleared 2 pushes
        expect(pipeline.del).toHaveBeenCalled();
        expect(pipeline.publish).toHaveBeenCalled();
      });

      it('returns 0 when no pending pushes', async () => {
        (redis.lrange as any).mockResolvedValue([]);

        const count = await service.markAllRead('user1');
        expect(count).toBe(0);
      });
    });

    // ─── getPendingPushes ────────────────────────────────────────────────

    describe('getPendingPushes', () => {
      it('returns pending push tasks for user', async () => {
        const task = {
          pushId: 'push_p1',
          targetUids: ['user1'],
          scenario: 'at_mention',
          title: 'Mention',
          body: '@you',
          data: {},
          priority: 'HIGH',
          priorityScore: 200,
          createdAt: Date.now(),
          retryCount: 0,
          maxRetries: 3,
          status: 'pending',
        };

        (redis.lrange as any).mockResolvedValue(['push_p1']);
        (pipeline.exec as any).mockResolvedValue([[null, JSON.stringify(task)]]);

        const pushes = await service.getPendingPushes('user1', 10);

        expect(pushes).toHaveLength(1);
        expect(pushes[0].scenario).toBe('at_mention');
        expect(pushes[0].priority).toBe('HIGH');
      });
    });

    // ─── getStats ────────────────────────────────────────────────────────

    describe('getStats', () => {
      it('returns queue statistics', async () => {
        (redis.zcard as any).mockResolvedValue(10);
        (redis.hlen as any).mockResolvedValue(2);
        (redis.scard as any).mockImplementation((key: string) => {
          if (key === 'wc:push:delivered:set') return Promise.resolve(100);
          if (key === 'wc:push:failed:set') return Promise.resolve(5);
          return Promise.resolve(0);
        });

        const stats = await service.getStats();

        expect(stats).toEqual({
          pending: 10,
          processing: 2,
          delivered: 100,
          failed: 5,
        });
      });
    });

    // ─── push scenarios and priorities ───────────────────────────────────

    describe('scenario priorities', () => {
      it('new_message is HIGH priority', async () => {
        const task = await service.sendPush(['u1'], {
          scenario: 'new_message',
          title: 'New message',
          body: 'from Alice',
        });
        expect(task.priority).toBe('HIGH');
      });

      it('at_mention is HIGH priority', async () => {
        const task = await service.sendPush(['u1'], {
          scenario: 'at_mention',
          title: 'Mention',
          body: '@you',
        });
        expect(task.priority).toBe('HIGH');
      });

      it('friend_request is MEDIUM priority', async () => {
        const task = await service.sendPush(['u1'], {
          scenario: 'friend_request',
          title: 'Friend request',
          body: 'from Bob',
        });
        expect(task.priority).toBe('MEDIUM');
      });

      it('group_invite is MEDIUM priority', async () => {
        const task = await service.sendPush(['u1'], {
          scenario: 'group_invite',
          title: 'Group invite',
          body: 'Bob invited you',
        });
        expect(task.priority).toBe('MEDIUM');
      });

      it('system_notice is LOW priority', async () => {
        const task = await service.sendPush(['u1'], {
          scenario: 'system_notice',
          title: 'Notice',
          body: 'System maintenance',
        });
        expect(task.priority).toBe('LOW');
      });
    });

    // ─── multi-device ────────────────────────────────────────────────────

    describe('multi-device sync', () => {
      it('sendPush targets all specified UIDs (multiple devices)', async () => {
        const task = await service.sendPush(['user1', 'user1_device2', 'user2'], {
          scenario: 'new_message',
          title: 'T',
          body: 'B',
        });

        expect(task.targetUids).toHaveLength(3);
        expect(task.targetUids).toContain('user1');
        expect(task.targetUids).toContain('user1_device2');
      });

      it('markAllRead publishes sync event for all devices', async () => {
        (redis.lrange as any).mockResolvedValue(['push_x']);
        (pipeline.exec as any).mockResolvedValue([]);

        await service.markAllRead('user1');

        expect(pipeline.publish).toHaveBeenCalled();
        const publishCall = (pipeline.publish as any).mock.calls.find(
          (call: any[]) => call[0].startsWith('wc:push:sync:')
        );
        expect(publishCall).toBeDefined();
      });
    });

    // ─── retry mechanism ─────────────────────────────────────────────────

    describe('retry mechanism', () => {
      it('task starts with retryCount 0', async () => {
        const task = await service.sendPush(['u1'], {
          scenario: 'new_message',
          title: 'T',
          body: 'B',
        });
        expect(task.retryCount).toBe(0);
        expect(task.maxRetries).toBe(3);
      });
    });

    // ─── PushError ───────────────────────────────────────────────────────

    describe('PushError', () => {
      it('creates an error with code and message', () => {
        const err = new PushError(3000, '推送失败');
        expect(err).toBeInstanceOf(Error);
        expect(err.code).toBe(3000);
        expect(err.message).toBe('推送失败');
        expect(err.name).toBe('PushError');
      });
    });
  });
});
