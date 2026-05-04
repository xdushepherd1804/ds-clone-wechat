import * as crypto from 'node:crypto';
function base64url(input) {
    const buf = typeof input === 'string' ? Buffer.from(input) : input;
    return buf.toString('base64url');
}
function base64urlDecode(input) {
    return Buffer.from(input, 'base64url');
}
function signHmac(data, secret) {
    return crypto.createHmac('sha256', secret).update(data).digest('base64url');
}
export function signJwt(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const body = { ...payload, iat: payload.iat ?? now };
    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(body));
    const signature = signHmac(`${headerB64}.${payloadB64}`, secret);
    return `${headerB64}.${payloadB64}.${signature}`;
}
export function verifyJwt(token, secret) {
    const parts = token.split('.');
    if (parts.length !== 3) {
        throw new JwtError('TOKEN_INVALID', 'malformed token');
    }
    const [headerB64, payloadB64, signature] = parts;
    const expectedSig = signHmac(`${headerB64}.${payloadB64}`, secret);
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
        throw new JwtError('TOKEN_INVALID', 'invalid signature');
    }
    let payload;
    try {
        payload = JSON.parse(base64urlDecode(payloadB64).toString('utf-8'));
    }
    catch {
        throw new JwtError('TOKEN_INVALID', 'invalid payload');
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && now > payload.exp) {
        throw new JwtError('TOKEN_EXPIRED', 'token expired');
    }
    return payload;
}
export function decodeJwt(token) {
    const parts = token.split('.');
    if (parts.length < 2) {
        throw new JwtError('TOKEN_INVALID', 'malformed token');
    }
    try {
        return JSON.parse(base64urlDecode(parts[1]).toString('utf-8'));
    }
    catch {
        throw new JwtError('TOKEN_INVALID', 'invalid payload');
    }
}
export function parseExpireString(expire) {
    const match = expire.match(/^(\d+)(s|m|h|d)$/);
    if (!match)
        throw new Error(`Invalid expire format: ${expire}`);
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
        case 's': return value;
        case 'm': return value * 60;
        case 'h': return value * 3600;
        case 'd': return value * 86400;
        default: return value;
    }
}
export class JwtError extends Error {
    name = 'JwtError';
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
//# sourceMappingURL=jwt.js.map