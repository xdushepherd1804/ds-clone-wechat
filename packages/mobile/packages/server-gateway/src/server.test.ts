import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const s: {
    capturedHandler: ((req: any, res: any) => void) | null;
    capturedUpgradeHandler: ((req: any, socket: any, head: any) => void) | null;
    mockListen: ReturnType<typeof vi.fn>;
    mockOn: ReturnType<typeof vi.fn>;
    mockClose: ReturnType<typeof vi.fn>;
  } = {
    capturedHandler: null,
    capturedUpgradeHandler: null,
    mockListen: vi.fn((_port: number, _host: string, cb: () => void) => { cb(); }),
    mockOn: vi.fn((event: string, handler: any) => {
      if (event === 'upgrade') s.capturedUpgradeHandler = handler;
    }),
    mockClose: vi.fn(),
  };

  return {
    state: s,
    mockConfig: {
      gateway: { port: 3000 },
      jwt: { secret: 'test-secret-key', access_expire: '1h', refresh_expire: '7d' },
      services: {
        auth: { port: 4001 },
        message: { port: 4002 },
        contact: { port: 4003 },
        group: { port: 4004 },
        file: { port: 4005 },
        moments: { port: 4006 },
        search: { port: 4008 },
      },
    },
    mockRegistry: {
      services: {
        auth: { host: 'localhost', port: 4001 },
        message: { host: 'localhost', port: 4002 },
      },
    },
    mockRateLimiter: {
      consume: vi.fn(() => true),
      reset: vi.fn(),
    },
    mockVerifyJwt: vi.fn(),
    mockRequestFn: vi.fn(() => ({
      on: vi.fn(),
      end: vi.fn(),
      pipe: vi.fn(),
    })),
  };
});

vi.mock('./rate-limiter', () => ({
  createRateLimiter: vi.fn(() => hoisted.mockRateLimiter),
}));

vi.mock('./jwt-verify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./jwt-verify')>();
  return {
    ...actual,
    verifyJwt: hoisted.mockVerifyJwt,
  };
});

vi.mock('@wechat-clone/shared/config', () => ({
  loadConfig: vi.fn(() => hoisted.mockConfig),
  loadServiceRegistry: vi.fn(() => hoisted.mockRegistry),
}));

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return {
    ...actual,
    createServer: vi.fn((handler: (req: any, res: any) => void) => {
      hoisted.state.capturedHandler = handler;
      return {
        listen: hoisted.state.mockListen,
        on: hoisted.state.mockOn,
        close: hoisted.state.mockClose,
      };
    }),
    request: hoisted.mockRequestFn,
  };
});

vi.spyOn(console, 'log').mockImplementation(() => {});

import './server';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeReq(method = 'GET', url = '/', headers: Record<string, string> = {}) {
  return {
    method,
    url,
    headers,
    pipe: vi.fn(),
    on: vi.fn(),
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function makeRes() {
  const res: Record<string, unknown> = {
    _statusCode: 0,
    _headers: {} as Record<string, string>,
    _body: '',
    _headersSent: false,
    writeHead: vi.fn(function (this: any, code: number, headers?: Record<string, string>) {
      this._statusCode = code;
      if (headers) Object.assign(this._headers, headers);
    }),
    setHeader: vi.fn(function (this: any, name: string, value: string) {
      this._headers[name] = value;
    }),
    end: vi.fn(function (this: any, data?: string) {
      this._headersSent = true;
      if (data) this._body = data;
    }),
    get headersSent() {
      return this._headersSent;
    },
  };
  return res as any;
}

function makeTokenPayload(overrides: {
  sub?: string;
  username?: string;
  type?: 'access' | 'refresh';
  exp?: number;
} = {}) {
  return {
    sub: overrides.sub ?? 'user-123',
    username: overrides.username ?? 'testuser',
    type: overrides.type ?? ('access' as const),
    iat: Math.floor(Date.now() / 1000),
    exp: overrides.exp ?? (Math.floor(Date.now() / 1000) + 3600),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('server-gateway HTTP server', () => {
  beforeEach(() => {
    hoisted.state.mockClose.mockClear();
    hoisted.mockRateLimiter.consume.mockReset();
    hoisted.mockRateLimiter.consume.mockReturnValue(true);
    hoisted.mockVerifyJwt.mockReset();
    hoisted.mockRequestFn.mockClear();
    (console.log as ReturnType<typeof vi.fn>).mockClear();
  });

  describe('startup', () => {
    it('starts on configured gateway port', () => {
      expect(hoisted.state.mockListen).toHaveBeenCalledWith(
        3000,
        expect.any(String),
        expect.any(Function),
      );
    });

    it('registers WebSocket upgrade handler', () => {
      expect(hoisted.state.mockOn).toHaveBeenCalledWith('upgrade', expect.any(Function));
    });
  });

  describe('CORS', () => {
    it('sets CORS headers on responses', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq(), res);
      expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
      expect(res._headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(res._headers['Access-Control-Allow-Headers']).toContain('Authorization');
    });

    it('responds 204 to OPTIONS preflight', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('OPTIONS', '/'), res);
      expect(res._statusCode).toBe(204);
    });
  });

  describe('health check', () => {
    it('returns 200 at /health with service list', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/health'), res);
      expect(res._statusCode).toBe(200);
      const body = JSON.parse(res._body);
      expect(body.status).toBe('ok');
      expect(body.service).toBe('gateway');
      expect(body.services).toContain('auth');
    });

    it('returns 200 at /ws/info with endpoint info', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/ws/info'), res);
      const body = JSON.parse(res._body);
      expect(body.wsEndpoint).toBe('/ws');
      expect(body.protocol).toBe('wechat-clone-v1');
    });
  });

  describe('routing', () => {
    it('routes /api/auth/* requests to auth service', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('POST', '/api/auth/login', {
        'content-type': 'application/json',
      }), res);
      expect(hoisted.mockRequestFn).toHaveBeenCalledTimes(1);
      const callArgs = (hoisted.mockRequestFn as any).mock.calls[0][0];
      expect(callArgs.hostname).toBe('auth');
      expect(callArgs.port).toBe(4001);
      expect(callArgs.path).toBe('/login');
      expect(callArgs.method).toBe('POST');
    });

    it('routes /api/users/* requests to auth service', () => {
      hoisted.mockVerifyJwt.mockReturnValue(makeTokenPayload());
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/users/me', {
        authorization: 'Bearer valid-token',
      }), res);
      expect(hoisted.mockRequestFn).toHaveBeenCalledTimes(1);
      const callArgs = (hoisted.mockRequestFn as any).mock.calls[0][0];
      expect(callArgs.hostname).toBe('auth');
      expect(callArgs.port).toBe(4001);
      expect(callArgs.path).toBe('/me');
    });

    it('routes /api/messages/* requests to message service', () => {
      hoisted.mockVerifyJwt.mockReturnValue(makeTokenPayload());
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/messages/list', {
        authorization: 'Bearer valid-token',
      }), res);
      expect(hoisted.mockRequestFn).toHaveBeenCalledTimes(1);
      const callArgs = (hoisted.mockRequestFn as any).mock.calls[0][0];
      expect(callArgs.hostname).toBe('message');
      expect(callArgs.port).toBe(4002);
      expect(callArgs.path).toBe('/list');
    });

    it('routes /api/contacts/* requests to contact service', () => {
      hoisted.mockVerifyJwt.mockReturnValue(makeTokenPayload());
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/contacts/list', {
        authorization: 'Bearer valid-token',
      }), res);
      const callArgs = (hoisted.mockRequestFn as any).mock.calls[0][0];
      expect(callArgs.hostname).toBe('contact');
      expect(callArgs.port).toBe(4003);
    });

    it('routes /api/groups/* requests to group service', () => {
      hoisted.mockVerifyJwt.mockReturnValue(makeTokenPayload());
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/groups/list', {
        authorization: 'Bearer valid-token',
      }), res);
      const callArgs = (hoisted.mockRequestFn as any).mock.calls[0][0];
      expect(callArgs.hostname).toBe('group');
      expect(callArgs.port).toBe(4004);
    });

    it('routes /api/files/* requests to file service', () => {
      hoisted.mockVerifyJwt.mockReturnValue(makeTokenPayload());
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('POST', '/api/files/upload', {
        authorization: 'Bearer valid-token',
      }), res);
      const callArgs = (hoisted.mockRequestFn as any).mock.calls[0][0];
      expect(callArgs.hostname).toBe('file');
      expect(callArgs.port).toBe(4005);
    });

    it('routes /api/moments/* requests to moments service', () => {
      hoisted.mockVerifyJwt.mockReturnValue(makeTokenPayload());
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/moments/feed', {
        authorization: 'Bearer valid-token',
      }), res);
      const callArgs = (hoisted.mockRequestFn as any).mock.calls[0][0];
      expect(callArgs.hostname).toBe('moments');
      expect(callArgs.port).toBe(4006);
    });

    it('returns 404 for non-existent API routes', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/nonexistent/path'), res);
      expect(res._statusCode).toBe(404);
      const body = JSON.parse(res._body);
      expect(body.code).toBe(1004);
    });

    it('returns 404 for completely unknown paths', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/unknown/route'), res);
      expect(res._statusCode).toBe(404);
    });
  });

  describe('authentication — test standard #2: no token returns 401', () => {
    it('returns 401 when no token provided for protected route', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/users/me'), res);
      expect(res._statusCode).toBe(401);
      const body = JSON.parse(res._body);
      expect(body.code).toBe(2000);
    });

    it('returns 401 when empty Authorization header', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/users/me', { authorization: '' }), res);
      expect(res._statusCode).toBe(401);
      const body = JSON.parse(res._body);
      expect(body.code).toBe(2000);
    });

    it('returns 401 when token has invalid signature', async () => {
      // Use JwtError from the real module (not mocked)
      const { JwtError } = await vi.importActual<typeof import('./jwt-verify')>('./jwt-verify') as typeof import('./jwt-verify');
      hoisted.mockVerifyJwt.mockImplementation(() => {
        throw new JwtError('invalid signature');
      });

      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/messages/list', {
        authorization: 'Bearer invalid-token',
      }), res);
      expect(res._statusCode).toBe(401);
      const body = JSON.parse(res._body);
      expect(body.code).toBe(2002);
    });

    it('returns 401 when token is expired', async () => {
      const { JwtError } = await vi.importActual<typeof import('./jwt-verify')>('./jwt-verify') as typeof import('./jwt-verify');
      hoisted.mockVerifyJwt.mockImplementation(() => {
        throw new JwtError('token expired');
      });

      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/messages/list', {
        authorization: 'Bearer expired-token',
      }), res);
      expect(res._statusCode).toBe(401);
      const body = JSON.parse(res._body);
      expect(body.code).toBe(2001);
    });

    it('returns 401 when token type is refresh instead of access', () => {
      hoisted.mockVerifyJwt.mockReturnValue(makeTokenPayload({ type: 'refresh' }));

      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/messages/list', {
        authorization: 'Bearer refresh-token',
      }), res);
      expect(res._statusCode).toBe(401);
      const body = JSON.parse(res._body);
      expect(body.code).toBe(2002);
    });

    it('injects user context headers on successful auth', () => {
      hoisted.mockVerifyJwt.mockReturnValue(makeTokenPayload({
        sub: 'user-abc',
        username: 'alice',
      }));

      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/messages/list', {
        authorization: 'Bearer valid-token',
      }), res);
      expect(hoisted.mockRequestFn).toHaveBeenCalledTimes(1);
      const callArgs = (hoisted.mockRequestFn as any).mock.calls[0][0];
      expect(callArgs.headers['x-user-id']).toBe('user-abc');
      expect(callArgs.headers['x-username']).toBe('alice');
      expect(callArgs.headers['authorization']).toBe('Bearer valid-token');
    });

    it('allows public auth routes without token', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('POST', '/api/auth/login', {
        'content-type': 'application/json',
      }), res);
      expect(hoisted.mockRequestFn).toHaveBeenCalledTimes(1);
      const callArgs = (hoisted.mockRequestFn as any).mock.calls[0][0];
      expect(callArgs.hostname).toBe('auth');
    });

    it('allows /api/auth/register without token', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('POST', '/api/auth/register', {
        'content-type': 'application/json',
      }), res);
      expect(hoisted.mockRequestFn).toHaveBeenCalledTimes(1);
    });

    it('allows /api/auth/refresh without token', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('POST', '/api/auth/refresh', {
        'content-type': 'application/json',
      }), res);
      expect(hoisted.mockRequestFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('rate limiting — test standard #3: returns 429', () => {
    it('returns 429 when rate limit is exceeded', () => {
      hoisted.mockRateLimiter.consume.mockReturnValue(false);

      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/health'), res);
      expect(res._statusCode).toBe(429);
      const body = JSON.parse(res._body);
      expect(body.code).toBe(1002);
    });

    it('calls rate limiter with client IP from x-forwarded-for', () => {
      hoisted.mockRateLimiter.consume.mockReturnValue(true);

      const req = makeReq('GET', '/health');
      req.headers['x-forwarded-for'] = '10.0.0.1, 10.0.0.2';
      hoisted.state.capturedHandler!(req, makeRes());
      expect(hoisted.mockRateLimiter.consume).toHaveBeenCalledWith('10.0.0.1');
    });

    it('calls rate limiter with socket.remoteAddress when no forwarded header', () => {
      hoisted.mockRateLimiter.consume.mockReturnValue(true);

      const req = makeReq('GET', '/health');
      req.socket = { remoteAddress: '192.168.1.1' };
      hoisted.state.capturedHandler!(req, makeRes());
      expect(hoisted.mockRateLimiter.consume).toHaveBeenCalledWith('192.168.1.1');
    });

    it('falls back to 127.0.0.1 when no IP available', () => {
      hoisted.mockRateLimiter.consume.mockReturnValue(true);

      const req = makeReq('GET', '/health');
      delete (req as any).socket;
      hoisted.state.capturedHandler!(req, makeRes());
      expect(hoisted.mockRateLimiter.consume).toHaveBeenCalledWith('127.0.0.1');
    });
  });

  describe('logging — test standard #4: all requests logged', () => {
    it('logs every request including method and path', () => {
      hoisted.mockRateLimiter.consume.mockReturnValue(true);

      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/health'), res);
      expect(console.log).toHaveBeenCalled();
      const logStr = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .flat()
        .join(' ');
      expect(logStr).toContain('GET');
      expect(logStr).toContain('/health');
    });

    it('logs 401 unauthorized responses', () => {
      hoisted.mockRateLimiter.consume.mockReturnValue(true);

      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/users/me'), res);
      const logStr = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .flat()
        .join(' ');
      expect(logStr).toContain('/api/users/me');
      expect(logStr).toContain('401');
    });

    it('logs 429 rate limited responses', () => {
      hoisted.mockRateLimiter.consume.mockReturnValue(false);

      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/contacts/list'), res);
      const logStr = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .flat()
        .join(' ');
      expect(logStr).toContain('429');
    });

    it('logs 404 not found responses', () => {
      hoisted.mockRateLimiter.consume.mockReturnValue(true);

      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/unknown/path'), res);
      const logStr = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .flat()
        .join(' ');
      expect(logStr).toContain('404');
    });

    it('logs OPTIONS preflight requests', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('OPTIONS', '/api/messages/list'), res);
      const logStr = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .flat()
        .join(' ');
      expect(logStr).toContain('OPTIONS');
      expect(logStr).toContain('204');
    });

    it('includes latency in log output', () => {
      hoisted.mockRateLimiter.consume.mockReturnValue(true);

      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/health'), res);
      const logStr = (console.log as ReturnType<typeof vi.fn>).mock.calls
        .flat()
        .join(' ');
      expect(logStr).toMatch(/\d+ms/);
    });
  });

  describe('WebSocket', () => {
    it('registers upgrade handler on server', () => {
      const upgradeCall = hoisted.state.mockOn.mock.calls.find(
        (c: any[]) => c[0] === 'upgrade',
      );
      expect(upgradeCall).toBeDefined();
    });

    it('destroys socket for non-/ws upgrade requests', () => {
      const mockSocket = {
        write: vi.fn(),
        destroy: vi.fn(),
        on: vi.fn(),
      };
      hoisted.state.capturedUpgradeHandler!(
        { url: '/other' },
        mockSocket,
        Buffer.alloc(0),
      );
      expect(mockSocket.destroy).toHaveBeenCalled();
    });
  });

  describe('response format', () => {
    it('includes timestamp in all error responses', () => {
      hoisted.mockRateLimiter.consume.mockReturnValue(false);

      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/api/contacts/list'), res);
      const body = JSON.parse(res._body);
      expect(body).toHaveProperty('timestamp');
      expect(typeof body.timestamp).toBe('number');
    });

    it('includes timestamp in health response', () => {
      const res = makeRes();
      hoisted.state.capturedHandler!(makeReq('GET', '/health'), res);
      const body = JSON.parse(res._body);
      expect(body).toHaveProperty('timestamp');
      expect(body.timestamp).toBeGreaterThan(0);
    });
  });
});
