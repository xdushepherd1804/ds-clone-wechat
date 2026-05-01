import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock setup ─────────────────────────────────────────────────────────────

const mockConfig = {
  services: { message: { port: 4002, host: '0.0.0.0' } },
  database: {
    mongodb: { uri: 'mongodb://localhost:27017/wechat' },
    redis: { host: 'localhost', port: 6379 },
  },
  jwt: { secret: 'test-secret', access_expire: '15m', refresh_expire: '7d' },
};

// Shared MessageError class that both mock and tests can use
const { TestMessageError } = vi.hoisted(() => {
  class MessageError extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
      this.name = 'MessageError';
    }
  }
  return { TestMessageError: MessageError };
});

let capturedHandler: ((req: any, res: any) => void) | null = null;
let capturedPort: number | null = null;

// Hoist mocks
const mockListen = vi.fn((_port: number, _host: string, cb: () => void) => {
  capturedPort = _port;
  cb();
});

const mockServerOn = vi.fn();
const mockServerCloseFn = vi.fn((cb: () => void) => { cb(); });
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

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function (this: any) {
    this.$disconnect = vi.fn().mockResolvedValue(undefined);
  }),
}));

vi.mock('mongodb', () => ({
  MongoClient: vi.fn(function (this: any) {
    this.connect = vi.fn().mockResolvedValue(undefined);
    this.db = vi.fn().mockReturnValue({});
    this.close = vi.fn().mockResolvedValue(undefined);
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
    this.zadd = vi.fn().mockResolvedValue(1);
  }),
}));

vi.mock('@wechat-clone/shared', () => ({
  loadConfig: vi.fn(() => mockConfig),
  ErrorCode: {
    SUCCESS: 0,
    INVALID_PARAM: 1001,
    NOT_FOUND: 1004,
    FORBIDDEN: 1005,
    UNAUTHORIZED: 2000,
    INTERNAL_ERROR: 1003,
    MSG_SEND_FAILED: 3000,
    MSG_NOT_FOUND: 3001,
    CONVERSATION_NOT_FOUND: 3002,
    RATE_LIMITED: 1002,
    GROUP_PERMISSION_DENIED: 5001,
  },
}));

// Mock the message service
const mockSendMessage = vi.fn();
const mockGetMessages = vi.fn();
const mockGetConversations = vi.fn();
const mockMarkConversationRead = vi.fn();
const mockRecallMessage = vi.fn();
const mockGetOfflineMessages = vi.fn();

vi.mock('./message.service', () => ({
  createMessageService: vi.fn(() => ({
    sendMessage: mockSendMessage,
    getMessages: mockGetMessages,
    getConversations: mockGetConversations,
    markConversationRead: mockMarkConversationRead,
    recallMessage: mockRecallMessage,
    getOfflineMessages: mockGetOfflineMessages,
  })),
  MessageError: TestMessageError,
}));

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Set env vars to prevent real connections
process.env.MONGODB_URL = '';
process.env.REDIS_URL = '';

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

describe('server-message HTTP server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendMessage.mockReset();
    mockGetMessages.mockReset();
    mockGetConversations.mockReset();
    mockMarkConversationRead.mockReset();
    mockRecallMessage.mockReset();
    mockGetOfflineMessages.mockReset();
  });

  it('starts on configured port', () => {
    expect(capturedPort).toBe(4002);
  });

  it('returns health check at /health', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/health'), res);
    const body = parseBody(res);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('message');
  });

  it('returns health check at /api/messages/health', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/api/messages/health'), res);
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
    expect(res._headers['Access-Control-Allow-Origin']).toBe('*');
  });

  it('returns 404 for unknown routes', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/api/messages/unknown'), res);
    expect(res._statusCode).toBe(404);
  });

  // ─── sendMessage ────────────────────────────────────────────────────────

  describe('POST /api/messages/send', () => {
    it('sends a message and returns 201', async () => {
      mockSendMessage.mockResolvedValue({
        msgId: 'm1', fromUid: 'u1', toUid: 'u2', chatType: 'private',
        msgType: 1, content: 'Hello', status: 'sent', serverSeq: 1,
        createdAt: new Date().toISOString(),
      });

      const res = makeRes();
      const req = makeReq('POST', '/api/messages/send', { 'x-user-id': 'u1' });
      // hack: make parseBody work by patching read stream
      const chunks: Buffer[] = [];
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') {
          cb(Buffer.from(JSON.stringify({ toUid: 'u2', chatType: 'private', msgType: 1, content: 'Hello' })));
        }
        if (event === 'end') cb();
        if (event === 'error') {} // noop
        return req;
      });

      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(201);
      expect(mockSendMessage).toHaveBeenCalled();
    });

    it('returns 401 without x-user-id header', async () => {
      const res = makeRes();
      const req = makeReq('POST', '/api/messages/send');
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(401);
    });
  });

  // ─── getMessages ────────────────────────────────────────────────────────

  describe('GET /api/messages/history', () => {
    it('returns 400 without conversation_id', async () => {
      const res = makeRes();
      const req = makeReq('GET', '/api/messages/history', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(400);
    });

    it('returns messages for valid request', async () => {
      mockGetMessages.mockResolvedValue([
        { msgId: 'm1', fromUid: 'u2', content: 'Hello', status: 'sent', serverSeq: 1, createdAt: new Date().toISOString() },
      ]);

      const res = makeRes();
      const req = makeReq('GET', '/api/messages/history?conversation_id=conv:u1:u2', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(200);
      expect(mockGetMessages).toHaveBeenCalledWith('conv:u1:u2', 'u1', expect.anything());
    });
  });

  // ─── getConversations ───────────────────────────────────────────────────

  describe('GET /api/messages/conversations', () => {
    it('returns conversations list', async () => {
      mockGetConversations.mockResolvedValue([
        { conversationId: 'conv:u1:u2', chatType: 'private', targetId: 'u2', lastMsg: null, unreadCount: 0, isTop: false, isMuted: false, updatedAt: new Date().toISOString() },
      ]);

      const res = makeRes();
      const req = makeReq('GET', '/api/messages/conversations', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(200);
      expect(mockGetConversations).toHaveBeenCalledWith('u1', expect.anything());
    });

    it('passes limit and offset from query params', async () => {
      mockGetConversations.mockResolvedValue([]);

      const res = makeRes();
      const req = makeReq('GET', '/api/messages/conversations?limit=10&offset=5', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(mockGetConversations).toHaveBeenCalledWith('u1', { limit: 10, offset: 5 });
    });
  });

  // ─── getOfflineMessages ─────────────────────────────────────────────────

  describe('GET /api/messages/offline', () => {
    it('returns offline messages', async () => {
      mockGetOfflineMessages.mockResolvedValue([
        { msgId: 'm1', content: 'Offline msg', fromUid: 'u2', status: 'sent', serverSeq: 1, createdAt: new Date().toISOString() },
      ]);

      const res = makeRes();
      const req = makeReq('GET', '/api/messages/offline', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(200);
      expect(mockGetOfflineMessages).toHaveBeenCalledWith('u1');
    });
  });

  // ─── markRead ───────────────────────────────────────────────────────────

  describe('PUT /api/messages/read/:conv_id', () => {
    it('marks conversation as read', async () => {
      mockMarkConversationRead.mockResolvedValue({ updatedCount: 3 });

      const res = makeRes();
      const req = makeReq('PUT', '/api/messages/read/conv:u1:u2', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(200);
      expect(mockMarkConversationRead).toHaveBeenCalledWith('conv:u1:u2', 'u1');
    });

    it('handles group conversation IDs', async () => {
      mockMarkConversationRead.mockResolvedValue({ updatedCount: 1 });

      const res = makeRes();
      const req = makeReq('PUT', '/api/messages/read/conv:group:g1', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(mockMarkConversationRead).toHaveBeenCalledWith('conv:group:g1', 'u1');
    });
  });

  // ─── recallMessage ──────────────────────────────────────────────────────

  describe('DELETE /api/messages/:msg_id', () => {
    it('recalls a message', async () => {
      mockRecallMessage.mockResolvedValue({
        msgId: 'm1', fromUid: 'u1', content: 'test', status: 'recalled', serverSeq: 1, createdAt: new Date().toISOString(),
      });

      const res = makeRes();
      const req = makeReq('DELETE', '/api/messages/m1', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(200);
      expect(mockRecallMessage).toHaveBeenCalledWith({ msgId: 'm1', userId: 'u1' });
    });

    it('returns 404 for unknown message', async () => {
      mockRecallMessage.mockRejectedValue(new TestMessageError(3001, '消息不存在'));

      const res = makeRes();
      const req = makeReq('DELETE', '/api/messages/m999', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(404);
    });
  });

  // ─── Error handling ─────────────────────────────────────────────────────

  describe('error handling', () => {
    it('handles MessageError with proper status codes', async () => {
      mockSendMessage.mockRejectedValue(new TestMessageError(1001, '参数错误'));

      const res = makeRes();
      const req = makeReq('POST', '/api/messages/send', { 'x-user-id': 'u1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ toUid: 'u2', chatType: 'private', content: 'test' })));
        if (event === 'end') cb();
        if (event === 'error') {}
        return req;
      });

      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(400);
    });

    it('handles internal errors as 500', async () => {
      mockSendMessage.mockRejectedValue(new Error('Unexpected failure'));

      const res = makeRes();
      const req = makeReq('POST', '/api/messages/send', { 'x-user-id': 'u1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ toUid: 'u2', chatType: 'private', content: 'test' })));
        if (event === 'end') cb();
        if (event === 'error') {}
        return req;
      });

      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(500);
    });
  });
});
