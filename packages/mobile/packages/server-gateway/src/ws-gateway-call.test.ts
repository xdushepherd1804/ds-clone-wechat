import { describe, it, expect, beforeEach } from 'vitest';
import { routeMessage } from './ws-gateway';

// We need to expose the CallSessionManager for testing.
// Since it's not exported, we test the routing logic with a simple session tracker.

interface TestCallSession {
  callId: string;
  callerUid: string;
  calleeUid: string;
  callType: 'audio' | 'video';
  createdAt: number;
}

class TestCallSessionManager {
  private sessions = new Map<string, TestCallSession>();

  create(callId: string, callerUid: string, calleeUid: string, callType: 'audio' | 'video'): TestCallSession {
    const session: TestCallSession = { callId, callerUid, calleeUid, callType, createdAt: Date.now() };
    this.sessions.set(callId, session);
    return session;
  }

  get(callId: string): TestCallSession | undefined {
    return this.sessions.get(callId);
  }

  remove(callId: string): void {
    this.sessions.delete(callId);
  }
}

describe('WS Gateway — Call Signaling Routing', () => {
  const callerUid = 'user_a';
  const calleeUid = 'user_b';
  const callId = 'call_a_b_1234567890';
  let sessions: TestCallSessionManager;

  beforeEach(() => {
    sessions = new TestCallSessionManager();
  });

  it('should route call_request to callee', () => {
    const result = routeMessage(
      {
        cmd: 'call_request',
        seq: 1,
        body: { calleeUid, calleeName: 'Bob', callType: 'audio' },
      },
      callerUid,
      sessions as any,
    );

    expect(result).not.toBeNull();
    expect(result!.targets).toEqual([calleeUid]);
    expect(result!.response.cmd).toBe('incoming_call');
    expect(result!.response.callType).toBe('audio');

    // Verify session was created
    const callId2 = (result!.response as any).callId;
    expect(callId2).toBeDefined();
    const session = sessions.get(callId2);
    expect(session).toBeDefined();
    expect(session!.callerUid).toBe(callerUid);
    expect(session!.calleeUid).toBe(calleeUid);
  });

  it('should route call_request for video calls', () => {
    const result = routeMessage(
      {
        cmd: 'call_request',
        seq: 1,
        body: { calleeUid, calleeName: 'Bob', callType: 'video' },
      },
      callerUid,
      sessions as any,
    );

    expect(result).not.toBeNull();
    expect(result!.response.callType).toBe('video');
  });

  it('should route call_accept to caller', () => {
    sessions.create(callId, callerUid, calleeUid, 'audio');

    const result = routeMessage(
      { cmd: 'call_accept', seq: 2, body: { callId } },
      calleeUid,
      sessions as any,
    );

    expect(result).not.toBeNull();
    expect(result!.targets).toEqual([callerUid]);
    expect(result!.response.cmd).toBe('call_accept');
    expect(result!.response.fromUid).toBe(calleeUid);
  });

  it('should route call_reject to caller and remove session', () => {
    sessions.create(callId, callerUid, calleeUid, 'audio');

    const result = routeMessage(
      { cmd: 'call_reject', seq: 2, body: { callId, reason: 'busy' } },
      calleeUid,
      sessions as any,
    );

    expect(result).not.toBeNull();
    expect(result!.targets).toEqual([callerUid]);
    expect(result!.response.cmd).toBe('call_ended');
    expect((result!.response as any).reason).toBe('rejected');

    // Session should be removed
    expect(sessions.get(callId)).toBeUndefined();
  });

  it('should route call_cancel to callee and remove session', () => {
    sessions.create(callId, callerUid, calleeUid, 'audio');

    const result = routeMessage(
      { cmd: 'call_cancel', seq: 2, body: { callId } },
      callerUid,
      sessions as any,
    );

    expect(result).not.toBeNull();
    expect(result!.targets).toEqual([calleeUid]);
    expect(result!.response.cmd).toBe('call_ended');
    expect((result!.response as any).reason).toBe('cancelled');

    // Session should be removed
    expect(sessions.get(callId)).toBeUndefined();
  });

  it('should route call_end to the other peer', () => {
    sessions.create(callId, callerUid, calleeUid, 'audio');

    // Caller hangs up → notify callee
    const result1 = routeMessage(
      { cmd: 'call_end', seq: 3, body: { callId } },
      callerUid,
      sessions as any,
    );
    expect(result1).not.toBeNull();
    expect(result1!.targets).toEqual([calleeUid]);
    expect(result1!.response.cmd).toBe('call_ended');
    expect(sessions.get(callId)).toBeUndefined();
  });

  it('should route offer_sdp to the other peer', () => {
    sessions.create(callId, callerUid, calleeUid, 'video');

    const result = routeMessage(
      {
        cmd: 'offer_sdp',
        seq: 4,
        body: { callId, sdp: 'v=0...' },
      },
      callerUid,
      sessions as any,
    );

    expect(result).not.toBeNull();
    expect(result!.targets).toEqual([calleeUid]);
    expect(result!.response.cmd).toBe('offer_sdp');
    expect((result!.response as any).sdp).toBe('v=0...');
  });

  it('should route answer_sdp to the other peer', () => {
    sessions.create(callId, callerUid, calleeUid, 'video');

    const result = routeMessage(
      {
        cmd: 'answer_sdp',
        seq: 5,
        body: { callId, sdp: 'v=0...' },
      },
      calleeUid,
      sessions as any,
    );

    expect(result).not.toBeNull();
    expect(result!.targets).toEqual([callerUid]);
    expect(result!.response.cmd).toBe('answer_sdp');
    expect((result!.response as any).sdp).toBe('v=0...');
  });

  it('should route ice_candidate to the other peer', () => {
    sessions.create(callId, callerUid, calleeUid, 'video');

    const result = routeMessage(
      {
        cmd: 'ice_candidate',
        seq: 6,
        body: { callId, candidate: 'candidate:...', sdpMid: '0', sdpMLineIndex: 0 },
      },
      callerUid,
      sessions as any,
    );

    expect(result).not.toBeNull();
    expect(result!.targets).toEqual([calleeUid]);
    expect(result!.response.cmd).toBe('ice_candidate');
    expect((result!.response as any).candidate).toBe('candidate:...');
  });

  it('should return null for heartbeat command', () => {
    const result = routeMessage(
      { cmd: 'heartbeat', seq: 7, body: {} },
      callerUid,
      sessions as any,
    );
    expect(result).toBeNull();
  });

  it('should return null for non-existent call session', () => {
    const result = routeMessage(
      { cmd: 'offer_sdp', seq: 8, body: { callId: 'nonexistent' } },
      callerUid,
      sessions as any,
    );
    expect(result).toBeNull();
  });

  it('should return null for call_accept with missing callId', () => {
    const result = routeMessage(
      { cmd: 'call_accept', seq: 9, body: {} },
      calleeUid,
      sessions as any,
    );
    expect(result).toBeNull();
  });

  it('should return null for call_request with missing calleeUid', () => {
    const result = routeMessage(
      { cmd: 'call_request', seq: 10, body: {} },
      callerUid,
      sessions as any,
    );
    expect(result).toBeNull();
  });
});
