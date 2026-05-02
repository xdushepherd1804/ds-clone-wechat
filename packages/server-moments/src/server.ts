/**
 * Moments service — timeline, create/delete moments, like, comment.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { loadConfig } from '@wechat-clone/shared/config';
import { ErrorCode } from '@wechat-clone/shared';
import { createMomentsService, MomentError } from './moments.service';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.services.moments.port;
const HOST = '0.0.0.0';

const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL || `redis://${config.database.redis.host}:${config.database.redis.port}`;
const redis = process.env.REDIS_URL === '' ? null : new Redis(redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 });

const service = createMomentsService({ prisma, redis });

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function parseBody(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) { reject(new Error('request body too large')); req.destroy(); return; }
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
  if (err instanceof MomentError) {
    sendJson(res, momentErrorToHttpStatus(err.code), { code: err.code, message: err.message });
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

function momentErrorToHttpStatus(code: number): number {
  switch (code) {
    case ErrorCode.INVALID_PARAM: return 400;
    case ErrorCode.UNAUTHORIZED: return 401;
    case ErrorCode.FORBIDDEN: case 4301: return 403;
    case ErrorCode.NOT_FOUND: case 4303: case 4308: return 404;
    default: return 500;
  }
}

function getUserId(req: IncomingMessage): string {
  const uid = req.headers['x-user-id'];
  if (typeof uid === 'string' && uid.length > 0) return uid;
  throw new MomentError(ErrorCode.UNAUTHORIZED, '未登录或登录已过期');
}

function getQueryParams(url: string): Record<string, string> {
  const idx = url.indexOf('?');
  if (idx < 0) return {};
  const params = new URLSearchParams(url.slice(idx));
  const result: Record<string, string> = {};
  for (const [k, v] of params) result[k] = v;
  return result;
}

// ─── Route matching ──────────────────────────────────────────────────────────

interface MatchedRoute {
  handler: string;
  params?: Record<string, string>;
}

function matchRoute(method: string, url: string): MatchedRoute | null {
  let path = new URL(url, 'http://localhost').pathname;

  if (method === 'GET' && (path === '/health' || path === '/api/moments/health')) {
    return { handler: 'health' };
  }

  // Strip /api/moments or /moments prefix
  path = path.replace(/^\/(?:api\/)?moments/, '') || '/';

  // GET /timeline or GET /
  if (method === 'GET' && (path === '/timeline' || path === '/')) {
    return { handler: 'getTimeline' };
  }

  // GET /user/:userId
  const userMatch = path.match(/^\/user\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && userMatch) {
    return { handler: 'getUserMoments', params: { userId: userMatch[1] } };
  }

  // POST / — create moment
  if (method === 'POST' && path === '/') {
    return { handler: 'createMoment' };
  }

  // POST /:id/like
  const likeMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/like$/);
  if (method === 'POST' && likeMatch) {
    return { handler: 'toggleLike', params: { momentId: likeMatch[1] } };
  }

  // DELETE /:id/like
  if (method === 'DELETE' && likeMatch) {
    return { handler: 'unlike', params: { momentId: likeMatch[1] } };
  }

  // POST /:id/comments
  const commentMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/comments$/);
  if (method === 'POST' && commentMatch) {
    return { handler: 'addComment', params: { momentId: commentMatch[1] } };
  }

  // DELETE /:id/comments/:commentId
  const deleteCommentMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/comments\/([a-zA-Z0-9_-]+)$/);
  if (method === 'DELETE' && deleteCommentMatch) {
    return { handler: 'deleteComment', params: { momentId: deleteCommentMatch[1], commentId: deleteCommentMatch[2] } };
  }

  // GET /:id — get moment by id (must be last to avoid matching /timeline etc)
  const idMatch = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && idMatch) {
    return { handler: 'getMomentById', params: { momentId: idMatch[1] } };
  }

  // DELETE /:id — delete moment
  if (method === 'DELETE' && idMatch) {
    return { handler: 'deleteMoment', params: { momentId: idMatch[1] } };
  }

  return null;
}

// ─── Server ──────────────────────────────────────────────────────────────────

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
        sendJson(res, 200, { status: 'ok', service: 'moments', timestamp: Date.now() });
        return;
      }

      case 'getTimeline': {
        const userId = getUserId(req);
        const qs = getQueryParams(req.url || '');
        const items = await service.getTimeline({
          userId,
          before: qs.before,
          limit: qs.limit ? parseInt(qs.limit, 10) : undefined,
        });
        sendJson(res, 200, { code: ErrorCode.SUCCESS, data: items as unknown as Record<string, unknown> });
        return;
      }

      case 'getUserMoments': {
        const userId = getUserId(req);
        const qs = getQueryParams(req.url || '');
        const items = await service.getUserMoments(route.params!.userId, {
          userId,
          before: qs.before,
          limit: qs.limit ? parseInt(qs.limit, 10) : undefined,
        });
        sendJson(res, 200, { code: ErrorCode.SUCCESS, data: items as unknown as Record<string, unknown> });
        return;
      }

      case 'getMomentById': {
        const userId = getUserId(req);
        const item = await service.getMomentById(route.params!.momentId, userId);
        sendJson(res, 200, { code: ErrorCode.SUCCESS, data: item as unknown as Record<string, unknown> });
        return;
      }

      case 'createMoment': {
        const userId = getUserId(req);
        const body = await parseBody(req);
        const item = await service.createMoment({
          userId,
          content: body.content as string | undefined,
          images: body.images as string[] | undefined,
          location: body.location as string | undefined,
          visibility: body.visibility as string | undefined,
        });
        sendJson(res, 201, { code: ErrorCode.SUCCESS, data: item as unknown as Record<string, unknown> });
        return;
      }

      case 'deleteMoment': {
        const userId = getUserId(req);
        await service.deleteMoment({ momentId: route.params!.momentId, userId });
        sendJson(res, 200, { code: ErrorCode.SUCCESS, message: '已删除' });
        return;
      }

      case 'toggleLike': {
        const userId = getUserId(req);
        const result = await service.toggleLikeMoment({ momentId: route.params!.momentId, userId });
        sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
        return;
      }

      case 'unlike': {
        const userId = getUserId(req);
        await service.unlikeMoment({ momentId: route.params!.momentId, userId });
        sendJson(res, 200, { code: ErrorCode.SUCCESS, message: '已取消点赞' });
        return;
      }

      case 'addComment': {
        const userId = getUserId(req);
        const body = await parseBody(req);
        const comment = await service.addComment({
          momentId: route.params!.momentId,
          userId,
          content: body.content as string,
          replyToId: body.replyToId as string | undefined,
        });
        sendJson(res, 201, { code: ErrorCode.SUCCESS, data: comment as unknown as Record<string, unknown> });
        return;
      }

      case 'deleteComment': {
        const userId = getUserId(req);
        await service.deleteComment({
          momentId: route.params!.momentId,
          commentId: route.params!.commentId,
          userId,
        });
        sendJson(res, 200, { code: ErrorCode.SUCCESS, message: '评论已删除' });
        return;
      }
    }
  } catch (err) {
    console.error('[moments] request error:', err);
    sendError(res, err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[moments] listening on ${HOST}:${PORT}`);
});

function shutdown() {
  console.log('[moments] shutting down...');
  server.close(() => {
    Promise.all([prisma.$disconnect(), redis?.quit()]).then(() => process.exit(0));
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
