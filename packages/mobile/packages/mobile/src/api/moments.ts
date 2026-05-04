import apiClient from './client';
import type {
  MomentItem,
  MomentComment,
  CreateMomentRequest,
  PaginatedResponse,
  ApiResponse,
} from '@wechat-clone/shared';

export async function getTimeline(
  cursor?: string,
  limit?: number,
): Promise<{ items: MomentItem[]; cursor?: string; hasMore: boolean }> {
  const params: Record<string, string | number> = {};
  if (cursor) params.cursor = cursor;
  if (limit) params.limit = limit;
  const res = await apiClient.get<PaginatedResponse<MomentItem>>(
    '/moments/timeline',
    { params },
  );
  return res.data.data;
}

export async function getUserMoments(
  userId: string,
  cursor?: string,
  limit?: number,
): Promise<{ items: MomentItem[]; cursor?: string; hasMore: boolean }> {
  const params: Record<string, string | number> = {};
  if (cursor) params.cursor = cursor;
  if (limit) params.limit = limit;
  const res = await apiClient.get<PaginatedResponse<MomentItem>>(
    `/moments/user/${userId}`,
    { params },
  );
  return res.data.data;
}

export async function getMoment(id: string): Promise<MomentItem> {
  const res = await apiClient.get<ApiResponse<MomentItem>>(`/moments/${id}`);
  return res.data.data!;
}

export async function createMoment(
  data: CreateMomentRequest,
): Promise<MomentItem> {
  const res = await apiClient.post<ApiResponse<MomentItem>>('/moments', data);
  return res.data.data!;
}

export async function deleteMoment(id: string): Promise<void> {
  await apiClient.delete(`/moments/${id}`);
}

export async function toggleLike(momentId: string): Promise<{ liked: boolean }> {
  const res = await apiClient.post<ApiResponse<{ liked: boolean }>>(
    `/moments/${momentId}/like`,
  );
  return res.data.data!;
}

export async function getMomentComments(
  momentId: string,
): Promise<MomentComment[]> {
  const res = await apiClient.get<ApiResponse<MomentComment[]>>(
    `/moments/${momentId}/comments`,
  );
  return res.data.data ?? [];
}
