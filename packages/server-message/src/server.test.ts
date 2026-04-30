import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfig = {
  services: { message: { port: 4002 } },
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

vi.spyOn(console, 'log').mockImplementation(() => {});

// Dynamic import is not needed since vi.mock hoists; we just need to trigger the side-effect import
await import('./server');

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

describe('server-message HTTP server', () => {
  it('starts on configured port', () => {
    expect(capturedPort).toBe(4002);
  });

  it('returns health check', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/health'), res);
    const body = JSON.parse(res._body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('message');
  });

  it('returns default response', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/unknown'), res);
    const body = JSON.parse(res._body);
    expect(body.service).toBe('message');
  });

  it('responds 204 to OPTIONS', () => {
    const res = makeRes();
    capturedHandler!(makeReq('OPTIONS', '/any'), res);
    expect(res._statusCode).toBe(204);
  });

  it('sets CORS headers', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/'), res);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
