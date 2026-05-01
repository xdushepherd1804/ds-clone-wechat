import type { Redis } from 'ioredis';
import { ErrorCode, generateId, RedisKeys } from '@wechat-clone/shared';

// ─── Types ─────────────────────────────────────────────────────────────────

export type PushPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type PushScenario =
  | 'new_message'
  | 'friend_request'
  | 'group_invite'
  | 'at_mention'
  | 'system_notice';

export interface PushPayload {
  scenario: PushScenario;
  title: string;
  body: string;
  senderId?: string;
  senderName?: string;
  data?: Record<string, unknown>;
}

export interface PushTask {
  pushId: string;
  targetUids: string[];
  scenario: PushScenario;
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: PushPriority;
  priorityScore: number;
  createdAt: number;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  status: 'pending' | 'processing' | 'delivered' | 'failed';
}

export interface PushServiceDeps {
  redis?: Redis | null;
}

export interface PushService {
  /** Enqueue a push notification for one or more users */
  sendPush(targetUids: string[], payload: PushPayload, priority?: PushPriority): Promise<PushTask>;
  /** Process pending pushes from the queue */
  processQueue(batchSize?: number): Promise<number>;
  /** Get pending push count for a user */
  getPendingCount(uid: string): Promise<number>;
  /** Mark all pushes for a user as read (sync across devices) */
  markAllRead(uid: string): Promise<number>;
  /** Get all pending pushes for a specific user */
  getPendingPushes(uid: string, limit?: number): Promise<PushTask[]>;
  /** Get queue statistics */
  getStats(): Promise<{ pending: number; processing: number; delivered: number; failed: number }>;
}

export class PushError extends Error {
  override name = 'PushError';
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PRIORITY_WEIGHTS: Record<PushPriority, number> = {
  HIGH: 200,
  MEDIUM: 100,
  LOW: 0,
};

const SCENARIO_PRIORITY: Record<PushScenario, PushPriority> = {
  new_message: 'HIGH',
  friend_request: 'MEDIUM',
  group_invite: 'MEDIUM',
  at_mention: 'HIGH',
  system_notice: 'LOW',
};

const MAX_RETRIES = 3;
const QUEUE_KEY = 'wc:push:queue';
const PROCESSING_KEY = 'wc:push:processing';
const DELIVERED_KEY = 'wc:push:delivered:set';
const FAILED_KEY = 'wc:push:failed:set';
const USER_PUSHES_PREFIX = 'wc:push:user:';
const READ_OFFSET_PREFIX = 'wc:push:read_offset:';
const PUSH_DATA_PREFIX = 'wc:push:data:';
const PUSH_TTL = 7 * 24 * 3600; // 7 days

// ─── Helpers ───────────────────────────────────────────────────────────────

function priorityScore(priority: PushPriority, createdAt: number): number {
  return PRIORITY_WEIGHTS[priority] * 1e13 - createdAt;
}

function userPendingKey(uid: string): string {
  return `${USER_PUSHES_PREFIX}${uid}:pending`;
}

function userDeliveredKey(uid: string): string {
  return `${USER_PUSHES_PREFIX}${uid}:delivered`;
}

function readOffsetKey(uid: string): string {
  return `${READ_OFFSET_PREFIX}${uid}`;
}

function pushDataKey(pushId: string): string {
  return `${PUSH_DATA_PREFIX}${pushId}`;
}

let seqCounter = 0;
const nextSeq = () => ++seqCounter;

// ─── Service Factory ────────────────────────────────────────────────────────

export function createPushService(deps: PushServiceDeps): PushService {
  const { redis: redisOrNull } = deps;
  const redis = redisOrNull ?? null;

  // ─── sendPush ──────────────────────────────────────────────────────────

  async function sendPush(
    targetUids: string[],
    payload: PushPayload,
    priority?: PushPriority,
  ): Promise<PushTask> {
    if (!targetUids || targetUids.length === 0) {
      throw new PushError(ErrorCode.INVALID_PARAM, '目标用户不能为空');
    }
    if (!payload.title && !payload.body) {
      throw new PushError(ErrorCode.INVALID_PARAM, '推送内容不能为空');
    }

    const p = priority ?? SCENARIO_PRIORITY[payload.scenario] ?? 'LOW';
    const now = Date.now();
    const task: PushTask = {
      pushId: generateId(),
      targetUids: [...targetUids],
      scenario: payload.scenario,
      title: payload.title,
      body: payload.body,
      data: { ...payload.data, senderId: payload.senderId, senderName: payload.senderName },
      priority: p,
      priorityScore: priorityScore(p, now),
      createdAt: now,
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      status: 'pending',
    };

    if (!redis) return task;

    try {
      // Store push data
      await redis.setex(pushDataKey(task.pushId), PUSH_TTL, JSON.stringify(task));

      // Add to global priority queue (ZSET)
      await redis.zadd(QUEUE_KEY, task.priorityScore, task.pushId);

      // Add to each user's pending list
      const pipeline = redis.pipeline();
      for (const uid of targetUids) {
        pipeline.rpush(userPendingKey(uid), task.pushId);
        pipeline.expire(userPendingKey(uid), PUSH_TTL);
      }
      await pipeline.exec();
    } catch {
      // Redis error — still return the task object
    }

    return task;
  }

  // ─── processQueue ───────────────────────────────────────────────────────

  async function processQueue(batchSize = 50): Promise<number> {
    if (!redis) return 0;

    let processed = 0;

    try {
      // Get highest priority items from the queue
      const pushIds = await redis.zrevrange(QUEUE_KEY, 0, batchSize - 1);

      for (const pushId of pushIds) {
        const done = await processOnePush(pushId);
        if (done) processed++;
      }
    } catch {
      // Redis error
    }

    return processed;
  }

  async function processOnePush(pushId: string): Promise<boolean> {
    if (!redis) return false;

    try {
      // Atomically claim the item (move from queue to processing)
      const removed = await redis.zrem(QUEUE_KEY, pushId);
      if (!removed) return false;

      // Mark as processing
      await redis.hset(PROCESSING_KEY, pushId, String(Date.now()));

      // Load push data
      const raw = await redis.get(pushDataKey(pushId));
      if (!raw) {
        await redis.hdel(PROCESSING_KEY, pushId);
        return false;
      }

      const task: PushTask = JSON.parse(raw);

      // Simulate pushing to each user
      let allDelivered = true;
      for (const uid of task.targetUids) {
        const delivered = await deliverToUser(uid, task);
        if (!delivered) {
          allDelivered = false;
        }
      }

      if (allDelivered) {
        // Mark as delivered for all users
        const pipeline = redis.pipeline();
        for (const uid of task.targetUids) {
          pipeline.lrem(userPendingKey(uid), 0, pushId);
          pipeline.rpush(userDeliveredKey(uid), pushId);
          pipeline.expire(userDeliveredKey(uid), PUSH_TTL);
        }
        pipeline.sadd(DELIVERED_KEY, pushId);
        pipeline.expire(DELIVERED_KEY, PUSH_TTL);
        pipeline.hdel(PROCESSING_KEY, pushId);
        await pipeline.exec();

        task.status = 'delivered';
        await redis.setex(pushDataKey(pushId), PUSH_TTL, JSON.stringify(task));
        return true;
      }

      // Handle retry
      task.retryCount++;
      if (task.retryCount < task.maxRetries) {
        // Re-enqueue with slightly lower priority (delay)
        task.priorityScore = priorityScore(task.priority, Date.now()) - task.retryCount * 1000;
        task.lastError = 'Delivery failed, retrying';
        await redis.setex(pushDataKey(pushId), PUSH_TTL, JSON.stringify(task));
        await redis.zadd(QUEUE_KEY, task.priorityScore, pushId);
        await redis.hdel(PROCESSING_KEY, pushId);
      } else {
        // Max retries exceeded — mark as failed
        task.status = 'failed';
        task.lastError = `Failed after ${task.maxRetries} retries`;
        await redis.setex(pushDataKey(pushId), PUSH_TTL, JSON.stringify(task));
        const pipeline = redis.pipeline();
        for (const uid of task.targetUids) {
          pipeline.lrem(userPendingKey(uid), 0, pushId);
        }
        pipeline.sadd(FAILED_KEY, pushId);
        pipeline.expire(FAILED_KEY, PUSH_TTL);
        pipeline.hdel(PROCESSING_KEY, pushId);
        await pipeline.exec();
      }

      return false;
    } catch {
      // On error, re-queue for retry
      try {
        const raw = await redis.get(pushDataKey(pushId));
        if (raw) {
          const task: PushTask = JSON.parse(raw);
          task.retryCount++;
          if (task.retryCount < task.maxRetries) {
            await redis.zadd(QUEUE_KEY, task.priorityScore, pushId);
          } else {
            task.status = 'failed';
            await redis.setex(pushDataKey(pushId), PUSH_TTL, JSON.stringify(task));
            await redis.sadd(FAILED_KEY, pushId);
          }
          await redis.hdel(PROCESSING_KEY, pushId);
        }
      } catch {
        // Best effort
      }
      return false;
    }
  }

  // ─── deliverToUser ──────────────────────────────────────────────────────

  async function deliverToUser(uid: string, task: PushTask): Promise<boolean> {
    if (!redis) return true;

    try {
      // Check if user is online
      const isOnline = await redis.get(RedisKeys.userOnline(uid));

      if (isOnline === '1') {
        // Publish to the push channel for this user
        // The WS Gateway subscribes to this channel and calls pushToUser()
        await redis.publish(
          `wc:push:channel:${uid}`,
          JSON.stringify({
            pushId: task.pushId,
            scenario: task.scenario,
            title: task.title,
            body: task.body,
            data: task.data,
            priority: task.priority,
            createdAt: task.createdAt,
            seq: nextSeq(),
          }),
        );
        return true;
      }

      // User is offline — still count as "delivered" (stored for later pull)
      return true;
    } catch {
      return false;
    }
  }

  // ─── getPendingCount ────────────────────────────────────────────────────

  async function getPendingCount(uid: string): Promise<number> {
    if (!redis) return 0;
    try {
      return await redis.llen(userPendingKey(uid));
    } catch {
      return 0;
    }
  }

  // ─── markAllRead ────────────────────────────────────────────────────────

  async function markAllRead(uid: string): Promise<number> {
    if (!redis) return 0;

    try {
      // Get all pending push IDs
      const pushIds = await redis.lrange(userPendingKey(uid), 0, -1);
      const count = pushIds.length;

      if (count > 0) {
        const pipeline = redis.pipeline();

        // Move all pending to delivered
        for (const pushId of pushIds) {
          pipeline.rpush(userDeliveredKey(uid), pushId);
        }
        pipeline.del(userPendingKey(uid));
        pipeline.expire(userDeliveredKey(uid), PUSH_TTL);

        // Update read offset to latest seq
        pipeline.set(readOffsetKey(uid), String(Date.now()));
        pipeline.expire(readOffsetKey(uid), PUSH_TTL);

        // Publish read-sync event to all devices
        pipeline.publish(
          `wc:push:sync:${uid}`,
          JSON.stringify({
            type: 'read_sync',
            uid,
            readOffset: Date.now(),
            clearedPushes: pushIds,
          }),
        );

        await pipeline.exec();
      }

      return count;
    } catch {
      return 0;
    }
  }

  // ─── getPendingPushes ───────────────────────────────────────────────────

  async function getPendingPushes(uid: string, limit = 50): Promise<PushTask[]> {
    if (!redis) return [];

    try {
      const pushIds = await redis.lrange(userPendingKey(uid), 0, limit - 1);
      if (pushIds.length === 0) return [];

      const pipeline = redis.pipeline();
      for (const id of pushIds) {
        pipeline.get(pushDataKey(id));
      }
      const results = await pipeline.exec();
      if (!results) return [];

      const tasks: PushTask[] = [];
      for (const [err, raw] of results) {
        if (err || !raw) continue;
        try {
          tasks.push(JSON.parse(raw as string) as PushTask);
        } catch {
          // Skip corrupted entries
        }
      }

      return tasks;
    } catch {
      return [];
    }
  }

  // ─── getStats ───────────────────────────────────────────────────────────

  async function getStats(): Promise<{ pending: number; processing: number; delivered: number; failed: number }> {
    if (!redis) {
      return { pending: 0, processing: 0, delivered: 0, failed: 0 };
    }

    try {
      const [pending, processing, delivered, failed] = await Promise.all([
        redis.zcard(QUEUE_KEY),
        redis.hlen(PROCESSING_KEY),
        redis.scard(DELIVERED_KEY),
        redis.scard(FAILED_KEY),
      ]);
      return { pending, processing, delivered, failed };
    } catch {
      return { pending: 0, processing: 0, delivered: 0, failed: 0 };
    }
  }

  return {
    sendPush,
    processQueue,
    getPendingCount,
    markAllRead,
    getPendingPushes,
    getStats,
  };
}
