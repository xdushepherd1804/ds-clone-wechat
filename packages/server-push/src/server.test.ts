import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock setup ─────────────────────────────────────────────────────────────

const mockConfig = {
  services: { push: { port: 4007, host: '0.0.0.0' } },
  database: {
    mongodb: { uri: 'mongodb://localhost:27017/wechat' },
    redis: { host: 'localhost', port: 6379 },
  },
  jwt: { secret: 'test-secret', access_expire: '15m', refresh_expire: '7d' },
};

// Shared PushError class
const { TestPushError } = vi.hoisted(() => {
  class PushError extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
      this.name = 'PushError';
    }
  }
  return { TestPushError: PushError };
});

let capturedHandler: ((req: any, res: any) => void) | null = null;
let capturedPort: number | null = null;

const mockListen = vi.fn((_port: number, _host: string, cb: () => void) => {
  capturedPort = _port;
  cb();
});

const mockServerOn = vi.fn();
const mockServerClose = vi.fn((cb?: () => void) => {
  if (cb) cb();
  return { on: vi.fn() };
});

vi.mock('node:http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:http')>();
  return {
    ...actual,
    createServer: vi.fn((handler: (req: any, res: any) => void) => {
      capturedHandler = handler;
      return {
        listen: mockListen,
        on: mockServerOn,
        close: mockServerClose,
      };
    }),
  };
});

const mockDeviceTokenCreate = vi.fn();
const mockDeviceTokenFindUnique = vi.fn();
const mockDeviceTokenFindMany = vi.fn();
const mockDeviceTokenDelete = vi.fn();

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function (this: any) {
    this.$connect = vi.fn().mockResolvedValue(undefined);
    this.$disconnect = vi.fn().mockResolvedValue(undefined);
    this.deviceToken = {
      findUnique: mockDeviceTokenFindUnique.mockResolvedValue(null),
      findMany: mockDeviceTokenFindMany.mockResolvedValue([]),
      create: mockDeviceTokenCreate,
      update: vi.fn(),
      delete: mockDeviceTokenDelete,
    };
  }),
}));

vi.mock('ioredis', () => ({
  Redis: vi.fn(function (this: any) {
    this.quit = vi.fn().mockResolvedValue(undefined);
    this.get = vi.fn().mockResolvedValue(null);
    this.setex = vi.fn().mockResolvedValue('OK');
    this.del = vi.fn().mockResolvedValue(1);
    this.rpush = vi.fn().mockResolvedValue(1);
    this.lpop = vi.fn().mockResolvedValue(null);
    this.lrange = vi.fn().mockResolvedValue([]);
    this.lrem = vi.fn().mockResolvedValue(0);
    this.llen = vi.fn().mockResolvedValue(0);
    this.zadd = vi.fn().mockResolvedValue(1);
    this.zrem = vi.fn().mockResolvedValue(0);
    this.zcard = vi.fn().mockResolvedValue(0);
    this.zrevrange = vi.fn().mockResolvedValue([]);
    this.hset = vi.fn().mockResolvedValue(1);
    this.hdel = vi.fn().mockResolvedValue(0);
    this.hlen = vi.fn().mockResolvedValue(0);
    this.sadd = vi.fn().mockResolvedValue(1);
    this.scard = vi.fn().mockResolvedValue(0);
    this.publish = vi.fn().mockResolvedValue(0);
    this.expire = vi.fn().mockResolvedValue(1);
    this.pipeline = vi.fn(() => ({
      rpush: vi.fn().mockReturnThis(),
      lrem: vi.fn().mockReturnThis(),
      del: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      sadd: vi.fn().mockReturnThis(),
      setex: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      publish: vi.fn().mockReturnThis(),
      get: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([]),
    }));
  }),
}));

vi.mock('@wechat-clone/shared', () => ({
  loadConfig: vi.fn(() => mockConfig),
  ErrorCode: {
    SUCCESS: 0,
    INVALID_PARAM: 1001,
    RATE_LIMITED: 1002,
    INTERNAL_ERROR: 1003,
    NOT_FOUND: 1004,
    FORBIDDEN: 1005,
    UNAUTHORIZED: 2000,
  },
}));

// Mock push service
const mockSendPush = vi.fn();
const mockProcessQueue = vi.fn();
const mockGetPendingCount = vi.fn();
const mockMarkAllRead = vi.fn();
const mockGetPendingPushes = vi.fn();
const mockGetStats = vi.fn();

vi.mock('./push.service', () => ({
  createPushService: vi.fn(() => ({
    sendPush: mockSendPush,
    processQueue: mockProcessQueue,
    getPendingCount: mockGetPendingCount,
    markAllRead: mockMarkAllRead,
    getPendingPushes: mockGetPendingPushes,
    getStats: mockGetStats,
  })),
  PushError: TestPushError,
}));

// Mock providers
const mockProviderSend = vi.fn().mockResolvedValue(undefined);
const mockProviderSendToMany = vi.fn().mockResolvedValue(undefined);

vi.mock('./providers', () => ({
  MockProvider: vi.fn(function (this: any) {
    this.type = 'mock';
    this.send = mockProviderSend;
    this.sendToMany = mockProviderSendToMany;
  }),
  FCMProvider: vi.fn(),
  APNsProvider: vi.fn(),
}));

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

process.env.REDIS_URL = '';

// Use dynamic import to trigger server.ts execution
await import('./server');

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeReq(method = 'GET', url = '/', headers: Record<string, string> = {}): any {
  return { method, url, headers, on: vi.fn(), socket: { remoteAddress: '127.0.0.1' } };
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
      if (data !== undefined) this._body = data;
    }),
  };
  return res;
}

function parseBody(res: any): any {
  try { return JSON.parse(res._body); } catch { return {}; }
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('server-push HTTP server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendPush.mockReset();
    mockProcessQueue.mockReset();
    mockGetPendingCount.mockReset();
    mockMarkAllRead.mockReset();
    mockGetPendingPushes.mockReset();
    mockGetStats.mockReset();
    mockProviderSend.mockReset();
    mockProviderSendToMany.mockReset();
    mockDeviceTokenCreate.mockReset();
    mockDeviceTokenFindUnique.mockReset();
    mockDeviceTokenFindMany.mockReset();
    mockDeviceTokenDelete.mockReset();
    // Default: no existing device, create returns a proper device
    mockDeviceTokenFindUnique.mockResolvedValue(null);
    mockDeviceTokenFindMany.mockResolvedValue([]);
    mockDeviceTokenCreate.mockImplementation(async (input: any) => ({
      id: 'dev1',
      userId: input?.data?.userId || 'user1',
      platform: input?.data?.platform || 'ios',
      deviceToken: input?.data?.deviceToken || 'tok',
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mockDeviceTokenDelete.mockResolvedValue({});
  });

  it('starts on configured port', () => {
    expect(capturedPort).toBe(4007);
  });

  it('returns health check at /health', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/health'), res);
    const body = parseBody(res);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('push');
    expect(body.providers).toBeDefined();
  });

  it('returns health check at /api/push/health', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/api/push/health'), res);
    const body = parseBody(res);
    expect(body.status).toBe('ok');
  });

  it('responds 204 to OPTIONS', () => {
    const res = makeRes();
    capturedHandler!(makeReq('OPTIONS', '/any'), res);
    expect(res._statusCode).toBe(204);
  });

  it('sets CORS headers', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/'), res);
    expect((res._headers as Record<string, string>)['Access-Control-Allow-Origin']).toBe('*');
  });

  it('returns 404 for unknown routes', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/api/push/unknown'), res);
    expect(res._statusCode).toBe(404);
  });

  // ─── sendPush ──────────────────────────────────────────────────────────

  describe('POST /api/push/send', () => {
    it('sends a push and returns 201', async () => {
      mockSendPush.mockResolvedValue({
        pushId: 'push_1',
        targetUids: ['user1', 'user2'],
        scenario: 'new_message',
        title: 'New Message',
        body: 'You have a message',
        data: { senderId: 'sender1' },
        priority: 'HIGH',
        priorityScore: 200,
        createdAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        status: 'pending',
      });

      const res = makeRes();
      const req = makeReq('POST', '/api/push/send');
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({
          targetUids: ['user1', 'user2'],
          scenario: 'new_message',
          title: 'New Message',
          body: 'You have a message',
        })));
        if (event === 'end') cb();
        if (event === 'error') {}
        return req;
      });

      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(201);
      expect(mockSendPush).toHaveBeenCalled();
      const body = parseBody(res);
      expect(body.code).toBe(0);
      expect(body.data.scenario).toBe('new_message');
    });

    it('triggers provider delivery', async () => {
      mockSendPush.mockResolvedValue({
        pushId: 'push_2',
        targetUids: ['user1'],
        scenario: 'new_message',
        title: 'T',
        body: 'B',
        data: {},
        priority: 'HIGH',
        priorityScore: 1,
        createdAt: Date.now(),
        retryCount: 0,
        maxRetries: 3,
        status: 'pending',
      });

      // Set up device data so the provider is actually called
      mockDeviceTokenFindMany.mockResolvedValue([
        { id: 'd1', userId: 'user1', platform: 'ios', deviceToken: 'ios-tok', createdAt: new Date(), updatedAt: new Date() },
      ]);

      const res = makeRes();
      const req = makeReq('POST', '/api/push/send');
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({
          targetUids: ['user1'],
          scenario: 'new_message',
          title: 'T',
          body: 'B',
        })));
        if (event === 'end') cb();
        if (event === 'error') {}
        return req;
      });

      await capturedHandler!(req, res);
      // Mock provider should be called for the target user with their device
      expect(mockProviderSendToMany).toHaveBeenCalled();
    });

    it('handles empty targetUids gracefully', async () => {
      mockSendPush.mockRejectedValue(new TestPushError(1001, '参数错误'));

      const res = makeRes();
      const req = makeReq('POST', '/api/push/send');
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ targetUids: [] })));
        if (event === 'end') cb();
        if (event === 'error') {}
        return req;
      });

      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(400);
    });
  });

  // ─── processQueue ──────────────────────────────────────────────────────

  describe('POST /api/push/process', () => {
    it('processes the queue and returns count', async () => {
      mockProcessQueue.mockResolvedValue(5);

      const res = makeRes();
      const req = makeReq('POST', '/api/push/process');
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ batchSize: 20 })));
        if (event === 'end') cb();
        if (event === 'error') {}
        return req;
      });

      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(200);
      const body = parseBody(res);
      expect(body.data.processed).toBe(5);
      expect(mockProcessQueue).toHaveBeenCalledWith(20);
    });
  });

  // ─── getPendingPushes ──────────────────────────────────────────────────

  describe('GET /api/push/pending', () => {
    it('returns 401 without x-user-id', async () => {
      const res = makeRes();
      await capturedHandler!(makeReq('GET', '/api/push/pending'), res);
      expect(res._statusCode).toBe(401);
    });

    it('returns pending pushes for authenticated user', async () => {
      mockGetPendingPushes.mockResolvedValue([
        { pushId: 'p1', scenario: 'new_message', title: 'Msg', body: 'B', priority: 'HIGH', status: 'pending' },
      ]);

      const res = makeRes();
      const req = makeReq('GET', '/api/push/pending', { 'x-user-id': 'user1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(200);
      expect(mockGetPendingPushes).toHaveBeenCalledWith('user1', 50);
    });

    it('respects limit query param', async () => {
      mockGetPendingPushes.mockResolvedValue([]);

      const res = makeRes();
      const req = makeReq('GET', '/api/push/pending?limit=10', { 'x-user-id': 'user1' });
      await capturedHandler!(req, res);
      expect(mockGetPendingPushes).toHaveBeenCalledWith('user1', 10);
    });

    it('caps limit at 100', async () => {
      mockGetPendingPushes.mockResolvedValue([]);

      const res = makeRes();
      const req = makeReq('GET', '/api/push/pending?limit=200', { 'x-user-id': 'user1' });
      await capturedHandler!(req, res);
      expect(mockGetPendingPushes).toHaveBeenCalledWith('user1', 100);
    });
  });

  // ─── markAllRead ───────────────────────────────────────────────────────

  describe('PUT /api/push/read', () => {
    it('returns 401 without x-user-id', async () => {
      const res = makeRes();
      await capturedHandler!(makeReq('PUT', '/api/push/read'), res);
      expect(res._statusCode).toBe(401);
    });

    it('marks all pushes as read for authenticated user', async () => {
      mockMarkAllRead.mockResolvedValue(3);

      const res = makeRes();
      const req = makeReq('PUT', '/api/push/read', { 'x-user-id': 'user1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(200);
      expect(mockMarkAllRead).toHaveBeenCalledWith('user1');
      const body = parseBody(res);
      expect(body.data.cleared).toBe(3);
    });
  });

  // ─── getStats ──────────────────────────────────────────────────────────

  describe('GET /api/push/stats', () => {
    it('returns queue statistics', async () => {
      mockGetStats.mockResolvedValue({ pending: 10, processing: 2, delivered: 100, failed: 5 });

      const res = makeRes();
      await capturedHandler!(makeReq('GET', '/api/push/stats'), res);
      expect(res._statusCode).toBe(200);
      const body = parseBody(res);
      expect(body.data.pending).toBe(10);
      expect(body.data.delivered).toBe(100);
    });
  });

  // ─── getPendingCount ───────────────────────────────────────────────────

  describe('GET /api/push/count', () => {
    it('returns 401 without x-user-id', async () => {
      const res = makeRes();
      await capturedHandler!(makeReq('GET', '/api/push/count'), res);
      expect(res._statusCode).toBe(401);
    });

    it('returns pending count for authenticated user', async () => {
      mockGetPendingCount.mockResolvedValue(7);

      const res = makeRes();
      const req = makeReq('GET', '/api/push/count', { 'x-user-id': 'user1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(200);
      expect(mockGetPendingCount).toHaveBeenCalledWith('user1');
      const body = parseBody(res);
      expect(body.data.count).toBe(7);
    });
  });

  // ─── Device routes ─────────────────────────────────────────────────────

  describe('POST /api/push/register-device', () => {
    it('returns 401 without x-user-id', async () => {
      const res = makeRes();
      const req = makeReq('POST', '/api/push/register-device');
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ platform: 'ios', device_token: 'tok' })));
        if (event === 'end') cb();
        if (event === 'error') {}
        return req;
      });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(401);
    });

    it('registers device for authenticated user', async () => {
      const res = makeRes();
      const req = makeReq('POST', '/api/push/register-device', { 'x-user-id': 'user1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ platform: 'ios', device_token: 'ios-token-abc' })));
        if (event === 'end') cb();
        if (event === 'error') {}
        return req;
      });

      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(201);
      const body = parseBody(res);
      expect(body.data.platform).toBe('ios');
      expect(body.data.deviceToken).toBe('ios-token-abc');
    });

    it('accepts deviceToken field name', async () => {
      const res = makeRes();
      const req = makeReq('POST', '/api/push/register-device', { 'x-user-id': 'user2' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ platform: 'android', deviceToken: 'fcm-token' })));
        if (event === 'end') cb();
        if (event === 'error') {}
        return req;
      });

      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(201);
      const body = parseBody(res);
      expect(body.data.platform).toBe('android');
      expect(body.data.deviceToken).toBe('fcm-token');
    });
  });

  describe('DELETE /api/push/unregister-device', () => {
    it('returns 401 without x-user-id', async () => {
      const res = makeRes();
      const req = makeReq('DELETE', '/api/push/unregister-device');
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ device_token: 'tok' })));
        if (event === 'end') cb();
        if (event === 'error') {}
        return req;
      });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(401);
    });

    it('unregisters device for authenticated user', async () => {
      const res = makeRes();
      const req = makeReq('DELETE', '/api/push/unregister-device', { 'x-user-id': 'user1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ device_token: 'ios-token-abc' })));
        if (event === 'end') cb();
        if (event === 'error') {}
        return req;
      });

      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(200);
    });
  });

  describe('GET /api/push/devices', () => {
    it('returns 401 without x-user-id', async () => {
      const res = makeRes();
      await capturedHandler!(makeReq('GET', '/api/push/devices'), res);
      expect(res._statusCode).toBe(401);
    });

    it('lists devices for authenticated user', async () => {
      const res = makeRes();
      const req = makeReq('GET', '/api/push/devices', { 'x-user-id': 'user1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(200);
      const body = parseBody(res);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  // ─── Error handling ────────────────────────────────────────────────────

  describe('error handling', () => {
    it('handles PushError with proper status codes', async () => {
      mockGetPendingPushes.mockRejectedValue(new TestPushError(2000, '未登录'));

      const res = makeRes();
      const req = makeReq('GET', '/api/push/pending', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(401);
    });

    it('handles internal errors as 500', async () => {
      mockGetStats.mockRejectedValue(new Error('Unexpected failure'));

      const res = makeRes();
      await capturedHandler!(makeReq('GET', '/api/push/stats'), res);
      expect(res._statusCode).toBe(500);
    });
  });
});
