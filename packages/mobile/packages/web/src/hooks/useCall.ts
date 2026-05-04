import { useEffect, useRef, useCallback } from 'react';
import { getWSClient } from '@/ws';
import { useCallStore } from '@/store';
import { useUserStore } from '@/store';
import { CallManager } from '@/call';
import type { CallType, IncomingCallBody, CallAcceptBody } from '@/types';
import { generateId } from '@wechat-clone/shared';

const CALL_TIMEOUT_MS = 30_000;

/**
 * useCall — manages WebRTC call lifecycle.
 *
 * Returns {
 *   callState,     // from callStore
 *   startCall,     // initiate a call
 *   acceptCall,    // accept incoming
 *   rejectCall,    // reject incoming
 *   endCall,       // hang up
 *   callManager,   // for media controls (mute/speaker/video)
 * }
 */
export function useCall() {
  const store = useCallStore;
  const user = useUserStore((s) => s.user);
  const callManagerRef = useRef<CallManager | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unsubsRef = useRef<(() => void)[]>([]);

  // Get or create CallManager
  const getCallManager = useCallback(() => {
    if (!callManagerRef.current) {
      callManagerRef.current = new CallManager();
    }
    return callManagerRef.current;
  }, []);

  // Cleanup helper
  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    unsubsRef.current.forEach((fn) => fn());
    unsubsRef.current = [];
    callManagerRef.current?.cleanup();
    callManagerRef.current = null;
    store.getState().resetCall();
  }, [store]);

  // Subscribe to incoming call events via WS
  useEffect(() => {
    const ws = getWSClient();

    const unsubIncoming = ws.on('incoming_call', (data) => {
      const body = (data as { body: IncomingCallBody }).body;
      if (!body) return;

      store.getState().setCallInfo({
        callId: body.callId,
        callType: body.callType,
        status: 'ringing',
        role: 'callee',
        peer: {
          uid: body.callerUid,
          username: body.callerName || body.callerUid,
          avatar: body.callerAvatar,
        },
      });

      // Auto-reject after timeout
      timeoutRef.current = setTimeout(() => {
        const state = store.getState();
        if (state.status === 'ringing') {
          store.getState().setStatus('timeout');
          ws.send({
            cmd: 'call_reject',
            seq: Date.now(),
            body: { callId: body.callId },
          });
          setTimeout(() => cleanup(), 2000);
        }
      }, CALL_TIMEOUT_MS);
    });

    // Handle call accepted by remote peer
    const unsubAccept = ws.on('call_accept', (data) => {
      const body = (data as { body: CallAcceptBody }).body;
      if (!body) return;

      const state = store.getState();
      if (state.status === 'calling') {
        store.getState().setStatus('ringing');
        // WebRTC negotiation will proceed via CallManager's signaling listeners
      }
    });

    // Handle call ended (remote hangup, reject, cancel)
    const unsubEnded = ws.on('call_ended', (data) => {
      const body = data as { body: { callId?: string; reason?: string; fromUid?: string } };
      if (!body?.body) return;

      const state = store.getState();
      if (body.body.reason === 'rejected') {
        store.getState().setStatus('rejected');
      } else {
        store.getState().setStatus('ended');
      }
      setTimeout(() => cleanup(), 2000);
    });

    // Handle call timeout from server
    const unsubTimeout = ws.on('call_timeout', (data) => {
      const body = data as { body: { callId?: string } };
      if (!body?.body) return;
      store.getState().setStatus('timeout');
      setTimeout(() => cleanup(), 2000);
    });

    unsubsRef.current.push(unsubIncoming, unsubAccept, unsubEnded, unsubTimeout);

    return () => {
      unsubIncoming();
      unsubAccept();
      unsubEnded();
      unsubTimeout();
    };
  }, [store, cleanup]);

  // Start a call (caller side)
  const startCall = useCallback(
    async (calleeUid: string, calleeName: string, callType: CallType) => {
      if (!user) return;

      const callId = generateId();
      const cm = getCallManager();

      // Set initial state
      store.getState().setCallInfo({
        callId,
        callType,
        status: 'calling',
        role: 'caller',
        peer: { uid: calleeUid, username: calleeName },
      });

      // Send call_request via WS
      const ws = getWSClient();
      ws.send({
        cmd: 'call_request',
        seq: Date.now(),
        body: { calleeUid, calleeName, callType },
      });

      // Start WebRTC
      try {
        await cm.startCall(callId, calleeUid, calleeName, callType);

        // Listen for connection events
        cm.on('connected', () => {
          store.getState().setStatus('connected');
        });

        cm.on('ended', () => {
          store.getState().setStatus('ended');
          setTimeout(() => cleanup(), 2000);
        });

        cm.on('rejected', () => {
          store.getState().setStatus('rejected');
          setTimeout(() => cleanup(), 2000);
        });

        cm.on('timeout', () => {
          store.getState().setStatus('timeout');
          setTimeout(() => cleanup(), 2000);
        });

        cm.on('error', (err) => {
          store.getState().setError((err as { message?: string })?.message || 'Call error');
        });
      } catch (err) {
        store.getState().setError('Failed to start call');
        cleanup();
      }
    },
    [user, store, getCallManager, cleanup],
  );

  // Accept incoming call (callee side)
  const acceptCall = useCallback(async () => {
    const state = store.getState();
    if (!state.callId || !state.callType) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const cm = getCallManager();

    // Send accept via WS
    const ws = getWSClient();
    ws.send({
      cmd: 'call_accept',
      seq: Date.now(),
      body: { callId: state.callId },
    });

    try {
      await cm.prepareIncoming(state.callId, state.callType);
      await cm.acceptCall();

      store.getState().setStatus('connected');

      cm.on('ended', () => {
        store.getState().setStatus('ended');
        setTimeout(() => cleanup(), 2000);
      });

      cm.on('error', (err) => {
        store.getState().setError((err as { message?: string })?.message || 'Call error');
      });
    } catch (err) {
      store.getState().setError('Failed to accept call');
      cleanup();
    }
  }, [store, getCallManager, cleanup]);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    const state = store.getState();
    if (!state.callId) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const cm = callManagerRef.current;
    if (cm) {
      cm.rejectCall();
    } else {
      const ws = getWSClient();
      ws.send({
        cmd: 'call_reject',
        seq: Date.now(),
        body: { callId: state.callId },
      });
    }

    store.getState().setStatus('rejected');
    setTimeout(() => cleanup(), 2000);
  }, [store, cleanup]);

  // End call (hang up)
  const endCall = useCallback(() => {
    const cm = callManagerRef.current;
    if (cm) {
      cm.endCall();
    }
    store.getState().setStatus('ended');
    setTimeout(() => cleanup(), 2000);
  }, [store, cleanup]);

  return {
    callState: store,
    callManager: callManagerRef.current,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    cleanup,
  };
}
