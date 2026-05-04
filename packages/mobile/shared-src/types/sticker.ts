export interface Sticker {
  id: string;
  userId: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  category?: string;
  isPublic: boolean;
  createdAt: string;
}

export interface StickerPack {
  id: string;
  userId: string;
  name: string;
  coverUrl?: string;
  isPublic: boolean;
  stickerCount: number;
  createdAt: string;
}

export interface StickerFavorite {
  userId: string;
  stickerId: string;
  createdAt: string;
}

export interface StickerUploadResult {
  id: string;
  url: string;
  thumbnailUrl?: string;
  name: string;
}

export interface StickerListResponse {
  stickers: Sticker[];
  total: number;
}
