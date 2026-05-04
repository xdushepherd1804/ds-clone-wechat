import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

// ─── Test helpers ──────────────────────────────────────────────────────────

/**
 * Create a valid HS256 JWT for testing.
 * Mirrors the format expected by verifyJwt.
 */
function makeToken(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

/** Create a mock TCP socket */
function makeSocket() {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {};
  let destroyed = false;
  let writable = true;
  const written: Buffer[] = [];

  return {
    listeners,
    written,
    destroyed: false,
    writable: true,
    write: vi.fn(function (this: any, data: Buffer | string) {
      if (this.destroyed || !this.writable) return false;
      written.push(Buffer.isBuffer(data) ? data : Buffer.from(data as string));
      return true;
    }),
    destroy: vi.fn(function (this: any) {
      this.destroyed = true;
      this.writable = false;
    }),
    on: vi.fn(function (this: any, event: string, handler: (...args: any[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
      return this;
    }),
    emit(event: string, ...args: any[]) {
      const handlers = listeners[event] || [];
      for (const h of handlers) h(...args);
    },
    removeAllListeners() {
      for (const key of Object.keys(listeners)) delete listeners[key];
    },
  };
}

/** Create a mock IncomingMessage for upgrade */
function makeUpgradeReq(url = '/ws', headers: Record<string, string> = {}) {
  return {
    url,
    headers: {
      'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
      ...headers,
    },
    method: 'GET',
    httpVersion: '1.1',
  };
}

/** Mask a payload per WebSocket protocol (client→server masking) */
function maskPayload(payload: Buffer, maskKey?: Buffer): { masked: Buffer; key: Buffer } {
  const key = maskKey ?? Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ key[i % 4];
  }
  return { masked, key };
}

/**
 * Build a complete WebSocket frame (client→server, masked).
 * Only supports payload < 126 bytes for simplicity.
 */
function makeClientFrame(opcode: number, payload: Buffer): Buffer {
  const { masked, key } = maskPayload(payload);
  const header = Buffer.alloc(2 + 4); // 2 header + 4 mask key
  header[0] = 0x80 | opcode; // FIN + opcode
  header[1] = 0x80 | payload.length; // MASK + length
  key.copy(header, 2);
  return Buffer.concat([header, masked]);
}

/** Build a client ping frame */
function makeClientPingFrame(): Buffer {
  return makeClientFrame(0x9, Buffer.from('ping'));
}

/** Build a client pong frame */
function makeClientPongFrame(): Buffer {
  return makeClientFrame(0xa, Buffer.from('pong'));
}

/** Build a client text frame */
function makeClientTextFrame(text: string): Buffer {
  return makeClientFrame(0x1, Buffer.from(text, 'utf-8'));
}

/** Build a client close frame */
function makeClientCloseFrame(code = 1000): Buffer {
  const body = Buffer.alloc(2);
  body.writeUInt16BE(code, 0);
  return makeClientFrame(0x8, body);
}

// ─── Imports (must be after hoisted mocks for the server test compatibility) ─

import {
  WsGateway,
  ConnectionManager,
  routeMessage,
} from './ws-gateway';
import {
  encodeTextFrame,
  encodeCloseFrame,
  encodePingFrame,
  encodePongFrame,
  decodeFrame,
  Opcode,
} from './ws-frame';

const JWT_SECRET = 'test-jwt-secret-for-ws-tests';

// ─── Tests: ConnectionManager ──────────────────────────────────────────────

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = new ConnectionManager(5);
  });

  describe('add / remove', () => {
    it('adds a connection and returns it', () => {
      const socket = makeSocket() as any;
      const conn = manager.add('user-1', 'alice', socket);
      expect(conn).not.toBeNull();
      expect(conn!.uid).toBe('user-1');
      expect(conn!.username).toBe('alice');
      expect(conn!.connId).toContain('user-1');
    });

    it('removes a connection by reference', () => {
      const socket = makeSocket() as any;
      const conn = manager.add('user-1', 'alice', socket)!;
      manager.remove(conn);
      expect(manager.getConnections('user-1')).toHaveLength(0);
    });

    it('removes a connection by connId', () => {
      const socket = makeSocket() as any;
      const conn = manager.add('user-1', 'alice', socket)!;
      manager.remove(conn.connId);
      expect(manager.getConnections('user-1')).toHaveLength(0);
    });

    it('handles removing non-existent connection gracefully', () => {
      expect(() => manager.remove('nonexistent')).not.toThrow();
    });
  });

  describe('max connections per user', () => {
    it('allows up to maxPerUser connections for one user', () => {
      const conns = [];
      for (let i = 0; i < 5; i++) {
        const conn = manager.add('user-1', 'alice', makeSocket() as any);
        expect(conn).not.toBeNull();
        conns.push(conn);
      }
      expect(manager.getConnections('user-1')).toHaveLength(5);
    });

    it('returns null when user exceeds max connections', () => {
      for (let i = 0; i < 5; i++) {
        manager.add('user-1', 'alice', makeSocket() as any);
      }
      const conn = manager.add('user-1', 'alice', makeSocket() as any);
      expect(conn).toBeNull();
    });

    it('frees slot after removing a connection', () => {
      for (let i = 0; i < 5; i++) {
        manager.add('user-1', 'alice', makeSocket() as any);
      }
      const conns = manager.getConnections('user-1');
      manager.remove(conns[0]);
      const conn = manager.add('user-1', 'alice', makeSocket() as any);
      expect(conn).not.toBeNull();
    });
  });

  describe('multi-user / multi-device', () => {
    it('tracks connections across different users independently', () => {
      manager.add('user-1', 'alice', makeSocket() as any);
      manager.add('user-2', 'bob', makeSocket() as any);
      manager.add('user-2', 'bob', makeSocket() as any);

      expect(manager.getConnections('user-1')).toHaveLength(1);
      expect(manager.getConnections('user-2')).toHaveLength(2);
    });

    it('reports correct stats', () => {
      manager.add('user-1', 'alice', makeSocket() as any);
      manager.add('user-2', 'bob', makeSocket() as any);
      manager.add('user-2', 'bob', makeSocket() as any);

      const stats = manager.getStats();
      expect(stats.totalConnections).toBe(3);
      expect(stats.uniqueUsers).toBe(2);
    });
  });

  describe('getById', () => {
    it('returns connection by id', () => {
      const conn = manager.add('user-1', 'alice', makeSocket() as any)!;
      const found = manager.getById(conn.connId);
      expect(found).toBeDefined();
      expect(found!.uid).toBe('user-1');
    });

    it('returns undefined for unknown id', () => {
      expect(manager.getById('nonexistent')).toBeUndefined();
    });
  });

  describe('closeAll / closeAllForUser', () => {
    it('closes all connections for a specific user', () => {
      const s1 = makeSocket();
      const s2 = makeSocket();
      manager.add('user-1', 'alice', s1 as any);
      manager.add('user-2', 'bob', s2 as any);

      manager.closeAllForUser('user-1');
      expect(manager.getConnections('user-1')).toHaveLength(0);
      expect(manager.getConnections('user-2')).toHaveLength(1);
    });

    it('closes all connections', () => {
      manager.add('user-1', 'alice', makeSocket() as any);
      manager.add('user-2', 'bob', makeSocket() as any);

      manager.closeAll();
      expect(manager.getStats().totalConnections).toBe(0);
    });
  });
});

// ─── Tests: WebSocket frames ───────────────────────────────────────────────

describe('WebSocket frame encoding/decoding', () => {
  describe('encodeTextFrame', () => {
    it('produces a valid unmasked text frame', () => {
      const frame = encodeTextFrame('hello');
      // FIN=1, opcode=1 (text), no mask, length=5
      expect(frame[0]).toBe(0x81);
      expect(frame[1]).toBe(5);
      expect(frame.subarray(2).toString()).toBe('hello');
    });
  });

  describe('encodeCloseFrame', () => {
    it('produces a valid close frame with status code', () => {
      const frame = encodeCloseFrame(1000, 'bye');
      expect(frame[0]).toBe(0x88); // FIN + CLOSE
      expect(frame.subarray(2, 4).readUInt16BE(0)).toBe(1000);
      expect(frame.subarray(4).toString()).toBe('bye');
    });
  });

  describe('encodePingFrame', () => {
    it('produces an empty ping frame', () => {
      const frame = encodePingFrame();
      expect(frame[0]).toBe(0x89);
      expect(frame[1]).toBe(0);
    });
  });

  describe('encodePongFrame', () => {
    it('produces a pong frame with payload', () => {
      const frame = encodePongFrame(Buffer.from('data'));
      expect(frame[0]).toBe(0x8a);
      expect(frame[1]).toBe(4);
    });
  });

  describe('decodeFrame', () => {
    it('decodes a masked text frame correctly', () => {
      const text = JSON.stringify({ cmd: 'heartbeat', seq: 1, body: {} });
      const frame = makeClientTextFrame(text);

      const result = decodeFrame(frame);
      expect(result).not.toBeNull();
      expect(result!.frame.opcode).toBe(Opcode.TEXT);
      expect(result!.frame.payload.toString()).toBe(text);
      expect(result!.consumed).toBe(frame.length);
    });

    it('decodes a masked ping frame', () => {
      const frame = makeClientPingFrame();
      const result = decodeFrame(frame);
      expect(result).not.toBeNull();
      expect(result!.frame.opcode).toBe(Opcode.PING);
    });

    it('decodes a masked pong frame', () => {
      const frame = makeClientPongFrame();
      const result = decodeFrame(frame);
      expect(result).not.toBeNull();
      expect(result!.frame.opcode).toBe(Opcode.PONG);
    });

    it('returns null for incomplete frame', () => {
      const text = JSON.stringify({ cmd: 'send_msg', seq: 1, body: {} });
      const full = makeClientTextFrame(text);
      const partial = full.subarray(0, 3); // incomplete header
      expect(decodeFrame(partial)).toBeNull();
    });

    it('decodes frames from a buffer with multiple frames', () => {
      const f1 = makeClientTextFrame(JSON.stringify({ cmd: 'heartbeat', seq: 1, body: {} }));
      const f2 = makeClientPingFrame();
      const buffer = Buffer.concat([f1, f2]);

      const r1 = decodeFrame(buffer);
      expect(r1).not.toBeNull();
      expect(r1!.frame.opcode).toBe(Opcode.TEXT);

      const remaining = buffer.subarray(r1!.consumed);
      const r2 = decodeFrame(remaining);
      expect(r2).not.toBeNull();
      expect(r2!.frame.opcode).toBe(Opcode.PING);
    });
  });
});

// ─── Tests: routeMessage ───────────────────────────────────────────────────

describe('routeMessage', () => {
  it('routes send_msg to target user', () => {
    const result = routeMessage(
      { cmd: 'send_msg', seq: 1, body: { chatType: 'private', toUid: 'user-2', content: 'hi' } },
      'user-1',
    );
    expect(result).not.toBeNull();
    expect(result!.targets).toEqual(['user-2']);
    expect(result!.response.cmd).toBe('new_msg');
    expect(result!.response.fromUid).toBe('user-1');
  });

  it('routes send_msg to group', () => {
    const result = routeMessage(
      { cmd: 'send_msg', seq: 2, body: { chatType: 'group', toGroupId: 'group-1', content: 'hello' } },
      'user-1',
    );
    expect(result).not.toBeNull();
    expect(result!.targets).toEqual(['group-1']);
  });

  it('returns null for send_msg without target', () => {
    const result = routeMessage(
      { cmd: 'send_msg', seq: 1, body: { content: 'hi' } },
      'user-1',
    );
    expect(result).toBeNull();
  });

  it('routes typing to target user', () => {
    const result = routeMessage(
      { cmd: 'typing', seq: 3, body: { chatType: 'private', toUid: 'user-2', isTyping: true } },
      'user-1',
    );
    expect(result).not.toBeNull();
    expect(result!.targets).toEqual(['user-2']);
  });

  it('routes read to target user', () => {
    const result = routeMessage(
      { cmd: 'read', seq: 4, body: { toUid: 'user-2', msgId: 'msg-1' } },
      'user-1',
    );
    expect(result).not.toBeNull();
    expect(result!.targets).toEqual(['user-2']);
  });

  it('returns null for heartbeat', () => {
    const result = routeMessage(
      { cmd: 'heartbeat', seq: 5, body: {} },
      'user-1',
    );
    expect(result).toBeNull();
  });

  it('returns null for ack_msg', () => {
    const result = routeMessage(
      { cmd: 'ack_msg', seq: 6, body: { msgId: 'msg-1' } },
      'user-1',
    );
    expect(result).toBeNull();
  });
});

// ─── Tests: WsGateway ──────────────────────────────────────────────────────

describe('WsGateway', () => {
  let gateway: WsGateway;
  let onlineStatus: { setOnline: ReturnType<typeof vi.fn>; setOffline: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    onlineStatus = {
      setOnline: vi.fn(),
      setOffline: vi.fn(),
    };
    gateway = new WsGateway({
      jwtSecret: JWT_SECRET,
      maxConnectionsPerUser: 5,
      heartbeatTimeoutMs: 500,  // short for testing
      pingIntervalMs: 1000,     // won't trigger in tests (use fake timers if needed)
      onlineStatus,
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    gateway.shutdown();
    vi.restoreAllMocks();
  });

  // ─── Test standard #1: Valid token establishes connection ──────────────

  describe('connection — valid token', () => {
    it('establishes WebSocket connection with valid JWT token', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-1',
        username: 'alice',
        type: 'access',
        iat: now,
        exp: now + 3600,
      }, JWT_SECRET);

      const socket = makeSocket();
      const req = makeUpgradeReq(`/ws?token=${token}`);

      gateway.handleUpgrade(req as any, socket as any, Buffer.alloc(0));

      // Should complete handshake (write 101 response)
      const handshakeResponse = socket.written[0]?.toString() ?? '';
      expect(handshakeResponse).toContain('101 Switching Protocols');
      expect(handshakeResponse).toContain('Upgrade: websocket');

      // Should register connection
      expect(gateway.connectionManager.getTotalConnections()).toBe(1);

      // Should set online status
      expect(onlineStatus.setOnline).toHaveBeenCalledWith('user-1');
    });

    it('generates unique connId for each connection', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      const s1 = makeSocket();
      const s2 = makeSocket();
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, s1 as any, Buffer.alloc(0));
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, s2 as any, Buffer.alloc(0));

      const conns = gateway.connectionManager.getConnections('user-1');
      expect(conns).toHaveLength(2);
      expect(conns[0].connId).not.toBe(conns[1].connId);
    });
  });

  // ─── Test standard #2: Invalid token rejects connection ────────────────

  describe('connection — invalid token', () => {
    it('rejects connection when no token provided', () => {
      const socket = makeSocket();
      gateway.handleUpgrade(makeUpgradeReq('/ws') as any, socket as any, Buffer.alloc(0));

      const response = socket.written[0]?.toString() ?? '';
      expect(response).toContain('401');
      expect(response).toContain('missing token');
      expect(gateway.connectionManager.getTotalConnections()).toBe(0);
    });

    it('rejects connection with invalid JWT signature', () => {
      const badToken = 'header.eyJzdWIiOiJ1c2VyLTEifQ.badsig';
      const socket = makeSocket();
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${badToken}`) as any, socket as any, Buffer.alloc(0));

      const response = socket.written[0]?.toString() ?? '';
      expect(response).toContain('401');
      expect(gateway.connectionManager.getTotalConnections()).toBe(0);
    });

    it('rejects connection with expired token', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-1', username: 'alice', type: 'access', iat: now - 7200, exp: now - 3600,
      }, JWT_SECRET);

      const socket = makeSocket();
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, socket as any, Buffer.alloc(0));

      const response = socket.written[0]?.toString() ?? '';
      expect(response).toContain('401');
      expect(response).toContain('token expired');
      expect(gateway.connectionManager.getTotalConnections()).toBe(0);
    });

    it('rejects connection when token type is refresh', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-1', username: 'alice', type: 'refresh', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      const socket = makeSocket();
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, socket as any, Buffer.alloc(0));

      const response = socket.written[0]?.toString() ?? '';
      expect(response).toContain('401');
      expect(response).toContain('access token required');
    });

    it('destroys socket for non-/ws upgrade requests', () => {
      const socket = makeSocket();
      gateway.handleUpgrade(makeUpgradeReq('/other') as any, socket as any, Buffer.alloc(0));
      expect(socket.destroyed).toBe(true);
    });
  });

  // ─── Test standard #3: Heartbeat timeout disconnects ──────────────────

  describe('heartbeat', () => {
    it('keeps connection alive when client sends ping frames', async () => {
      vi.useFakeTimers();
      try {
        const now = Math.floor(Date.now() / 1000);
        const token = makeToken({
          sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
        }, JWT_SECRET);

        const socket = makeSocket();
        gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, socket as any, Buffer.alloc(0));

        expect(gateway.connectionManager.getTotalConnections()).toBe(1);

        // Advance time almost to timeout and send a ping
        vi.advanceTimersByTime(400);
        socket.emit('data', makeClientPingFrame());

        // Advance past original timeout — should still be connected
        vi.advanceTimersByTime(400);
        expect(gateway.connectionManager.getTotalConnections()).toBe(1); // ping refreshed timer

        // Now let it fully time out
        vi.advanceTimersByTime(600);
        expect(gateway.connectionManager.getTotalConnections()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('disconnects after heartbeat timeout with no ping', async () => {
      vi.useFakeTimers();
      try {
        const now = Math.floor(Date.now() / 1000);
        const token = makeToken({
          sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
        }, JWT_SECRET);

        const socket = makeSocket();
        gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, socket as any, Buffer.alloc(0));

        expect(gateway.connectionManager.getTotalConnections()).toBe(1);

        // Advance past heartbeat timeout
        vi.advanceTimersByTime(600);
        expect(gateway.connectionManager.getTotalConnections()).toBe(0);
        expect(onlineStatus.setOffline).toHaveBeenCalledWith('user-1');
      } finally {
        vi.useRealTimers();
      }
    });

    it('responds to client ping with pong', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      const socket = makeSocket();
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, socket as any, Buffer.alloc(0));
      socket.written.length = 0; // clear handshake response

      socket.emit('data', makeClientPingFrame());

      // Should have sent a pong frame back
      const frames = socket.written;
      expect(frames.length).toBeGreaterThan(0);
      // Check pong opcode in response
      const pongFrame = frames[0];
      expect(pongFrame[0] & 0x0f).toBe(Opcode.PONG);
    });

    it('responds to JSON heartbeat with ack', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      const socket = makeSocket();
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, socket as any, Buffer.alloc(0));
      socket.written.length = 0;

      const heartbeatMsg = JSON.stringify({ cmd: 'heartbeat', seq: 42, body: {} });
      socket.emit('data', makeClientTextFrame(heartbeatMsg));

      const frames = socket.written;
      expect(frames.length).toBeGreaterThan(0);

      // Decode the text frame we sent back
      const responseFrame = frames[0];
      const result = decodeFrame(responseFrame);
      expect(result).not.toBeNull();
      if (result) {
        const response = JSON.parse(result.frame.payload.toString());
        expect(response.cmd).toBe('ack');
        expect(response.seq).toBe(42);
        expect(response.body.type).toBe('heartbeat');
      }
    });
  });

  // ─── Test standard #4: Multi-device simultaneous connections ──────────

  describe('multi-device', () => {
    it('allows same user to connect from multiple devices', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      const devices = [makeSocket(), makeSocket(), makeSocket()];
      for (const sock of devices) {
        gateway.handleUpgrade(
          makeUpgradeReq(`/ws?token=${token}`) as any,
          sock as any,
          Buffer.alloc(0),
        );
      }

      expect(gateway.connectionManager.getConnections('user-1')).toHaveLength(3);
      expect(gateway.connectionManager.getTotalConnections()).toBe(3);

      // onlineStatus.setOnline should be called for each connection
      expect(onlineStatus.setOnline).toHaveBeenCalledTimes(3);
    });

    it('limits user to max 5 connections', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      for (let i = 0; i < 5; i++) {
        gateway.handleUpgrade(
          makeUpgradeReq(`/ws?token=${token}`) as any,
          makeSocket() as any,
          Buffer.alloc(0),
        );
      }

      // 6th connection should be rejected
      const socket6 = makeSocket();
      gateway.handleUpgrade(
        makeUpgradeReq(`/ws?token=${token}`) as any,
        socket6 as any,
        Buffer.alloc(0),
      );

      expect(gateway.connectionManager.getConnections('user-1')).toHaveLength(5);
    });

    it('only sets offline when all devices disconnect', async () => {
      vi.useFakeTimers();
      try {
        const now = Math.floor(Date.now() / 1000);
        const token = makeToken({
          sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
        }, JWT_SECRET);

        const s1 = makeSocket();
        const s2 = makeSocket();

        gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, s1 as any, Buffer.alloc(0));
        gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, s2 as any, Buffer.alloc(0));

        onlineStatus.setOffline.mockClear();

        // Disconnect only one device via heartbeat timeout
        // First, refresh s1 but not s2
        vi.advanceTimersByTime(200);
        s1.emit('data', makeClientPingFrame()); // refresh s1

        // s2 times out at 500ms
        vi.advanceTimersByTime(400);
        expect(gateway.connectionManager.getTotalConnections()).toBe(1); // only s1 remains, s2 timed out

        // User should still be "online" since s1 is connected
        expect(onlineStatus.setOffline).not.toHaveBeenCalled();

        // Now s1 also times out
        vi.advanceTimersByTime(400);
        expect(gateway.connectionManager.getTotalConnections()).toBe(0);
        expect(onlineStatus.setOffline).toHaveBeenCalledWith('user-1');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  // ─── Test standard #5: Message routing to target user ──────────────────

  describe('message routing', () => {
    it('routes send_msg to target user connection', () => {
      const now = Math.floor(Date.now() / 1000);
      const token1 = makeToken({
        sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);
      const token2 = makeToken({
        sub: 'user-2', username: 'bob', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      const s1 = makeSocket();
      const s2 = makeSocket();

      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token1}`) as any, s1 as any, Buffer.alloc(0));
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token2}`) as any, s2 as any, Buffer.alloc(0));

      // Clear handshake response buffers
      s1.written.length = 0;
      s2.written.length = 0;

      // User-1 sends a message to user-2
      const sendMsg = JSON.stringify({
        cmd: 'send_msg',
        seq: 1,
        body: { chatType: 'private', toUid: 'user-2', msgType: 1, content: 'Hello Bob', clientSeq: 100 },
      });
      s1.emit('data', makeClientTextFrame(sendMsg));

      // User-1 should get an ack
      const ackFrames = s1.written;
      expect(ackFrames.length).toBeGreaterThan(0);
      const ackResult = decodeFrame(ackFrames[0]);
      if (ackResult) {
        const ackBody = JSON.parse(ackResult.frame.payload.toString());
        expect(ackBody.cmd).toBe('ack');
        expect(ackBody.seq).toBe(1);
        expect(ackBody.body.status).toBe('delivered');
      }

      // User-2 should receive the new_msg
      const msgFrames = s2.written;
      expect(msgFrames.length).toBeGreaterThan(0);
      const msgResult = decodeFrame(msgFrames[0]);
      if (msgResult) {
        const msgBody = JSON.parse(msgResult.frame.payload.toString());
        expect(msgBody.cmd).toBe('new_msg');
        expect(msgBody.body.fromUid).toBe('user-1');
        expect(msgBody.body.content).toBe('Hello Bob');
      }
    });

    it('pushToUser sends to all devices of target user', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-2', username: 'bob', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      const device1 = makeSocket();
      const device2 = makeSocket();

      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, device1 as any, Buffer.alloc(0));
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, device2 as any, Buffer.alloc(0));

      device1.written.length = 0;
      device2.written.length = 0;

      const sent = gateway.pushToUser('user-2', { cmd: 'new_msg', seq: 1, body: { text: 'hello' } });

      expect(sent).toBe(2);
      expect(device1.written.length).toBeGreaterThan(0);
      expect(device2.written.length).toBeGreaterThan(0);
    });

    it('returns 0 when target user has no connections', () => {
      const sent = gateway.pushToUser('nonexistent', { cmd: 'new_msg', seq: 1, body: {} });
      expect(sent).toBe(0);
    });

    it('handles close frame from client', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      const socket = makeSocket();
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, socket as any, Buffer.alloc(0));

      expect(gateway.connectionManager.getTotalConnections()).toBe(1);

      socket.emit('data', makeClientCloseFrame(1000));

      expect(gateway.connectionManager.getTotalConnections()).toBe(0);
      expect(onlineStatus.setOffline).toHaveBeenCalledWith('user-1');
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('ignores malformed JSON in text frames', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      const socket = makeSocket();
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, socket as any, Buffer.alloc(0));
      socket.written.length = 0;

      // Send malformed JSON — should not crash
      expect(() => {
        socket.emit('data', makeClientTextFrame('not-json'));
      }).not.toThrow();
    });

    it('rejects non-/ws path', () => {
      const socket = makeSocket();
      gateway.handleUpgrade(
        { url: '/api/messages', headers: {} } as any,
        socket as any,
        Buffer.alloc(0),
      );
      expect(socket.destroyed).toBe(true);
    });

    it('handles socket close event', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      const socket = makeSocket();
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, socket as any, Buffer.alloc(0));

      expect(gateway.connectionManager.getTotalConnections()).toBe(1);

      socket.emit('close');

      expect(gateway.connectionManager.getTotalConnections()).toBe(0);
      expect(onlineStatus.setOffline).toHaveBeenCalledWith('user-1');
    });

    it('handles socket error event', () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeToken({
        sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      const socket = makeSocket();
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token}`) as any, socket as any, Buffer.alloc(0));

      expect(gateway.connectionManager.getTotalConnections()).toBe(1);

      socket.emit('error', new Error('connection reset'));

      expect(gateway.connectionManager.getTotalConnections()).toBe(0);
    });

    it('shutdown closes all connections and updates online status', () => {
      const now = Math.floor(Date.now() / 1000);
      const token1 = makeToken({
        sub: 'user-1', username: 'alice', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);
      const token2 = makeToken({
        sub: 'user-2', username: 'bob', type: 'access', iat: now, exp: now + 3600,
      }, JWT_SECRET);

      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token1}`) as any, makeSocket() as any, Buffer.alloc(0));
      gateway.handleUpgrade(makeUpgradeReq(`/ws?token=${token2}`) as any, makeSocket() as any, Buffer.alloc(0));

      expect(gateway.connectionManager.getTotalConnections()).toBe(2);

      gateway.shutdown();

      expect(gateway.connectionManager.getTotalConnections()).toBe(0);
    });
  });
});
