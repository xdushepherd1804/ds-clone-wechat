import { getToken } from '@/utils/token';

type MessageHandler = (data: unknown) => void;

type WSState = 'disconnected' | 'connecting' | 'connected';

export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers = new Map<string, Set<MessageHandler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  public state: WSState = 'disconnected';

  constructor(url: string) {
    this.url = url;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    const token = getToken();
    if (!token) {
      console.warn('[WS] No token, skipping connection');
      return;
    }

    this.state = 'connecting';
    const wsUrl = new URL(this.url);
    wsUrl.searchParams.set('token', token);
    this.ws = new WebSocket(wsUrl.toString());

    this.ws.onopen = () => {
      this.state = 'connected';
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const cmd = msg.cmd || msg.type;
        if (cmd && this.handlers.has(cmd)) {
          this.handlers.get(cmd)!.forEach((handler) => handler(msg));
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.state = 'disconnected';
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
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

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.state = 'disconnected';
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
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
