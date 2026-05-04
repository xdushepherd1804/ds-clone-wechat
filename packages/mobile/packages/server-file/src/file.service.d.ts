export interface FileServiceConfig {
    maxImageSize: number;
    maxFileSize: number;
    maxSize: number;
    allowedTypes: string[];
    allowedImageTypes: string[];
    maxImageDimension: number;
    thumbnailSizes: {
        small: number;
        large: number;
    };
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
export declare class FileError extends Error {
    name: string;
    code: number;
    constructor(code: number, message: string);
}
export declare function createFileService(config?: Partial<FileServiceConfig>, deps?: FileServiceDeps): {
    validateUpload: (metadata: FileMetadata) => void;
    validateType: (mimeType: string) => boolean;
    isImage: (mimeType: string) => boolean;
    getExtensionForType: (mimeType: string) => string | null;
    processUpload: (metadata: FileMetadata, _fileBuffer?: Buffer) => Promise<UploadResult>;
    validateFileName: (filename: string) => boolean;
    config: {
        maxImageSize: number;
        maxFileSize: number;
        maxSize: number;
        allowedTypes: string[];
        allowedImageTypes: string[];
        maxImageDimension: number;
        thumbnailSizes: {
            small: number;
            large: number;
        };
        storagePath: string;
    };
    uploadFile: (buffer: Buffer, metadata: FileMetadata, opts?: {
        isPublic?: boolean;
        ownerId?: string;
    }) => Promise<UploadResult>;
    getFile: (fileId: string, userId?: string) => Promise<{
        record: FileRecord;
        buffer: Buffer;
    }>;
    getThumbnail: (fileId: string, size: "small" | "large", userId?: string) => Promise<{
        record: FileRecord;
        buffer: Buffer;
    }>;
    deleteFile: (fileId: string, userId?: string) => Promise<void>;
    getFileRecord: (fileId: string) => FileRecord | undefined;
    generateThumbnail: (buffer: Buffer, mimeType: string, size: "small" | "large") => Promise<Buffer>;
    initChunkUpload: (metadata: FileMetadata, totalChunks: number, opts?: {
        isPublic?: boolean;
        ownerId?: string;
    }) => Promise<string>;
    uploadChunk: (fileId: string, chunkIndex: number, buffer: Buffer) => Promise<void>;
    getChunkProgress: (fileId: string) => {
        received: number;
        total: number;
    } | null;
    mergeChunks: (fileId: string) => Promise<UploadResult>;
    cleanupStaleChunks: (maxAgeMs?: number) => number;
    uploadSticker: (buffer: Buffer, metadata: FileMetadata, opts?: {
        isPublic?: boolean;
        userId?: string;
    }) => Promise<{
        id: string;
        url: string;
        thumbnailUrl?: string;
        name: string;
    }>;
    getStickers: (userId: string) => {
        stickers: StickerRecord[];
        total: number;
    };
    getStickerRecord: (stickerId: string) => StickerRecord | undefined;
    getStickerFile: (stickerId: string) => Promise<{
        record: StickerRecord;
        buffer: Buffer;
    }>;
    deleteSticker: (stickerId: string, userId: string) => Promise<void>;
    favoriteSticker: (userId: string, stickerId: string) => void;
    unfavoriteSticker: (userId: string, stickerId: string) => void;
    getFavoriteStickers: (userId: string) => StickerRecord[];
    isStickerFavorited: (userId: string, stickerId: string) => boolean;
};
//# sourceMappingURL=file.service.d.ts.map