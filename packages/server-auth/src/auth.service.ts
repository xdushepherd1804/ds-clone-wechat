import type { PrismaClient, User } from '@prisma/client';
import type { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';
import {
  ErrorCode,
  ErrorMessage,
  hashPassword,
  verifyPassword,
  isValidUsername,
  isValidPassword,
  isValidNickname,
  sanitizeText,
} from '@wechat-clone/shared';
import type {
  UserProfile,
  UserPublicProfile,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  UpdateProfileRequest,
  ChangePasswordRequest,
} from '@wechat-clone/shared';
import { signJwt, verifyJwt, parseExpireString } from './jwt';
import type { SessionStore, SessionData } from './session';
import { InMemorySessionStore, createRedisSessionStore } from './session';

// ─── Types ─────────────────────────────────────────────────────────────────

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

// ─── Helpers ───────────────────────────────────────────────────────────────

function mapToProfile(user: User): UserProfile {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar,
    phone: user.phone,
    status: (user.status as UserProfile['status']) || 'offline',
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

function mapToPublicProfile(user: User): UserPublicProfile {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar,
    status: (user.status as UserPublicProfile['status']) || 'offline',
  };
}

function generateJti(): string {
  return randomBytes(16).toString('hex');
}

// ─── Service Factory ────────────────────────────────────────────────────────

export function createAuthService(deps: AuthDeps) {
  const { prisma, config, redis } = deps;
  const store: SessionStore =
    deps.sessionStore ?? (redis ? createRedisSessionStore(redis) : new InMemorySessionStore());

  const accessTtl = parseExpireString(config.accessExpire);
  const refreshTtl = parseExpireString(config.refreshExpire);

  // ─── Register ──────────────────────────────────────────────────────────

  async function register(req: RegisterRequest): Promise<{ user: UserProfile }> {
    if (!isValidUsername(req.username)) {
      throw new AuthError(ErrorCode.INVALID_PARAM, '用户名格式不正确 (字母开头, 3-20位)');
    }
    if (!isValidPassword(req.password) || req.password.length < 8) {
      throw new AuthError(ErrorCode.PASSWORD_TOO_WEAK, ErrorMessage[ErrorCode.PASSWORD_TOO_WEAK]);
    }
    if (!isValidNickname(req.nickname)) {
      throw new AuthError(ErrorCode.INVALID_PARAM, '昵称不能为空');
    }

    const existing = await prisma.user.findUnique({ where: { username: req.username } });
    if (existing) {
      throw new AuthError(ErrorCode.USERNAME_TAKEN, ErrorMessage[ErrorCode.USERNAME_TAKEN]);
    }

    const { hash, salt } = hashPassword(req.password);
    const passwordHash = `${hash}:${salt}`;

    const user = await prisma.user.create({
      data: {
        username: req.username,
        passwordHash,
        nickname: req.nickname,
        phone: req.phone ?? null,
      },
    });

    return { user: mapToProfile(user) };
  }

  // ─── Login ─────────────────────────────────────────────────────────────

  async function login(req: LoginRequest): Promise<LoginResult> {
    if (!req.username || !req.password) {
      throw new AuthError(ErrorCode.INVALID_PARAM, '用户名和密码不能为空');
    }

    const user = await prisma.user.findUnique({ where: { username: req.username } });
    if (!user) {
      throw new AuthError(ErrorCode.LOGIN_FAILED, ErrorMessage[ErrorCode.LOGIN_FAILED]);
    }

    const [storedHash, storedSalt] = user.passwordHash.split(':');
    if (!storedSalt || !verifyPassword(req.password, storedHash, storedSalt)) {
      throw new AuthError(ErrorCode.LOGIN_FAILED, ErrorMessage[ErrorCode.LOGIN_FAILED]);
    }

    const now = Math.floor(Date.now() / 1000);
    const jti = generateJti();
    const deviceId = generateJti();

    const accessToken = signJwt(
      {
        sub: user.id,
        username: user.username,
        type: 'access',
        jti,
        exp: now + accessTtl,
      },
      config.jwtSecret,
    );

    const refreshToken = signJwt(
      {
        sub: user.id,
        username: user.username,
        type: 'refresh',
        jti,
        exp: now + refreshTtl,
      },
      config.jwtSecret,
    );

    const session: SessionData = {
      userId: user.id,
      username: user.username,
      deviceId,
      refreshTokenJti: jti,
      createdAt: now,
    };

    await store.create(session, refreshTtl);

    await prisma.user.update({
      where: { id: user.id },
      data: { status: 'online', lastSeenAt: new Date() },
    });

    return {
      token: accessToken,
      user: mapToProfile(user),
      expiresIn: accessTtl,
      refreshToken,
    };
  }

  // ─── Logout ────────────────────────────────────────────────────────────

  async function logout(accessToken: string): Promise<void> {
    try {
      const payload = verifyJwt(accessToken, config.jwtSecret);
      if (payload.jti) {
        await store.deleteByJti(payload.jti);
      }
    } catch {
      // token might be invalid — still "logged out"
    }
    // Clear all sessions for the user if token can be decoded
    try {
      const decoded = verifyJwt(accessToken, config.jwtSecret);
      if (decoded.sub) {
        await prisma.user.update({
          where: { id: decoded.sub },
          data: { status: 'offline', lastSeenAt: new Date() },
        });
      }
    } catch {
      // ignore
    }
  }

  // ─── Refresh Token ─────────────────────────────────────────────────────

  async function refreshTokens(refreshToken: string): Promise<LoginResult> {
    let payload;
    try {
      payload = verifyJwt(refreshToken, config.jwtSecret);
    } catch (err) {
      if (err instanceof Error && err.message === 'token expired') {
        throw new AuthError(ErrorCode.TOKEN_EXPIRED, ErrorMessage[ErrorCode.TOKEN_EXPIRED]);
      }
      throw new AuthError(ErrorCode.TOKEN_INVALID, ErrorMessage[ErrorCode.TOKEN_INVALID]);
    }

    if (payload.type !== 'refresh') {
      throw new AuthError(ErrorCode.TOKEN_INVALID, 'not a refresh token');
    }

    const session = payload.jti ? await store.getByJti(payload.jti) : null;
    if (!session) {
      throw new AuthError(ErrorCode.TOKEN_EXPIRED, 'session expired');
    }

    // Remove old session
    if (payload.jti) {
      await store.deleteByJti(payload.jti);
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new AuthError(ErrorCode.LOGIN_FAILED, 'user not found');
    }

    const now = Math.floor(Date.now() / 1000);
    const newJti = generateJti();

    const newAccessToken = signJwt(
      {
        sub: user.id,
        username: user.username,
        type: 'access',
        jti: newJti,
        exp: now + accessTtl,
      },
      config.jwtSecret,
    );

    const newRefreshToken = signJwt(
      {
        sub: user.id,
        username: user.username,
        type: 'refresh',
        jti: newJti,
        exp: now + refreshTtl,
      },
      config.jwtSecret,
    );

    const newSession: SessionData = {
      userId: user.id,
      username: user.username,
      deviceId: session.deviceId,
      refreshTokenJti: newJti,
      createdAt: now,
    };

    await store.create(newSession, refreshTtl);

    return {
      token: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: accessTtl,
      user: mapToProfile(user),
    };
  }

  // ─── Get Current User ──────────────────────────────────────────────────

  async function getCurrentUser(userId: string): Promise<UserProfile> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AuthError(ErrorCode.NOT_FOUND, '用户不存在');
    }
    return mapToProfile(user);
  }

  // ─── Update Profile ────────────────────────────────────────────────────

  async function updateProfile(userId: string, req: UpdateProfileRequest): Promise<UserProfile> {
    const data: Record<string, unknown> = {};

    if (req.nickname !== undefined) {
      if (!isValidNickname(req.nickname)) {
        throw new AuthError(ErrorCode.INVALID_PARAM, '昵称不能为空');
      }
      data.nickname = sanitizeText(req.nickname);
    }

    if (req.avatar !== undefined) {
      data.avatar = req.avatar;
    }

    if (req.phone !== undefined) {
      if (req.phone) {
        const existing = await prisma.user.findUnique({ where: { phone: req.phone } });
        if (existing && existing.id !== userId) {
          throw new AuthError(ErrorCode.INVALID_PARAM, '手机号已被使用');
        }
      }
      data.phone = req.phone;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });

    return mapToProfile(user);
  }

  // ─── Get User By ID ────────────────────────────────────────────────────

  async function getUserById(userId: string): Promise<UserPublicProfile> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AuthError(ErrorCode.NOT_FOUND, '用户不存在');
    }
    return mapToPublicProfile(user);
  }

  // ─── Search Users ──────────────────────────────────────────────────────

  async function searchUsers(query: string): Promise<UserSearchResult> {
    if (!query || query.trim().length === 0) {
      throw new AuthError(ErrorCode.INVALID_PARAM, '搜索关键词不能为空');
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { nickname: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 50,
    });

    return {
      items: users.map(mapToPublicProfile),
      total: users.length,
    };
  }

  // ─── Update Avatar ─────────────────────────────────────────────────────

  async function updateAvatar(userId: string, avatar: string | null): Promise<UserProfile> {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatar },
    });
    return mapToProfile(user);
  }

  // ─── Change Password ───────────────────────────────────────────────────

  async function changePassword(userId: string, req: ChangePasswordRequest): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AuthError(ErrorCode.NOT_FOUND, '用户不存在');
    }

    const [storedHash, storedSalt] = user.passwordHash.split(':');
    if (!storedSalt || !verifyPassword(req.oldPassword, storedHash, storedSalt)) {
      throw new AuthError(ErrorCode.OLD_PASSWORD_WRONG, ErrorMessage[ErrorCode.OLD_PASSWORD_WRONG]);
    }

    if (!isValidPassword(req.newPassword) || req.newPassword.length < 8) {
      throw new AuthError(ErrorCode.PASSWORD_TOO_WEAK, ErrorMessage[ErrorCode.PASSWORD_TOO_WEAK]);
    }

    const { hash: newHash, salt: newSalt } = hashPassword(req.newPassword);
    const newPasswordHash = `${newHash}:${newSalt}`;

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });

    // Invalidate all sessions to force re-login after password change
    await store.deleteAllForUser(userId);
  }

  // ─── Rate Limiter ──────────────────────────────────────────────────────

  async function checkRateLimit(
    action: string,
    identifier: string,
    windowSeconds: number,
    maxAttempts: number,
  ): Promise<void> {
    if (!redis) return; // Skip rate limiting without Redis

    const key = `wc:rate:${action}:${identifier}:${windowSeconds}s`;

    const current = await redis.incr(key);
    if (current === 1) {
      await redis.expire(key, windowSeconds);
    }

    if (current > maxAttempts) {
      throw new AuthError(ErrorCode.RATE_LIMITED, '请求过于频繁，请稍后再试');
    }
  }

  return {
    register,
    login,
    logout,
    refreshTokens,
    getCurrentUser,
    updateProfile,
    getUserById,
    searchUsers,
    updateAvatar,
    changePassword,
    checkRateLimit,
    store,
    config,
  };
}

// ─── Auth Error ────────────────────────────────────────────────────────────

export class AuthError extends Error {
  override name = 'AuthError';
  code: number;

  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}
