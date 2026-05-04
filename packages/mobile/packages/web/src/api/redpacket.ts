import apiClient from './client';
import type {
  RedPacketInfo,
  RedPacketDetail,
  RedPacketRecord,
  SendRedPacketInput,
  OpenRedPacketResult,
  ApiResponse,
} from '@/types';

export async function sendRedPacket(
  data: SendRedPacketInput,
): Promise<RedPacketInfo> {
  const res = await apiClient.post<ApiResponse<RedPacketInfo>>('/redpacket/send', data);
  return res.data.data!;
}

export async function openRedPacket(
  packetId: string,
): Promise<OpenRedPacketResult> {
  const res = await apiClient.post<ApiResponse<OpenRedPacketResult>>(
    `/redpacket/open/${packetId}`,
  );
  return res.data.data!;
}

export async function getRedPacket(
  packetId: string,
): Promise<RedPacketDetail> {
  const res = await apiClient.get<ApiResponse<RedPacketDetail>>(
    `/redpacket/${packetId}`,
  );
  return res.data.data!;
}

export async function getSentHistory(
  page = 1,
  pageSize = 20,
): Promise<{ list: RedPacketInfo[]; total: number }> {
  const res = await apiClient.get<
    ApiResponse<{ list: RedPacketInfo[]; total: number }>
  >('/redpacket/history/sent', { params: { page, pageSize } });
  return res.data.data!;
}

export async function getReceivedHistory(
  page = 1,
  pageSize = 20,
): Promise<{ list: RedPacketRecord[]; total: number }> {
  const res = await apiClient.get<
    ApiResponse<{ list: RedPacketRecord[]; total: number }>
  >('/redpacket/history/received', { params: { page, pageSize } });
  return res.data.data!;
}
