import { create } from 'zustand';
import type { CallType } from '@wechat-clone/shared';

export type CallStatus =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connected'
  | 'ended';

export type CallRole = 'caller' | 'callee';

export interface CallPeer {
  uid: string;
  username: string;
  avatar?: string;
}

interface CallState {
  callId: string | null;
  callType: CallType | null;
  status: CallStatus;
  role: CallRole | null;
  peer: CallPeer | null;
  isMuted: boolean;
  isSpeakerOn: boolean;
  isVideoOff: boolean;
  duration: number;
  startTime: number | null;
  error: string | null;

  setCallInfo: (info: {
    callId: string;
    callType: CallType;
    role: CallRole;
    peer: CallPeer;
  }) => void;
  setStatus: (status: CallStatus) => void;
  setMuted: (muted: boolean) => void;
  setSpeakerOn: (on: boolean) => void;
  setVideoOff: (off: boolean) => void;
  resetCall: () => void;
  incrementDuration: () => void;
  setError: (error: string | null) => void;
}

const initialState = {
  callId: null,
  callType: null as CallType | null,
  status: 'idle' as CallStatus,
  role: null as CallRole | null,
  peer: null as CallPeer | null,
  isMuted: false,
  isSpeakerOn: false,
  isVideoOff: false,
  duration: 0,
  startTime: null as number | null,
  error: null as string | null,
};

export const useCallStore = create<CallState>((set) => ({
  ...initialState,

  setCallInfo: (info) =>
    set({
      callId: info.callId,
      callType: info.callType,
      role: info.role,
      peer: info.peer,
      status: 'calling',
      startTime: Date.now(),
      duration: 0,
      error: null,
    }),

  setStatus: (status) => set({ status }),

  setMuted: (muted) => set({ isMuted: muted }),

  setSpeakerOn: (on) => set({ isSpeakerOn: on }),

  setVideoOff: (off) => set({ isVideoOff: off }),

  resetCall: () => set({ ...initialState }),

  incrementDuration: () =>
    set((state) => ({ duration: state.duration + 1 })),

  setError: (error) => set({ error }),
}));
