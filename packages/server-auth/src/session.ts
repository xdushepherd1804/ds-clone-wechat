import type { Redis } from 'ioredis';
import { RedisKeys } from '@wechat-clone/shared';
import type { JwtPayload } from './jwt';

export interface SessionData {
  userId: string;
  username: string;
  deviceId: string;
  refreshTokenJti: string;
  createdAt: number;
}

export interface SessionStore {
  create(session: SessionData, ttlSeconds: number): Promise<void>;
  get(token: string): Promise<SessionData | null>;
  getByJti(jti: string): Promise<SessionData | null>;
  delete(token: string): Promise<void>;
  deleteByJti(jti: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
}

export function createRedisSessionStore(redis: Redis): SessionStore {
  return {
    async create(session, ttlSeconds) {
      const tokenKey = RedisKeys.session(session.refreshTokenJti);
      const userSessionsKey = `wc:sessions:user:${session.userId}`;
      const data = JSON.stringify(session);

      const pipe = redis.pipeline();
      pipe.setex(tokenKey, ttlSeconds, data);
      pipe.sadd(userSessionsKey, session.refreshTokenJti);
      pipe.expire(userSessionsKey, ttlSeconds);
      await pipe.exec();
    },

    async get(token) {
      const key = RedisKeys.session(token);
      const raw = await redis.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as SessionData;
      } catch {
        return null;
      }
    },

    async getByJti(jti) {
      return this.get(jti);
    },

    async delete(token) {
      const session = await this.get(token);
      if (session) {
        const key = RedisKeys.session(token);
        const userSessionsKey = `wc:sessions:user:${session.userId}`;
        const pipe = redis.pipeline();
        pipe.del(key);
        pipe.srem(userSessionsKey, token);
        await pipe.exec();
      }
    },

    async deleteByJti(jti) {
      await this.delete(jti);
    },

    async deleteAllForUser(userId) {
      const userSessionsKey = `wc:sessions:user:${userId}`;
      const jtis = await redis.smembers(userSessionsKey);
      if (jtis.length > 0) {
        const keys = jtis.map((jti) => RedisKeys.session(jti));
        const pipe = redis.pipeline();
        pipe.del(...keys);
        pipe.del(userSessionsKey);
        await pipe.exec();
      }
    },
  };
}

export class InMemorySessionStore implements SessionStore {
  private store = new Map<string, { data: SessionData; expiresAt: number }>();
  private userSessions = new Map<string, Set<string>>();

  async create(session: SessionData, ttlSeconds: number): Promise<void> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(session.refreshTokenJti, { data: session, expiresAt });
    const userSet = this.userSessions.get(session.userId) ?? new Set();
    userSet.add(session.refreshTokenJti);
    this.userSessions.set(session.userId, userSet);
  }

  async get(token: string): Promise<SessionData | null> {
    const entry = this.store.get(token);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(token);
      return null;
    }
    return entry.data;
  }

  async getByJti(jti: string): Promise<SessionData | null> {
    return this.get(jti);
  }

  async delete(token: string): Promise<void> {
    const entry = this.store.get(token);
    if (entry) {
      const userSet = this.userSessions.get(entry.data.userId);
      if (userSet) {
        userSet.delete(token);
        if (userSet.size === 0) this.userSessions.delete(entry.data.userId);
      }
    }
    this.store.delete(token);
  }

  async deleteByJti(jti: string): Promise<void> {
    await this.delete(jti);
  }

  async deleteAllForUser(userId: string): Promise<void> {
    const userSet = this.userSessions.get(userId);
    if (userSet) {
      for (const jti of userSet) {
        this.store.delete(jti);
      }
      this.userSessions.delete(userId);
    }
  }
}
