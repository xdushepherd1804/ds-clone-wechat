import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock setup ─────────────────────────────────────────────────────────────

const mockConfig = {
  services: { search: { port: 4008, host: '0.0.0.0' } },
  database: {
    mongodb: { uri: 'mongodb://localhost:27017/wechat' },
    redis: { host: 'localhost', port: 6379 },
  },
  jwt: { secret: 'test-secret', access_expire: '15m', refresh_expire: '7d' },
};

const { TestSearchError } = vi.hoisted(() => {
  class SearchError extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
      this.name = 'SearchError';
    }
  }
  return { TestSearchError: SearchError };
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

vi.mock('@wechat-clone/shared', () => ({
  loadConfig: vi.fn(() => mockConfig),
  ErrorCode: {
    SUCCESS: 0,
    INVALID_PARAM: 1001,
    NOT_FOUND: 1004,
    FORBIDDEN: 1005,
    UNAUTHORIZED: 2000,
    INTERNAL_ERROR: 1003,
    RATE_LIMITED: 1002,
  },
}));

// Mock the search service
const mockSearchMessages = vi.fn();
const mockSearchContacts = vi.fn();
const mockSearchGroups = vi.fn();
const mockSearchAll = vi.fn();
const mockInitSearchIndexes = vi.fn();

vi.mock('./search.service', () => ({
  createSearchService: vi.fn(() => ({
    searchMessages: mockSearchMessages,
    searchContacts: mockSearchContacts,
    searchGroups: mockSearchGroups,
    searchAll: mockSearchAll,
    initSearchIndexes: mockInitSearchIndexes,
  })),
  SearchError: TestSearchError,
}));

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Prevent real connections
process.env.MONGODB_URL = '';

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

describe('server-search HTTP server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchMessages.mockReset();
    mockSearchContacts.mockReset();
    mockSearchGroups.mockReset();
    mockSearchAll.mockReset();
    mockInitSearchIndexes.mockReset();
  });

  it('starts on configured port', () => {
    expect(capturedPort).toBe(4008);
  });

  it('returns health check at /health', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/health'), res);
    const body = parseBody(res);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('search');
  });

  it('returns health check at /api/search/health', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/api/search/health'), res);
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
    capturedHandler!(makeReq('GET', '/api/search/unknown'), res);
    expect(res._statusCode).toBe(404);
  });

  // ─── searchMessages ──────────────────────────────────────────────────────

  describe('GET /api/search/messages', () => {
    it('returns 401 without x-user-id header', async () => {
      const res = makeRes();
      const req = makeReq('GET', '/api/search/messages?q=hello');
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(401);
    });

    it('returns 400 without q param', async () => {
      const res = makeRes();
      const req = makeReq('GET', '/api/search/messages', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(400);
    });

    it('searches messages with keyword', async () => {
      mockSearchMessages.mockResolvedValue({
        items: [{ msgId: 'm1', content: 'hello world', highlight: '<mark>hello</mark> world', conversationId: 'conv:u1:u2', chatType: 'private', fromUid: 'u2', createdAt: '2024-01-01T00:00:00.000Z' }],
        total: 1, page: 1, size: 20,
      });

      const res = makeRes();
      const req = makeReq('GET', '/api/search/messages?q=hello', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);

      expect(res._statusCode).toBe(200);
      expect(mockSearchMessages).toHaveBeenCalledWith({
        userId: 'u1', keyword: 'hello',
        convId: undefined, page: undefined, size: undefined,
      });
    });

    it('passes conv_id, page, and size params', async () => {
      mockSearchMessages.mockResolvedValue({ items: [], total: 0, page: 2, size: 10 });

      const res = makeRes();
      const req = makeReq('GET', '/api/search/messages?q=hello&conv_id=conv:group:g1&page=2&size=10', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);

      expect(mockSearchMessages).toHaveBeenCalledWith({
        userId: 'u1', keyword: 'hello', convId: 'conv:group:g1', page: 2, size: 10,
      });
    });

    it('accepts /search/messages path (without /api prefix)', async () => {
      mockSearchMessages.mockResolvedValue({ items: [], total: 0, page: 1, size: 20 });

      const res = makeRes();
      const req = makeReq('GET', '/search/messages?q=test', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);

      expect(res._statusCode).toBe(200);
    });
  });

  // ─── searchContacts ──────────────────────────────────────────────────────

  describe('GET /api/search/contacts', () => {
    it('returns contact search results', async () => {
      mockSearchContacts.mockResolvedValue({
        items: [{ id: 'u2', username: 'bob', nickname: 'Bob', avatar: null, isContact: true }],
        total: 1,
      });

      const res = makeRes();
      const req = makeReq('GET', '/api/search/contacts?q=bob', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);

      expect(res._statusCode).toBe(200);
      expect(mockSearchContacts).toHaveBeenCalledWith({ userId: 'u1', keyword: 'bob' });
    });

    it('returns 400 without q param', async () => {
      const res = makeRes();
      const req = makeReq('GET', '/api/search/contacts', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(400);
    });
  });

  // ─── searchGroups ────────────────────────────────────────────────────────

  describe('GET /api/search/groups', () => {
    it('returns group search results', async () => {
      mockSearchGroups.mockResolvedValue({
        items: [{ id: 'g1', name: 'React Devs', avatar: null, memberCount: 50, isMember: false }],
        total: 1,
      });

      const res = makeRes();
      const req = makeReq('GET', '/api/search/groups?q=react', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);

      expect(res._statusCode).toBe(200);
      expect(mockSearchGroups).toHaveBeenCalledWith({ userId: 'u1', keyword: 'react' });
    });
  });

  // ─── searchAll ───────────────────────────────────────────────────────────

  describe('GET /api/search/all', () => {
    it('returns aggregated search results', async () => {
      mockSearchAll.mockResolvedValue({
        messages: [{ msgId: 'm1', content: 'hello', highlight: '<mark>hello</mark>', conversationId: 'conv:u1:u2', chatType: 'private', fromUid: 'u2', createdAt: '2024-01-01T00:00:00.000Z' }],
        contacts: [{ id: 'u2', username: 'hello_user', nickname: 'Hello', avatar: null, isContact: true }],
        groups: [],
      });

      const res = makeRes();
      const req = makeReq('GET', '/api/search/all?q=hello', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);

      expect(res._statusCode).toBe(200);
      expect(mockSearchAll).toHaveBeenCalledWith({ userId: 'u1', keyword: 'hello' });
    });
  });

  // ─── initIndexes ─────────────────────────────────────────────────────────

  describe('POST /api/search/init-indexes', () => {
    it('initializes search indexes', async () => {
      mockInitSearchIndexes.mockResolvedValue({ created: ['messages.content_text', 'message_boxes.user_msg'] });

      const res = makeRes();
      const req = makeReq('POST', '/api/search/init-indexes');
      await capturedHandler!(req, res);

      expect(res._statusCode).toBe(200);
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('handles SearchError with proper status codes', async () => {
      mockSearchMessages.mockRejectedValue(new TestSearchError(1001, '参数错误'));

      const res = makeRes();
      const req = makeReq('GET', '/api/search/messages?q=test', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(400);
    });

    it('handles internal errors as 500', async () => {
      mockSearchMessages.mockRejectedValue(new Error('Unexpected failure'));

      const res = makeRes();
      const req = makeReq('GET', '/api/search/messages?q=test', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      expect(res._statusCode).toBe(500);
    });
  });
});
