import type { Redis } from 'ioredis';
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
export declare function createRedisSessionStore(redis: Redis): SessionStore;
export declare class InMemorySessionStore implements SessionStore {
    private store;
    private userSessions;
    create(session: SessionData, ttlSeconds: number): Promise<void>;
    get(token: string): Promise<SessionData | null>;
    getByJti(jti: string): Promise<SessionData | null>;
    delete(token: string): Promise<void>;
    deleteByJti(jti: string): Promise<void>;
    deleteAllForUser(userId: string): Promise<void>;
}
//# sourceMappingURL=session.d.ts.map