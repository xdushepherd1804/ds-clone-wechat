/** Call types for WebRTC audio/video calling */

export type CallType = 'audio' | 'video';

export type CallStatus =
  | 'calling'
  | 'ringing'
  | 'connected'
  | 'ended'
  | 'rejected'
  | 'timeout';

export type CallRole = 'caller' | 'callee';

export interface CallParticipant {
  uid: string;
  username: string;
  avatar?: string;
}

export interface CallInfo {
  callId: string;
  caller: CallParticipant;
  callee: CallParticipant;
  callType: CallType;
  status: CallStatus;
  startTime?: number;
  endTime?: number;
}

// ─── WS Call Signaling Commands ──────────────────────────────────────────

/** Supported call-related WS commands */
export type CallCmd =
  | 'call_request'
  | 'incoming_call'
  | 'call_accept'
  | 'call_reject'
  | 'call_cancel'
  | 'call_timeout'
  | 'offer_sdp'
  | 'answer_sdp'
  | 'ice_candidate'
  | 'call_end'
  | 'call_ended';

export interface CallRequestBody {
  calleeUid: string;
  calleeName: string;
  callType: CallType;
}

export interface IncomingCallBody {
  callId: string;
  callerUid: string;
  callerName: string;
  callerAvatar?: string;
  callType: CallType;
}

export interface CallAcceptBody {
  callId: string;
}

export interface CallRejectBody {
  callId: string;
  reason?: string;
}

export interface CallCancelBody {
  callId: string;
}

export interface CallTimeoutBody {
  callId: string;
}

export interface SdpBody {
  callId: string;
  sdp: string;
}

export interface IceCandidateBody {
  callId: string;
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

export interface CallEndBody {
  callId: string;
}

export interface CallEndedBody {
  callId: string;
  reason?: string;
}

// ─── Call WS message wrappers ────────────────────────────────────────────

export interface CallWSMessage {
  cmd: CallCmd;
  seq: number;
  body: CallWSBody;
}

export type CallWSBody =
  | CallRequestBody
  | IncomingCallBody
  | CallAcceptBody
  | CallRejectBody
  | CallCancelBody
  | CallTimeoutBody
  | SdpBody
  | IceCandidateBody
  | CallEndBody
  | CallEndedBody;
