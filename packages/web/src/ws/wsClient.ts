import { getToken } from '@/utils/token';

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;
const RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

type MessageHandler = (data: unknown) => void;

export type WSConnectionState = 'disconnected' | 'connecting' | 'connected';

type StateChangeListener = (state: WSConnectionState) => void;
type TokenExpiredListener = () => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private stateListeners = new Set<StateChangeListener>();
  private tokenExpiredListeners = new Set<TokenExpiredListener>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastActivity = 0;
  private paused = false;
  private tokenExpired = false;
  private visibilityHandler: (() => void) | null = null;

  public state: WSConnectionState = 'disconnected';

  constructor(url: string) {
    this.url = url;
  }

  /** Register a state-change listener. Returns unsubscribe function. */
  onStateChange(listener: StateChangeListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  /** Register a token-expired listener. Returns unsubscribe function. */
  onTokenExpired(listener: TokenExpiredListener): () => void {
    this.tokenExpiredListeners.add(listener);
    return () => {
      this.tokenExpiredListeners.delete(listener);
    };
  }

  private setState(next: WSConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.stateListeners.forEach((fn) => fn(next));
  }

  private resetActivity(): void {
    this.lastActivity = Date.now();
    this.scheduleHeartbeatTimeout();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.resetActivity();

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          cmd: 'heartbeat',
          seq: Date.now(),
          body: { timestamp: Date.now() },
        }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private scheduleHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) clearTimeout(this.heartbeatTimeout);
    this.heartbeatTimeout = setTimeout(() => {
      // No activity from server within timeout — consider connection dead
      this.ws?.close(4001, 'heartbeat timeout');
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private setupVisibilityListener(): void {
    if (typeof document === 'undefined') return;
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
    }
    this.visibilityHandler = () => {
      if (document.hidden) {
        this.paused = true;
        // Cancel any pending reconnect
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      } else {
        this.paused = false;
        // If disconnected, try to reconnect
        if (this.state === 'disconnected' && !this.tokenExpired) {
          this.reconnectAttempts = 0;
          this.connect();
        }
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  private removeVisibilityListener(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.tokenExpired) return;

    const token = getToken();
    if (!token) {
      console.warn('[WS] No token, skipping connection');
      return;
    }

    this.setupVisibilityListener();
    this.setState('connecting');
    const wsUrl = new URL(this.url);
    wsUrl.searchParams.set('token', token);
    this.ws = new WebSocket(wsUrl.toString());

    this.ws.onopen = () => {
      this.setState('connected');
      this.reconnectAttempts = 0;
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      this.resetActivity();
      try {
        const msg = JSON.parse(event.data);

        // Handle token expired error from server
        if (msg.cmd === 'error' && msg.body?.code === 'TOKEN_EXPIRED') {
          this.handleTokenExpired();
          return;
        }

        const cmd = msg.cmd || msg.type;
        if (cmd && this.handlers.has(cmd)) {
          this.handlers.get(cmd)!.forEach((handler) => handler(msg));
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = (event) => {
      this.setState('disconnected');
      this.stopHeartbeat();

      // Token expired close code
      if (event.code === 4002) {
        this.handleTokenExpired();
        return;
      }

      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private handleTokenExpired(): void {
    this.tokenExpired = true;
    this.disconnect();
    this.tokenExpiredListeners.forEach((fn) => fn());
  }

  send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  on(cmd: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(cmd)) {
      this.handlers.set(cmd, new Set());
    }
    this.handlers.get(cmd)!.add(handler);
    return () => {
      this.handlers.get(cmd)?.delete(handler);
    };
  }

  off(cmd: string, handler: MessageHandler): void {
    this.handlers.get(cmd)?.delete(handler);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.removeVisibilityListener();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setState('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.tokenExpired) return;
    if (this.paused) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    const delay = Math.min(
      RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS,
    );
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /** Reset the token-expired flag (called after re-login). */
  resetTokenExpired(): void {
    this.tokenExpired = false;
  }
}

let wsClient: WSClient | null = null;

export function getWSClient(): WSClient {
  if (!wsClient) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    wsClient = new WSClient(`${protocol}//${host}/ws`);
  }
  return wsClient;
}
