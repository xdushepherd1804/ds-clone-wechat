/**
 * Docker entry point for the message service.
 */
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { MongoClient } from 'mongodb';
import { Redis } from 'ioredis';
import { loadConfig, ErrorCode } from '@wechat-clone/shared';
import { createMessageService, MessageError } from './message.service';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.services.message.port;
const HOST = '0.0.0.0';

// MongoDB setup
const mongoUrl = process.env.MONGODB_URL || config.database.mongodb.uri;
let mongoClient: MongoClient | null = null;
let mongoDb: any = null;

if (!process.env.MONGODB_URL || process.env.MONGODB_URL !== '') {
  mongoClient = new MongoClient(mongoUrl);
}

// Redis setup
const redisUrl = process.env.REDIS_URL || `redis://${config.database.redis.host}:${config.database.redis.port}`;
const redis = process.env.REDIS_URL === '' ? null : new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 });

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
  if (err instanceof MessageError) {
    sendJson(res, messageErrorToHttpStatus(err.code), { code: err.code, message: err.message });
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

function messageErrorToHttpStatus(code: number): number {
  switch (code) {
    case ErrorCode.INVALID_PARAM:
      return 400;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.NOT_FOUND:
    case ErrorCode.MSG_NOT_FOUND:
    case ErrorCode.CONVERSATION_NOT_FOUND:
      return 404;
    case ErrorCode.RATE_LIMITED:
      return 429;
    case ErrorCode.GROUP_PERMISSION_DENIED:
      return 403;
    default:
      return 500;
  }
}

function getUserId(req: IncomingMessage): string {
  const uid = req.headers['x-user-id'];
  if (typeof uid === 'string' && uid.length > 0) return uid;
  throw new MessageError(ErrorCode.UNAUTHORIZED, '未登录或登录已过期');
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

  if (method === 'GET' && (path === '/health' || path === '/api/messages/health')) {
    return { handler: 'health' };
  }

  if (method === 'POST' && (path === '/api/messages/send' || path === '/messages/send' || path === '/send')) {
    return { handler: 'sendMessage' };
  }

  if (method === 'GET' && (path === '/api/messages/history' || path === '/messages/history' || path === '/history')) {
    return { handler: 'getMessages' };
  }

  if (method === 'GET' && (path === '/api/messages/conversations' || path === '/messages/conversations' || path === '/conversations')) {
    return { handler: 'getConversations' };
  }

  if (method === 'GET' && (path === '/api/messages/offline' || path === '/messages/offline' || path === '/offline')) {
    return { handler: 'getOfflineMessages' };
  }

  // PUT /api/messages/read/:conv_id
  const readMatch = path.match(/^\/(?:api\/)?(?:messages\/)?read\/([a-zA-Z0-9_:.-]+)$/);
  if (method === 'PUT' && readMatch) {
    return { handler: 'markRead', params: { convId: readMatch[1] } };
  }

  // DELETE /api/messages/:msg_id
  const deleteMatch = path.match(/^\/(?:api\/)?(?:messages\/)?([a-zA-Z0-9_-]+)$/);
  if (method === 'DELETE' && deleteMatch) {
    return { handler: 'recallMessage', params: { msgId: deleteMatch[1] } };
  }

  return null;
}

// ─── Server start ────────────────────────────────────────────────────────────

async function start() {
  // Connect MongoDB
  if (mongoClient) {
    await mongoClient.connect();
    mongoDb = mongoClient.db();
  }

  // Push notification integration — notify push service when recipient is offline
  const pushHost = process.env.PUSH_HOST || 'localhost';
  const pushPort = (config.services as Record<string, { port: number; host?: string }>).push?.port ?? 3007;

  function notifyPush(recipientId: string, senderNickname: string, content: string) {
    const body = JSON.stringify({
      targetUids: [recipientId],
      scenario: 'new_message',
      title: senderNickname || '新消息',
      body: content.length > 50 ? content.slice(0, 50) : content,
    });

    const req = request({
      hostname: pushHost,
      port: pushPort,
      path: '/push/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(body)),
      },
    });

    req.on('error', () => {
      // Push service may be unavailable — non-critical
    });

    req.end(body);
  }

  const service = createMessageService({
    prisma,
    mongo: mongoDb,
    redis,
    onOfflineMessage: (event) => {
      notifyPush(
        event.recipientId,
        event.senderNickname,
        typeof event.msg.content === 'string' ? event.msg.content : '',
      );
    },
  });

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
          sendJson(res, 200, { status: 'ok', service: 'message', timestamp: Date.now() });
          return;
        }

        case 'sendMessage': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          const msg = await service.sendMessage({
            fromUid: userId,
            toUid: body.toUid as string | undefined,
            toGroupId: body.toGroupId as string | undefined,
            chatType: (body.chatType as string) || 'private',
            msgType: (typeof body.msgType === 'number' ? body.msgType : 1) as any,
            content: typeof body.content === 'string' ? body.content : JSON.stringify(body.content ?? ''),
          });
          sendJson(res, 201, { code: ErrorCode.SUCCESS, data: msg as unknown as Record<string, unknown> });
          return;
        }

        case 'getMessages': {
          const userId = getUserId(req);
          const qs = getQueryParams(req.url || '');
          const conversationId = qs.conversation_id || qs.conversationId || '';
          if (!conversationId) {
            sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: '缺少会话ID' });
            return;
          }
          const msgs = await service.getMessages(conversationId, userId, {
            before: qs.before,
            limit: qs.limit ? parseInt(qs.limit, 10) : undefined,
          });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: msgs as unknown as Record<string, unknown> });
          return;
        }

        case 'getConversations': {
          const userId = getUserId(req);
          const qs = getQueryParams(req.url || '');
          const conversations = await service.getConversations(userId, {
            limit: qs.limit ? parseInt(qs.limit, 10) : undefined,
            offset: qs.offset ? parseInt(qs.offset, 10) : undefined,
          });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: conversations as unknown as Record<string, unknown> });
          return;
        }

        case 'getOfflineMessages': {
          const userId = getUserId(req);
          const msgs = await service.getOfflineMessages(userId);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: msgs as unknown as Record<string, unknown> });
          return;
        }

        case 'markRead': {
          const userId = getUserId(req);
          const convId = route.params!.convId;
          const result = await service.markConversationRead(convId, userId);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
          return;
        }

        case 'recallMessage': {
          const userId = getUserId(req);
          const msgId = route.params!.msgId;
          const result = await service.recallMessage({ msgId, userId });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
          return;
        }
      }
    } catch (err) {
      sendError(res, err);
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[message] listening on ${HOST}:${PORT}`);
  });

  // Graceful shutdown
  function shutdown() {
    console.log('[message] shutting down...');
    server.close(() => {
      Promise.all([
        prisma.$disconnect(),
        mongoClient?.close(),
        redis?.quit(),
      ]).then(() => process.exit(0));
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('[message] failed to start:', err);
  process.exit(1);
});
