import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn(() => null as string | null),
}));

vi.mock('@/utils/token', () => ({
  getToken: mockGetToken,
  setToken: vi.fn(),
  removeToken: vi.fn(),
}));

import { WSClient, getWSClient } from './wsClient';

describe('WSClient', () => {
  let client: WSClient;
  let mockWebSocket: ReturnType<typeof vi.fn>;
  let wsInstances: Array<{
    url: string;
    readyState: number;
    onopen: (() => void) | null;
    onmessage: ((event: { data: string }) => void) | null;
    onclose: ((event: CloseEvent) => void) | null;
    onerror: (() => void) | null;
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    wsInstances = [];
    mockGetToken.mockReturnValue(null);

    mockWebSocket = vi.fn(function (this: { url: string; readyState: number; onopen: (() => void) | null; onmessage: ((event: { data: string }) => void) | null; onclose: ((event: CloseEvent) => void) | null; onerror: (() => void) | null; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }, url: string) {
      this.url = url;
      this.readyState = 0;
      this.onopen = null;
      this.onmessage = null;
      this.onclose = null;
      this.onerror = null;
      this.send = vi.fn();
      this.close = vi.fn(function (this: { readyState: number; onclose: ((event: CloseEvent) => void) | null }) {
        this.readyState = 3;
        if (this.onclose) {
          this.onclose(new CloseEvent('close', { code: 1000 }));
        }
      });
      wsInstances.push(this as unknown as (typeof wsInstances)[0]);
    });

    Object.defineProperty(mockWebSocket, 'OPEN', { value: 1, writable: false });
    Object.defineProperty(mockWebSocket, 'CONNECTING', { value: 0, writable: false });
    Object.defineProperty(mockWebSocket, 'CLOSED', { value: 3, writable: false });

    (global as unknown as { WebSocket: typeof WebSocket }).WebSocket = mockWebSocket as unknown as typeof WebSocket;

    client = new WSClient('ws://localhost:8080/ws');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with disconnected state', () => {
      const c = new WSClient('ws://example.com/ws');
      expect(c.state).toBe('disconnected');
    });
  });

  describe('connect', () => {
    it('does not connect if no token', () => {
      mockGetToken.mockReturnValue(null);
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      client.connect();

      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('[WS]'));
      expect(client.state).toBe('disconnected');
      consoleWarn.mockRestore();
    });

    it('sets state to connecting', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();
      expect(client.state).toBe('connecting');
    });

    it('creates WebSocket with token in URL', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();

      expect(mockWebSocket).toHaveBeenCalled();
      const wsUrl = wsInstances[0]?.url ?? '';
      expect(wsUrl).toContain('token=test-token');
    });

    it('does not reconnect if already open', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const firstInstance = wsInstances[0];

      firstInstance.readyState = 1;
      client.state = 'connected';

      client.connect();
      expect(wsInstances).toHaveLength(1);
    });
  });

  describe('onopen', () => {
    it('sets state to connected and resets reconnect attempts', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();
      (client as unknown as { reconnectAttempts: number }).reconnectAttempts = 5;

      const ws = wsInstances[0];
      ws.onopen?.();

      expect(client.state).toBe('connected');
      expect((client as unknown as { reconnectAttempts: number }).reconnectAttempts).toBe(0);
    });
  });

  describe('onmessage', () => {
    it('calls registered handlers for matching cmd', () => {
      const handler = vi.fn();
      client.on('new_msg', handler);

      mockGetToken.mockReturnValue('test-token');
      client.connect();

      const ws = wsInstances[0];
      ws.onmessage?.({ data: JSON.stringify({ cmd: 'new_msg', payload: 'hello' }) });

      expect(handler).toHaveBeenCalledWith({ cmd: 'new_msg', payload: 'hello' });
    });

    it('calls handler with type field when cmd is absent', () => {
      const handler = vi.fn();
      client.on('heartbeat', handler);

      mockGetToken.mockReturnValue('test-token');
      client.connect();

      const ws = wsInstances[0];
      ws.onmessage?.({ data: JSON.stringify({ type: 'heartbeat', ts: 123 }) });

      expect(handler).toHaveBeenCalledWith({ type: 'heartbeat', ts: 123 });
    });

    it('ignores malformed JSON gracefully', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();

      const ws = wsInstances[0];
      expect(() => {
        ws.onmessage?.({ data: 'not-json' });
      }).not.toThrow();
    });

    it('does not call handler if no cmd/type match', () => {
      const handler = vi.fn();
      client.on('new_msg', handler);

      mockGetToken.mockReturnValue('test-token');
      client.connect();

      const ws = wsInstances[0];
      ws.onmessage?.({ data: JSON.stringify({ cmd: 'other_cmd', payload: 'x' }) });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('onclose', () => {
    it('sets state to disconnected and schedules reconnect', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      ws.onopen?.();
      ws.onclose?.(new CloseEvent('close', { code: 1000 }));

      expect(client.state).toBe('disconnected');
      expect((client as unknown as { reconnectTimer: unknown }).reconnectTimer).not.toBeNull();
    });
  });

  describe('send', () => {
    it('sends JSON stringified data when connected', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      ws.readyState = 1;

      client.send({ type: 'message', content: 'hello' });

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'message', content: 'hello' }));
    });

    it('does not send if not open', () => {
      client.send({ type: 'message' });
      expect(wsInstances).toHaveLength(0);
    });
  });

  describe('on / off', () => {
    it('registers and unregisters handlers', () => {
      const handler = vi.fn();
      const unsubscribe = client.on('test', handler);

      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      ws.onmessage?.({ data: JSON.stringify({ cmd: 'test', value: 1 }) });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      ws.onmessage?.({ data: JSON.stringify({ cmd: 'test', value: 2 }) });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('off method removes a specific handler', () => {
      const h1 = vi.fn();
      const h2 = vi.fn();
      client.on('test', h1);
      client.on('test', h2);

      client.off('test', h1);

      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      ws.onmessage?.({ data: JSON.stringify({ cmd: 'test', value: 1 }) });

      expect(h1).not.toHaveBeenCalled();
      expect(h2).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('clears reconnect timer and closes WebSocket', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      ws.close = vi.fn();

      client.disconnect();

      expect(client.state).toBe('disconnected');
      expect(ws.close).toHaveBeenCalled();
    });
  });

  describe('max reconnect attempts', () => {
    it('stops reconnecting after max attempts', () => {
      mockGetToken.mockReturnValue('test-token');
      (client as unknown as { reconnectAttempts: number; maxReconnectAttempts: number }).reconnectAttempts = 10;

      client.connect();
      const ws = wsInstances[0];
      ws.onclose?.(new CloseEvent('close', { code: 1000 }));

      expect((client as unknown as { reconnectTimer: unknown }).reconnectTimer).toBeNull();
    });
  });

  describe('heartbeat', () => {
    it('starts heartbeat after connection opens', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      ws.onopen?.();

      // Heartbeat interval should be set
      expect((client as unknown as { heartbeatTimer: unknown }).heartbeatTimer).not.toBeNull();
    });

    it('sends heartbeat message on interval', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      ws.readyState = 1;
      ws.onopen?.();

      // Advance time by 30s
      vi.advanceTimersByTime(30000);

      expect(ws.send).toHaveBeenCalledWith(
        expect.stringContaining('heartbeat'),
      );
    });

    it('stops heartbeat on disconnect', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      ws.onopen?.();
      ws.onclose?.(new CloseEvent('close', { code: 1000 }));

      expect((client as unknown as { heartbeatTimer: unknown }).heartbeatTimer).toBeNull();
    });

    it('closes connection on heartbeat timeout', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      (ws as unknown as { readyState: number }).readyState = 1;
      ws.onopen?.();

      // No activity for 60s — should close with 4001
      vi.advanceTimersByTime(60000);

      expect(ws.close).toHaveBeenCalledWith(4001, 'heartbeat timeout');
    });
  });

  describe('visibility change', () => {
    it('pauses reconnect when page is hidden', () => {
      const addEventListenerSpy = vi.spyOn(document, 'addEventListener');

      mockGetToken.mockReturnValue('test-token');
      client.connect();

      // Visibility listener should be registered
      expect(addEventListenerSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      addEventListenerSpy.mockRestore();
    });

    it('sets paused flag when document is hidden', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      ws.onopen?.();
      ws.onclose?.(new CloseEvent('close', { code: 1000 }));

      // Should have scheduled reconnect
      expect((client as unknown as { reconnectTimer: unknown }).reconnectTimer).not.toBeNull();

      // Simulate page hidden — should clear reconnect timer
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect((client as unknown as { paused: boolean }).paused).toBe(true);
      expect((client as unknown as { reconnectTimer: unknown }).reconnectTimer).toBeNull();

      // Restore
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    });

    it('reconnects when page becomes visible again', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();

      // Simulate page hidden
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect((client as unknown as { paused: boolean }).paused).toBe(true);

      // Simulate disconnect while hidden
      const ws = wsInstances[0];
      ws.onclose?.(new CloseEvent('close', { code: 1000 }));

      // Should not schedule reconnect while paused
      expect((client as unknown as { reconnectTimer: unknown }).reconnectTimer).toBeNull();

      // Now make page visible again
      Object.defineProperty(document, 'hidden', { value: false, configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));

      expect((client as unknown as { paused: boolean }).paused).toBe(false);
      expect(client.state).toBe('connecting');
    });
  });

  describe('token expiry', () => {
    it('stops reconnect when token expires', () => {
      const listener = vi.fn();
      client.onTokenExpired(listener);

      mockGetToken.mockReturnValue('test-token');
      client.connect();

      // Simulate token-expired close
      const ws = wsInstances[0];
      ws.onopen?.();
      ws.onclose?.(new CloseEvent('close', { code: 4002 }));

      expect(listener).toHaveBeenCalled();
      expect((client as unknown as { tokenExpired: boolean }).tokenExpired).toBe(true);
    });

    it('does not connect when token is expired', () => {
      (client as unknown as { tokenExpired: boolean }).tokenExpired = true;
      mockGetToken.mockReturnValue('test-token');

      client.connect();

      expect(client.state).toBe('disconnected');
    });

    it('handles TOKEN_EXPIRED error from server', () => {
      const listener = vi.fn();
      client.onTokenExpired(listener);

      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      ws.onmessage?.({ data: JSON.stringify({ cmd: 'error', body: { code: 'TOKEN_EXPIRED' } }) });

      expect(listener).toHaveBeenCalled();
    });

    it('resetTokenExpired allows reconnection', () => {
      (client as unknown as { tokenExpired: boolean }).tokenExpired = true;

      client.resetTokenExpired();

      expect((client as unknown as { tokenExpired: boolean }).tokenExpired).toBe(false);
    });
  });

  describe('state listeners', () => {
    it('notifies listeners on state change', () => {
      const listener = vi.fn();
      client.onStateChange(listener);

      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      ws.onopen?.();

      expect(listener).toHaveBeenCalledWith('connecting');
      expect(listener).toHaveBeenCalledWith('connected');
    });

    it('unsubscribes state listener', () => {
      const listener = vi.fn();
      const unsub = client.onStateChange(listener);
      unsub();

      mockGetToken.mockReturnValue('test-token');
      client.connect();

      expect(listener).not.toHaveBeenCalled();
    });

    it('does not fire when state does not change', () => {
      const listener = vi.fn();
      client.onStateChange(listener);

      client.state = 'disconnected';
      (client as unknown as { setState: (s: string) => void }).setState('disconnected');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('isConnected', () => {
    it('returns true when WebSocket is open', () => {
      mockGetToken.mockReturnValue('test-token');
      client.connect();
      const ws = wsInstances[0];
      ws.readyState = 1;

      expect(client.isConnected()).toBe(true);
    });

    it('returns false when disconnected', () => {
      expect(client.isConnected()).toBe(false);
    });
  });
});

describe('getWSClient', () => {
  it('returns a singleton WSClient instance', async () => {
    const { getWSClient } = await import('./wsClient');
    const client1 = getWSClient();
    const client2 = getWSClient();

    expect(client1).toBe(client2);
  });
});
