import { create } from 'zustand';

export type WSConnectionState = 'disconnected' | 'connecting' | 'connected';

interface WSState {
  status: WSConnectionState;
  lastConnectedAt: number | null;
  reconnectAttempt: number;

  setStatus: (status: WSConnectionState) => void;
  setLastConnectedAt: (ts: number | null) => void;
  setReconnectAttempt: (n: number) => void;
}

export const useWSStore = create<WSState>((set) => ({
  status: 'disconnected',
  lastConnectedAt: null,
  reconnectAttempt: 0,

  setStatus: (status) => set({ status }),
  setLastConnectedAt: (ts) => set({ lastConnectedAt: ts }),
  setReconnectAttempt: (n) => set({ reconnectAttempt: n }),
}));
