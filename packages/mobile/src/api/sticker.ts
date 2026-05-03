import apiClient from './client';
import type {
  ApiResponse,
  Sticker,
  StickerUploadResult,
  StickerListResponse,
} from '@wechat-clone/shared';

export async function uploadSticker(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<StickerUploadResult> {
  const formData = new FormData();
  formData.append('file', file as unknown as Blob);
  const res = await apiClient.post<ApiResponse<StickerUploadResult>>(
    '/stickers/upload',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );
  return res.data.data!;
}

export async function getStickers(
  params?: { page?: number; pageSize?: number },
): Promise<StickerListResponse> {
  const res = await apiClient.get<ApiResponse<StickerListResponse>>(
    '/stickers',
    { params },
  );
  return res.data.data!;
}

export async function getFavoriteStickers(
  params?: { page?: number; pageSize?: number },
): Promise<StickerListResponse> {
  const res = await apiClient.get<ApiResponse<StickerListResponse>>(
    '/stickers/favorites',
    { params },
  );
  return res.data.data!;
}

export async function toggleFavorite(stickerId: string): Promise<void> {
  await apiClient.post(`/stickers/${stickerId}/favorite`);
}

export async function deleteSticker(id: string): Promise<void> {
  await apiClient.delete(`/stickers/${id}`);
}
