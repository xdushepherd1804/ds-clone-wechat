import { describe, it, expect, beforeEach } from 'vitest';
import { useCallStore } from './callStore';

describe('callStore', () => {
  beforeEach(() => {
    useCallStore.setState(useCallStore.getInitialState());
  });

  it('should have correct initial state', () => {
    const state = useCallStore.getState();
    expect(state.callId).toBeNull();
    expect(state.callType).toBeNull();
    expect(state.status).toBeNull();
    expect(state.role).toBeNull();
    expect(state.peer).toBeNull();
    expect(state.isMuted).toBe(false);
    expect(state.isSpeakerOn).toBe(true);
    expect(state.isVideoOff).toBe(false);
    expect(state.isMinimized).toBe(false);
    expect(state.duration).toBe(0);
    expect(state.error).toBeNull();
  });

  it('should set call info correctly', () => {
    const { setCallInfo } = useCallStore.getState();
    setCallInfo({
      callId: 'call_123',
      callType: 'video',
      status: 'calling',
      role: 'caller',
      peer: { uid: 'user_b', username: 'Bob' },
    });

    const state = useCallStore.getState();
    expect(state.callId).toBe('call_123');
    expect(state.callType).toBe('video');
    expect(state.status).toBe('calling');
    expect(state.role).toBe('caller');
    expect(state.peer?.uid).toBe('user_b');
    expect(state.peer?.username).toBe('Bob');
  });

  it('should update call status', () => {
    const { setCallInfo, setStatus } = useCallStore.getState();
    setCallInfo({
      callId: 'call_123',
      callType: 'audio',
      status: 'calling',
      role: 'caller',
      peer: { uid: 'user_b', username: 'Bob' },
    });

    expect(useCallStore.getState().status).toBe('calling');

    setStatus('ringing');
    expect(useCallStore.getState().status).toBe('ringing');

    setStatus('connected');
    expect(useCallStore.getState().status).toBe('connected');
    expect(useCallStore.getState().startTime).not.toBeNull();

    setStatus('ended');
    expect(useCallStore.getState().status).toBe('ended');
  });

  it('should toggle mute/speaker/video correctly', () => {
    const { setMuted, setSpeakerOn, setVideoOff } = useCallStore.getState();

    setMuted(true);
    expect(useCallStore.getState().isMuted).toBe(true);

    setSpeakerOn(false);
    expect(useCallStore.getState().isSpeakerOn).toBe(false);

    setVideoOff(true);
    expect(useCallStore.getState().isVideoOff).toBe(true);
  });

  it('should set and clear errors', () => {
    const { setError } = useCallStore.getState();
    setError('Connection failed');
    expect(useCallStore.getState().error).toBe('Connection failed');

    setError(null);
    expect(useCallStore.getState().error).toBeNull();
  });

  it('should reset call state completely', () => {
    const { setCallInfo, resetCall } = useCallStore.getState();
    setCallInfo({
      callId: 'call_123',
      callType: 'audio',
      status: 'connected',
      role: 'caller',
      peer: { uid: 'user_b', username: 'Bob' },
    });
    setMutedState(true);

    resetCall();

    const state = useCallStore.getState();
    expect(state.callId).toBeNull();
    expect(state.status).toBeNull();
    expect(state.role).toBeNull();
    expect(state.peer).toBeNull();
  });

  it('should track minimized state', () => {
    const { setMinimized } = useCallStore.getState();
    setMinimized(true);
    expect(useCallStore.getState().isMinimized).toBe(true);

    setMinimized(false);
    expect(useCallStore.getState().isMinimized).toBe(false);
  });
});

// Helper to set mute state directly
function setMutedState(muted: boolean) {
  useCallStore.setState({ isMuted: muted });
}
