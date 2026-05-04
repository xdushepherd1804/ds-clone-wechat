/**
 * @wechat-clone/server-auth — authentication service
 *
 * Provides user registration, login, JWT authentication, session management,
 * and user profile management.
 */

// ─── JWT ────────────────────────────────────────────────────────────────────

export { signJwt, verifyJwt, decodeJwt, parseExpireString, JwtError } from './jwt';
export type { JwtPayload } from './jwt';

// ─── Session ────────────────────────────────────────────────────────────────

export {
  createRedisSessionStore,
  InMemorySessionStore,
} from './session';
export type { SessionData, SessionStore } from './session';

// ─── Auth Service ───────────────────────────────────────────────────────────

export { createAuthService, AuthError } from './auth.service';
export type { LoginResult, UserSearchResult, AuthConfig, AuthDeps } from './auth.service';

// ─── Middleware ──────────────────────────────────────────────────────────────

export { createAuthMiddleware, extractTokenFromHeader } from './middleware';
export type { AuthContext } from './middleware';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

/**
 * Initialize the auth service.
 * Called by the gateway to set up the auth module.
 */
export function bootstrap(): void {
  // Auth service is configured via createAuthService() with its dependencies
  // (PrismaClient, Redis, JWT config). The gateway wires these together.
}
