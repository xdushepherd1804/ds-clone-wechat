import { describe, it, expect, beforeEach } from 'vitest';
import { useWSStore } from './wsStore';

describe('wsStore', () => {
  beforeEach(() => {
    useWSStore.setState({
      status: 'disconnected',
      lastConnectedAt: null,
      reconnectAttempt: 0,
    });
  });

  describe('initial state', () => {
    it('starts disconnected', () => {
      expect(useWSStore.getState().status).toBe('disconnected');
    });

    it('has null lastConnectedAt', () => {
      expect(useWSStore.getState().lastConnectedAt).toBeNull();
    });

    it('has zero reconnectAttempt', () => {
      expect(useWSStore.getState().reconnectAttempt).toBe(0);
    });
  });

  describe('setStatus', () => {
    it('updates status to connected', () => {
      useWSStore.getState().setStatus('connected');
      expect(useWSStore.getState().status).toBe('connected');
    });

    it('updates status to connecting', () => {
      useWSStore.getState().setStatus('connecting');
      expect(useWSStore.getState().status).toBe('connecting');
    });

    it('updates status to disconnected', () => {
      useWSStore.getState().setStatus('connected');
      useWSStore.getState().setStatus('disconnected');
      expect(useWSStore.getState().status).toBe('disconnected');
    });
  });

  describe('setLastConnectedAt', () => {
    it('sets last connected timestamp', () => {
      const now = Date.now();
      useWSStore.getState().setLastConnectedAt(now);
      expect(useWSStore.getState().lastConnectedAt).toBe(now);
    });

    it('sets lastConnectedAt to null', () => {
      useWSStore.getState().setLastConnectedAt(Date.now());
      useWSStore.getState().setLastConnectedAt(null);
      expect(useWSStore.getState().lastConnectedAt).toBeNull();
    });
  });

  describe('setReconnectAttempt', () => {
    it('tracks reconnect attempt count', () => {
      useWSStore.getState().setReconnectAttempt(5);
      expect(useWSStore.getState().reconnectAttempt).toBe(5);
    });
  });
});
