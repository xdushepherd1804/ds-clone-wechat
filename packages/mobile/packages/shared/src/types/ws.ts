/** 上行 — Client → Server */
export interface WSRequest {
  cmd:
    | 'send_msg'
    | 'ack_msg'
    | 'heartbeat'
    | 'typing'
    | 'read'
    | 'call_request'
    | 'call_accept'
    | 'call_reject'
    | 'call_cancel'
    | 'offer_sdp'
    | 'answer_sdp'
    | 'ice_candidate'
    | 'call_end';
  seq: number;
  body: Record<string, unknown>;
}

/** 下行 — Server → Client */
export interface WSResponse {
  cmd:
    | 'new_msg'
    | 'ack'
    | 'error'
    | 'typing'
    | 'online_status'
    | 'incoming_call'
    | 'call_ended'
    | 'call_timeout'
    | 'offer_sdp'
    | 'answer_sdp'
    | 'ice_candidate';
  seq: number;
  body: Record<string, unknown>;
}

export type WSCmd = WSRequest['cmd'];

export type WSResponseCmd = WSResponse['cmd'];

export interface WSHeartbeatBody {
  timestamp: number;
}

export interface WSSendMsgBody {
  chatType: 'private' | 'group';
  toUid?: string;
  toGroupId?: string;
  msgType: number;
  content: string;
  clientSeq: number;
}

export interface WSNewMsgBody {
  msgId: string;
  fromUid: string;
  chatType: 'private' | 'group';
  toUid?: string;
  toGroupId?: string;
  msgType: number;
  content: string;
  serverSeq: number;
  createdAt: string;
}

export interface WSAckMsgBody {
  msgId: string;
  status: 'delivered' | 'read';
}

export interface WSTypingBody {
  chatType: 'private' | 'group';
  toUid?: string;
  toGroupId?: string;
  isTyping: boolean;
}

export interface WSOnlineStatusBody {
  userId: string;
  status: 'online' | 'offline';
  lastSeenAt?: string;
}
