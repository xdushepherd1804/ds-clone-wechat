import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfig = {
  services: {
    redpacket: { port: 4009, host: '0.0.0.0' },
  },
};

let capturedHandler: ((req: any, res: any) => void) | null = null;
let capturedPort: number | null = null;

vi.mock('@wechat-clone/shared', () => ({
  loadConfig: vi.fn(() => mockConfig),
  ErrorCode: {
    SUCCESS: 0,
    INVALID_PARAM: 1001,
    NOT_FOUND: 1004,
    UNAUTHORIZED: 2000,
    INTERNAL_ERROR: 1003,
    RED_PACKET_NOT_FOUND: 8000,
    RED_PACKET_EXPIRED: 8001,
    RED_PACKET_FINISHED: 8002,
    RED_PACKET_ALREADY_OPENED: 8003,
    RED_PACKET_INSUFFICIENT_BALANCE: 8004,
  },
}));

const mockService = {
  sendRedPacket: vi.fn(),
  openRedPacket: vi.fn(),
  getRedPacket: vi.fn(),
  getRedPacketHistory: vi.fn(),
  getReceivedHistory: vi.fn(),
  expireRedPackets: vi.fn(),
  hasOpened: vi.fn(),
};

vi.mock('./redpacket.service', () => ({
  createRedPacketService: vi.fn(() => mockService),
  RedPacketError: class RedPacketError extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

vi.mock('ioredis', () => ({
  default: vi.fn(function () {
    return { connect: vi.fn(), quit: vi.fn() };
  }),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(function () {
    return { $disconnect: vi.fn() };
  }),
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
          return { on: vi.fn(), close: vi.fn((cb: () => void) => { cb(); }) };
        }),
      };
    }),
  };
});

vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(process, 'on').mockImplementation(() => process);
vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

await import('./server');

function makeReq(method = 'GET', url = '/', headers: Record<string, string> = {}) {
  return { method, url, headers, on: vi.fn() };
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

function parseBody(res: any): Record<string, unknown> {
  try { return JSON.parse(res._body); } catch { return {}; }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('server-redpacket HTTP server', () => {
  it('starts on configured port', () => {
    expect(capturedPort).toBe(4009);
  });

  it('returns health check', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/health'), res);
    const body = parseBody(res);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('redpacket');
  });

  it('responds 204 to OPTIONS', () => {
    const res = makeRes();
    capturedHandler!(makeReq('OPTIONS', '/'), res);
    expect(res._statusCode).toBe(204);
  });

  it('returns 404 for unknown routes', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/api/unknown'), res);
    expect(res._statusCode).toBe(404);
  });

  describe('POST /api/redpacket/send', () => {
    it('creates a red packet', async () => {
      mockService.sendRedPacket.mockResolvedValue({
        id: 'rp1',
        senderId: 'u1',
        totalAmount: 10,
        totalCount: 5,
        remainingCount: 5,
        remainingAmount: 10,
        type: 'random',
        status: 'active',
        blessing: '恭喜',
        expiredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      const res = makeRes();
      const req = makeReq('POST', '/api/redpacket/send', { 'x-user-id': 'u1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data')
          cb(Buffer.from(JSON.stringify({ totalAmount: 10, totalCount: 5, type: 'random', blessing: '恭喜' })));
        if (event === 'end') cb();
        return req;
      });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
      expect(res._statusCode).toBe(201);
    });
  });

  describe('POST /api/redpacket/open/:id', () => {
    it('opens a red packet', async () => {
      mockService.openRedPacket.mockResolvedValue({
        amount: 2.0,
        packet: { id: 'rp1', status: 'active', remainingCount: 4 },
      });

      const res = makeRes();
      const req = makeReq('POST', '/api/redpacket/open/rp1', { 'x-user-id': 'u2' });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
      expect(mockService.openRedPacket).toHaveBeenCalledWith('rp1', 'u2');
    });
  });

  describe('GET /api/redpacket/:id', () => {
    it('returns packet detail', async () => {
      mockService.getRedPacket.mockResolvedValue({
        id: 'rp1',
        senderId: 'u1',
        totalAmount: 10,
        totalCount: 5,
        remainingCount: 3,
        remainingAmount: 6,
        type: 'random',
        status: 'active',
        blessing: '恭喜',
        expiredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        records: [],
      });

      const res = makeRes();
      await capturedHandler!(makeReq('GET', '/api/redpacket/rp1'), res);
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
    });
  });

  describe('GET /api/redpacket/history/sent', () => {
    it('returns sent history', async () => {
      mockService.getRedPacketHistory.mockResolvedValue({
        list: [],
        total: 0,
      });

      const res = makeRes();
      const req = makeReq('GET', '/api/redpacket/history/sent?page=1&pageSize=20', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
    });
  });

  describe('GET /api/redpacket/history/received', () => {
    it('returns received history', async () => {
      mockService.getReceivedHistory.mockResolvedValue({
        list: [],
        total: 0,
      });

      const res = makeRes();
      const req = makeReq('GET', '/api/redpacket/history/received?page=1&pageSize=20', { 'x-user-id': 'u1' });
      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
    });
  });

  describe('POST /api/redpacket/expire', () => {
    it('expires old red packets', async () => {
      mockService.expireRedPackets.mockResolvedValue(3);

      const res = makeRes();
      const req = makeReq('POST', '/api/redpacket/expire');
      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
      expect(body.data).toEqual({ expiredCount: 3 });
    });
  });
});
