import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockConfig = {
  gateway: { port: 3000 },
  services: {
    auth: { port: 4001 },
    message: { port: 4002 },
    contact: { port: 4003 },
    group: { port: 4004 },
    file: { port: 4005 },
    moments: { port: 4006 },
  },
};

const mockRegistry = {
  services: {
    auth: { host: 'localhost', port: 4001 },
    message: { host: 'localhost', port: 4002 },
  },
};

let capturedHandler: ((req: any, res: any) => void) | null = null;
let capturedUpgradeHandler: ((req: any, socket: any, head: any) => void) | null = null;
let capturedPort: number | null = null;

vi.mock('@wechat-clone/shared', () => ({
  loadConfig: vi.fn(() => mockConfig),
  loadServiceRegistry: vi.fn(() => mockRegistry),
}));

const mockServer = {
  listen: vi.fn((port: number, _host: string, cb: () => void) => {
    capturedPort = port;
    cb();
    return mockServer;
  }),
  on: vi.fn((event: string, handler: any) => {
    if (event === 'upgrade') capturedUpgradeHandler = handler;
    return mockServer;
  }),
  close: vi.fn(),
};

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return {
    ...actual,
    createServer: vi.fn((handler: (req: any, res: any) => void) => {
      capturedHandler = handler;
      return mockServer;
    }),
    request: vi.fn(() => ({
      on: vi.fn(),
      end: vi.fn(),
    })),
  };
});

vi.spyOn(console, 'log').mockImplementation(() => {});

import './server';

function makeReq(method = 'GET', url = '/', headers: Record<string, string> = {}) {
  return { method, url, headers };
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

describe('server-gateway HTTP server', () => {
  beforeEach(() => {
    capturedHandler = null;
    capturedUpgradeHandler = null;
    capturedPort = null;
  });

  it('starts on configured gateway port', () => {
    expect(capturedPort).toBe(3000);
  });

  it('sets CORS headers', () => {
    const res = makeRes();
    capturedHandler!(makeReq(), res);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('responds 204 to OPTIONS', () => {
    const res = makeRes();
    capturedHandler!(makeReq('OPTIONS', '/'), res);
    expect(res._statusCode).toBe(204);
  });

  it('returns health check at /health with service list', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/health'), res);
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('gateway');
    expect(body.services).toContain('auth');
  });

  it('returns WS info at /ws/info', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/ws/info'), res);
    const body = JSON.parse(res._body);
    expect(body.wsEndpoint).toBe('/ws');
    expect(body.protocol).toBe('wechat-clone-v1');
  });

  it('returns default response for unmatched routes', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/unknown'), res);
    expect(res._statusCode).toBe(200);
    const body = JSON.parse(res._body);
    expect(body.service).toBe('gateway');
  });

  it('registers WebSocket upgrade handler', () => {
    expect(capturedUpgradeHandler).not.toBeNull();
  });
});
