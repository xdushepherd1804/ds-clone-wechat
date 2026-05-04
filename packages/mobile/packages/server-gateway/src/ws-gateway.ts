/**
 * WebSocket Gateway — connection management, heartbeat, message routing.
 *
 *   Client → WS Gateway → verify JWT → parse frame → route to target
 *   Message Service → WS Gateway → find connection → push to client
 */
import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { createHash } from 'node:crypto';
import { verifyJwt, JwtError } from './jwt-verify';
import {
  encodeFrame,
  encodeTextFrame,
  encodeCloseFrame,
  encodePongFrame,
  decodeFrame,
  sendFrame,
  Opcode,
} from './ws-frame';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WsGatewayOptions {
  jwtSecret: string;
  /** Max connections per user (default 5) */
  maxConnectionsPerUser?: number;
  /** Heartbeat timeout in ms (default 60_000) */
  heartbeatTimeoutMs?: number;
  /** Server ping interval in ms (default 30_000) */
  pingIntervalMs?: number;
  /** Online status manager */
  onlineStatus?: OnlineStatusManager;
}

export interface OnlineStatusManager {
  setOnline(uid: string): void;
  setOffline(uid: string): void;
}

export interface WsConnection {
  readonly connId: string;
  readonly uid: string;
  readonly username: string;
  readonly connectedAt: number;
  readonly socket: Socket;

  sendText(text: string): void;
  sendRaw(data: Buffer): void;
  close(code?: number, reason?: string): void;
}

export interface WsConnectionStats {
  totalConnections: number;
  uniqueUsers: number;
}

// ─── Connection wrapper ──────────────────────────────────────────────────────

class WsConnectionImpl implements WsConnection {
  readonly connId: string;
  readonly uid: string;
  readonly username: string;
  readonly connectedAt: number;
  readonly socket: Socket;

  private _closed = false;

  constructor(connId: string, uid: string, username: string, socket: Socket) {
    this.connId = connId;
    this.uid = uid;
    this.username = username;
    this.socket = socket;
    this.connectedAt = Date.now();
  }

  get closed(): boolean {
    return this._closed;
  }

  sendText(text: string): void {
    if (this._closed) return;
    sendFrame(this.socket, encodeTextFrame(text));
  }

  sendRaw(data: Buffer): void {
    if (this._closed) return;
    sendFrame(this.socket, data);
  }

  close(code = 1000, reason = ''): void {
    if (this._closed) return;
    this._closed = true;
    sendFrame(this.socket, encodeCloseFrame(code, reason));
    try {
      this.socket.destroy();
    } catch {
      // ignore
    }
  }
}

// ─── Connection Manager ──────────────────────────────────────────────────────

export class ConnectionManager {
  private connections = new Map<string, Set<WsConnectionImpl>>();
  private uidByConnId = new Map<string, string>();
  private connById = new Map<string, WsConnectionImpl>();
  private maxPerUser: number;
  private _nextId = 0;

  constructor(maxPerUser = 5) {
    this.maxPerUser = maxPerUser;
  }

  add(uid: string, username: string, socket: Socket): WsConnection | null {
    let userConns = this.connections.get(uid);
    if (!userConns) {
      userConns = new Set();
      this.connections.set(uid, userConns);
    }

    if (userConns.size >= this.maxPerUser) return null;

    const connId = `${uid}-${++this._nextId}-${Date.now()}`;
    const conn = new WsConnectionImpl(connId, uid, username, socket);

    userConns.add(conn);
    this.uidByConnId.set(connId, uid);
    this.connById.set(connId, conn);

    return conn;
  }

  remove(connOrId: WsConnection | string): void {
    const id = typeof connOrId === 'string' ? connOrId : connOrId.connId;
    const uid = this.uidByConnId.get(id);
    const conn = this.connById.get(id);
    if (!uid) return;

    const userConns = this.connections.get(uid);
    if (userConns && conn) {
      userConns.delete(conn);
      if (userConns.size === 0) this.connections.delete(uid);
    }

    this.uidByConnId.delete(id);
    this.connById.delete(id);
  }

  getConnections(uid: string): WsConnection[] {
    const set = this.connections.get(uid);
    return set ? [...set] : [];
  }

  getById(connId: string): WsConnection | undefined {
    return this.connById.get(connId);
  }

  getTotalConnections(): number {
    return this.connById.size;
  }

  getStats(): WsConnectionStats {
    return {
      totalConnections: this.connById.size,
      uniqueUsers: this.connections.size,
    };
  }

  closeAllForUser(uid: string): void {
    const conns = this.getConnections(uid);
    for (const conn of conns) {
      const id = conn.connId;
      this.uidByConnId.delete(id);
      this.connById.delete(id);
      (conn as WsConnectionImpl).close(1001, 'server shutdown');
    }
    this.connections.delete(uid);
  }

  closeAll(): void {
    for (const uid of [...this.connections.keys()]) {
      this.closeAllForUser(uid);
    }
  }
}

// ─── Call Session Manager ─────────────────────────────────────────────────────

interface CallSession {
  callId: string;
  callerUid: string;
  calleeUid: string;
  callType: 'audio' | 'video';
  createdAt: number;
}

class CallSessionManager {
  private sessions = new Map<string, CallSession>();

  create(callId: string, callerUid: string, calleeUid: string, callType: 'audio' | 'video'): CallSession {
    const session: CallSession = { callId, callerUid, calleeUid, callType, createdAt: Date.now() };
    this.sessions.set(callId, session);
    return session;
  }

  get(callId: string): CallSession | undefined {
    return this.sessions.get(callId);
  }

  remove(callId: string): void {
    this.sessions.delete(callId);
  }
}

// ─── Message router ──────────────────────────────────────────────────────────

interface ParsedRequest {
  cmd: string;
  seq: number;
  body: Record<string, unknown>;
}

export function routeMessage(
  parsed: ParsedRequest,
  fromUid: string,
  callSessions?: CallSessionManager,
): { targets: string[]; response: Record<string, unknown> } | null {
  switch (parsed.cmd) {
    case 'send_msg': {
      const body = parsed.body as {
        chatType?: 'private' | 'group';
        toUid?: string;
        toGroupId?: string;
        msgType?: number;
        content?: string;
        clientSeq?: number;
      };
      const target = body.chatType === 'group' ? body.toGroupId : body.toUid;
      if (!target) return null;
      return {
        targets: [target],
        response: {
          cmd: 'new_msg',
          fromUid,
          chatType: body.chatType ?? 'private',
          msgType: body.msgType ?? 0,
          content: body.content ?? '',
          clientSeq: body.clientSeq,
          serverSeq: parsed.seq,
        },
      };
    }

    case 'typing': {
      const body = parsed.body as {
        chatType?: 'private' | 'group';
        toUid?: string;
        toGroupId?: string;
        isTyping?: boolean;
      };
      const target = body.chatType === 'group' ? body.toGroupId : body.toUid;
      if (!target) return null;
      return {
        targets: [target],
        response: {
          cmd: 'typing',
          fromUid,
          chatType: body.chatType,
          isTyping: body.isTyping,
        },
      };
    }

    case 'read': {
      const body = parsed.body as { toUid?: string; msgId?: string };
      if (!body.toUid) return null;
      return {
        targets: [body.toUid],
        response: { cmd: 'read', fromUid, msgId: body.msgId },
      };
    }

    // ─── Call signaling ─────────────────────────────────────────────────

    case 'call_request': {
      if (!callSessions) return null;
      const body = parsed.body as {
        calleeUid?: string;
        calleeName?: string;
        callType?: 'audio' | 'video';
      };
      const calleeUid = body.calleeUid;
      if (!calleeUid) return null;

      const callId = `call_${fromUid}_${calleeUid}_${Date.now()}`;
      callSessions.create(callId, fromUid, calleeUid, body.callType ?? 'audio');

      return {
        targets: [calleeUid],
        response: {
          cmd: 'incoming_call',
          callId,
          callerUid: fromUid,
          callType: body.callType ?? 'audio',
        },
      };
    }

    case 'call_accept': {
      if (!callSessions) return null;
      const body = parsed.body as { callId?: string };
      const callId = body.callId;
      if (!callId) return null;

      const session = callSessions.get(callId);
      if (!session) return null;

      return {
        targets: [session.callerUid],
        response: {
          cmd: 'call_accept',
          callId,
          fromUid,
        },
      };
    }

    case 'call_reject': {
      if (!callSessions) return null;
      const body = parsed.body as { callId?: string; reason?: string };
      const callId = body.callId;
      if (!callId) return null;

      const session = callSessions.get(callId);
      if (!session) return null;

      callSessions.remove(callId);

      return {
        targets: [session.callerUid],
        response: {
          cmd: 'call_ended',
          callId,
          reason: 'rejected',
          fromUid,
        },
      };
    }

    case 'call_cancel': {
      if (!callSessions) return null;
      const body = parsed.body as { callId?: string };
      const callId = body.callId;
      if (!callId) return null;

      const session = callSessions.get(callId);
      if (!session) return null;

      callSessions.remove(callId);

      return {
        targets: [session.calleeUid],
        response: {
          cmd: 'call_ended',
          callId,
          reason: 'cancelled',
          fromUid,
        },
      };
    }

    case 'call_end': {
      if (!callSessions) return null;
      const body = parsed.body as { callId?: string };
      const callId = body.callId;
      if (!callId) return null;

      const session = callSessions.get(callId);
      if (!session) return null;

      const otherUid = session.callerUid === fromUid ? session.calleeUid : session.callerUid;
      callSessions.remove(callId);

      return {
        targets: [otherUid],
        response: {
          cmd: 'call_ended',
          callId,
          fromUid,
        },
      };
    }

    case 'offer_sdp':
    case 'answer_sdp':
    case 'ice_candidate': {
      if (!callSessions) return null;
      const body = parsed.body as { callId?: string; sdp?: string; candidate?: string; sdpMid?: string; sdpMLineIndex?: number };
      const callId = body.callId;
      if (!callId) return null;

      const session = callSessions.get(callId);
      if (!session) return null;

      const otherUid = session.callerUid === fromUid ? session.calleeUid : session.callerUid;

      const response: Record<string, unknown> = { cmd: parsed.cmd, callId };
      if (body.sdp) response.sdp = body.sdp;
      if (body.candidate) response.candidate = body.candidate;
      if (body.sdpMid !== undefined) response.sdpMid = body.sdpMid;
      if (body.sdpMLineIndex !== undefined) response.sdpMLineIndex = body.sdpMLineIndex;

      return {
        targets: [otherUid],
        response,
      };
    }

    case 'heartbeat':
    case 'ack_msg':
    default:
      return null;
  }
}

// ─── Gateway ─────────────────────────────────────────────────────────────────

export class WsGateway {
  readonly connectionManager: ConnectionManager;
  readonly callSessions: CallSessionManager;
  private jwtSecret: string;
  private heartbeatTimeoutMs: number;
  private pingIntervalMs: number;
  private onlineStatus?: OnlineStatusManager;

  constructor(options: WsGatewayOptions) {
    this.connectionManager = new ConnectionManager(options.maxConnectionsPerUser ?? 5);
    this.callSessions = new CallSessionManager();
    this.jwtSecret = options.jwtSecret;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 60_000;
    this.pingIntervalMs = options.pingIntervalMs ?? 30_000;
    this.onlineStatus = options.onlineStatus;
  }

  /** Handle an HTTP upgrade request */
  handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    const url = req.url ?? '/';

    if (!url.startsWith('/ws')) {
      socket.destroy();
      return;
    }

    // Extract token from query string
    let token: string | null = null;
    try {
      const queryIdx = url.indexOf('?');
      if (queryIdx >= 0) {
        const params = new URLSearchParams(url.slice(queryIdx));
        token = params.get('token');
      }
    } catch {
      // invalid URL
    }

    if (!token) {
      this.rejectUpgrade(socket, 4001, 'missing token');
      return;
    }

    let payload: { sub: string; username: string; type: string };
    try {
      payload = verifyJwt(token, this.jwtSecret);
      if (payload.type !== 'access') {
        this.rejectUpgrade(socket, 4002, 'access token required');
        return;
      }
    } catch (err) {
      if (err instanceof JwtError) {
        const code = err.message === 'token expired' ? 4003 : 4002;
        this.rejectUpgrade(socket, code, err.message);
        return;
      }
      this.rejectUpgrade(socket, 4002, 'auth failed');
      return;
    }

    // Perform WebSocket handshake
    this.completeHandshake(req, socket, head);

    // Register connection
    const conn = this.connectionManager.add(payload.sub, payload.username, socket);
    if (!conn) {
      this.sendCloseAndDestroy(socket, 1013, 'too many connections');
      return;
    }

    this.onlineStatus?.setOnline(payload.sub);

    // Setup unified data pipeline (heartbeat + message handling)
    this.setupConnection(conn as WsConnectionImpl);

    console.log(
      `[ws-gateway] connection established: uid=${payload.sub} connId=${conn.connId} total=${this.connectionManager.getTotalConnections()}`,
    );
  }

  /** Push a message to all connections of a target user */
  pushToUser(uid: string, message: Record<string, unknown>): number {
    const conns = this.connectionManager.getConnections(uid);
    const text = JSON.stringify(message);
    let sent = 0;
    for (const conn of conns) {
      (conn as WsConnectionImpl).sendText(text);
      sent++;
    }
    return sent;
  }

  /** Shutdown all connections */
  shutdown(): void {
    this.connectionManager.closeAll();
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private rejectUpgrade(socket: Socket, code: number, message: string): void {
    const body = JSON.stringify({ code, message });
    socket.write(
      `HTTP/1.1 401 Unauthorized\r\n` +
        `Content-Type: application/json\r\n` +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        `Connection: close\r\n\r\n${body}`,
    );
    socket.destroy();
  }

  private completeHandshake(req: IncomingMessage, socket: Socket, head: Buffer): void {
    const key = req.headers['sec-websocket-key'] ?? '';
    const accept = createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
  }

  private sendCloseAndDestroy(socket: Socket, code: number, reason: string): void {
    sendFrame(socket, encodeCloseFrame(code, reason));
    socket.destroy();
  }

  /**
   * Unified connection setup — single data pipeline that handles
   * heartbeat, message parsing, and routing in the same listener.
   */
  private setupConnection(conn: WsConnectionImpl): void {
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
    let buffer = Buffer.alloc(0);

    const resetHeartbeat = () => {
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      heartbeatTimer = setTimeout(() => {
        conn.close(4001, 'heartbeat timeout');
        this.onDisconnect(conn);
      }, this.heartbeatTimeoutMs);
    };

    // Start heartbeat timer
    resetHeartbeat();

    // Send periodic server pings
    const pingTimer = setInterval(() => {
      sendFrame(conn.socket, encodeFrame(Opcode.PING, Buffer.alloc(0)));
    }, this.pingIntervalMs);

    // Unified data handler
    conn.socket.on('data', (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);

      while (buffer.length > 0) {
        const result = decodeFrame(buffer);
        if (!result) break;

        const { frame, consumed } = result;
        buffer = buffer.subarray(consumed);

        switch (frame.opcode) {
          case Opcode.PING:
            sendFrame(conn.socket, encodePongFrame(frame.payload));
            resetHeartbeat();
            this.onlineStatus?.setOnline(conn.uid);
            break;

          case Opcode.PONG:
            resetHeartbeat();
            break;

          case Opcode.TEXT: {
            const text = frame.payload.toString('utf-8');
            if (!text) break;

            let parsed: ParsedRequest;
            try {
              parsed = JSON.parse(text);
            } catch {
              break;
            }

            if (parsed.cmd === 'heartbeat') {
              conn.sendText(JSON.stringify({
                cmd: 'ack',
                seq: parsed.seq,
                body: { type: 'heartbeat', timestamp: Date.now() },
              }));
              resetHeartbeat();
              this.onlineStatus?.setOnline(conn.uid);
              break;
            }

            if (parsed.cmd === 'ack_msg') break;

            const route = routeMessage(parsed, conn.uid, this.callSessions);
            if (route) {
              const outbound = {
                cmd: route.response.cmd,
                seq: Date.now(),
                body: route.response,
              };
              for (const target of route.targets) {
                this.pushToUser(target, outbound);
              }
              conn.sendText(JSON.stringify({
                cmd: 'ack',
                seq: parsed.seq,
                body: { status: 'delivered' },
              }));
            }
            break;
          }

          case Opcode.CLOSE:
            conn.close();
            this.onDisconnect(conn);
            break;

          default:
            break;
        }
      }
    });

    conn.socket.on('close', () => {
      clearInterval(pingTimer);
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      this.onDisconnect(conn);
    });

    conn.socket.on('error', () => {
      clearInterval(pingTimer);
      if (heartbeatTimer) clearTimeout(heartbeatTimer);
      this.onDisconnect(conn);
    });
  }

  private onDisconnect(conn: WsConnectionImpl): void {
    this.connectionManager.remove(conn);

    const remaining = this.connectionManager.getConnections(conn.uid);
    if (remaining.length === 0) {
      this.onlineStatus?.setOffline(conn.uid);
    }

    console.log(
      `[ws-gateway] connection closed: uid=${conn.uid} connId=${conn.connId} total=${this.connectionManager.getTotalConnections()}`,
    );
  }
}
