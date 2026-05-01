/**
 * @wechat-clone/server-file — file upload and storage service
 */

export {
  createFileService,
  FileError,
} from './file.service';

export type {
  FileServiceConfig,
  FileServiceDeps,
  FileStorage,
  ImageProcessor,
  FileMetadata,
  UploadResult,
  FileRecord,
  ChunkUploadState,
  StickerRecord,
} from './file.service';
