/**
 * Docker entry point for the search service.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { MongoClient } from 'mongodb';
import { loadConfig } from '@wechat-clone/shared/config';
import { ErrorCode } from '@wechat-clone/shared';
import { createSearchService, SearchError } from './search.service';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.services.search?.port ?? 3008;
const HOST = '0.0.0.0';

// MongoDB setup
const mongoUrl = process.env.MONGODB_URL || config.database.mongodb?.uri;
let mongoClient: MongoClient | null = null;
let mongoDb: any = null;

if (mongoUrl && process.env.MONGODB_URL !== '') {
  mongoClient = new MongoClient(mongoUrl);
}

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
      try { resolve(JSON.parse(raw)); } catch { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, data: Record<string, unknown>): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof SearchError) {
    sendJson(res, errorToHttpStatus(err.code), { code: err.code, message: err.message });
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

function errorToHttpStatus(code: number): number {
  switch (code) {
    case ErrorCode.INVALID_PARAM: return 400;
    case ErrorCode.UNAUTHORIZED: return 401;
    case ErrorCode.FORBIDDEN: return 403;
    case ErrorCode.NOT_FOUND: return 404;
    case ErrorCode.RATE_LIMITED: return 429;
    default: return 500;
  }
}

function getUserId(req: IncomingMessage): string {
  const uid = req.headers['x-user-id'];
  if (typeof uid === 'string' && uid.length > 0) return uid;
  throw new SearchError(ErrorCode.UNAUTHORIZED, '未登录或登录已过期');
}

function getQueryParams(url: string): Record<string, string> {
  const idx = url.indexOf('?');
  if (idx < 0) return {};
  const params = new URLSearchParams(url.slice(idx));
  const result: Record<string, string> = {};
  for (const [k, v] of params) {
    result[k] = v;
  }
  return result;
}

// ─── Route matching ──────────────────────────────────────────────────────────

interface MatchedRoute {
  handler: string;
  params?: Record<string, string>;
}

function matchRoute(method: string, url: string): MatchedRoute | null {
  const path = new URL(url, 'http://localhost').pathname;

  if (method === 'GET' && (path === '/health' || path === '/api/search/health')) {
    return { handler: 'health' };
  }

  if (method === 'GET' && (path === '/api/search/messages' || path === '/search/messages')) {
    return { handler: 'searchMessages' };
  }

  if (method === 'GET' && (path === '/api/search/contacts' || path === '/search/contacts')) {
    return { handler: 'searchContacts' };
  }

  if (method === 'GET' && (path === '/api/search/groups' || path === '/search/groups')) {
    return { handler: 'searchGroups' };
  }

  if (method === 'GET' && (path === '/api/search/all' || path === '/search/all')) {
    return { handler: 'searchAll' };
  }

  if (method === 'POST' && (path === '/api/search/init-indexes' || path === '/search/init-indexes')) {
    return { handler: 'initIndexes' };
  }

  return null;
}

// ─── Server start ────────────────────────────────────────────────────────────

async function start() {
  if (mongoClient) {
    await mongoClient.connect();
    mongoDb = mongoClient.db();
  }

  const service = createSearchService({ prisma, mongo: mongoDb });

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id, x-username');

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
          sendJson(res, 200, { status: 'ok', service: 'search', timestamp: Date.now() });
          return;
        }

        case 'searchMessages': {
          const userId = getUserId(req);
          const qs = getQueryParams(req.url || '');
          if (!qs.q) {
            sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: '缺少搜索关键词' });
            return;
          }
          const result = await service.searchMessages({
            userId,
            keyword: qs.q,
            convId: qs.conv_id,
            page: qs.page ? parseInt(qs.page, 10) : undefined,
            size: qs.size ? parseInt(qs.size, 10) : undefined,
          });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
          return;
        }

        case 'searchContacts': {
          const userId = getUserId(req);
          const qs = getQueryParams(req.url || '');
          if (!qs.q) {
            sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: '缺少搜索关键词' });
            return;
          }
          const result = await service.searchContacts({ userId, keyword: qs.q });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
          return;
        }

        case 'searchGroups': {
          const userId = getUserId(req);
          const qs = getQueryParams(req.url || '');
          if (!qs.q) {
            sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: '缺少搜索关键词' });
            return;
          }
          const result = await service.searchGroups({ userId, keyword: qs.q });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
          return;
        }

        case 'searchAll': {
          const userId = getUserId(req);
          const qs = getQueryParams(req.url || '');
          if (!qs.q) {
            sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: '缺少搜索关键词' });
            return;
          }
          const result = await service.searchAll({ userId, keyword: qs.q });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
          return;
        }

        case 'initIndexes': {
          const result = await service.initSearchIndexes();
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
          return;
        }
      }
    } catch (err) {
      sendError(res, err);
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[search] listening on ${HOST}:${PORT}`);
  });

  // Graceful shutdown
  function shutdown() {
    console.log('[search] shutting down...');
    server.close(() => {
      Promise.all([
        prisma.$disconnect(),
        mongoClient?.close(),
      ]).then(() => process.exit(0));
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('[search] failed to start:', err);
  process.exit(1);
});
