import { describe, it, expect, vi } from 'vitest';

const { mockConfig, capturedHandler, capturedPort } = vi.hoisted(() => ({
  mockConfig: {
    services: { auth: { port: 3099, host: '0.0.0.0' } },
    jwt: { secret: 'test-secret', access_expire: '15m', refresh_expire: '7d' },
    database: { redis: { host: 'localhost', port: 6379 } },
  },
  capturedHandler: { value: null as ((req: any, res: any) => void) | null },
  capturedPort: { value: null as number | null },
}));

vi.mock('@wechat-clone/shared/config', () => ({
  loadConfig: vi.fn(() => mockConfig),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({ $disconnect: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn(() => ({ disconnect: vi.fn() })),
}));

const mockListen = vi.fn((port: number, _host: string, cb: () => void) => {
  capturedPort.value = port;
  setTimeout(cb, 0);
  return { on: vi.fn(), close: vi.fn() };
});
const mockCreateServer = vi.fn((handler: (req: any, res: any) => void) => {
  capturedHandler.value = handler;
  return { listen: mockListen, close: vi.fn(), on: vi.fn() };
});

vi.mock('node:http', () => ({
  createServer: mockCreateServer,
}));

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

await import('./server');

// Wait for async listen callback
await vi.waitFor(() => capturedPort.value !== null, { timeout: 100 });

function makeReq(method = 'GET', url = '/') {
  return { method, url, headers: {}, socket: { remoteAddress: '127.0.0.1' } };
}

function makeRes() {
  const res: Record<string, unknown> = {
    _statusCode: 0,
    _headers: {} as Record<string, string>,
    _body: '',
    writeHead: vi.fn(function (this: any, code: number, headers?: Record<string, string>) {
      this._statusCode = code;
      if (headers) Object.assign(this._headers, headers);
    }),
    setHeader: vi.fn(function (this: any, name: string, value: string) {
      this._headers[name] = value;
    }),
    end: vi.fn(function (this: any, data?: string) {
      if (data) this._body = data;
    }),
  };
  return res as any;
}

describe('server-auth HTTP server', () => {
  it('starts on the configured port', () => {
    expect(capturedPort.value).toBe(3099);
  });

  it('sets CORS headers on every response', () => {
    const res = makeRes();
    capturedHandler.value!(makeReq(), res);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res._headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, DELETE, OPTIONS');
  });

  it('responds 204 to OPTIONS requests', () => {
    const res = makeRes();
    capturedHandler.value!(makeReq('OPTIONS', '/'), res);
    expect(res._statusCode).toBe(204);
  });

  it('returns health check at /health', () => {
    const res = makeRes();
    capturedHandler.value!(makeReq('GET', '/health'), res);
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('auth');
    expect(body.timestamp).toBeDefined();
  });

  it('returns 404 for unknown routes', () => {
    const res = makeRes();
    capturedHandler.value!(makeReq('GET', '/unknown/route'), res);
    expect(res._statusCode).toBe(404);
    const body = JSON.parse(res._body);
    expect(body.code).toBeGreaterThan(0);
  });
});
