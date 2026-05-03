/**
 * Docker entry point for the red packet service.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { loadConfig } from '@wechat-clone/shared/config';
import { ErrorCode } from '@wechat-clone/shared';
import { createRedPacketService, RedPacketError } from './redpacket.service';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.services.redpacket?.port ?? 3009;
const HOST = '0.0.0.0';

const prisma = new PrismaClient();

const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: true })
  : null;

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
  if (err instanceof RedPacketError) {
    sendJson(res, redPacketErrorToHttpStatus(err.code), { code: err.code, message: err.message });
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

function redPacketErrorToHttpStatus(code: number): number {
  switch (code) {
    case ErrorCode.INVALID_PARAM:
      return 400;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.NOT_FOUND:
    case ErrorCode.RED_PACKET_NOT_FOUND:
      return 404;
    case ErrorCode.RED_PACKET_EXPIRED:
    case ErrorCode.RED_PACKET_FINISHED:
    case ErrorCode.RED_PACKET_ALREADY_OPENED:
      return 409;
    default:
      return 500;
  }
}

function getUserId(req: IncomingMessage): string {
  const uid = req.headers['x-user-id'];
  if (typeof uid === 'string' && uid.length > 0) return uid;
  throw new RedPacketError(ErrorCode.UNAUTHORIZED, '未登录或登录已过期');
}

// ─── Route matching ──────────────────────────────────────────────────────────

interface MatchedRoute {
  handler: string;
  params?: Record<string, string>;
}

function matchRoute(method: string, url: string): MatchedRoute | null {
  const path = new URL(url, 'http://localhost').pathname;

  if (method === 'GET' && path === '/health') {
    return { handler: 'health' };
  }

  // POST /api/redpacket/send
  if (method === 'POST' && path === '/api/redpacket/send') {
    return { handler: 'send' };
  }

  // POST /api/redpacket/open/:id
  const openMatch = path.match(/^\/api\/redpacket\/open\/([a-zA-Z0-9_-]+)$/);
  if (method === 'POST' && openMatch) {
    return { handler: 'open', params: { id: openMatch[1] } };
  }

  // GET /api/redpacket/:id
  const detailMatch = path.match(/^\/api\/redpacket\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && detailMatch) {
    return { handler: 'detail', params: { id: detailMatch[1] } };
  }

  // GET /api/redpacket/history/sent
  if (method === 'GET' && path === '/api/redpacket/history/sent') {
    return { handler: 'historySent' };
  }

  // GET /api/redpacket/history/received
  if (method === 'GET' && path === '/api/redpacket/history/received') {
    return { handler: 'historyReceived' };
  }

  // POST /api/redpacket/expire (internal cron)
  if (method === 'POST' && path === '/api/redpacket/expire') {
    return { handler: 'expire' };
  }

  return null;
}

// ─── Server start ────────────────────────────────────────────────────────────

async function start() {
  if (redis) {
    try {
      await redis.connect();
      console.log('[redpacket] redis connected');
    } catch (err) {
      console.warn('[redpacket] redis connection failed, running without cache:', (err as Error).message);
    }
  }

  const service = createRedPacketService({ prisma, redis });

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
          sendJson(res, 200, { status: 'ok', service: 'redpacket', timestamp: Date.now() });
          return;
        }

        case 'send': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          const packet = await service.sendRedPacket(userId, {
            conversationId: body.conversationId as string | undefined,
            totalAmount: Number(body.totalAmount),
            totalCount: Number(body.totalCount),
            type: (body.type as 'fixed' | 'random') || 'random',
            blessing: body.blessing as string | undefined,
          });
          sendJson(res, 201, { code: ErrorCode.SUCCESS, data: packet as unknown as Record<string, unknown> });
          return;
        }

        case 'open': {
          const userId = getUserId(req);
          const result = await service.openRedPacket(route.params!.id, userId);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
          return;
        }

        case 'detail': {
          const detail = await service.getRedPacket(route.params!.id);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: detail as unknown as Record<string, unknown> });
          return;
        }

        case 'historySent': {
          const userId = getUserId(req);
          const url = new URL(req.url!, 'http://localhost');
          const page = parseInt(url.searchParams.get('page') || '1', 10);
          const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);
          const result = await service.getRedPacketHistory(userId, page, pageSize);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
          return;
        }

        case 'historyReceived': {
          const userId = getUserId(req);
          const url = new URL(req.url!, 'http://localhost');
          const page = parseInt(url.searchParams.get('page') || '1', 10);
          const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);
          const result = await service.getReceivedHistory(userId, page, pageSize);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
          return;
        }

        case 'expire': {
          const count = await service.expireRedPackets();
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: { expiredCount: count } });
          return;
        }
      }
    } catch (err) {
      sendError(res, err);
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[redpacket] listening on ${HOST}:${PORT}`);
  });

  // Graceful shutdown
  function shutdown() {
    console.log('[redpacket] shutting down...');
    server.close(() => {
      Promise.all([
        prisma.$disconnect(),
        redis ? redis.quit() : Promise.resolve(),
      ]).then(() => process.exit(0));
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('[redpacket] failed to start:', err);
  process.exit(1);
});
