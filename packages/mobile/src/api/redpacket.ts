import apiClient from './client';
import type {
  ApiResponse,
  RedPacketInfo,
  RedPacketDetail,
  OpenRedPacketResult,
  SendRedPacketInput,
} from '@wechat-clone/shared';

export async function sendRedPacket(
  data: SendRedPacketInput,
): Promise<RedPacketInfo> {
  const res = await apiClient.post<ApiResponse<RedPacketInfo>>(
    '/redpacket/send',
    data,
  );
  return res.data.data!;
}

export async function openRedPacket(
  id: string,
): Promise<OpenRedPacketResult> {
  const res = await apiClient.post<ApiResponse<OpenRedPacketResult>>(
    `/redpacket/open/${id}`,
  );
  return res.data.data!;
}

export async function getRedPacket(id: string): Promise<RedPacketDetail> {
  const res = await apiClient.get<ApiResponse<RedPacketDetail>>(
    `/redpacket/${id}`,
  );
  return res.data.data!;
}

export async function getSentHistory(
  page = 1,
  pageSize = 20,
): Promise<RedPacketInfo[]> {
  const res = await apiClient.get<ApiResponse<RedPacketInfo[]>>(
    '/redpacket/history/sent',
    { params: { page, pageSize } },
  );
  return res.data.data ?? [];
}

export async function getReceivedHistory(
  page = 1,
  pageSize = 20,
): Promise<RedPacketInfo[]> {
  const res = await apiClient.get<ApiResponse<RedPacketInfo[]>>(
    '/redpacket/history/received',
    { params: { page, pageSize } },
  );
  return res.data.data ?? [];
}
