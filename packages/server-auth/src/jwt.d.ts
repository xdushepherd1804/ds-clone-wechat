export interface JwtPayload {
    sub: string;
    username: string;
    type: 'access' | 'refresh';
    iat: number;
    exp: number;
    jti?: string;
}
export declare function signJwt(payload: Omit<JwtPayload, 'iat'> & {
    iat?: number;
}, secret: string): string;
export declare function verifyJwt(token: string, secret: string): JwtPayload;
export declare function decodeJwt(token: string): JwtPayload;
export declare function parseExpireString(expire: string): number;
export declare class JwtError extends Error {
    name: string;
    code: string;
    constructor(code: string, message: string);
}
//# sourceMappingURL=jwt.d.ts.map