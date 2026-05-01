import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockConfig = {
  services: { group: { port: 4004, host: '0.0.0.0' } },
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
    GROUP_NOT_FOUND: 5000,
    GROUP_PERMISSION_DENIED: 5001,
    GROUP_MEMBER_NOT_FOUND: 5003,
    GROUP_MEMBER_ALREADY_EXISTS: 5002,
  },
}));

const mockService = {
  createGroup: vi.fn(),
  getGroup: vi.fn(),
  updateGroup: vi.fn(),
  getMembers: vi.fn(),
  addMembers: vi.fn(),
  removeMember: vi.fn(),
  updateMemberRole: vi.fn(),
  updateMemberNickname: vi.fn(),
  dissolveGroup: vi.fn(),
  joinGroup: vi.fn(),
  approveJoin: vi.fn(),
  quitGroup: vi.fn(),
  setAnnouncement: vi.fn(),
  muteMember: vi.fn(),
  validateMentions: vi.fn(),
  isMuted: vi.fn(),
};

vi.mock('./group.service', () => ({
  createGroupService: vi.fn(() => mockService),
  GroupError: class GroupError extends Error {
    code: number;
    constructor(code: number, message: string) {
      super(message);
      this.code = code;
    }
  },
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

describe('server-group HTTP server', () => {
  it('starts on configured port', () => {
    expect(capturedPort).toBe(4004);
  });

  it('returns health check', () => {
    const res = makeRes();
    capturedHandler!(makeReq('GET', '/health'), res);
    const body = parseBody(res);
    expect(body.status).toBe('ok');
    expect(body.service).toBe('group');
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

  describe('POST /api/groups/create', () => {
    it('creates a group and returns 201', async () => {
      mockService.createGroup.mockResolvedValue({
        id: 'g1', name: 'Test', ownerId: 'u1', memberCount: 1,
      });
      const res = makeRes();
      const req = makeReq('POST', '/api/groups/create', { 'x-user-id': 'u1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ name: 'Test', memberIds: ['u2'] })));
        if (event === 'end') cb();
        return req;
      });

      await capturedHandler!(req, res);
      // Wait for async handling
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
    });
  });

  describe('GET /api/groups/:id', () => {
    it('returns group details', async () => {
      mockService.getGroup.mockResolvedValue({
        id: 'g1', name: 'Test', ownerId: 'u1', memberCount: 3,
      });
      const res = makeRes();
      await capturedHandler!(makeReq('GET', '/api/groups/g1'), res);
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
    });
  });

  describe('DELETE /api/groups/:id', () => {
    it('dissolves group when owner calls', async () => {
      mockService.dissolveGroup.mockResolvedValue(undefined);
      const res = makeRes();
      const req = makeReq('DELETE', '/api/groups/g1', { 'x-user-id': 'u1' });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
      expect(mockService.dissolveGroup).toHaveBeenCalledWith('g1', 'u1');
    });
  });

  describe('PUT /api/groups/:id', () => {
    it('updates group info', async () => {
      mockService.updateGroup.mockResolvedValue({
        id: 'g1', name: 'New Name', ownerId: 'u1',
      });
      const res = makeRes();
      const req = makeReq('PUT', '/api/groups/g1', { 'x-user-id': 'u1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ name: 'New Name' })));
        if (event === 'end') cb();
        return req;
      });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
    });
  });

  describe('GET /api/groups/:id/members', () => {
    it('returns member list', async () => {
      mockService.getMembers.mockResolvedValue([
        { id: 'm1', groupId: 'g1', userId: 'u1', role: 'owner' },
      ]);
      const res = makeRes();
      await capturedHandler!(makeReq('GET', '/api/groups/g1/members'), res);
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
    });
  });

  describe('POST /api/groups/:id/members', () => {
    it('adds members', async () => {
      mockService.addMembers.mockResolvedValue(undefined);
      const res = makeRes();
      const req = makeReq('POST', '/api/groups/g1/members', { 'x-user-id': 'u1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ userIds: ['u2', 'u3'] })));
        if (event === 'end') cb();
        return req;
      });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockService.addMembers).toHaveBeenCalledWith({
        groupId: 'g1', userIds: ['u2', 'u3'], operatorId: 'u1',
      });
    });
  });

  describe('DELETE /api/groups/:id/members/:uid', () => {
    it('removes a member', async () => {
      mockService.removeMember.mockResolvedValue(undefined);
      const res = makeRes();
      const req = makeReq('DELETE', '/api/groups/g1/members/u2', { 'x-user-id': 'u1' });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockService.removeMember).toHaveBeenCalledWith({
        groupId: 'g1', userId: 'u2', operatorId: 'u1',
      });
    });
  });

  describe('PUT /api/groups/:id/members/:uid/role', () => {
    it('updates member role', async () => {
      mockService.updateMemberRole.mockResolvedValue({
        id: 'm2', groupId: 'g1', userId: 'u2', role: 'admin',
      });
      const res = makeRes();
      const req = makeReq('PUT', '/api/groups/g1/members/u2/role', { 'x-user-id': 'u1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ role: 'admin' })));
        if (event === 'end') cb();
        return req;
      });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockService.updateMemberRole).toHaveBeenCalledWith({
        groupId: 'g1', userId: 'u2', role: 'admin', operatorId: 'u1',
      });
    });
  });

  describe('POST /api/groups/:id/join', () => {
    it('requests to join a group', async () => {
      mockService.joinGroup.mockResolvedValue({
        id: 'jr1', groupId: 'g1', userId: 'u1', status: 'pending',
      });
      const res = makeRes();
      const req = makeReq('POST', '/api/groups/g1/join', { 'x-user-id': 'u1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ message: 'hi' })));
        if (event === 'end') cb();
        return req;
      });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
      expect(mockService.joinGroup).toHaveBeenCalledWith('g1', 'u1', 'hi');
    });
  });

  describe('PUT /api/groups/:id/join/:uid', () => {
    it('approves join request', async () => {
      mockService.approveJoin.mockResolvedValue(undefined);
      const res = makeRes();
      const req = makeReq('PUT', '/api/groups/g1/join/u2', { 'x-user-id': 'u1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ action: 'approve' })));
        if (event === 'end') cb();
        return req;
      });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockService.approveJoin).toHaveBeenCalledWith('g1', 'u2', 'u1', 'approve');
    });
  });

  describe('POST /api/groups/:id/quit', () => {
    it('quits a group', async () => {
      mockService.quitGroup.mockResolvedValue(undefined);
      const res = makeRes();
      const req = makeReq('POST', '/api/groups/g1/quit', { 'x-user-id': 'u1' });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockService.quitGroup).toHaveBeenCalledWith('g1', 'u1');
    });
  });

  describe('PUT /api/groups/:id/announcement', () => {
    it('sets group announcement', async () => {
      mockService.setAnnouncement.mockResolvedValue({
        id: 'g1', announcement: 'New announcement',
      });
      const res = makeRes();
      const req = makeReq('PUT', '/api/groups/g1/announcement', { 'x-user-id': 'u1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ announcement: 'New announcement' })));
        if (event === 'end') cb();
        return req;
      });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockService.setAnnouncement).toHaveBeenCalledWith('g1', 'u1', 'New announcement');
    });
  });

  describe('PUT /api/groups/:id/mute/:uid', () => {
    it('mutes a member', async () => {
      mockService.muteMember.mockResolvedValue(undefined);
      const res = makeRes();
      const req = makeReq('PUT', '/api/groups/g1/mute/u2', { 'x-user-id': 'u1' });
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({ durationMinutes: 30 })));
        if (event === 'end') cb();
        return req;
      });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      expect(mockService.muteMember).toHaveBeenCalledWith({
        groupId: 'g1', userId: 'u2', operatorId: 'u1', durationMinutes: 30,
      });
    });
  });

  describe('POST /api/groups/:id/mentions/validate', () => {
    it('validates mentions', async () => {
      mockService.validateMentions.mockResolvedValue({
        valid: true, mentionedUserIds: ['u2', 'u3'],
      });
      const res = makeRes();
      const req = makeReq('POST', '/api/groups/g1/mentions/validate');
      req.on = vi.fn((event: string, cb: Function) => {
        if (event === 'data') cb(Buffer.from(JSON.stringify({
          senderId: 'u1', mentions: ['u2', 'u3'],
        })));
        if (event === 'end') cb();
        return req;
      });

      await capturedHandler!(req, res);
      await new Promise((r) => setTimeout(r, 10));

      const body = parseBody(res);
      expect(body.code).toBe(0);
    });
  });
});
