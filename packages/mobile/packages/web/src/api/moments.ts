import apiClient from './client';
import type {
  MomentItem,
  CreateMomentRequest,
  AddCommentRequest,
  MomentComment,
  MomentLike,
  MomentFeedQuery,
  ApiResponse,
  PaginatedResponse,
} from '@/types';

interface ToggleLikeResult {
  liked: boolean;
}

export async function getTimeline(params?: MomentFeedQuery): Promise<MomentItem[]> {
  const res = await apiClient.get<ApiResponse<MomentItem[]>>('/moments/timeline', { params });
  return res.data.data!;
}

export async function getUserMoments(
  userId: string,
  params?: MomentFeedQuery,
): Promise<MomentItem[]> {
  const res = await apiClient.get<ApiResponse<MomentItem[]>>(`/moments/user/${userId}`, { params });
  return res.data.data!;
}

export async function getMomentById(momentId: string): Promise<MomentItem> {
  const res = await apiClient.get<ApiResponse<MomentItem>>(`/moments/${momentId}`);
  return res.data.data!;
}

export async function createMoment(data: CreateMomentRequest): Promise<MomentItem> {
  const res = await apiClient.post<ApiResponse<MomentItem>>('/moments', data);
  return res.data.data!;
}

export async function deleteMoment(momentId: string): Promise<void> {
  await apiClient.delete(`/moments/${momentId}`);
}

export async function toggleLike(momentId: string): Promise<ToggleLikeResult> {
  const res = await apiClient.post<ApiResponse<ToggleLikeResult>>(`/moments/${momentId}/like`);
  return res.data.data!;
}

export async function likeMoment(momentId: string): Promise<MomentLike> {
  const res = await apiClient.post<ApiResponse<MomentLike>>(`/moments/${momentId}/like`);
  return res.data.data!;
}

export async function unlikeMoment(momentId: string): Promise<void> {
  await apiClient.delete(`/moments/${momentId}/like`);
}

export async function addComment(
  momentId: string,
  data: AddCommentRequest,
): Promise<MomentComment> {
  const res = await apiClient.post<ApiResponse<MomentComment>>(
    `/moments/${momentId}/comments`,
    data,
  );
  return res.data.data!;
}

export async function deleteComment(momentId: string, commentId: string): Promise<void> {
  await apiClient.delete(`/moments/${momentId}/comments/${commentId}`);
}
