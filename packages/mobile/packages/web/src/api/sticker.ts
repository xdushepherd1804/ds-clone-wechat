import apiClient from './client';
import type { Sticker, StickerUploadResult } from '@wechat-clone/shared';

export async function uploadSticker(file: File): Promise<StickerUploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await apiClient.post<StickerUploadResult>('/files/stickers/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export async function getStickers(): Promise<{ stickers: Sticker[]; total: number }> {
  const res = await apiClient.get<{ stickers: Sticker[]; total: number }>('/files/stickers');
  return res.data;
}

export async function getFavoriteStickers(): Promise<{ stickers: Sticker[]; total: number }> {
  const res = await apiClient.get<{ stickers: Sticker[]; total: number }>('/files/stickers/favorites');
  return res.data;
}

export async function favoriteSticker(stickerId: string): Promise<void> {
  await apiClient.post(`/files/stickers/${stickerId}/favorite`);
}

export async function unfavoriteSticker(stickerId: string): Promise<void> {
  await apiClient.delete(`/files/stickers/${stickerId}/favorite`);
}

export async function deleteSticker(stickerId: string): Promise<void> {
  await apiClient.delete(`/files/stickers/${stickerId}`);
}
