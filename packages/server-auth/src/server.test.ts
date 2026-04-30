import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockConfig = {
  services: { auth: { port: 3099 } },
};

let capturedHandler: ((req: any, res: any) => void) | null = null;
let capturedPort: number | null = null;

vi.mock('@wechat-clone/shared', () => ({
  loadConfig: vi.fn(() => mockConfig),
}));

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return {
    ...actual,
    createServer: vi.fn((handler: (req: any, res: any) => void) => {
      capturedHandler = handler;
      return {
        listen: vi.fn((port: number, _host: string, cb: () => void) => {
          capturedPort = port;
          cb();
          return { on: vi.fn(), close: vi.fn() };
        }),
      };
    }),
  };
});

// Suppress console output during tests
vi.spyOn(console, 'log').mockImplementation(() => {});

import './server';

function makeReq(method = 'GET', url = '/') {
  return { method, url, headers: {} };
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
  beforeEach(() => {
    capturedHandler = null;
    capturedPort = null;
  });

  it('starts on the configured port', () => {
    expect(capturedPort).toBe(3099);
  });

  it('sets CORS headers on every response', () => {
    const res = makeRes();
    capturedHandler!(makeReq(), res);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res._headers['Access-Control-Allow-Methods']).toBe('GET, POST, PUT, DELETE, OPTIONS');
  });

  it('responds 204 to OPTIONS requests', () => {
    const res = makeRes();
    capturedHandler!(makeReq('OPTIONS', '/'), res);
    expect(res._statusCode).toBe(204);
  });

  it('returns health check at /health', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/health'), res);
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('auth');
    expect(body.timestamp).toBeDefined();
  });

  it('returns default response for unknown routes', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/unknown'), res);
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.service).toBe('auth');
  });
});
