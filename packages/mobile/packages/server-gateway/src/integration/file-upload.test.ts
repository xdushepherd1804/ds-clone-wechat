/**
 * T028 — File Upload Integration Test
 *
 * Scenario:
 *   1. Upload an image → generate thumbnail
 *   2. Send an image message
 *   3. Receiver views image and thumbnail
 *
 * Tests file service integration with chat messaging.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAuthService } from '../../../server-auth/src/auth.service';
import type { AuthDeps } from '../../../server-auth/src/auth.service';
import { createContactService } from '../../../server-contact/src/contact.service';
import { createMessageService } from '../../../server-message/src/message.service';
import { createFileService, FileError } from '../../../server-file/src/file.service';
import type { FileStorage, ImageProcessor } from '../../../server-file/src/file.service';
import {
  makeMockPrisma,
  makeMockMongo,
  makeMockRedis,
  InMemorySessionStore,
  TEST_JWT_SECRET,
  resetCounters,
} from './test-helpers';
import type { AuthConfig } from '../../../server-auth/src/auth.service';

const AUTH_CONFIG: AuthConfig = { jwtSecret: TEST_JWT_SECRET, accessExpire: '15m', refreshExpire: '7d' };

// ─── Mock storage & image processor ───────────────────────────────────────────

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
      exists: vi.fn(async (filePath: string) => files.has(filePath)),
      mkdir: vi.fn(async (_dirPath: string) => {}),
    } as FileStorage,
  };
}

function makeMockImageProcessor() {
  return {
    resize: vi.fn(async (buffer: Buffer, _mimeType: string, width: number, _height: number) => {
      const header = Buffer.from(`thumb_${width}x${_height}_`);
      return Buffer.concat([header, buffer.slice(0, Math.min(buffer.length, 100))]);
    }),
  } as ImageProcessor;
}

describe('File Upload Integration', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let mongo: ReturnType<typeof makeMockMongo>;
  let redis: ReturnType<typeof makeMockRedis>;
  let auth: ReturnType<typeof createAuthService>;
  let contact: ReturnType<typeof createContactService>;
  let message: ReturnType<typeof createMessageService>;
  let fileService: ReturnType<typeof createFileService>;
  let mockStorage: ReturnType<typeof makeMockStorage>;
  let imageProcessor: ImageProcessor;

  beforeEach(() => {
    resetCounters();
    prisma = makeMockPrisma();
    mongo = makeMockMongo();
    redis = makeMockRedis();
    mockStorage = makeMockStorage();
    imageProcessor = makeMockImageProcessor();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    auth = createAuthService({
      prisma: prisma as unknown as AuthDeps['prisma'],
      redis: redis as any,
      config: AUTH_CONFIG,
      sessionStore: new InMemorySessionStore(),
    });

    contact = createContactService({ prisma: prisma as unknown as any, redis: redis as any });

    message = createMessageService({
      prisma: prisma as unknown as any,
      mongo: mongo as any,
      redis: redis as any,
    });

    fileService = createFileService(
      { storagePath: '/tmp/test-uploads' },
      { storage: mockStorage.storage, imageProcessor },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Step 1: Upload image → generate thumbnail ──────────────────────────

  describe('step 1 — upload image with thumbnail', () => {
    it('uploads an image and generates thumbnails', async () => {
      const imageBuffer = Buffer.from('fake-image-data-' + 'x'.repeat(1024));
      const result = await fileService.uploadFile(
        imageBuffer,
        {
          originalName: 'sunset.jpg',
          mimeType: 'image/jpeg',
          size: imageBuffer.length,
          width: 1920,
          height: 1080,
        },
        { ownerId: 'user-1', isPublic: false },
      );

      expect(result.fileId).toBeTruthy();
      expect(result.url).toContain('/api/files/');
      expect(result.thumbnailUrl).toContain('/thumbnail');
      expect(result.metadata.originalName).toBe('sunset.jpg');
    });

    it('stores the file in mock storage', async () => {
      const imageBuffer = Buffer.from('store-me');
      const result = await fileService.uploadFile(
        imageBuffer,
        { originalName: 'test.png', mimeType: 'image/png', size: imageBuffer.length },
        { isPublic: true },
      );

      const { buffer } = await fileService.getFile(result.fileId);
      expect(buffer.toString()).toBe('store-me');
    });

    it('generates small and large thumbnails for images', async () => {
      const imageBuffer = Buffer.from('thumbnail-test-image-data');
      const result = await fileService.uploadFile(
        imageBuffer,
        { originalName: 'photo.jpg', mimeType: 'image/jpeg', size: imageBuffer.length },
        { ownerId: 'user-1' },
      );

      // Thumbnail URL should be present
      expect(result.thumbnailUrl).toBeTruthy();

      // Should be able to fetch thumbnails
      const smallThumb = await fileService.getThumbnail(result.fileId, 'small', 'user-1');
      expect(smallThumb.buffer.toString()).toContain('thumb_200x200');

      const largeThumb = await fileService.getThumbnail(result.fileId, 'large', 'user-1');
      expect(largeThumb.buffer.toString()).toContain('thumb_800x800');
    });

    it('rejects file with unsupported type', async () => {
      await expect(
        fileService.uploadFile(
          Buffer.from('data'),
          { originalName: 'malware.exe', mimeType: 'application/x-msdownload', size: 100 },
        ),
      ).rejects.toThrow(FileError);
    });

    it('rejects file exceeding size limit', async () => {
      const maxSize = 10 * 1024 * 1024 + 1;
      await expect(
        fileService.uploadFile(
          Buffer.alloc(maxSize),
          { originalName: 'huge.jpg', mimeType: 'image/jpeg', size: maxSize },
        ),
      ).rejects.toThrow(FileError);
    });

    it('rejects empty file', async () => {
      await expect(
        fileService.uploadFile(
          Buffer.alloc(0),
          { originalName: 'empty.txt', mimeType: 'text/plain', size: 0 },
        ),
      ).rejects.toThrow(FileError);
    });
  });

  // ─── Step 2: Send an image message ──────────────────────────────────────

  describe('step 2 — send image message', () => {
    let userIdA: string;
    let userIdB: string;

    beforeEach(async () => {
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });
      const b = await auth.register({ username: 'bob', password: 'pass67890', nickname: 'Bob' });
      userIdA = a.user.id;
      userIdB = b.user.id;

      const req = await contact.sendFriendRequest({ fromUid: userIdA, toUid: userIdB });
      await contact.handleFriendRequest({ requestId: req.id, action: 'accept', userId: userIdB });
    });

    it('uploads an image and sends it as a message', async () => {
      // Upload image
      const imageBuffer = Buffer.from('image-for-message');
      const upload = await fileService.uploadFile(
        imageBuffer,
        { originalName: 'cat.jpg', mimeType: 'image/jpeg', size: imageBuffer.length },
        { ownerId: userIdA },
      );

      // Send image message referencing the file
      const msg = await message.sendMessage({
        fromUid: userIdA,
        toUid: userIdB,
        chatType: 'private',
        msgType: 'image' as any,
        content: JSON.stringify({ fileId: upload.fileId, url: upload.url }),
      });

      expect(msg.msgType).toBe('image');
      expect(msg.fromUid).toBe(userIdA);
      expect(msg.toUid).toBe(userIdB);

      const parsed = JSON.parse(msg.content);
      expect(parsed.fileId).toBe(upload.fileId);
    });
  });

  // ─── Step 3: Receiver views image and thumbnail ─────────────────────────

  describe('step 3 — receiver views file', () => {
    it('receiver can download the file', async () => {
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });
      const b = await auth.register({ username: 'bob', password: 'pass67890', nickname: 'Bob' });

      // A uploads a public image
      const imageBuffer = Buffer.from('public-image-content');
      const upload = await fileService.uploadFile(
        imageBuffer,
        { originalName: 'shared.jpg', mimeType: 'image/jpeg', size: imageBuffer.length },
        { isPublic: true, ownerId: a.user.id },
      );

      // B downloads it (public file, no auth needed)
      const { buffer } = await fileService.getFile(upload.fileId);
      expect(buffer.toString()).toBe('public-image-content');
    });

    it('access control: private file requires owner', async () => {
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });
      const b = await auth.register({ username: 'bob', password: 'pass67890', nickname: 'Bob' });

      // A uploads a private image
      const imageBuffer = Buffer.from('private-data');
      const upload = await fileService.uploadFile(
        imageBuffer,
        { originalName: 'private.jpg', mimeType: 'image/jpeg', size: imageBuffer.length },
        { ownerId: a.user.id, isPublic: false },
      );

      // Owner can access
      const { buffer } = await fileService.getFile(upload.fileId, a.user.id);
      expect(buffer.toString()).toBe('private-data');

      // B cannot access (wrong owner)
      await expect(
        fileService.getFile(upload.fileId, b.user.id),
      ).rejects.toThrow(FileError);
    });

    it('access control: thumbnail respects owner check', async () => {
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });
      const b = await auth.register({ username: 'bob', password: 'pass67890', nickname: 'Bob' });

      const imageBuffer = Buffer.from('thumb-test-data');
      const upload = await fileService.uploadFile(
        imageBuffer,
        { originalName: 'thumb-test.jpg', mimeType: 'image/jpeg', size: imageBuffer.length },
        { ownerId: a.user.id, isPublic: false },
      );

      // Owner can access thumbnail
      const thumb = await fileService.getThumbnail(upload.fileId, 'small', a.user.id);
      expect(thumb.buffer.toString()).toContain('thumb_200x200');

      // B cannot
      await expect(
        fileService.getThumbnail(upload.fileId, 'small', b.user.id),
      ).rejects.toThrow(FileError);
    });

    it('can delete file with proper authorization', async () => {
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });

      const imageBuffer = Buffer.from('delete-me');
      const upload = await fileService.uploadFile(
        imageBuffer,
        { originalName: 'tmp.jpg', mimeType: 'image/jpeg', size: imageBuffer.length },
        { ownerId: a.user.id },
      );

      // Delete as owner
      await fileService.deleteFile(upload.fileId, a.user.id);

      // File should no longer exist
      await expect(
        fileService.getFile(upload.fileId, a.user.id),
      ).rejects.toThrow(FileError);
    });

    it('prevents unauthorized deletion', async () => {
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });
      const b = await auth.register({ username: 'bob', password: 'pass67890', nickname: 'Bob' });

      const imageBuffer = Buffer.from('protected');
      const upload = await fileService.uploadFile(
        imageBuffer,
        { originalName: 'protected.jpg', mimeType: 'image/jpeg', size: imageBuffer.length },
        { ownerId: a.user.id },
      );

      // B cannot delete A's file
      await expect(
        fileService.deleteFile(upload.fileId, b.user.id),
      ).rejects.toThrow(FileError);
    });
  });

  // ─── Chunked upload ──────────────────────────────────────────────────────

  describe('chunked upload', () => {
    it('uploads a file in chunks and merges successfully', async () => {
      const totalSize = 1024 * 100; // 100KB
      const chunkSize = 1024 * 10; // 10KB per chunk
      const totalChunks = totalSize / chunkSize;
      const fullBuffer = Buffer.alloc(totalSize, 0x42); // filled with 'B'

      // Init chunk upload
      const fileId = await fileService.initChunkUpload(
        { originalName: 'bigfile.bin', mimeType: 'application/zip', size: totalSize },
        totalChunks,
        { ownerId: 'user-1' },
      );
      expect(fileId).toBeTruthy();

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const chunk = fullBuffer.subarray(i * chunkSize, (i + 1) * chunkSize);
        await fileService.uploadChunk(fileId, i, chunk);
      }

      // Check progress
      const progress = fileService.getChunkProgress(fileId);
      expect(progress).not.toBeNull();
      expect(progress!.received).toBe(totalChunks);
      expect(progress!.total).toBe(totalChunks);

      // Merge chunks
      const result = await fileService.mergeChunks(fileId);
      expect(result.fileId).toBeTruthy();
      expect(result.metadata.size).toBe(totalSize);

      // Verify merged file
      const { buffer } = await fileService.getFile(result.fileId, 'user-1');
      expect(buffer.length).toBe(totalSize);
      expect(buffer[0]).toBe(0x42);
    });

    it('rejects chunk with invalid index', async () => {
      const fileId = await fileService.initChunkUpload(
        { originalName: 'test.bin', mimeType: 'application/zip', size: 100 },
        2,
      );

      await expect(
        fileService.uploadChunk(fileId, 5, Buffer.from('data')),
      ).rejects.toThrow(FileError);
    });

    it('rejects merge when chunks are incomplete', async () => {
      const fileId = await fileService.initChunkUpload(
        { originalName: 'test.bin', mimeType: 'application/zip', size: 200 },
        3,
      );

      await fileService.uploadChunk(fileId, 0, Buffer.alloc(100));
      // Missing chunks 1 and 2
      await expect(fileService.mergeChunks(fileId)).rejects.toThrow(FileError);
    });

    it('cleans up stale chunk uploads', async () => {
      await fileService.initChunkUpload(
        { originalName: 'stale.bin', mimeType: 'application/zip', size: 100 },
        2,
      );

      // Cleanup with 0ms max age (everything is stale)
      const cleaned = fileService.cleanupStaleChunks(0);
      expect(cleaned).toBeGreaterThan(0);
    });
  });

  // ─── Full file upload flow ────────────────────────────────────────────────

  describe('full file upload flow', () => {
    it('complete scenario: upload → thumbnail → send → receive → delete', async () => {
      const a = await auth.register({ username: 'alice', password: 'pass12345', nickname: 'Alice' });
      const b = await auth.register({ username: 'bob', password: 'pass67890', nickname: 'Bob' });

      // Make friends
      const req = await contact.sendFriendRequest({ fromUid: a.user.id, toUid: b.user.id });
      await contact.handleFriendRequest({ requestId: req.id, action: 'accept', userId: b.user.id });

      // Upload image
      const imageBuffer = Buffer.from('integration-test-image');
      const upload = await fileService.uploadFile(
        imageBuffer,
        { originalName: 'moment.jpg', mimeType: 'image/jpeg', size: imageBuffer.length },
        { ownerId: a.user.id, isPublic: false },
      );

      // Verify file exists
      const { buffer } = await fileService.getFile(upload.fileId, a.user.id);
      expect(buffer.toString()).toBe('integration-test-image');

      // Verify thumbnails generated
      const thumb = await fileService.getThumbnail(upload.fileId, 'small', a.user.id);
      expect(thumb.buffer.length).toBeGreaterThan(0);

      // Send as image message
      const msg = await message.sendMessage({
        fromUid: a.user.id,
        toUid: b.user.id,
        chatType: 'private',
        msgType: 'image' as any,
        content: JSON.stringify({ fileId: upload.fileId, url: upload.url, thumbUrl: upload.thumbnailUrl }),
      });
      expect(msg.content).toContain(upload.fileId);

      // Clean up
      await fileService.deleteFile(upload.fileId, a.user.id);
      await expect(
        fileService.getFile(upload.fileId, a.user.id),
      ).rejects.toThrow(FileError);
    });
  });
});
