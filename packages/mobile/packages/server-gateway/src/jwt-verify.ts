import { createHmac, timingSafeEqual } from 'node:crypto';

export interface JwtPayload {
  sub: string;
  username: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
  jti?: string;
}

function base64urlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url');
}

export function verifyJwt(token: string, secret: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new JwtError('malformed token');
  }

  const [headerB64, payloadB64, signature] = parts;
  const expectedSig = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    throw new JwtError('invalid signature');
  }

  let payload: JwtPayload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64).toString('utf-8'));
  } catch {
    throw new JwtError('invalid payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) {
    throw new JwtError('token expired');
  }

  return payload;
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

export class JwtError extends Error {
  override name = 'JwtError';
  constructor(message: string) {
    super(message);
  }
}
