/**
 * Docker entry point for the push notification service.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from '@wechat-clone/shared/config';
import { ErrorCode } from '@wechat-clone/shared';
import { createPushService, PushError } from './push.service';
import { createDeviceService, DeviceError } from './device.service';
import { MockProvider, FCMProvider, APNsProvider } from './providers';
import type { PushProvider, DeviceInfo, PushPayload as ProviderPushPayload } from './providers';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.services.push?.port ?? 3007;
const HOST = config.services.push?.host ?? '0.0.0.0';

// Redis setup
const redisUrl = process.env.REDIS_URL || `redis://${config.database.redis.host}:${config.database.redis.port}`;
const redis = process.env.REDIS_URL === '' ? null : new Redis(redisUrl);

// Prisma setup
const prisma = new PrismaClient();

// ─── Provider initialisation ─────────────────────────────────────────────────

function createProviders(): PushProvider[] {
  const providers: PushProvider[] = [];

  // Mock provider is always available as fallback (dev default)
  const mockProvider = new MockProvider();
  providers.push(mockProvider);

  // FCM — enabled via FCM_SERVICE_ACCOUNT env var
  const fcmAccount = process.env.FCM_SERVICE_ACCOUNT;
  if (fcmAccount) {
    try {
      providers.push(new FCMProvider({ serviceAccountJson: fcmAccount }));
      console.log('[push] FCM provider initialised');
    } catch (err) {
      console.warn('[push] FCM provider init failed:', err);
    }
  }

  // APNs — enabled via APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID
  const apnsKey = process.env.APNS_KEY;
  const apnsKeyId = process.env.APNS_KEY_ID;
  const apnsTeamId = process.env.APNS_TEAM_ID;
  const apnsBundleId = process.env.APNS_BUNDLE_ID;
  if (apnsKey && apnsKeyId && apnsTeamId && apnsBundleId) {
    try {
      providers.push(new APNsProvider({
        key: apnsKey,
        keyId: apnsKeyId,
        teamId: apnsTeamId,
        bundleId: apnsBundleId,
        sandbox: process.env.APNS_SANDBOX === '1',
      }));
      console.log('[push] APNs provider initialised');
    } catch (err) {
      console.warn('[push] APNs provider init failed:', err);
    }
  }

  return providers;
}

const providers = createProviders();

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
  if (err instanceof PushError || err instanceof DeviceError) {
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
    case ErrorCode.INVALID_PARAM:
      return 400;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.FORBIDDEN:
      return 403;
    case ErrorCode.NOT_FOUND:
      return 404;
    case ErrorCode.RATE_LIMITED:
      return 429;
    default:
      return 500;
  }
}

function getUserId(req: IncomingMessage): string {
  const uid = req.headers['x-user-id'];
  if (typeof uid === 'string' && uid.length > 0) return uid;
  throw new PushError(ErrorCode.UNAUTHORIZED, '未登录或登录已过期');
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

// ─── Push delivery via providers ─────────────────────────────────────────────

async function sendPushToProviders(
  userId: string,
  providerPayload: ProviderPushPayload,
): Promise<boolean> {
  const deviceService = createDeviceService({ prisma });
  const devices = await deviceService.getDevices(userId);
  if (devices.length === 0) return false;

  let delivered = false;
  for (const provider of providers) {
    try {
      const providerDevices: DeviceInfo[] = [];
      for (const d of devices) {
        // Route to the right provider based on platform
        if (
          (provider.type === 'apns' && d.platform === 'ios') ||
          (provider.type === 'fcm' && (d.platform === 'android' || d.platform === 'web')) ||
          provider.type === 'mock'
        ) {
          providerDevices.push({
            userId: d.userId,
            platform: d.platform,
            deviceToken: d.deviceToken,
          });
        }
      }

      if (providerDevices.length > 0) {
        await provider.sendToMany(providerDevices, providerPayload);
        delivered = true;
      }
    } catch {
      // Provider delivery failed, try next
    }
  }

  return delivered;
}

// ─── Route matching ──────────────────────────────────────────────────────────

interface MatchedRoute {
  handler: string;
  params?: Record<string, string>;
}

function matchRoute(method: string, url: string): MatchedRoute | null {
  const path = new URL(url, 'http://localhost').pathname;

  if (method === 'GET' && (path === '/health' || path === '/api/push/health')) {
    return { handler: 'health' };
  }

  if (method === 'POST' && (path === '/api/push/send' || path === '/push/send')) {
    return { handler: 'sendPush' };
  }

  if (method === 'POST' && (path === '/api/push/process' || path === '/push/process')) {
    return { handler: 'processQueue' };
  }

  if (method === 'GET' && (path === '/api/push/pending' || path === '/push/pending')) {
    return { handler: 'getPendingPushes' };
  }

  if (method === 'PUT' && (path === '/api/push/read' || path === '/push/read')) {
    return { handler: 'markAllRead' };
  }

  if (method === 'GET' && (path === '/api/push/stats' || path === '/push/stats')) {
    return { handler: 'getStats' };
  }

  if (method === 'GET' && (path === '/api/push/count' || path === '/push/count')) {
    return { handler: 'getPendingCount' };
  }

  // Device registration
  if (method === 'POST' && (path === '/api/push/register-device' || path === '/push/register-device')) {
    return { handler: 'registerDevice' };
  }

  // Device unregistration
  if (method === 'DELETE' && (path === '/api/push/unregister-device' || path === '/push/unregister-device')) {
    return { handler: 'unregisterDevice' };
  }

  // List devices
  if (method === 'GET' && (path === '/api/push/devices' || path === '/push/devices')) {
    return { handler: 'getDevices' };
  }

  return null;
}

// ─── Queue worker ────────────────────────────────────────────────────────────

function startQueueWorker(service: ReturnType<typeof createPushService>, intervalMs = 1000): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await service.processQueue(20);
    } catch {
      // Queue processing errors are non-fatal
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  tick(); // Initial run

  return () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// ─── Server start ────────────────────────────────────────────────────────────

async function start() {
  await prisma.$connect();

  const service = createPushService({ redis });
  const deviceService = createDeviceService({ prisma });
  const stopWorker = startQueueWorker(service);

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
          sendJson(res, 200, {
            status: 'ok',
            service: 'push',
            providers: providers.map((p) => p.type),
            timestamp: Date.now(),
          });
          return;
        }

        case 'sendPush': {
          const body = await parseBody(req);
          const targetUids = Array.isArray(body.targetUids) ? body.targetUids as string[] : [];
          const task = await service.sendPush(targetUids, {
            scenario: (body.scenario as string) || 'system_notice',
            title: (body.title as string) || '',
            body: (body.body as string) || '',
            senderId: body.senderId as string | undefined,
            senderName: body.senderName as string | undefined,
            data: body.data as Record<string, unknown> | undefined,
          }, body.priority as string | undefined);

          // Actually deliver via providers
          const providerPayload: ProviderPushPayload = {
            title: task.title,
            body: task.body,
            data: task.data,
          };
          for (const uid of task.targetUids) {
            await sendPushToProviders(uid, providerPayload);
          }

          sendJson(res, 201, { code: ErrorCode.SUCCESS, data: task as unknown as Record<string, unknown> });
          return;
        }

        case 'processQueue': {
          const body = await parseBody(req);
          const batchSize = typeof body.batchSize === 'number' ? body.batchSize : 50;
          const count = await service.processQueue(batchSize);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: { processed: count } });
          return;
        }

        case 'getPendingPushes': {
          const userId = getUserId(req);
          const qs = getQueryParams(req.url || '');
          const limit = qs.limit ? Math.min(parseInt(qs.limit, 10), 100) : 50;
          const pushes = await service.getPendingPushes(userId, limit);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: pushes as unknown as Record<string, unknown> });
          return;
        }

        case 'markAllRead': {
          const userId = getUserId(req);
          const count = await service.markAllRead(userId);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: { cleared: count } });
          return;
        }

        case 'getStats': {
          const stats = await service.getStats();
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: stats as unknown as Record<string, unknown> });
          return;
        }

        case 'getPendingCount': {
          const userId = getUserId(req);
          const count = await service.getPendingCount(userId);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: { count } });
          return;
        }

        case 'registerDevice': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          const device = await deviceService.registerDevice({
            userId,
            platform: (body.platform as string) || '',
            deviceToken: (body.device_token as string) || (body.deviceToken as string) || '',
          });
          sendJson(res, 201, { code: ErrorCode.SUCCESS, data: device as unknown as Record<string, unknown> });
          return;
        }

        case 'unregisterDevice': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          const deviceToken = (body.device_token as string) || (body.deviceToken as string) || '';
          await deviceService.unregisterDevice(userId, deviceToken);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: {} });
          return;
        }

        case 'getDevices': {
          const userId = getUserId(req);
          const devices = await deviceService.getDevices(userId);
          sendJson(res, 200, { code: ErrorCode.SUCCESS, data: devices as unknown as Record<string, unknown> });
          return;
        }
      }
    } catch (err) {
      sendError(res, err);
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[push] listening on ${HOST}:${PORT}`);
    console.log(`[push] providers: ${providers.map((p) => p.type).join(', ')}`);
  });

  // Graceful shutdown
  function shutdown() {
    console.log('[push] shutting down...');
    stopWorker();
    server.close(() => {
      Promise.all([
        prisma.$disconnect(),
        redis?.quit(),
      ]).then(() => process.exit(0));
    });
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('[push] failed to start:', err);
  process.exit(1);
});
