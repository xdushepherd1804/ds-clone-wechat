import { create } from 'zustand';
import type { CallType, CallStatus, CallParticipant } from '@/types';

export interface CallState {
  // Current call
  callId: string | null;
  callType: CallType | null;
  status: CallStatus | null;
  role: 'caller' | 'callee' | null;
  peer: CallParticipant | null;

  // UI state
  isMuted: boolean;
  isSpeakerOn: boolean;
  isVideoOff: boolean;
  isMinimized: boolean;

  // Call timer
  duration: number;
  startTime: number | null;

  // Error
  error: string | null;

  // Actions
  setCallInfo: (info: {
    callId: string;
    callType: CallType;
    status: CallStatus;
    role: 'caller' | 'callee';
    peer: CallParticipant;
  }) => void;
  setStatus: (status: CallStatus) => void;
  setMuted: (muted: boolean) => void;
  setSpeakerOn: (on: boolean) => void;
  setVideoOff: (off: boolean) => void;
  setMinimized: (minimized: boolean) => void;
  setDuration: (duration: number) => void;
  setError: (error: string | null) => void;
  resetCall: () => void;
}

const initialState = {
  callId: null,
  callType: null,
  status: null,
  role: null,
  peer: null,
  isMuted: false,
  isSpeakerOn: true,
  isVideoOff: false,
  isMinimized: false,
  duration: 0,
  startTime: null,
  error: null,
};

export const useCallStore = create<CallState>((set) => ({
  ...initialState,

  setCallInfo: (info) =>
    set({
      callId: info.callId,
      callType: info.callType,
      status: info.status,
      role: info.role,
      peer: info.peer,
      startTime: info.status === 'connected' ? Date.now() : null,
      duration: 0,
      error: null,
    }),

  setStatus: (status) =>
    set((state) => ({
      status,
      startTime: status === 'connected' && !state.startTime ? Date.now() : state.startTime,
    })),

  setMuted: (isMuted) => set({ isMuted }),
  setSpeakerOn: (isSpeakerOn) => set({ isSpeakerOn }),
  setVideoOff: (isVideoOff) => set({ isVideoOff }),
  setMinimized: (isMinimized) => set({ isMinimized }),
  setDuration: (duration) => set({ duration }),
  setError: (error) => set({ error }),

  resetCall: () => set({ ...initialState }),
}));
