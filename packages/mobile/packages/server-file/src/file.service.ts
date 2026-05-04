import { ErrorCode } from '@wechat-clone/shared';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface FileServiceConfig {
  maxImageSize: number;
  maxFileSize: number;
  maxSize: number;
  allowedTypes: string[];
  allowedImageTypes: string[];
  maxImageDimension: number;
  thumbnailSizes: { small: number; large: number };
  storagePath: string;
}

export interface FileServiceDeps {
  storage?: FileStorage;
  imageProcessor?: ImageProcessor;
}

export interface FileStorage {
  save(filePath: string, buffer: Buffer): Promise<void>;
  get(filePath: string): Promise<Buffer>;
  delete(filePath: string): Promise<void>;
  exists(filePath: string): Promise<boolean>;
  mkdir(dirPath: string): Promise<void>;
}

export interface ImageProcessor {
  resize(buffer: Buffer, mimeType: string, width: number, height: number): Promise<Buffer>;
}

const DEFAULT_CONFIG: FileServiceConfig = {
  maxImageSize: 10 * 1024 * 1024, // 10MB
  maxFileSize: 100 * 1024 * 1024, // 100MB
  maxSize: 10 * 1024 * 1024, // 10MB (legacy)
  allowedTypes: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/mov', 'video/avi',
    'audio/mp3', 'audio/wav', 'audio/aac', 'audio/ogg',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'text/plain',
    'application/zip',
  ],
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  maxImageDimension: 4096,
  thumbnailSizes: { small: 200, large: 800 },
  storagePath: 'uploads',
};

export interface FileMetadata {
  originalName: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
}

export interface UploadResult {
  fileId: string;
  url: string;
  metadata: FileMetadata;
  thumbnailUrl?: string;
}

export interface FileRecord {
  fileId: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  thumbnailSmall?: string;
  thumbnailLarge?: string;
  isPublic: boolean;
  ownerId?: string;
  createdAt: number;
  checksum: string;
}

export interface StickerRecord {
  id: string;
  userId: string;
  name: string;
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  category?: string;
  isPublic: boolean;
  createdAt: number;
  storagePath: string;
}

export interface ChunkUploadState {
  fileId: string;
  totalChunks: number;
  receivedChunks: Set<number>;
  metadata: FileMetadata;
  isPublic: boolean;
  ownerId?: string;
  tempDir: string;
  createdAt: number;
}

export class FileError extends Error {
  override name = 'FileError';
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

function isAllowedType(mimeType: string, allowedTypes: string[]): boolean {
  return allowedTypes.includes(mimeType);
}

function validateImageDimensions(
  width: number | undefined,
  height: number | undefined,
  maxDimension: number,
): boolean {
  if (width === undefined || height === undefined) return true;
  return width <= maxDimension && height <= maxDimension;
}

function generateFileId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function generateChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '/');
}

// ─── Local FS Storage ─────────────────────────────────────────────────────

class LocalFileStorage implements FileStorage {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = path.resolve(basePath);
  }

  async save(filePath: string, buffer: Buffer): Promise<void> {
    const fullPath = path.join(this.basePath, filePath);
    const dir = path.dirname(fullPath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(fullPath, buffer);
  }

  async get(filePath: string): Promise<Buffer> {
    const fullPath = path.join(this.basePath, filePath);
    return fs.promises.readFile(fullPath);
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = path.join(this.basePath, filePath);
    try {
      await fs.promises.unlink(fullPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.basePath, filePath);
    try {
      await fs.promises.access(fullPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(dirPath: string): Promise<void> {
    const fullPath = path.join(this.basePath, dirPath);
    await fs.promises.mkdir(fullPath, { recursive: true });
  }
}

// ─── Service Factory ────────────────────────────────────────────────────────

export function createFileService(
  config: Partial<FileServiceConfig> = {},
  deps: FileServiceDeps = {},
) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const storage: FileStorage = deps.storage ?? new LocalFileStorage(cfg.storagePath);
  const imageProcessor: ImageProcessor | null = deps.imageProcessor ?? null;

  // In-memory store for file records and chunk state (stateless service, no DB)
  const fileRecords = new Map<string, FileRecord>();
  const chunkUploads = new Map<string, ChunkUploadState>();

  // ─── Validate Upload ────────────────────────────────────────────────────

  function validateUpload(metadata: FileMetadata): void {
    if (metadata.size <= 0) {
      throw new FileError(ErrorCode.INVALID_PARAM, '文件不能为空');
    }

    // Separate size limits for images vs other files
    const isImg = cfg.allowedImageTypes.includes(metadata.mimeType);
    const maxAllowed = isImg ? cfg.maxImageSize : cfg.maxFileSize;

    if (metadata.size > maxAllowed) {
      const limitMB = maxAllowed / 1024 / 1024;
      throw new FileError(ErrorCode.FILE_TOO_LARGE, `文件大小不能超过 ${limitMB}MB`);
    }

    if (!isAllowedType(metadata.mimeType, cfg.allowedTypes)) {
      throw new FileError(ErrorCode.FILE_TYPE_NOT_ALLOWED, `不支持的文件类型: ${metadata.mimeType}`);
    }

    if (cfg.allowedImageTypes.includes(metadata.mimeType)) {
      if (!validateImageDimensions(metadata.width, metadata.height, cfg.maxImageDimension)) {
        throw new FileError(ErrorCode.INVALID_PARAM, `图片尺寸不能超过 ${cfg.maxImageDimension}px`);
      }
    }
  }

  // ─── Validate Type ──────────────────────────────────────────────────────

  function validateType(mimeType: string): boolean {
    return cfg.allowedTypes.includes(mimeType);
  }

  // ─── Is Image ───────────────────────────────────────────────────────────

  function isImage(mimeType: string): boolean {
    return cfg.allowedImageTypes.includes(mimeType);
  }

  // ─── Get Extension Whitelist ────────────────────────────────────────────

  function getExtensionForType(mimeType: string): string | null {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
      'video/mp4': '.mp4',
      'video/mov': '.mov',
      'video/avi': '.avi',
      'audio/mp3': '.mp3',
      'audio/wav': '.wav',
      'audio/aac': '.aac',
      'audio/ogg': '.ogg',
      'application/pdf': '.pdf',
      'application/msword': '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
      'application/vnd.ms-excel': '.xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
      'application/vnd.ms-powerpoint': '.ppt',
      'text/plain': '.txt',
      'application/zip': '.zip',
    };
    return map[mimeType] ?? null;
  }

  // ─── Process Upload (simulated) ─────────────────────────────────────────

  async function processUpload(
    metadata: FileMetadata,
    _fileBuffer?: Buffer,
  ): Promise<UploadResult> {
    validateUpload(metadata);

    const fileId = generateFileId();
    const ext = getExtensionForType(metadata.mimeType) ?? '.bin';

    const result: UploadResult = {
      fileId,
      url: `/files/${fileId}${ext}`,
      metadata,
    };

    if (isImage(metadata.mimeType)) {
      result.thumbnailUrl = `/files/${fileId}_thumb${ext}`;
    }

    return result;
  }

  // ─── Validate File Name ─────────────────────────────────────────────────

  function validateFileName(filename: string): boolean {
    if (!filename || filename.trim().length === 0) return false;
    if (filename.length > 255) return false;
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return false;
    return true;
  }

  // ─── Upload File ────────────────────────────────────────────────────────

  async function uploadFile(
    buffer: Buffer,
    metadata: FileMetadata,
    opts: { isPublic?: boolean; ownerId?: string } = {},
  ): Promise<UploadResult> {
    validateUpload(metadata);

    const fileId = generateFileId();
    const ext = getExtensionForType(metadata.mimeType) ?? '.bin';
    const dateStr = formatDate(new Date());
    const typeFolder = metadata.mimeType.split('/')[0];
    const relPath = `${typeFolder}/${dateStr}/${fileId}${ext}`;
    const checksum = generateChecksum(buffer);

    await storage.save(relPath, buffer);

    const record: FileRecord = {
      fileId,
      originalName: metadata.originalName,
      mimeType: metadata.mimeType,
      size: metadata.size,
      storagePath: relPath,
      isPublic: opts.isPublic ?? false,
      ownerId: opts.ownerId,
      createdAt: Date.now(),
      checksum,
    };

    const result: UploadResult = {
      fileId,
      url: `/api/files/${fileId}`,
      metadata,
    };

    // Generate thumbnails for images
    if (isImage(metadata.mimeType) && imageProcessor) {
      const smallThumb = await generateThumbnail(buffer, metadata.mimeType, 'small');
      const largeThumb = await generateThumbnail(buffer, metadata.mimeType, 'large');

      const thumbSmallPath = `${typeFolder}/${dateStr}/${fileId}_thumb_small${ext}`;
      const thumbLargePath = `${typeFolder}/${dateStr}/${fileId}_thumb_large${ext}`;

      await storage.save(thumbSmallPath, smallThumb);
      await storage.save(thumbLargePath, largeThumb);

      record.thumbnailSmall = thumbSmallPath;
      record.thumbnailLarge = thumbLargePath;
      result.thumbnailUrl = `/api/files/${fileId}/thumbnail`;
    }

    fileRecords.set(fileId, record);

    return result;
  }

  // ─── Generate Thumbnail ─────────────────────────────────────────────────

  async function generateThumbnail(
    buffer: Buffer,
    mimeType: string,
    size: 'small' | 'large',
  ): Promise<Buffer> {
    if (!imageProcessor) {
      throw new FileError(ErrorCode.INTERNAL_ERROR, '图片处理器未配置');
    }
    const dim = cfg.thumbnailSizes[size];
    return imageProcessor.resize(buffer, mimeType, dim, dim);
  }

  // ─── Get File ───────────────────────────────────────────────────────────

  async function getFile(fileId: string, userId?: string): Promise<{ record: FileRecord; buffer: Buffer }> {
    const record = fileRecords.get(fileId);
    if (!record) {
      throw new FileError(ErrorCode.FILE_NOT_FOUND, '文件不存在');
    }

    // Access control: private files require owner match
    if (!record.isPublic) {
      if (!userId) {
        throw new FileError(ErrorCode.UNAUTHORIZED, '未授权访问');
      }
      if (record.ownerId && record.ownerId !== userId) {
        throw new FileError(ErrorCode.FORBIDDEN, '无权限访问该文件');
      }
    }

    const buffer = await storage.get(record.storagePath);
    return { record, buffer };
  }

  // ─── Get Thumbnail ──────────────────────────────────────────────────────

  async function getThumbnail(
    fileId: string,
    size: 'small' | 'large',
    userId?: string,
  ): Promise<{ record: FileRecord; buffer: Buffer }> {
    const record = fileRecords.get(fileId);
    if (!record) {
      throw new FileError(ErrorCode.FILE_NOT_FOUND, '文件不存在');
    }

    // Apply same access control as the original file
    if (!record.isPublic) {
      if (!userId) {
        throw new FileError(ErrorCode.UNAUTHORIZED, '未授权访问');
      }
      if (record.ownerId && record.ownerId !== userId) {
        throw new FileError(ErrorCode.FORBIDDEN, '无权限访问该文件');
      }
    }

    const thumbPath = size === 'small' ? record.thumbnailSmall : record.thumbnailLarge;
    if (!thumbPath) {
      throw new FileError(ErrorCode.NOT_FOUND, '缩略图不存在');
    }

    const buffer = await storage.get(thumbPath);
    return { record, buffer };
  }

  // ─── Delete File ────────────────────────────────────────────────────────

  async function deleteFile(fileId: string, userId?: string): Promise<void> {
    const record = fileRecords.get(fileId);
    if (!record) {
      throw new FileError(ErrorCode.FILE_NOT_FOUND, '文件不存在');
    }

    // Access control for deletion
    if (record.ownerId && userId && record.ownerId !== userId) {
      throw new FileError(ErrorCode.FORBIDDEN, '无权限删除该文件');
    }

    // Delete main file
    await storage.delete(record.storagePath);

    // Delete thumbnails if present
    if (record.thumbnailSmall) await storage.delete(record.thumbnailSmall);
    if (record.thumbnailLarge) await storage.delete(record.thumbnailLarge);

    fileRecords.delete(fileId);
  }

  // ─── Get File Record ────────────────────────────────────────────────────

  function getFileRecord(fileId: string): FileRecord | undefined {
    return fileRecords.get(fileId);
  }

  // ─── Init Chunk Upload ──────────────────────────────────────────────────

  async function initChunkUpload(
    metadata: FileMetadata,
    totalChunks: number,
    opts: { isPublic?: boolean; ownerId?: string } = {},
  ): Promise<string> {
    validateUpload(metadata);

    if (totalChunks < 1 || totalChunks > 10000) {
      throw new FileError(ErrorCode.INVALID_PARAM, '分片数量必须在 1-10000 之间');
    }

    const fileId = generateFileId();
    const tempDir = `chunks/${fileId}`;

    await storage.mkdir(tempDir);

    const state: ChunkUploadState = {
      fileId,
      totalChunks,
      receivedChunks: new Set<number>(),
      metadata,
      isPublic: opts.isPublic ?? false,
      ownerId: opts.ownerId,
      tempDir,
      createdAt: Date.now(),
    };

    chunkUploads.set(fileId, state);

    return fileId;
  }

  // ─── Upload Chunk ───────────────────────────────────────────────────────

  async function uploadChunk(
    fileId: string,
    chunkIndex: number,
    buffer: Buffer,
  ): Promise<void> {
    const state = chunkUploads.get(fileId);
    if (!state) {
      throw new FileError(ErrorCode.NOT_FOUND, '分片上传会话不存在或已过期');
    }

    if (chunkIndex < 0 || chunkIndex >= state.totalChunks) {
      throw new FileError(ErrorCode.INVALID_PARAM, `分片索引无效: ${chunkIndex}`);
    }

    if (state.receivedChunks.has(chunkIndex)) {
      throw new FileError(ErrorCode.INVALID_PARAM, `分片 ${chunkIndex} 已上传`);
    }

    const chunkPath = `${state.tempDir}/chunk_${chunkIndex}`;
    await storage.save(chunkPath, buffer);
    state.receivedChunks.add(chunkIndex);
  }

  // ─── Get Chunk Progress ─────────────────────────────────────────────────

  function getChunkProgress(fileId: string): { received: number; total: number } | null {
    const state = chunkUploads.get(fileId);
    if (!state) return null;
    return { received: state.receivedChunks.size, total: state.totalChunks };
  }

  // ─── Merge Chunks ───────────────────────────────────────────────────────

  async function mergeChunks(fileId: string): Promise<UploadResult> {
    const state = chunkUploads.get(fileId);
    if (!state) {
      throw new FileError(ErrorCode.NOT_FOUND, '分片上传会话不存在或已过期');
    }

    // Verify all chunks received
    if (state.receivedChunks.size !== state.totalChunks) {
      throw new FileError(
        ErrorCode.INVALID_PARAM,
        `分片不完整: 已收到 ${state.receivedChunks.size}/${state.totalChunks}`,
      );
    }

    // Read and concatenate all chunks in order
    const chunks: Buffer[] = [];
    for (let i = 0; i < state.totalChunks; i++) {
      const chunkPath = `${state.tempDir}/chunk_${i}`;
      const chunkBuffer = await storage.get(chunkPath);
      chunks.push(chunkBuffer);
    }
    const mergedBuffer = Buffer.concat(chunks);

    // Verify total size matches metadata
    if (mergedBuffer.length !== state.metadata.size) {
      throw new FileError(
        ErrorCode.FILE_UPLOAD_FAILED,
        `合并后文件大小不匹配: 期望 ${state.metadata.size}, 实际 ${mergedBuffer.length}`,
      );
    }

    // Upload as complete file
    const result = await uploadFile(mergedBuffer, state.metadata, {
      isPublic: state.isPublic,
      ownerId: state.ownerId,
    });

    // Cleanup chunks
    for (let i = 0; i < state.totalChunks; i++) {
      await storage.delete(`${state.tempDir}/chunk_${i}`);
    }
    chunkUploads.delete(fileId);

    return result;
  }

  // ─── Cleanup Stale Chunks ────────────────────────────────────────────────

  function cleanupStaleChunks(maxAgeMs: number = 3600_000): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [fileId, state] of chunkUploads) {
      if (now - state.createdAt >= maxAgeMs) {
        chunkUploads.delete(fileId);
        cleaned++;
      }
    }
    return cleaned;
  }

  // ─── Stickers ────────────────────────────────────────────────────────────

  const stickerRecords = new Map<string, StickerRecord>();
  const stickerFavorites = new Map<string, Set<string>>(); // userId -> Set<stickerId>

  const STICKER_MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const STICKER_ALLOWED_TYPES = ['image/png', 'image/webp', 'image/gif', 'image/jpeg'];

  function generateStickerId(): string {
    return `sticker_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  async function uploadSticker(
    buffer: Buffer,
    metadata: FileMetadata,
    opts: { isPublic?: boolean; userId?: string } = {},
  ): Promise<{
    id: string;
    url: string;
    thumbnailUrl?: string;
    name: string;
  }> {
    if (!opts.userId) {
      throw new FileError(ErrorCode.UNAUTHORIZED, '需要登录');
    }
    if (buffer.length <= 0) {
      throw new FileError(ErrorCode.INVALID_PARAM, '贴图不能为空');
    }
    if (buffer.length > STICKER_MAX_SIZE) {
      throw new FileError(ErrorCode.FILE_TOO_LARGE, '贴图大小不能超过 5MB');
    }
    if (!STICKER_ALLOWED_TYPES.includes(metadata.mimeType)) {
      throw new FileError(ErrorCode.FILE_TYPE_NOT_ALLOWED, '贴图仅支持 PNG、WebP、GIF、JPEG 格式');
    }

    const stickerId = generateStickerId();
    const ext = getExtensionForType(metadata.mimeType) ?? '.png';
    const dateStr = formatDate(new Date());
    const relPath = `stickers/${dateStr}/${stickerId}${ext}`;

    await storage.save(relPath, buffer);

    const record: StickerRecord = {
      id: stickerId,
      userId: opts.userId,
      name: metadata.originalName,
      url: `/api/files/stickers/${stickerId}`,
      width: metadata.width,
      height: metadata.height,
      isPublic: opts.isPublic ?? false,
      createdAt: Date.now(),
      storagePath: relPath,
    };

    stickerRecords.set(stickerId, record);

    return {
      id: stickerId,
      url: record.url,
      thumbnailUrl: record.thumbnailUrl,
      name: metadata.originalName,
    };
  }

  function getStickers(userId: string): { stickers: StickerRecord[]; total: number } {
    const userStickers = Array.from(stickerRecords.values())
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
    return { stickers: userStickers, total: userStickers.length };
  }

  function getStickerRecord(stickerId: string): StickerRecord | undefined {
    return stickerRecords.get(stickerId);
  }

  async function deleteSticker(stickerId: string, userId: string): Promise<void> {
    const record = stickerRecords.get(stickerId);
    if (!record) {
      throw new FileError(ErrorCode.STICKER_NOT_FOUND, '贴图不存在');
    }
    if (record.userId !== userId) {
      throw new FileError(ErrorCode.FORBIDDEN, '无权限删除该贴图');
    }
    await storage.delete(record.storagePath);
    stickerRecords.delete(stickerId);

    // Remove from all favorites
    for (const [, favSet] of stickerFavorites) {
      favSet.delete(stickerId);
    }
  }

  function favoriteSticker(userId: string, stickerId: string): void {
    const record = stickerRecords.get(stickerId);
    if (!record) {
      throw new FileError(ErrorCode.STICKER_NOT_FOUND, '贴图不存在');
    }
    if (!stickerFavorites.has(userId)) {
      stickerFavorites.set(userId, new Set());
    }
    const favSet = stickerFavorites.get(userId)!;
    if (favSet.has(stickerId)) {
      throw new FileError(ErrorCode.STICKER_ALREADY_FAVORITED, '已收藏该贴图');
    }
    favSet.add(stickerId);
  }

  function unfavoriteSticker(userId: string, stickerId: string): void {
    const favSet = stickerFavorites.get(userId);
    if (!favSet || !favSet.has(stickerId)) {
      throw new FileError(ErrorCode.STICKER_NOT_FAVORITED, '未收藏该贴图');
    }
    favSet.delete(stickerId);
  }

  function getFavoriteStickers(userId: string): StickerRecord[] {
    const favSet = stickerFavorites.get(userId);
    if (!favSet) return [];
    return Array.from(favSet)
      .map((id) => stickerRecords.get(id))
      .filter((s): s is StickerRecord => s !== undefined)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function isStickerFavorited(userId: string, stickerId: string): boolean {
    return stickerFavorites.get(userId)?.has(stickerId) ?? false;
  }

  async function getStickerFile(stickerId: string): Promise<{ record: StickerRecord; buffer: Buffer }> {
    const record = stickerRecords.get(stickerId);
    if (!record) {
      throw new FileError(ErrorCode.STICKER_NOT_FOUND, '贴图不存在');
    }
    const buffer = await storage.get(record.storagePath);
    return { record, buffer };
  }

  return {
    // Existing API (backward compatible)
    validateUpload,
    validateType,
    isImage,
    getExtensionForType,
    processUpload,
    validateFileName,
    config: cfg,

    // New: Full file lifecycle
    uploadFile,
    getFile,
    getThumbnail,
    deleteFile,
    getFileRecord,
    generateThumbnail,

    // New: Chunked upload
    initChunkUpload,
    uploadChunk,
    getChunkProgress,
    mergeChunks,
    cleanupStaleChunks,

    // New: Stickers
    uploadSticker,
    getStickers,
    getStickerRecord,
    getStickerFile,
    deleteSticker,
    favoriteSticker,
    unfavoriteSticker,
    getFavoriteStickers,
    isStickerFavorited,
  };
}
