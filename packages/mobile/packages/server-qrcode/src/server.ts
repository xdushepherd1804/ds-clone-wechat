/**
 * Docker entry point for the QR code service.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import QRCode from 'qrcode';
import { loadConfig } from '@wechat-clone/shared/config';
import { ErrorCode } from '@wechat-clone/shared';
import type { QrCodePayload } from '@wechat-clone/shared';
import { createQrCodeService, QrCodeError } from './qrcode.service';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.services.qrcode?.port ?? 3010;
const HOST = '0.0.0.0';

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

function sendPng(res: ServerResponse, dataUrl: string): void {
  const base64 = dataUrl.split(',')[1] || dataUrl;
  const buf = Buffer.from(base64, 'base64');
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': buf.length,
    'Cache-Control': 'public, max-age=3600',
  });
  res.end(buf);
}

function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof QrCodeError) {
    sendJson(res, qrErrorToHttpStatus(err.code), { code: err.code, message: err.message });
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

function qrErrorToHttpStatus(code: number): number {
  switch (code) {
    case ErrorCode.INVALID_PARAM:
    case ErrorCode.QRCODE_INVALID:
    case ErrorCode.INVITE_CODE_INVALID:
      return 400;
    case ErrorCode.UNAUTHORIZED:
      return 401;
    case ErrorCode.QRCODE_EXPIRED:
    case ErrorCode.INVITE_CODE_EXPIRED:
      return 410;
    case ErrorCode.NOT_FOUND:
      return 404;
    default:
      return 500;
  }
}

function getUserId(req: IncomingMessage): string | undefined {
  const uid = req.headers['x-user-id'];
  if (typeof uid === 'string' && uid.length > 0) return uid;
  return undefined;
}

// ─── Route matching ──────────────────────────────────────────────────────────

interface MatchedRoute {
  handler: string;
  params?: Record<string, string>;
}

function matchRoute(method: string, url: string): MatchedRoute | null {
  // Strip query string
  const queryIdx = url.indexOf('?');
  const path = queryIdx !== -1 ? url.slice(0, queryIdx) : url;

  if (method === 'GET' && (path === '/health' || path === '/api/qrcode/health')) {
    return { handler: 'health' };
  }

  // GET /api/qrcode/user-card?uid=xxx  (also matches proxied /user-card)
  if (method === 'GET' && (path === '/api/qrcode/user-card' || path === '/user-card')) {
    return { handler: 'generateUserCardQr' };
  }

  // GET /api/qrcode/group-invite?group_id=xxx  (also matches proxied /group-invite)
  if (method === 'GET' && (path === '/api/qrcode/group-invite' || path === '/group-invite')) {
    return { handler: 'generateGroupInviteQr' };
  }

  // POST /api/qrcode/scan-result  (also matches proxied /scan-result)
  if (method === 'POST' && (path === '/api/qrcode/scan-result' || path === '/scan-result')) {
    return { handler: 'processScanResult' };
  }

  return null;
}

// ─── Server start ────────────────────────────────────────────────────────────

async function start() {
  const service = createQrCodeService();

  const server = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
          sendJson(res, 200, { status: 'ok', service: 'qrcode', timestamp: Date.now() });
          return;
        }

        case 'generateUserCardQr': {
          const url = new URL(req.url || '/', 'http://localhost');
          const uid = url.searchParams.get('uid');
          if (!uid) {
            sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: '缺少 uid 参数' });
            return;
          }

          const payload = await service.buildUserCardPayload(uid);
          const json = JSON.stringify(payload);

          const format = url.searchParams.get('format') || 'png';
          const size = parseInt(url.searchParams.get('size') || '300', 10);

          try {
            if (format === 'json') {
              const dataUrl = await QRCode.toDataURL(json, {
                width: size,
                margin: 2,
                errorCorrectionLevel: 'M',
              });
              sendJson(res, 200, {
                code: ErrorCode.SUCCESS,
                data: { dataUrl, payload },
              });
            } else {
              const dataUrl = await QRCode.toDataURL(json, {
                width: size,
                margin: 2,
                errorCorrectionLevel: 'M',
                type: 'image/png',
              });
              sendPng(res, dataUrl);
            }
          } catch {
            sendJson(res, 500, {
              code: ErrorCode.QRCODE_GENERATE_FAILED,
              message: '二维码生成失败',
            });
          }
          return;
        }

        case 'generateGroupInviteQr': {
          const url = new URL(req.url || '/', 'http://localhost');
          const groupId = url.searchParams.get('group_id');
          if (!groupId) {
            sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: '缺少 group_id 参数' });
            return;
          }

          const payload = await service.buildGroupInvitePayload(groupId);
          const json = JSON.stringify(payload);

          const format = url.searchParams.get('format') || 'png';
          const size = parseInt(url.searchParams.get('size') || '300', 10);

          try {
            if (format === 'json') {
              const dataUrl = await QRCode.toDataURL(json, {
                width: size,
                margin: 2,
                errorCorrectionLevel: 'M',
              });
              sendJson(res, 200, {
                code: ErrorCode.SUCCESS,
                data: { dataUrl, payload },
              });
            } else {
              const dataUrl = await QRCode.toDataURL(json, {
                width: size,
                margin: 2,
                errorCorrectionLevel: 'M',
                type: 'image/png',
              });
              sendPng(res, dataUrl);
            }
          } catch {
            sendJson(res, 500, {
              code: ErrorCode.QRCODE_GENERATE_FAILED,
              message: '二维码生成失败',
            });
          }
          return;
        }

        case 'processScanResult': {
          const userId = getUserId(req);
          const body = await parseBody(req);
          const payload = body.payload as QrCodePayload;

          if (!payload || !payload.type) {
            sendJson(res, 400, { code: ErrorCode.INVALID_PARAM, message: '缺少二维码内容' });
            return;
          }

          try {
            const result = await service.processScan({
              payload,
              currentUserId: userId,
            });
            sendJson(res, 200, { code: ErrorCode.SUCCESS, data: result as unknown as Record<string, unknown> });
          } catch (err) {
            sendError(res, err);
          }
          return;
        }
      }
    } catch (err) {
      sendError(res, err);
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(`[qrcode] listening on ${HOST}:${PORT}`);
  });

  function shutdown() {
    console.log('[qrcode] shutting down...');
    server.close(() => process.exit(0));
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('[qrcode] failed to start:', err);
  process.exit(1);
});
