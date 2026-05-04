export enum MsgType {
  TEXT = 1,
  IMAGE = 2,
  VOICE = 3,
  VIDEO = 4,
  FILE = 5,
  LOCATION = 6,
  LINK = 7,
  SYSTEM = 100,
  CUSTOM = 200,
}

export enum MsgStatus {
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed',
}

export enum ChatType {
  PRIVATE = 'private',
  GROUP = 'group',
}

export interface Message {
  msgId: string;
  fromUid: string;
  toUid?: string;
  toGroupId?: string;
  chatType: ChatType;
  msgType: MsgType;
  content: string;
  status: MsgStatus;
  clientSeq?: number;
  serverSeq: number;
  createdAt: string;
  updatedAt?: string;
}

export interface MessageBody {
  text?: string;
  imageUrl?: string;
  imageThumbUrl?: string;
  voiceUrl?: string;
  voiceDuration?: number;
  videoUrl?: string;
  videoThumbUrl?: string;
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  linkUrl?: string;
  linkTitle?: string;
  linkDesc?: string;
}

export interface Conversation {
  conversationId: string;
  chatType: ChatType;
  targetId: string;
  lastMsg: Message | null;
  unreadCount: number;
  isTop: boolean;
  isMuted: boolean;
  updatedAt: string;
}

export interface SyncKey {
  key: number;
  msgCount: number;
}

export interface SyncRequest {
  syncKeys: SyncKey[];
}

export interface SyncResponse {
  newMsgs: Message[];
  newSyncKeys: SyncKey[];
}
