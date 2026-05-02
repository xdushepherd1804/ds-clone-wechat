/**
 * Docker entry point for the contact service.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { ErrorCode } from '@wechat-clone/shared';
import { loadConfig } from '@wechat-clone/shared/config';
import { createContactService, ContactError } from './contact.service';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.services.contact.port;
const HOST = '0.0.0.0';

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL || `redis://${config.database.redis.host}:${config.database.redis.port}`;
const redis = process.env.REDIS_URL === '' ? null : new Redis(redisUrl);

const service = createContactService({ prisma, redis });

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
  if (err instanceof ContactError) {
    sendJson(res, contactErrorToHttpStatus(err.code), { code: err.code, message: err.message });
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

function contactErrorToHttpStatus(code: number): number {
  switch (code) {
    case ErrorCode.INVALID_PARAM:
      return 400;
    case ErrorCode.NOT_FOUND:
    case ErrorCode.CONTACT_NOT_FOUND:
    case ErrorCode.FRIEND_REQUEST_NOT_FOUND:
      return 404;
    case ErrorCode.CONTACT_ALREADY_EXISTS:
    case ErrorCode.FRIEND_REQUEST_ALREADY_HANDLED:
      return 409;
    case ErrorCode.CONTACT_BLOCKED:
    case ErrorCode.FORBIDDEN:
      return 403;
    default:
      return 500;
  }
}

function getUserId(req: IncomingMessage): string {
  const uid = req.headers['x-user-id'];
  if (typeof uid === 'string' && uid.length > 0) return uid;
  throw new ContactError(ErrorCode.UNAUTHORIZED, '未登录或登录已过期');
}

// ─── Route matching ──────────────────────────────────────────────────────────

interface MatchedRoute {
  handler: string;
  params?: Record<string, string>;
}

function matchRoute(method: string, url: string): MatchedRoute | null {
  const path = new URL(url, 'http://localhost').pathname;

  if (method === 'GET' && (path === '/health' || path === '/api/contacts/health')) {
    return { handler: 'health' };
  }

  // GET /requests — pending friend requests (must be before GET / which matches anything)
  if (method === 'GET' && (path === '/requests' || path === '/api/contacts/requests')) {
    return { handler: 'getFriendRequests' };
  }

  // GET / — list contacts
  if (method === 'GET' && (path === '/' || path === '/api/contacts')) {
    return { handler: 'getContacts' };
  }

  // POST /requests — send friend request
  if (method === 'POST' && (path === '/requests' || path === '/api/contacts/requests')) {
    return { handler: 'sendFriendRequest' };
  }

  // PUT /requests/:id — handle (accept/reject) friend request
  const handleReqMatch = path.match(/^\/(?:api\/)?(?:contacts\/)?requests\/([a-zA-Z0-9_-]+)$/);
  if (method === 'PUT' && handleReqMatch) {
    return { handler: 'handleFriendRequest', params: { requestId: handleReqMatch[1] } };
  }

  // POST /search — search contacts
  if (method === 'POST' && (path === '/search' || path === '/api/contacts/search')) {
    return { handler: 'searchContacts' };
  }

  // DELETE /block/:uid — unblock user (must be before DELETE /:uid)
  const unblockMatch = path.match(/^\/(?:api\/)?(?:contacts\/)?block\/([a-zA-Z0-9_-]+)$/);
  if (method === 'DELETE' && unblockMatch) {
    return { handler: 'unblockUser', params: { targetUid: unblockMatch[1] } };
  }

  // POST /block — block user
  if (method === 'POST' && (path === '/block' || path === '/api/contacts/block')) {
    return { handler: 'blockUser' };
  }

  // PUT /:uid/remark — update remark (must be before DELETE /:uid)
  const remarkMatch = path.match(/^\/(?:api\/)?(?:contacts\/)?([a-zA-Z0-9_-]+)\/remark$/);
  if (method === 'PUT' && remarkMatch) {
    return { handler: 'updateRemark', params: { contactUid: remarkMatch[1] } };
  }

  // PUT /:uid/tags — update tags (must be before DELETE /:uid)
  const tagsMatch = path.match(/^\/(?:api\/)?(?:contacts\/)?([a-zA-Z0-9_-]+)\/tags$/);
  if (method === 'PUT' && tagsMatch) {
    return { handler: 'updateTags', params: { contactUid: tagsMatch[1] } };
  }

  // DELETE /:uid — delete contact
  const deleteMatch = path.match(/^\/(?:api\/)?(?:contacts\/)?([a-zA-Z0-9_-]+)$/);
  if (method === 'DELETE' && deleteMatch) {
    return { handler: 'deleteContact', params: { contactUid: deleteMatch[1] } };
  }

  return null;
}

// ─── Server start ────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-id');

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
        sendJson(res, 200, { status: 'ok', service: 'contact', timestamp: Date.now() });
        return;
      }

      case 'getContacts': {
        const userId = getUserId(req);
        const contacts = await service.getContacts(userId);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, data: contacts });
        return;
      }

      case 'sendFriendRequest': {
        const userId = getUserId(req);
        const body = await parseBody(req);
        if (!body.toUid || typeof body.toUid !== 'string') {
          sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: 'toUid 不能为空' });
          return;
        }
        const result = await service.sendFriendRequest({
          fromUid: userId,
          toUid: body.toUid,
          message: typeof body.message === 'string' ? body.message : undefined,
        });
        sendJson(res, 201, { code: ErrorCode.SUCCESS, data: result });
        return;
      }

      case 'getFriendRequests': {
        const userId = getUserId(req);
        const requests = await service.getFriendRequests(userId);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, data: requests });
        return;
      }

      case 'handleFriendRequest': {
        const userId = getUserId(req);
        const body = await parseBody(req);
        const action = body.action as string;
        if (action !== 'accept' && action !== 'reject') {
          sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: 'action 必须为 accept 或 reject' });
          return;
        }
        await service.handleFriendRequest({
          requestId: route.params!.requestId,
          action,
          userId,
        });
        const msg = action === 'accept' ? '已添加好友' : '已拒绝好友申请';
        sendJson(res, 200, { code: ErrorCode.SUCCESS, message: msg });
        return;
      }

      case 'deleteContact': {
        const userId = getUserId(req);
        await service.deleteContact(userId, route.params!.contactUid);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, message: '已删除联系人' });
        return;
      }

      case 'updateRemark': {
        const userId = getUserId(req);
        const body = await parseBody(req);
        if (typeof body.remark !== 'string') {
          sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: 'remark 不能为空' });
          return;
        }
        const result = await service.updateRemark(userId, route.params!.contactUid, body.remark);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result });
        return;
      }

      case 'updateTags': {
        const userId = getUserId(req);
        const body = await parseBody(req);
        if (!Array.isArray(body.tags)) {
          sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: 'tags 必须为数组' });
          return;
        }
        const result = await service.updateTags(userId, route.params!.contactUid, body.tags as string[]);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result });
        return;
      }

      case 'blockUser': {
        const userId = getUserId(req);
        const body = await parseBody(req);
        if (!body.targetUid || typeof body.targetUid !== 'string') {
          sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: 'targetUid 不能为空' });
          return;
        }
        await service.blockUser(userId, body.targetUid);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, message: '已拉黑' });
        return;
      }

      case 'unblockUser': {
        const userId = getUserId(req);
        await service.unblockUser(userId, route.params!.targetUid);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, message: '已取消拉黑' });
        return;
      }

      case 'searchContacts': {
        const userId = getUserId(req);
        const body = await parseBody(req);
        if (!body.keyword || typeof body.keyword !== 'string') {
          sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: 'keyword 不能为空' });
          return;
        }
        const results = await service.searchContacts({ userId, keyword: body.keyword });
        sendJson(res, 200, { code: ErrorCode.SUCCESS, data: results });
        return;
      }
    }
  } catch (err) {
    console.error('[contact] request error:', err);
    sendError(res, err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[contact] listening on ${HOST}:${PORT}`);
});

function shutdown() {
  console.log('[contact] shutting down...');
  server.close(() => {
    prisma.$disconnect().then(() => {
      redis?.disconnect();
      process.exit(0);
    });
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
