import { ErrorCode, ErrorMessage } from '@wechat-clone/shared';
import type { JwtPayload } from './jwt';
import { verifyJwt } from './jwt';
import { AuthError } from './auth.service';

export interface AuthContext {
  userId: string;
  username: string;
  tokenType: 'access' | 'refresh';
  jti?: string;
}

export function createAuthMiddleware(jwtSecret: string) {
  return function authenticate(token: string): AuthContext {
    if (!token) {
      throw new AuthError(ErrorCode.UNAUTHORIZED, ErrorMessage[ErrorCode.UNAUTHORIZED]);
    }

    // Strip "Bearer " prefix if present
    const tokenStr = token.startsWith('Bearer ') ? token.slice(7) : token;

    let payload: JwtPayload;
    try {
      payload = verifyJwt(tokenStr, jwtSecret);
    } catch (err) {
      if (err instanceof Error && err.message === 'token expired') {
        throw new AuthError(ErrorCode.TOKEN_EXPIRED, ErrorMessage[ErrorCode.TOKEN_EXPIRED]);
      }
      throw new AuthError(ErrorCode.TOKEN_INVALID, ErrorMessage[ErrorCode.TOKEN_INVALID]);
    }

    if (payload.type !== 'access') {
      throw new AuthError(ErrorCode.TOKEN_INVALID, 'access token required');
    }

    return {
      userId: payload.sub,
      username: payload.username,
      tokenType: payload.type,
      jti: payload.jti,
    };
  };
}

export function extractTokenFromHeader(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null;
  const parts = authorizationHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return null;
}
