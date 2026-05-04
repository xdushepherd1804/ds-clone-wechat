/**
 * @wechat-clone/server-gateway — API / WebSocket gateway
 *
 * Provides request routing, JWT authentication, rate limiting,
 * CORS, request logging, and WebSocket upgrade handling.
 */

export { verifyJwt, extractTokenFromHeader, JwtError } from './jwt-verify';
export type { JwtPayload } from './jwt-verify';

export { createRateLimiter } from './rate-limiter';
export type { RateLimiter, RateLimiterOptions } from './rate-limiter';

export { createLogger } from './logger';
export type { Logger } from './logger';

export {
  WsGateway,
  ConnectionManager,
  routeMessage,
} from './ws-gateway';
export type {
  WsGatewayOptions,
  WsConnection,
  WsConnectionStats,
  OnlineStatusManager,
} from './ws-gateway';

export {
  encodeFrame,
  encodeTextFrame,
  encodeCloseFrame,
  encodePingFrame,
  encodePongFrame,
  decodeFrame,
  sendFrame,
  Opcode,
} from './ws-frame';
export type { WsFrame } from './ws-frame';

/**
 * Initialize the gateway.
 * The HTTP server is started automatically when server.ts is imported.
 */
export function bootstrap(): void {
  // Gateway server starts automatically on import of server.ts.
  // This function is provided for explicit initialization by orchestrators.
}
