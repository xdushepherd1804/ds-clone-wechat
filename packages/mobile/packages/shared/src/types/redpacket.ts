export type RedPacketType = 'fixed' | 'random';

export type RedPacketStatus = 'active' | 'finished' | 'expired';

export interface RedPacketInfo {
  id: string;
  senderId: string;
  conversationId?: string;
  totalAmount: number;
  totalCount: number;
  remainingCount: number;
  remainingAmount: number;
  type: RedPacketType;
  blessing?: string;
  status: RedPacketStatus;
  expiredAt: string;
  createdAt: string;
}

export interface RedPacketRecord {
  id: string;
  packetId: string;
  userId: string;
  amount: number;
  createdAt: string;
}

export interface RedPacketDetail extends RedPacketInfo {
  records: RedPacketRecord[];
}

export interface SendRedPacketInput {
  conversationId?: string;
  totalAmount: number;
  totalCount: number;
  type: RedPacketType;
  blessing?: string;
}

export interface OpenRedPacketResult {
  amount: number;
  packet: RedPacketInfo;
}

export interface RedPacketHistoryQuery {
  page?: number;
  pageSize?: number;
}
