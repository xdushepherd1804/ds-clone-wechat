/**
 * Docker entry point for the group service.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { loadConfig, ErrorCode } from '@wechat-clone/shared';
import type { GroupRole } from '@wechat-clone/shared';
import { createGroupService, GroupError } from './group.service';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.services.group.port;
const HOST = '0.0.0.0';

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
  if (err instanceof GroupError) {
    sendJson(res, groupErrorToHttpStatus(err.code), { code: err.code, message: err.message });
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

function groupErrorToHttpStatus(code: number): number {
  switch (code) {
    case ErrorCode.INVALID_PARAM:
      return 400;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.FORBIDDEN:
    case ErrorCode.GROUP_PERMISSION_DENIED:
      return 403;
    case ErrorCode.NOT_FOUND:
    case ErrorCode.GROUP_NOT_FOUND:
    case ErrorCode.GROUP_MEMBER_NOT_FOUND:
      return 404;
    case ErrorCode.GROUP_MEMBER_ALREADY_EXISTS:
    case ErrorCode.GROUP_FULL:
      return 409;
    default:
      return 500;
  }
}

function getUserId(req: IncomingMessage): string {
  const uid = req.headers['x-user-id'];
  if (typeof uid === 'string' && uid.length > 0) return uid;
  throw new GroupError(ErrorCode.UNAUTHORIZED, '未登录或登录已过期');
}

// ─── Route matching ──────────────────────────────────────────────────────────

interface MatchedRoute {
  handler: string;
  params?: Record<string, string>;
}

function matchRoute(method: string, url: string): MatchedRoute | null {
  let path = new URL(url, 'http://localhost').pathname;

  if (method === 'GET' && path === '/health') {
    return { handler: 'health' };
  }

  // Normalize: strip /api/groups or /groups prefix (from direct access or gateway)
  path = path.replace(/^\/(?:api\/)?groups/, '') || '/';

  // POST /create
  if (method === 'POST' && path === '/create') {
    return { handler: 'createGroup' };
  }

  // GET / => list user's groups
  if (method === 'GET' && path === '/') {
    return { handler: 'listGroups' };
  }

  // GET /:id
  const getGroupMatch = path.match(/^\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && getGroupMatch) {
    return { handler: 'getGroup', params: { id: getGroupMatch[1] } };
  }

  // DELETE /:id (dissolve)
  if (method === 'DELETE' && getGroupMatch) {
    return { handler: 'dissolveGroup', params: { id: getGroupMatch[1] } };
  }

  // PUT/PATCH /:id (update)
  if ((method === 'PUT' || method === 'PATCH') && getGroupMatch) {
    return { handler: 'updateGroup', params: { id: getGroupMatch[1] } };
  }

  // GET /:id/members
  const membersMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/members$/);
  if (method === 'GET' && membersMatch) {
    return { handler: 'getMembers', params: { id: membersMatch[1] } };
  }

  // POST /:id/members (add/invite)
  if (method === 'POST' && membersMatch) {
    return { handler: 'addMembers', params: { id: membersMatch[1] } };
  }

  // DELETE /:id/members/:uid (kick)
  const kickMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/members\/([a-zA-Z0-9_-]+)$/);
  if (method === 'DELETE' && kickMatch) {
    return { handler: 'removeMember', params: { id: kickMatch[1], uid: kickMatch[2] } };
  }

  // PUT /:id/members/:uid/role
  const roleMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/members\/([a-zA-Z0-9_-]+)\/role$/);
  if (method === 'PUT' && roleMatch) {
    return { handler: 'updateMemberRole', params: { id: roleMatch[1], uid: roleMatch[2] } };
  }

  // PUT/PATCH /:id/members/nickname
  const nicknameMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/members\/nickname$/);
  if ((method === 'PUT' || method === 'PATCH') && nicknameMatch) {
    return { handler: 'updateMemberNickname', params: { id: nicknameMatch[1] } };
  }

  // POST /:id/join
  const joinMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/join$/);
  if (method === 'POST' && joinMatch) {
    return { handler: 'joinGroup', params: { id: joinMatch[1] } };
  }

  // PUT /:id/join/:uid (approve/reject)
  const approveMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/join\/([a-zA-Z0-9_-]+)$/);
  if (method === 'PUT' && approveMatch) {
    return { handler: 'approveJoin', params: { id: approveMatch[1], uid: approveMatch[2] } };
  }

  // POST /:id/quit
  const quitMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/quit$/);
  if (method === 'POST' && quitMatch) {
    return { handler: 'quitGroup', params: { id: quitMatch[1] } };
  }

  // PUT /:id/announcement
  const announcementMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/announcement$/);
  if (method === 'PUT' && announcementMatch) {
    return { handler: 'setAnnouncement', params: { id: announcementMatch[1] } };
  }

  // PUT /:id/mute/:uid
  const muteMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/mute\/([a-zA-Z0-9_-]+)$/);
  if (method === 'PUT' && muteMatch) {
    return { handler: 'muteMember', params: { id: muteMatch[1], uid: muteMatch[2] } };
  }

  // POST /:id/mentions/validate
  const mentionsMatch = path.match(/^\/([a-zA-Z0-9_-]+)\/mentions\/validate$/);
  if (method === 'POST' && mentionsMatch) {
    return { handler: 'validateMentions', params: { id: mentionsMatch[1] } };
  }

  return null;
}

// ─── Server start ────────────────────────────────────────────────────────────

async function start() {
  const service = createGroupService({ prisma });

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
          sendJson(res, 200, { status: 'ok', service: 'group', timestamp: Date.now() });
          return;
        }

        case 'createGroup': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          const group = await service.createGroup({
            name: body.name as string,
            ownerId: userId,
            avatar: body.avatar as string | undefined,
            memberIds: body.memberIds as string[] | undefined,
          });
          sendJson(res, 201, { code: ErrorCode.SUCCESS, data: group as unknown as Record<string, unknown> });
          return;
        }

        case 'listGroups': {
          const userId = getUserId(req);
          const groups = await service.listUserGroups(userId);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: groups as unknown as Record<string, unknown> });
          return;
        }

        case 'getGroup': {
          const group = await service.getGroup(route.params!.id);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: group as unknown as Record<string, unknown> });
          return;
        }

        case 'dissolveGroup': {
          const userId = getUserId(req);
          await service.dissolveGroup(route.params!.id, userId);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: {} });
          return;
        }

        case 'updateGroup': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          const group = await service.updateGroup(route.params!.id, userId, {
            name: body.name as string | undefined,
            avatar: body.avatar as string | undefined,
            announcement: body.announcement as string | undefined,
          });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: group as unknown as Record<string, unknown> });
          return;
        }

        case 'getMembers': {
          const members = await service.getMembers(route.params!.id);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: members as unknown as Record<string, unknown> });
          return;
        }

        case 'addMembers': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          await service.addMembers({
            groupId: route.params!.id,
            userIds: body.userIds as string[],
            operatorId: userId,
          });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: {} });
          return;
        }

        case 'removeMember': {
          const userId = getUserId(req);
          await service.removeMember({
            groupId: route.params!.id,
            userId: route.params!.uid,
            operatorId: userId,
          });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: {} });
          return;
        }

        case 'updateMemberRole': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          const member = await service.updateMemberRole({
            groupId: route.params!.id,
            userId: route.params!.uid,
            role: body.role as GroupRole,
            operatorId: userId,
          });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: member as unknown as Record<string, unknown> });
          return;
        }

        case 'updateMemberNickname': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          const member = await service.updateMemberNickname({
            groupId: route.params!.id,
            userId,
            nicknameInGroup: body.nicknameInGroup as string,
          });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: member as unknown as Record<string, unknown> });
          return;
        }

        case 'joinGroup': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          const request = await service.joinGroup(
            route.params!.id,
            userId,
            body.message as string | undefined,
          );
          sendJson(res, 201, { code: ErrorCode.SUCCESS, data: request as unknown as Record<string, unknown> });
          return;
        }

        case 'approveJoin': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          const action = (body.action as string) || 'approve';
          await service.approveJoin(route.params!.id, route.params!.uid, userId, action as 'approve' | 'reject');
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: {} });
          return;
        }

        case 'quitGroup': {
          const userId = getUserId(req);
          await service.quitGroup(route.params!.id, userId);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: {} });
          return;
        }

        case 'setAnnouncement': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          const group = await service.setAnnouncement(
            route.params!.id,
            userId,
            body.announcement as string,
          );
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: group as unknown as Record<string, unknown> });
          return;
        }

        case 'muteMember': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          await service.muteMember({
            groupId: route.params!.id,
            userId: route.params!.uid,
            operatorId: userId,
            durationMinutes: (body.durationMinutes as number) || 60,
          });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: {} });
          return;
        }

        case 'validateMentions': {
          const body = await parseBody(req);
          const result = await service.validateMentions({
            groupId: route.params!.id,
            senderId: body.senderId as string,
            mentions: body.mentions as string[],
          });
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
          return;
        }
      }
    } catch (err) {
      sendError(res, err);
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[group] listening on ${HOST}:${PORT}`);
  });

  // Graceful shutdown
  function shutdown() {
    console.log('[group] shutting down...');
    server.close(() => {
      prisma.$disconnect().then(() => process.exit(0));
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('[group] failed to start:', err);
  process.exit(1);
});
