import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFileService, FileError } from './file.service';
import type { FileStorage, ImageProcessor } from './file.service';

// ─── Mock Storage ───────────────────────────────────────────────────────────

function makeMockStorage() {
  const files = new Map<string, Buffer>();
  return {
    files,
    storage: {
      save: vi.fn(async (filePath: string, buffer: Buffer) => {
        files.set(filePath, buffer);
      }),
      get: vi.fn(async (filePath: string) => {
        const buf = files.get(filePath);
        if (!buf) throw new Error('ENOENT');
        return buf;
      }),
      delete: vi.fn(async (filePath: string) => {
        files.delete(filePath);
      }),
      exists: vi.fn(async (filePath: string) => {
        return files.has(filePath);
      }),
      mkdir: vi.fn(async (_dirPath: string) => {
        // no-op in mock
      }),
    } as FileStorage,
  };
}

function makeMockImageProcessor() {
  return {
    resize: vi.fn(async (buffer: Buffer, _mimeType: string, width: number, _height: number) => {
      // Return a smaller buffer to simulate resizing
      const header = Buffer.from(`thumb_${width}x${_height}_`);
      return Buffer.concat([header, buffer.slice(0, Math.min(buffer.length, 100))]);
    }),
  } as ImageProcessor;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('file.service', () => {
  // ── Legacy validateUpload tests (backward compatible) ──────────────────

  describe('validateUpload', () => {
    const svc = createFileService();

    it('throws if file size is 0', () => {
      expect(() => svc.validateUpload({
        originalName: 'empty.txt',
        mimeType: 'text/plain',
        size: 0,
      })).toThrow(FileError);
    });

    it('throws if file size exceeds max', () => {
      const smallSvc = createFileService({ maxImageSize: 100, maxFileSize: 100 });
      expect(() => smallSvc.validateUpload({
        originalName: 'big.txt',
        mimeType: 'text/plain',
        size: 200,
      })).toThrow(FileError);
    });

    it('throws for unsupported file type', () => {
      expect(() => svc.validateUpload({
        originalName: 'bad.exe',
        mimeType: 'application/x-msdownload',
        size: 100,
      })).toThrow(FileError);
    });

    it('accepts valid text file', () => {
      expect(() => svc.validateUpload({
        originalName: 'readme.txt',
        mimeType: 'text/plain',
        size: 1024,
      })).not.toThrow();
    });

    it('accepts valid image file', () => {
      expect(() => svc.validateUpload({
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 500 * 1024,
        width: 1920,
        height: 1080,
      })).not.toThrow();
    });

    it('rejects image with oversized dimensions', () => {
      const smallDimSvc = createFileService({ maxImageDimension: 1000 });
      expect(() => smallDimSvc.validateUpload({
        originalName: 'huge.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        width: 5000,
        height: 3000,
      })).toThrow(FileError);
    });

    it('rejects oversized image dimensions', () => {
      expect(() => svc.validateUpload({
        originalName: 'huge.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
        width: 5000,
        height: 3000,
      })).toThrow(FileError);
    });

    it('accepts image without dimension metadata', () => {
      expect(() => svc.validateUpload({
        originalName: 'img.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      })).not.toThrow();
    });

    it('accepts valid audio file', () => {
      expect(() => svc.validateUpload({
        originalName: 'song.mp3',
        mimeType: 'audio/mp3',
        size: 3 * 1024 * 1024,
      })).not.toThrow();
    });

    it('accepts valid video file', () => {
      expect(() => svc.validateUpload({
        originalName: 'clip.mp4',
        mimeType: 'video/mp4',
        size: 8 * 1024 * 1024,
      })).not.toThrow();
    });

    it('accepts PDF file', () => {
      expect(() => svc.validateUpload({
        originalName: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 500 * 1024,
      })).not.toThrow();
    });

    it('rejects negative size', () => {
      expect(() => svc.validateUpload({
        originalName: 'a.txt',
        mimeType: 'text/plain',
        size: -1,
      })).toThrow(FileError);
    });

    // ── New: Image size limit separate from file size limit ──────────────

    it('rejects image exceeding image size limit (10MB) but under file limit', () => {
      const svc = createFileService();
      expect(() => svc.validateUpload({
        originalName: 'large.jpg',
        mimeType: 'image/jpeg',
        size: 50 * 1024 * 1024, // 50MB, over 10MB image limit
      })).toThrow(FileError);
    });

    it('accepts non-image file under file size limit (100MB)', () => {
      const svc = createFileService();
      expect(() => svc.validateUpload({
        originalName: 'large.zip',
        mimeType: 'application/zip',
        size: 50 * 1024 * 1024, // 50MB, under 100MB file limit
      })).not.toThrow();
    });

    it('rejects non-image file exceeding file size limit (100MB)', () => {
      const svc = createFileService();
      expect(() => svc.validateUpload({
        originalName: 'huge.zip',
        mimeType: 'application/zip',
        size: 150 * 1024 * 1024, // 150MB, over 100MB limit
      })).toThrow(FileError);
    });

    // ── New: Expanded allowed types ─────────────────────────────────────

    it('accepts SVG image', () => {
      const svc = createFileService();
      expect(() => svc.validateUpload({
        originalName: 'icon.svg',
        mimeType: 'image/svg+xml',
        size: 1024,
      })).not.toThrow();
    });

    it('accepts Word document', () => {
      const svc = createFileService();
      expect(() => svc.validateUpload({
        originalName: 'report.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 1024,
      })).not.toThrow();
    });

    it('accepts Excel spreadsheet', () => {
      const svc = createFileService();
      expect(() => svc.validateUpload({
        originalName: 'data.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 1024,
      })).not.toThrow();
    });

    it('accepts ZIP archive', () => {
      const svc = createFileService();
      expect(() => svc.validateUpload({
        originalName: 'archive.zip',
        mimeType: 'application/zip',
        size: 1024,
      })).not.toThrow();
    });

    it('accepts AAC audio', () => {
      const svc = createFileService();
      expect(() => svc.validateUpload({
        originalName: 'song.aac',
        mimeType: 'audio/aac',
        size: 1024,
      })).not.toThrow();
    });

    it('accepts MOV video', () => {
      const svc = createFileService();
      expect(() => svc.validateUpload({
        originalName: 'clip.mov',
        mimeType: 'video/mov',
        size: 1024,
      })).not.toThrow();
    });
  });

  describe('validateType', () => {
    const svc = createFileService();

    it('returns true for supported types', () => {
      expect(svc.validateType('image/png')).toBe(true);
      expect(svc.validateType('audio/mp3')).toBe(true);
      expect(svc.validateType('text/plain')).toBe(true);
    });

    it('returns false for unsupported types', () => {
      expect(svc.validateType('application/octet-stream')).toBe(false);
      expect(svc.validateType('application/x-msdownload')).toBe(false);
    });
  });

  describe('isImage', () => {
    const svc = createFileService();

    it('returns true for image types', () => {
      expect(svc.isImage('image/jpeg')).toBe(true);
      expect(svc.isImage('image/png')).toBe(true);
      expect(svc.isImage('image/gif')).toBe(true);
      expect(svc.isImage('image/webp')).toBe(true);
      expect(svc.isImage('image/svg+xml')).toBe(true);
    });

    it('returns false for non-image types', () => {
      expect(svc.isImage('video/mp4')).toBe(false);
      expect(svc.isImage('audio/mp3')).toBe(false);
      expect(svc.isImage('text/plain')).toBe(false);
    });
  });

  describe('getExtensionForType', () => {
    const svc = createFileService();

    it('maps common MIME types to extensions', () => {
      expect(svc.getExtensionForType('image/jpeg')).toBe('.jpg');
      expect(svc.getExtensionForType('image/png')).toBe('.png');
      expect(svc.getExtensionForType('audio/mp3')).toBe('.mp3');
      expect(svc.getExtensionForType('video/mp4')).toBe('.mp4');
      expect(svc.getExtensionForType('application/pdf')).toBe('.pdf');
      expect(svc.getExtensionForType('text/plain')).toBe('.txt');
    });

    it('returns null for unmapped types', () => {
      expect(svc.getExtensionForType('application/octet-stream')).toBeNull();
    });
  });

  describe('processUpload', () => {
    it('returns upload result with fileId and URL', async () => {
      const svc = createFileService();
      const result = await svc.processUpload({
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      });

      expect(result.fileId).toMatch(/^file_/);
      expect(result.url).toMatch(/^\/files\/file_.*\.jpg$/);
      expect(result.metadata.originalName).toBe('photo.jpg');
    });

    it('includes thumbnail URL for images', async () => {
      const svc = createFileService();
      const result = await svc.processUpload({
        originalName: 'photo.png',
        mimeType: 'image/png',
        size: 2048,
      });

      expect(result.thumbnailUrl).toBeTruthy();
      expect(result.thumbnailUrl).toContain('_thumb');
    });

    it('does not include thumbnail URL for non-images', async () => {
      const svc = createFileService();
      const result = await svc.processUpload({
        originalName: 'doc.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      });

      expect(result.thumbnailUrl).toBeUndefined();
    });

    it('throws for invalid file', async () => {
      const svc = createFileService();
      await expect(svc.processUpload({
        originalName: 'bad.exe',
        mimeType: 'application/x-msdownload',
        size: 100,
      })).rejects.toThrow(FileError);
    });

    it('uses .bin extension for unknown types', async () => {
      const svc = createFileService({
        allowedTypes: ['text/plain', 'application/octet-stream'],
      });
      const result = await svc.processUpload({
        originalName: 'data',
        mimeType: 'application/octet-stream',
        size: 100,
      });
      expect(result.url).toContain('.bin');
    });
  });

  describe('validateFileName', () => {
    const svc = createFileService();

    it('rejects empty filenames', () => {
      expect(svc.validateFileName('')).toBe(false);
      expect(svc.validateFileName('   ')).toBe(false);
    });

    it('rejects filenames with path traversal', () => {
      expect(svc.validateFileName('../etc/passwd')).toBe(false);
      expect(svc.validateFileName('..\\windows')).toBe(false);
      expect(svc.validateFileName('foo/bar.txt')).toBe(false);
    });

    it('accepts valid filenames', () => {
      expect(svc.validateFileName('photo.jpg')).toBe(true);
      expect(svc.validateFileName('document.pdf')).toBe(true);
      expect(svc.validateFileName('my-file.txt')).toBe(true);
    });

    it('rejects filenames over 255 chars', () => {
      expect(svc.validateFileName('a'.repeat(256))).toBe(false);
      expect(svc.validateFileName('a'.repeat(255))).toBe(true);
    });
  });

  describe('service config', () => {
    it('uses default config when none provided', () => {
      const svc = createFileService();
      expect(svc.config.maxImageSize).toBe(10 * 1024 * 1024);
      expect(svc.config.maxFileSize).toBe(100 * 1024 * 1024);
      expect(svc.config.allowedTypes).toContain('image/jpeg');
    });

    it('merges custom config with defaults', () => {
      const svc = createFileService({ maxImageSize: 1024, maxFileSize: 2048, allowedTypes: ['text/plain'] });
      expect(svc.config.maxImageSize).toBe(1024);
      expect(svc.config.maxFileSize).toBe(2048);
      expect(svc.config.allowedTypes).toEqual(['text/plain']);
      expect(svc.config.allowedImageTypes).toContain('image/jpeg');
    });
  });

  // ── New: uploadFile tests ──────────────────────────────────────────────

  describe('uploadFile', () => {
    let mockStorage: ReturnType<typeof makeMockStorage>;
    let mockProcessor: ImageProcessor;

    beforeEach(() => {
      mockStorage = makeMockStorage();
      mockProcessor = makeMockImageProcessor();
    });

    it('uploads a file and returns result', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage, imageProcessor: mockProcessor });
      const buffer = Buffer.from('test image data');
      const result = await svc.uploadFile(buffer, {
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: buffer.length,
      });

      expect(result.fileId).toMatch(/^file_/);
      expect(result.url).toMatch(/^\/api\/files\/file_/);
      expect(result.metadata.originalName).toBe('photo.jpg');
    });

    it('generates thumbnails for images', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage, imageProcessor: mockProcessor });
      const buffer = Buffer.from('test image data for thumbnail');
      const result = await svc.uploadFile(buffer, {
        originalName: 'photo.jpg',
        mimeType: 'image/jpeg',
        size: buffer.length,
      });

      // Should have thumbnail URL
      expect(result.thumbnailUrl).toBeTruthy();
      expect(result.thumbnailUrl).toContain('thumbnail');

      // Image processor should have been called twice (small + large)
      expect(mockProcessor.resize).toHaveBeenCalledTimes(2);
    });

    it('does not generate thumbnails for non-images', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage, imageProcessor: mockProcessor });
      const buffer = Buffer.from('test pdf data');
      const result = await svc.uploadFile(buffer, {
        originalName: 'doc.pdf',
        mimeType: 'application/pdf',
        size: buffer.length,
      });

      expect(result.thumbnailUrl).toBeUndefined();
      expect(mockProcessor.resize).not.toHaveBeenCalled();
    });

    it('rejects files over size limit', async () => {
      const svc = createFileService(
        { maxImageSize: 100 },
        { storage: mockStorage.storage, imageProcessor: mockProcessor },
      );
      const buffer = Buffer.alloc(200);
      await expect(svc.uploadFile(buffer, {
        originalName: 'big.jpg',
        mimeType: 'image/jpeg',
        size: 200,
      })).rejects.toThrow(FileError);
    });

    it('rejects invalid file types', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage, imageProcessor: mockProcessor });
      const buffer = Buffer.from('malware');
      await expect(svc.uploadFile(buffer, {
        originalName: 'bad.exe',
        mimeType: 'application/x-msdownload',
        size: buffer.length,
      })).rejects.toThrow(FileError);
    });

    it('stores public files accessible without auth', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage, imageProcessor: mockProcessor });
      const buffer = Buffer.from('public data');
      const result = await svc.uploadFile(buffer, {
        originalName: 'public.txt',
        mimeType: 'text/plain',
        size: buffer.length,
      }, { isPublic: true });

      // Public file should be accessible without userId
      const { buffer: retrieved } = await svc.getFile(result.fileId);
      expect(retrieved.toString()).toBe('public data');
    });

    it('stores private files requiring auth', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage, imageProcessor: mockProcessor });
      const buffer = Buffer.from('private data');
      const result = await svc.uploadFile(buffer, {
        originalName: 'private.txt',
        mimeType: 'text/plain',
        size: buffer.length,
      }, { isPublic: false, ownerId: 'user1' });

      // Private file accessible by owner
      const { buffer: retrieved } = await svc.getFile(result.fileId, 'user1');
      expect(retrieved.toString()).toBe('private data');
    });
  });

  // ── New: Access control tests (Test criterion #4) ──────────────────────

  describe('access control', () => {
    let mockStorage: ReturnType<typeof makeMockStorage>;

    beforeEach(() => {
      mockStorage = makeMockStorage();
    });

    it('denies access to private file without userId', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const buffer = Buffer.from('secret');
      const result = await svc.uploadFile(buffer, {
        originalName: 'secret.txt',
        mimeType: 'text/plain',
        size: buffer.length,
      }, { isPublic: false, ownerId: 'user1' });

      await expect(svc.getFile(result.fileId)).rejects.toThrow(FileError);
      await expect(svc.getFile(result.fileId)).rejects.toThrow('未授权访问');
    });

    it('denies access to private file with wrong userId', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const buffer = Buffer.from('secret');
      const result = await svc.uploadFile(buffer, {
        originalName: 'secret.txt',
        mimeType: 'text/plain',
        size: buffer.length,
      }, { isPublic: false, ownerId: 'user1' });

      await expect(svc.getFile(result.fileId, 'user2')).rejects.toThrow(FileError);
      await expect(svc.getFile(result.fileId, 'user2')).rejects.toThrow('无权限访问该文件');
    });

    it('allows access to private file by owner', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const buffer = Buffer.from('my file');
      const result = await svc.uploadFile(buffer, {
        originalName: 'mine.txt',
        mimeType: 'text/plain',
        size: buffer.length,
      }, { isPublic: false, ownerId: 'user1' });

      const { buffer: retrieved } = await svc.getFile(result.fileId, 'user1');
      expect(retrieved.toString()).toBe('my file');
    });

    it('allows access to public file without userId', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const buffer = Buffer.from('public');
      const result = await svc.uploadFile(buffer, {
        originalName: 'public.txt',
        mimeType: 'text/plain',
        size: buffer.length,
      }, { isPublic: true });

      const { buffer: retrieved } = await svc.getFile(result.fileId);
      expect(retrieved.toString()).toBe('public');
    });

    it('denies private thumbnail access without auth', async () => {
      const mockProcessor = makeMockImageProcessor();
      const svc = createFileService({}, { storage: mockStorage.storage, imageProcessor: mockProcessor });
      const buffer = Buffer.from('image data');
      const result = await svc.uploadFile(buffer, {
        originalName: 'private.jpg',
        mimeType: 'image/jpeg',
        size: buffer.length,
      }, { isPublic: false, ownerId: 'user1' });

      await expect(svc.getThumbnail(result.fileId, 'small')).rejects.toThrow(FileError);
      await expect(svc.getThumbnail(result.fileId, 'small')).rejects.toThrow('未授权访问');
    });

    it('allows private thumbnail access by owner', async () => {
      const mockProcessor = makeMockImageProcessor();
      const svc = createFileService({}, { storage: mockStorage.storage, imageProcessor: mockProcessor });
      const buffer = Buffer.from('image data for thumbnail');
      const result = await svc.uploadFile(buffer, {
        originalName: 'private.jpg',
        mimeType: 'image/jpeg',
        size: buffer.length,
      }, { isPublic: false, ownerId: 'user1' });

      const { buffer: thumbBuffer } = await svc.getThumbnail(result.fileId, 'small', 'user1');
      expect(thumbBuffer).toBeDefined();
    });

    it('throws FILE_NOT_FOUND for non-existent file', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      await expect(svc.getFile('nonexistent')).rejects.toThrow(FileError);
      await expect(svc.getFile('nonexistent')).rejects.toThrow('文件不存在');
    });

    it('denies deletion by non-owner', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const buffer = Buffer.from('data');
      const result = await svc.uploadFile(buffer, {
        originalName: 'file.txt',
        mimeType: 'text/plain',
        size: buffer.length,
      }, { isPublic: false, ownerId: 'user1' });

      await expect(svc.deleteFile(result.fileId, 'user2')).rejects.toThrow(FileError);
      await expect(svc.deleteFile(result.fileId, 'user2')).rejects.toThrow('无权限删除该文件');
    });

    it('allows deletion by owner', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const buffer = Buffer.from('data');
      const result = await svc.uploadFile(buffer, {
        originalName: 'file.txt',
        mimeType: 'text/plain',
        size: buffer.length,
      }, { isPublic: false, ownerId: 'user1' });

      await svc.deleteFile(result.fileId, 'user1');
      await expect(svc.getFile(result.fileId, 'user1')).rejects.toThrow('文件不存在');
    });
  });

  // ── New: Chunked upload tests (Test criterion #5) ──────────────────────

  describe('chunked upload', () => {
    let mockStorage: ReturnType<typeof makeMockStorage>;

    beforeEach(() => {
      mockStorage = makeMockStorage();
    });

    it('initializes chunk upload session', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const fileId = await svc.initChunkUpload({
        originalName: 'large.zip',
        mimeType: 'application/zip',
        size: 1024 * 1024,
      }, 5);

      expect(fileId).toMatch(/^file_/);
      const progress = svc.getChunkProgress(fileId);
      expect(progress).toEqual({ received: 0, total: 5 });
    });

    it('rejects invalid chunk count', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      await expect(svc.initChunkUpload({
        originalName: 'large.zip',
        mimeType: 'application/zip',
        size: 1024,
      }, 0)).rejects.toThrow(FileError);

      await expect(svc.initChunkUpload({
        originalName: 'large.zip',
        mimeType: 'application/zip',
        size: 1024,
      }, 10001)).rejects.toThrow(FileError);
    });

    it('uploads individual chunks', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const fileId = await svc.initChunkUpload({
        originalName: 'large.zip',
        mimeType: 'application/zip',
        size: 300,
      }, 3);

      await svc.uploadChunk(fileId, 0, Buffer.from('AAA'));
      await svc.uploadChunk(fileId, 1, Buffer.from('BBB'));
      await svc.uploadChunk(fileId, 2, Buffer.from('CCC'));

      const progress = svc.getChunkProgress(fileId);
      expect(progress).toEqual({ received: 3, total: 3 });
    });

    it('rejects duplicate chunk upload', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const fileId = await svc.initChunkUpload({
        originalName: 'large.zip',
        mimeType: 'application/zip',
        size: 200,
      }, 2);

      await svc.uploadChunk(fileId, 0, Buffer.from('AA'));
      await expect(svc.uploadChunk(fileId, 0, Buffer.from('BB'))).rejects.toThrow(FileError);
    });

    it('rejects invalid chunk index', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const fileId = await svc.initChunkUpload({
        originalName: 'large.zip',
        mimeType: 'application/zip',
        size: 200,
      }, 2);

      await expect(svc.uploadChunk(fileId, -1, Buffer.from('X'))).rejects.toThrow(FileError);
      await expect(svc.uploadChunk(fileId, 5, Buffer.from('X'))).rejects.toThrow(FileError);
    });

    it('merges chunks correctly into final file', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });

      const chunk1 = Buffer.from('Hello, ');
      const chunk2 = Buffer.from('this is ');
      const chunk3 = Buffer.from('a test!');
      const fullBuffer = Buffer.concat([chunk1, chunk2, chunk3]);

      const fileId = await svc.initChunkUpload({
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: fullBuffer.length,
      }, 3, { isPublic: true });

      await svc.uploadChunk(fileId, 0, chunk1);
      await svc.uploadChunk(fileId, 1, chunk2);
      await svc.uploadChunk(fileId, 2, chunk3);

      const result = await svc.mergeChunks(fileId);
      expect(result.fileId).toBeTruthy();
      expect(result.metadata.originalName).toBe('test.txt');

      // Verify the merged file can be retrieved (public, no userId needed)
      const { buffer: retrieved } = await svc.getFile(result.fileId);
      expect(retrieved.toString()).toBe('Hello, this is a test!');
    });

    it('rejects merge when chunks are incomplete', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const fileId = await svc.initChunkUpload({
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: 200,
      }, 3);

      await svc.uploadChunk(fileId, 0, Buffer.from('AAA'));
      // Missing chunks 1 and 2

      await expect(svc.mergeChunks(fileId)).rejects.toThrow(FileError);
      await expect(svc.mergeChunks(fileId)).rejects.toThrow('分片不完整');
    });

    it('rejects merge with size mismatch', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const fileId = await svc.initChunkUpload({
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: 999999, // Wrong size in metadata
      }, 2);

      await svc.uploadChunk(fileId, 0, Buffer.from('AA'));
      await svc.uploadChunk(fileId, 1, Buffer.from('BB'));

      await expect(svc.mergeChunks(fileId)).rejects.toThrow(FileError);
      await expect(svc.mergeChunks(fileId)).rejects.toThrow('大小不匹配');
    });

    it('rejects upload to non-existent chunk session', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      await expect(svc.uploadChunk('nonexistent', 0, Buffer.from('X'))).rejects.toThrow(FileError);
    });

    it('reports null progress for unknown session', () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      expect(svc.getChunkProgress('nonexistent')).toBeNull();
    });

    it('cleans up stale chunk sessions', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      await svc.initChunkUpload({
        originalName: 'old.zip',
        mimeType: 'application/zip',
        size: 100,
      }, 2);

      // Cleanup with 0 max age should remove all sessions
      const cleaned = svc.cleanupStaleChunks(0);
      expect(cleaned).toBe(1);

      // Session should be gone
      const progress = svc.getChunkProgress('any');
      expect(progress).toBeNull();
    });

    it('handles chunk upload merging for large files end-to-end (100MB simulated)', async () => {
      const svc = createFileService({}, { storage: mockStorage.storage });
      const totalSize = 100 * 1024; // 100KB for test speed, simulating large file logic
      const chunkCount = 10;
      const chunkSize = totalSize / chunkCount;

      const fileId = await svc.initChunkUpload({
        originalName: 'bigfile.bin',
        mimeType: 'application/zip',
        size: totalSize,
      }, chunkCount, { isPublic: true });

      // Upload all chunks
      for (let i = 0; i < chunkCount; i++) {
        const chunk = Buffer.alloc(chunkSize, String(i).charCodeAt(0));
        await svc.uploadChunk(fileId, i, chunk);
      }

      const result = await svc.mergeChunks(fileId);
      expect(result.fileId).toBeTruthy();

      // Verify total size
      const { buffer: retrieved } = await svc.getFile(result.fileId);
      expect(retrieved.length).toBe(totalSize);
    });
  });

  // ── New: getFileRecord tests ───────────────────────────────────────────

  describe('getFileRecord', () => {
    it('returns undefined for non-existent file', () => {
      const svc = createFileService();
      expect(svc.getFileRecord('nonexistent')).toBeUndefined();
    });

    it('returns record for uploaded file', async () => {
      const mockStorage = makeMockStorage();
      const svc = createFileService({}, { storage: mockStorage.storage });
      const buffer = Buffer.from('test');
      const result = await svc.uploadFile(buffer, {
        originalName: 'test.txt',
        mimeType: 'text/plain',
        size: buffer.length,
      });

      const record = svc.getFileRecord(result.fileId);
      expect(record).toBeDefined();
      expect(record!.originalName).toBe('test.txt');
      expect(record!.mimeType).toBe('text/plain');
    });
  });

  // ── New: thumbnail generation edge cases ──────────────────────────────

  describe('thumbnail generation', () => {
    it('throws when image processor not configured', async () => {
      const svc = createFileService();
      await expect(svc.generateThumbnail(Buffer.from('img'), 'image/jpeg', 'small'))
        .rejects.toThrow(FileError);
    });

    it('generates small thumbnail at 200x200', async () => {
      const mockProcessor = makeMockImageProcessor();
      const svc = createFileService({}, { imageProcessor: mockProcessor });
      const buffer = Buffer.from('image data');

      const result = await svc.generateThumbnail(buffer, 'image/png', 'small');
      expect(result).toBeDefined();
      expect(mockProcessor.resize).toHaveBeenCalledWith(buffer, 'image/png', 200, 200);
    });

    it('generates large thumbnail at 800x800', async () => {
      const mockProcessor = makeMockImageProcessor();
      const svc = createFileService({}, { imageProcessor: mockProcessor });
      const buffer = Buffer.from('image data');

      const result = await svc.generateThumbnail(buffer, 'image/png', 'large');
      expect(result).toBeDefined();
      expect(mockProcessor.resize).toHaveBeenCalledWith(buffer, 'image/png', 800, 800);
    });
  });
});
