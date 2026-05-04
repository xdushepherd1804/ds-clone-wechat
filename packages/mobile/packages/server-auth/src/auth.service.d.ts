import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { UserProfile, UserPublicProfile, LoginRequest, LoginResponse, RegisterRequest, UpdateProfileRequest, ChangePasswordRequest } from '@wechat-clone/shared';
import type { SessionStore } from './session';
export interface LoginResult extends LoginResponse {
    refreshToken: string;
}
export interface UserSearchResult {
    items: UserPublicProfile[];
    total: number;
}
export interface AuthConfig {
    jwtSecret: string;
    accessExpire: string;
    refreshExpire: string;
}
export interface AuthDeps {
    prisma: PrismaClient;
    redis: Redis | null;
    config: AuthConfig;
    sessionStore?: SessionStore;
}
export declare function createAuthService(deps: AuthDeps): {
    register: (req: RegisterRequest) => Promise<{
        user: UserProfile;
    }>;
    login: (req: LoginRequest) => Promise<LoginResult>;
    logout: (accessToken: string) => Promise<void>;
    refreshTokens: (refreshToken: string) => Promise<LoginResult>;
    getCurrentUser: (userId: string) => Promise<UserProfile>;
    updateProfile: (userId: string, req: UpdateProfileRequest) => Promise<UserProfile>;
    getUserById: (userId: string) => Promise<UserPublicProfile>;
    searchUsers: (query: string) => Promise<UserSearchResult>;
    updateAvatar: (userId: string, avatar: string | null) => Promise<UserProfile>;
    changePassword: (userId: string, req: ChangePasswordRequest) => Promise<void>;
    checkRateLimit: (action: string, identifier: string, windowSeconds: number, maxAttempts: number) => Promise<void>;
    store: SessionStore;
    config: AuthConfig;
};
export declare class AuthError extends Error {
    name: string;
    code: number;
    constructor(code: number, message: string);
}
//# sourceMappingURL=auth.service.d.ts.map