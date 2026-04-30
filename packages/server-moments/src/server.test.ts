import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfig = {
  services: { moments: { port: 4006 } },
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

describe('server-moments HTTP server', () => {
  it('starts on configured port', () => {
    expect(capturedPort).toBe(4006);
  });

  it('returns health check', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/health'), res);
    const body = JSON.parse(res._body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('moments');
  });

  it('returns default response', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/'), res);
    const body = JSON.parse(res._body);
    expect(body.service).toBe('moments');
  });

  it('responds 204 to OPTIONS', () => {
    const res = makeRes();
    capturedHandler!(makeReq('OPTIONS', '/'), res);
    expect(res._statusCode).toBe(204);
  });
});
