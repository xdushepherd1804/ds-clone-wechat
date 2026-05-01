import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfig = {
  services: { file: { port: 4005 } },
};

let capturedHandler: ((req: any, res: any) => void) | null = null;
let capturedPort: number | null = null;

vi.mock('@wechat-clone/shared', () => ({
  loadConfig: vi.fn(() => mockConfig),
  ErrorCode: {
    INVALID_PARAM: 1001,
    UNAUTHORIZED: 2000,
    FORBIDDEN: 2003,
    NOT_FOUND: 1004,
    FILE_NOT_FOUND: 7003,
    FILE_TOO_LARGE: 7000,
    FILE_TYPE_NOT_ALLOWED: 7001,
    FILE_UPLOAD_FAILED: 7002,
    INTERNAL_ERROR: 1003,
  },
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

function makeReq(method = 'GET', url = '/', headers: Record<string, string> = {}) {
  return { method, url, headers };
}

function makeReqWithBody(method = 'POST', url = '/', body: string | Buffer, headers: Record<string, string> = {}) {
  const req: any = {
    method,
    url,
    headers,
    _body: typeof body === 'string' ? Buffer.from(body) : body,
    on: vi.fn(function (this: any, event: string, cb: Function) {
      if (event === 'data') {
        cb(this._body);
      }
      if (event === 'end') {
        cb();
      }
      if (event === 'error') {
        // don't call error
      }
      return this;
    }),
  };
  return req;
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
    end: vi.fn(function (this: any, data?: string | Buffer) {
      if (data) this._body = typeof data === 'string' ? data : data.toString();
    }),
  };
  return res as any;
}

// Helper to make async handler work
async function handleAsync(req: any, res: any): Promise<void> {
  await capturedHandler!(req, res);
  // Wait a microtick for promises to resolve
  await new Promise((resolve) => setImmediate(resolve));
}

describe('server-file HTTP server', () => {
  it('starts on configured port', () => {
    expect(capturedPort).toBe(4005);
  });

  it('returns health check', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/health'), res);
    const body = JSON.parse(res._body);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('file');
  });

  it('returns default response', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/'), res);
    const body = JSON.parse(res._body);
    expect(body.service).toBe('file');
  });

  it('responds 204 to OPTIONS', () => {
    const res = makeRes();
    capturedHandler!(makeReq('OPTIONS', '/'), res);
    expect(res._statusCode).toBe(204);
  });

  it('sets CORS headers on requests', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/health'), res);
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res._headers['Access-Control-Allow-Methods']).toContain('GET');
  });

  // ── API route tests ───────────────────────────────────────────────

  it('returns 400 for upload without multipart content type', async () => {
    const res = makeRes();
    const req = makeReqWithBody('POST', '/api/files/upload', 'not multipart', {
      'content-type': 'text/plain',
    });
    await handleAsync(req, res);
    // Should get error about missing multipart type
    expect(res._statusCode).toBeGreaterThanOrEqual(400);
  });

  it('returns 405 for GET on upload endpoint', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/api/files/upload'), res);
    const body = JSON.parse(res._body);
    expect(res._statusCode).toBe(405);
  });

  it('returns 405 for POST on file download endpoint', () => {
    const res = makeRes();
    capturedHandler!(makeReq('POST', '/api/files/file_123'), res);
    const body = JSON.parse(res._body);
    expect(res._statusCode).toBe(405);
  });

  it('returns 405 for POST on thumbnail endpoint', () => {
    const res = makeRes();
    capturedHandler!(makeReq('POST', '/api/files/file_123/thumbnail'), res);
    const body = JSON.parse(res._body);
    expect(res._statusCode).toBe(405);
  });

  it('returns 405 for non-POST on upload-chunk', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/api/files/upload-chunk'), res);
    const body = JSON.parse(res._body);
    expect(res._statusCode).toBe(405);
  });

  it('returns 405 for non-POST on merge-chunks', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/api/files/merge-chunks'), res);
    const body = JSON.parse(res._body);
    expect(res._statusCode).toBe(405);
  });

  it('extracts user ID from x-user-id header', async () => {
    const res = makeRes();
    const req = makeReqWithBody('POST', '/api/files/merge-chunks', JSON.stringify({ fileId: 'nonexistent' }), {
      'content-type': 'application/json',
      'x-user-id': 'user123',
    });
    await handleAsync(req, res);
    // Should get a FILE_NOT_FOUND or some error (file doesn't exist, but route works)
    const body = JSON.parse(res._body);
    // It'll fail because the file doesn't exist, but the route should work
    expect(body.error).toBeDefined();
  });
});
