import apiClient from './client';
import type {
  Message,
  Conversation,
  SyncRequest,
  SyncResponse,
  ApiResponse,
} from '@/types';

export async function getConversations(): Promise<Conversation[]> {
  const res = await apiClient.get<ApiResponse<Conversation[]>>('/messages/conversations');
  return res.data.data!;
}

export async function getMessages(
  convId: string,
  params?: { before?: number; limit?: number },
): Promise<Message[]> {
  const res = await apiClient.get<ApiResponse<Message[]>>(
    `/messages/${convId}`,
    { params },
  );
  return res.data.data!;
}

export async function sendMessage(data: {
  conversationId: string;
  chatType: string;
  toUid?: string;
  toGroupId?: string;
  msgType: number;
  content: string;
}): Promise<Message> {
  const res = await apiClient.post<ApiResponse<Message>>('/messages', data);
  return res.data.data!;
}

export async function syncMessages(data: SyncRequest): Promise<SyncResponse> {
  const res = await apiClient.post<SyncResponse>('/messages/sync', data);
  return res.data;
}

export async function markAsRead(convId: string): Promise<void> {
  await apiClient.post(`/messages/${convId}/read`);
}
