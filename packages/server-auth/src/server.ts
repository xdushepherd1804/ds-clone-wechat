import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { loadConfig, ErrorCode } from '@wechat-clone/shared';
import { createAuthService, AuthError } from './auth.service';
import { createAuthMiddleware, extractTokenFromHeader } from './middleware';
import {
  validateRegister,
  validateLogin,
  validateUpdateProfile,
  validateChangePassword,
  validateSearch,
} from './validation';
import swaggerSpec from './swagger.json' assert { type: 'json' };

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.services.auth.port;
const HOST = '0.0.0.0';

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL || `redis://${config.database.redis.host}:${config.database.redis.port}`;
const redis = process.env.REDIS_URL === '' ? null : new Redis(redisUrl);

const auth = createAuthService({
  prisma,
  redis,
  config: {
    jwtSecret: config.jwt.secret,
    accessExpire: config.jwt.access_expire,
    refreshExpire: config.jwt.refresh_expire,
  },
});

const authenticate = createAuthMiddleware(config.jwt.secret);

async function parseBody(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      if (!raw.trim()) { resolve({}); return; }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: Record<string, unknown>): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof AuthError) {
    sendJson(res, authErrorToHttpStatus(err.code), {
      code: err.code,
      message: err.message,
    });
    return;
  }
  if (err instanceof Error) {
    if (err.message === 'invalid JSON') {
      sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: '请求体格式错误' });
      return;
    }
    if (err.message === 'request body too large') {
      sendJson(res, 413, { code: ErrorCode.INVALID_PARAM, message: '请求体过大' });
      return;
    }
  }
  sendJson(res, 500, { code: ErrorCode.INTERNAL_ERROR, message: '服务器内部错误' });
}

function authErrorToHttpStatus(code: number): number {
  switch (code) {
    case ErrorCode.INVALID_PARAM:
    case ErrorCode.PASSWORD_TOO_WEAK:
    case ErrorCode.USERNAME_TAKEN:
      return 400;
    case ErrorCode.UNAUTHORIZED:
    case ErrorCode.TOKEN_EXPIRED:
    case ErrorCode.TOKEN_INVALID:
    case ErrorCode.LOGIN_FAILED:
    case ErrorCode.OLD_PASSWORD_WRONG:
      return 401;
    case ErrorCode.RATE_LIMITED:
      return 429;
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.FORBIDDEN:
      return 403;
    default:
      return 500;
  }
}

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded)) return forwarded[0].trim();
  return req.socket.remoteAddress || '127.0.0.1';
}

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Auth Service — API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs/swagger.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      defaultModelsExpandDepth: -1,
    });
  </script>
</body>
</html>`;

function matchRoute(
  method: string,
  url: string,
): {
  handler: 'register' | 'login' | 'logout' | 'refresh' | 'getMe' | 'updateMe' | 'getUser' | 'searchUsers' | 'updateAvatar' | 'changePassword' | 'health' | 'swaggerUi' | 'swaggerJson';
  params?: Record<string, string>;
} | null {
  const path = new URL(url, 'http://localhost').pathname;

  if (method === 'GET' && (path === '/health' || path === '/api/auth/health')) return { handler: 'health' };
  if (method === 'GET' && path === '/api/docs/swagger.json') return { handler: 'swaggerJson' };
  if (method === 'GET' && path === '/api/docs') return { handler: 'swaggerUi' };
  if (method === 'POST' && (path === '/api/auth/register' || path === '/register')) return { handler: 'register' };
  if (method === 'POST' && (path === '/api/auth/login' || path === '/login')) return { handler: 'login' };
  if (method === 'POST' && (path === '/api/auth/logout' || path === '/logout')) return { handler: 'logout' };
  if (method === 'POST' && (path === '/api/auth/refresh' || path === '/refresh')) return { handler: 'refresh' };
  if (method === 'GET' && (path === '/api/users/me' || path === '/users/me')) return { handler: 'getMe' };
  if (method === 'PUT' && (path === '/api/users/me' || path === '/users/me')) return { handler: 'updateMe' };
  if (method === 'POST' && (path === '/api/users/search' || path === '/users/search')) return { handler: 'searchUsers' };
  if (method === 'PUT' && (path === '/api/users/me/avatar' || path === '/users/me/avatar')) return { handler: 'updateAvatar' };
  if (method === 'PUT' && (path === '/api/users/me/password' || path === '/users/me/password')) return { handler: 'changePassword' };

  // GET /api/users/:id or /users/:id
  const userMatch = path.match(/^\/(?:api\/)?users\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && userMatch) {
    return { handler: 'getUser', params: { id: userMatch[1] } };
  }

  return null;
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const route = matchRoute(req.method || 'GET', req.url || '/');

    if (!route) {
      sendJson(res, 404, { code: ErrorCode.NOT_FOUND, message: '接口不存在' });
      return;
    }

    switch (route.handler) {
      case 'health': {
        sendJson(res, 200, { status: 'ok', service: 'auth', timestamp: Date.now() });
        return;
      }

      case 'swaggerJson': {
        sendJson(res, 200, swaggerSpec as unknown as Record<string, unknown>);
        return;
      }

      case 'swaggerUi': {
        const html = SWAGGER_UI_HTML;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      case 'register': {
        const body = await parseBody(req);
        const errors = validateRegister(body);
        if (errors.length > 0) {
          sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: errors[0].message, errors });
          return;
        }
        const result = await auth.register({
          username: body.username as string,
          password: body.password as string,
          nickname: body.nickname as string,
          phone: body.phone as string | undefined,
        });
        sendJson(res, 201, { code: ErrorCode.SUCCESS, ...result });
        return;
      }

      case 'login': {
        const ip = getClientIp(req);
        await auth.checkRateLimit('login', ip, 60, 5);
        const body = await parseBody(req);
        const errors = validateLogin(body);
        if (errors.length > 0) {
          sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: errors[0].message, errors });
          return;
        }
        const result = await auth.login({
          username: body.username as string,
          password: body.password as string,
        });
        sendJson(res, 200, { code: ErrorCode.SUCCESS, ...result });
        return;
      }

      case 'logout': {
        const token = extractTokenFromHeader(req.headers.authorization);
        if (token) {
          await auth.logout(token);
        }
        sendJson(res, 200, { code: ErrorCode.SUCCESS, message: '已登出' });
        return;
      }

      case 'refresh': {
        const body = await parseBody(req);
        const refreshToken = body.refreshToken as string;
        if (!refreshToken) {
          sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: 'refreshToken 不能为空' });
          return;
        }
        const result = await auth.refreshTokens(refreshToken);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, ...result });
        return;
      }

      case 'getMe': {
        const token = extractTokenFromHeader(req.headers.authorization);
        const ctx = authenticate(token || '');
        const user = await auth.getCurrentUser(ctx.userId);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, user });
        return;
      }

      case 'updateMe': {
        const token = extractTokenFromHeader(req.headers.authorization);
        const ctx = authenticate(token || '');
        const body = await parseBody(req);
        const errors = validateUpdateProfile(body);
        if (errors.length > 0) {
          sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: errors[0].message, errors });
          return;
        }
        const user = await auth.updateProfile(ctx.userId, {
          nickname: body.nickname as string | undefined,
          avatar: body.avatar as string | undefined,
          phone: body.phone as string | undefined,
        });
        sendJson(res, 200, { code: ErrorCode.SUCCESS, user });
        return;
      }

      case 'getUser': {
        const token = extractTokenFromHeader(req.headers.authorization);
        authenticate(token || '');
        const user = await auth.getUserById(route.params!.id);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, user });
        return;
      }

      case 'searchUsers': {
        const token = extractTokenFromHeader(req.headers.authorization);
        authenticate(token || '');
        const body = await parseBody(req);
        const errors = validateSearch(body);
        if (errors.length > 0) {
          sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: errors[0].message, errors });
          return;
        }
        const result = await auth.searchUsers(body.query as string);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, ...result });
        return;
      }

      case 'updateAvatar': {
        const token = extractTokenFromHeader(req.headers.authorization);
        const ctx = authenticate(token || '');
        const body = await parseBody(req);
        const avatar = (body.avatar as string) || null;
        const user = await auth.updateAvatar(ctx.userId, avatar);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, user });
        return;
      }

      case 'changePassword': {
        const token = extractTokenFromHeader(req.headers.authorization);
        const ctx = authenticate(token || '');
        const body = await parseBody(req);
        const errors = validateChangePassword(body);
        if (errors.length > 0) {
          sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: errors[0].message, errors });
          return;
        }
        await auth.changePassword(ctx.userId, {
          oldPassword: body.oldPassword as string,
          newPassword: body.newPassword as string,
        });
        sendJson(res, 200, { code: ErrorCode.SUCCESS, message: '密码修改成功' });
        return;
      }
    }
  } catch (err) {
    sendError(res, err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[auth] listening on ${HOST}:${PORT}`);
});

// Graceful shutdown
function shutdown() {
  console.log('[auth] shutting down...');
  server.close(() => {
    prisma.$disconnect().then(() => {
      redis?.disconnect();
      process.exit(0);
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
