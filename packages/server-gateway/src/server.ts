/**
 * API Gateway — request routing, JWT auth, rate limiting, logging, CORS.
 *
 * Middleware chain:
 *   Request → Logger → CORS → RateLimiter → Auth(JWT) → Router → Service
 */
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { loadConfig, loadServiceRegistry } from '@wechat-clone/shared/config';
import { ErrorCode, ErrorMessage } from '@wechat-clone/shared';
import { verifyJwt, extractTokenFromHeader, JwtError } from './jwt-verify';
import { createRateLimiter } from './rate-limiter';
import { createLogger } from './logger';
import { WsGateway } from './ws-gateway';

// ─── Config ──────────────────────────────────────────────────────────────────
const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.gateway.port;
const JWT_SECRET = process.env.JWT_SECRET || config.jwt.secret;

interface ServiceTarget {
  host: string;
  port: number;
}

// ─── Service registry ────────────────────────────────────────────────────────
const services: Record<string, ServiceTarget> = {
  auth: { host: process.env.AUTH_HOST || 'auth', port: config.services.auth.port },
  message: { host: process.env.MESSAGE_HOST || 'message', port: config.services.message.port },
  contact: { host: process.env.CONTACT_HOST || 'contact', port: config.services.contact.port },
  group: { host: process.env.GROUP_HOST || 'group', port: config.services.group.port },
  file: { host: process.env.FILE_HOST || 'file', port: config.services.file.port },
  moments: { host: process.env.MOMENTS_HOST || 'moments', port: config.services.moments.port },
  search: { host: process.env.SEARCH_HOST || 'search', port: config.services.search?.port ?? 3008 },
  push: { host: process.env.PUSH_HOST || 'push', port: (config.services as Record<string, { port: number; host?: string }>).push?.port ?? 3007 },
  redpacket: { host: process.env.REDPACKET_HOST || 'redpacket', port: config.services.redpacket?.port ?? 3009 },
  qrcode: { host: process.env.QRCODE_HOST || 'qrcode', port: config.services.qrcode?.port ?? 3010 },
};

// ─── Route table ─────────────────────────────────────────────────────────────
interface RouteEntry {
  prefix: string;
  service: string;
  authRequired: boolean;
}

const routes: RouteEntry[] = [
  { prefix: '/api/auth/', service: 'auth', authRequired: false },
  { prefix: '/api/users/', service: 'auth', authRequired: true },
  { prefix: '/api/messages/', service: 'message', authRequired: true },
  { prefix: '/api/contacts/', service: 'contact', authRequired: true },
  { prefix: '/api/groups/', service: 'group', authRequired: true },
  { prefix: '/api/files/', service: 'file', authRequired: true },
  { prefix: '/api/moments/', service: 'moments', authRequired: true },
  { prefix: '/api/search/', service: 'search', authRequired: true },
  { prefix: '/api/push/', service: 'push', authRequired: true },
  { prefix: '/api/redpacket/', service: 'redpacket', authRequired: true },
  { prefix: '/api/qrcode/', service: 'qrcode', authRequired: true },
];

// ─── Middleware instances ────────────────────────────────────────────────────
const rateLimiter = createRateLimiter({ tokensPerInterval: 100, interval: 60_000 });
const logger = createLogger();

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sendJson(res: ServerResponse, statusCode: number, data: Record<string, unknown>): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ...data, timestamp: Date.now() }));
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0].trim();
  return req.socket?.remoteAddress || '127.0.0.1';
}

/** Forward an HTTP request to a backend service */
function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  target: ServiceTarget,
  path: string,
): void {
  const headers = { ...req.headers };
  delete headers.host;

  const options = {
    hostname: target.host,
    port: target.port,
    path,
    method: req.method,
    headers,
  };

  const proxy = request(options, (proxyRes: IncomingMessage) => {
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxy.on('error', () => {
    if (!res.headersSent) {
      sendJson(res, 502, { code: ErrorCode.INTERNAL_ERROR, message: 'Service unavailable' });
    }
  });

  req.pipe(proxy);
}

// ─── Server ──────────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  const start = Date.now();
  const ip = getClientIp(req);

  // 1. Logger
  const logRequest = () => logger.log(req, res, start, ip);

  // 2. CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    logRequest();
    return;
  }

  try {
    // 3. Rate limiting
    if (!rateLimiter.consume(ip)) {
      sendJson(res, 429, {
        code: ErrorCode.RATE_LIMITED,
        message: ErrorMessage[ErrorCode.RATE_LIMITED],
      });
      logRequest();
      return;
    }

    const url = req.url ?? '/';
    const parsedUrl = new URL(url, 'http://localhost');
    const pathname = parsedUrl.pathname;
    const search = parsedUrl.search;

    // Health check
    if (pathname === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        service: 'gateway',
        services: Object.keys(services),
      });
      logRequest();
      return;
    }

    // WS info
    if (pathname === '/ws/info') {
      sendJson(res, 200, { wsEndpoint: '/ws', protocol: 'wechat-clone-v1' });
      logRequest();
      return;
    }

    // 4. Router — match route prefix (with or without trailing slash)
    let matchedRoute: RouteEntry | undefined;
    for (const route of routes) {
      if (pathname.startsWith(route.prefix) || pathname === route.prefix.replace(/\/$/, '')) {
        matchedRoute = route;
        break;
      }
    }

    // 5. Auth (JWT) — verify token for protected routes
    if (matchedRoute && matchedRoute.authRequired) {
      const token = extractTokenFromHeader(req.headers.authorization);

      if (!token) {
        sendJson(res, 401, {
          code: ErrorCode.UNAUTHORIZED,
          message: ErrorMessage[ErrorCode.UNAUTHORIZED],
        });
        logRequest();
        return;
      }

      try {
        const payload = verifyJwt(token, JWT_SECRET);
        if (payload.type !== 'access') {
          sendJson(res, 401, {
            code: ErrorCode.TOKEN_INVALID,
            message: 'access token required',
          });
          logRequest();
          return;
        }

        // Inject user context into headers for downstream services
        req.headers['x-user-id'] = payload.sub;
        req.headers['x-username'] = payload.username;
      } catch (err) {
        if (err instanceof JwtError) {
          const code =
            err.message === 'token expired' ? ErrorCode.TOKEN_EXPIRED : ErrorCode.TOKEN_INVALID;
          sendJson(res, 401, { code, message: ErrorMessage[code] });
          logRequest();
          return;
        }
        throw err;
      }
    }

    // 6. Proxy to matched service
    if (matchedRoute) {
      const prefixNoSlash = matchedRoute.prefix.replace(/\/$/, '');
      const basePath = pathname === prefixNoSlash ? '/' : pathname.slice(matchedRoute.prefix.length - 1);
      const servicePath = search ? basePath + search : basePath;
      const target = services[matchedRoute.service];
      if (target) {
        proxyRequest(req, res, target, servicePath);
        logRequest();
        return;
      }
    }

    // 404 — no matching route
    sendJson(res, 404, {
      code: ErrorCode.NOT_FOUND,
      message: '接口不存在',
    });
    logRequest();
  } catch (err) {
    if (!res.headersSent) {
      sendJson(res, 500, {
        code: ErrorCode.INTERNAL_ERROR,
        message: ErrorMessage[ErrorCode.INTERNAL_ERROR],
      });
    }
    logRequest();
  }
});

// ─── WebSocket gateway ───────────────────────────────────────────────────────
const wsGateway = new WsGateway({
  jwtSecret: JWT_SECRET,
  maxConnectionsPerUser: 5,
  heartbeatTimeoutMs: 60_000,
  pingIntervalMs: 30_000,
});

server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
  wsGateway.handleUpgrade(req, socket, head);
});

// ─── Start ───────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  try {
    const registry = loadServiceRegistry(CONFIG_DIR);
    const serviceNames = Object.keys(registry.services);
    console.log(`[gateway] service registry loaded: ${serviceNames.join(', ')}`);
  } catch {
    console.log('[gateway] service registry not loaded (services.json missing or invalid)');
  }
  console.log(`[gateway] listening on 0.0.0.0:${PORT}`);
  console.log('[gateway] WebSocket endpoint: /ws');
});

// ─── Graceful shutdown ───────────────────────────────────────────────────────
function shutdown() {
  console.log('[gateway] shutting down...');
  wsGateway.shutdown();
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ─── Exports for testing ────────────────────────────────────────────────────
export { rateLimiter, wsGateway };
