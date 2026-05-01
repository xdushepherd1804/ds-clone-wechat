/**
 * Docker entry point for the file service.
 */
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig, ErrorCode } from '@wechat-clone/shared';
import { createFileService, FileError } from './file.service';
import type { FileMetadata } from './file.service';

const CONFIG_DIR = process.env.CONFIG_DIR || '/app/config';
const config = loadConfig(CONFIG_DIR);
const PORT = config.services.file.port;
const UPLOADS_DIR = process.env.UPLOADS_DIR || 'uploads';

const fileService = createFileService(
  { storagePath: UPLOADS_DIR },
);

// ─── Helpers ───────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, code: number, data: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, err: unknown): void {
  if (err instanceof FileError) {
    sendJson(res, mapErrorCodeToStatus(err.code), { error: err.code, message: err.message });
  } else if (err instanceof Error) {
    sendJson(res, 500, { error: ErrorCode.INTERNAL_ERROR, message: err.message });
  } else {
    sendJson(res, 500, { error: ErrorCode.INTERNAL_ERROR, message: 'Unknown error' });
  }
}

function mapErrorCodeToStatus(code: number): number {
  if (code === ErrorCode.UNAUTHORIZED || code === ErrorCode.TOKEN_EXPIRED) return 401;
  if (code === ErrorCode.FORBIDDEN) return 403;
  if (code === ErrorCode.NOT_FOUND || code === ErrorCode.FILE_NOT_FOUND) return 404;
  if (code === ErrorCode.INVALID_PARAM || code === ErrorCode.FILE_TOO_LARGE || code === ErrorCode.FILE_TYPE_NOT_ALLOWED) return 400;
  if (code === ErrorCode.FILE_UPLOAD_FAILED) return 500;
  return 400;
}

function getUserId(req: IncomingMessage): string | undefined {
  const uid = req.headers['x-user-id'];
  if (Array.isArray(uid)) return uid[0];
  return uid ?? undefined;
}

async function readBody(req: IncomingMessage, maxSize = 100 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxSize) {
        req.destroy(new Error('body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

interface ParsedMultipart {
  fields: Record<string, string>;
  files: Array<{
    fieldName: string;
    filename: string;
    contentType: string;
    buffer: Buffer;
  }>;
}

function parseMultipart(body: Buffer, contentType: string): ParsedMultipart {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
  if (!boundaryMatch) throw new FileError(ErrorCode.INVALID_PARAM, 'Invalid multipart content type');
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const boundaryDelimiter = `--${boundary}`;
  const endDelimiter = `--${boundary}--`;

  const result: ParsedMultipart = { fields: {}, files: [] };
  const bodyStr = body.toString('binary');
  const parts = bodyStr.split(boundaryDelimiter);

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('--')) break; // end delimiter
    if (part === '\r\n' || part === '') continue;

    // Split headers from body
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headerSection = part.slice(0, headerEnd);
    const bodySection = part.slice(headerEnd + 4, part.endsWith('\r\n') ? part.length - 2 : part.length);

    // Parse headers
    const headers: Record<string, string> = {};
    for (const line of headerSection.split('\r\n')) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).trim().toLowerCase();
      const value = line.slice(colonIdx + 1).trim();
      headers[key] = value;
    }

    const disposition = headers['content-disposition'] || '';
    const fieldNameMatch = disposition.match(/name="([^"]+)"/);
    const fieldName = fieldNameMatch ? fieldNameMatch[1] : '';

    const filenameMatch = disposition.match(/filename="([^"]*)"/);
    const filename = filenameMatch ? filenameMatch[1] : '';

    if (filename) {
      // File part
      const contentType = headers['content-type'] || 'application/octet-stream';
      result.files.push({
        fieldName,
        filename,
        contentType,
        buffer: Buffer.from(bodySection, 'binary'),
      });
    } else {
      // Field part
      result.fields[fieldName] = bodySection;
    }
  }

  return result;
}

// ─── URL Routing ───────────────────────────────────────────────────────────

function matchRoute(url: string): { type: string; fileId?: string; stickerId?: string; action?: string } | null {
  // Sticker routes (must match before generic file/:id)
  if (url === '/api/files/stickers/upload' || url.startsWith('/api/files/stickers/upload?')) {
    return { type: 'sticker-upload' };
  }
  if (url === '/api/files/stickers/favorites' || url.startsWith('/api/files/stickers/favorites?')) {
    return { type: 'sticker-favorites' };
  }
  if (url === '/api/files/stickers' || url.startsWith('/api/files/stickers?')) {
    return { type: 'sticker-list' };
  }

  // Match /api/files/stickers/:id/favorite
  const stickerFavMatch = url.match(/^\/api\/files\/stickers\/([^/?]+)\/favorite/);
  if (stickerFavMatch) {
    return { type: 'sticker-favorite', stickerId: stickerFavMatch[1] };
  }

  // Match /api/files/stickers/:id
  const stickerMatch = url.match(/^\/api\/files\/stickers\/([^/?]+)/);
  if (stickerMatch) {
    return { type: 'sticker', stickerId: stickerMatch[1] };
  }

  // GET/POST /api/files/upload
  if (url === '/api/files/upload' || url.startsWith('/api/files/upload?')) {
    return { type: 'upload' };
  }
  // POST /api/files/upload-chunk
  if (url === '/api/files/upload-chunk' || url.startsWith('/api/files/upload-chunk?')) {
    return { type: 'chunk-init' };
  }
  // POST /api/files/merge-chunks
  if (url === '/api/files/merge-chunks' || url.startsWith('/api/files/merge-chunks?')) {
    return { type: 'chunk-merge' };
  }

  // Match /api/files/:id/thumbnail
  const thumbMatch = url.match(/^\/api\/files\/([^\/?]+)\/thumbnail/);
  if (thumbMatch) {
    return { type: 'thumbnail', fileId: thumbMatch[1] };
  }

  // Match /api/files/:id (download/delete)
  const fileMatch = url.match(/^\/api\/files\/([^\/?]+)/);
  if (fileMatch) {
    return { type: 'file', fileId: fileMatch[1] };
  }

  return null;
}

// ─── Server ─────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url || '/';

  // Health check
  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'file', timestamp: Date.now() }));
    return;
  }

  // Route matching
  const route = matchRoute(url);
  const userId = getUserId(req);

  try {
    if (!route) {
      // Default response for root
      sendJson(res, 200, { service: 'file', message: 'File service running' });
      return;
    }

    switch (route.type) {
      // ── POST /api/files/upload ─────────────────────────────────
      case 'upload': {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 405, message: 'Method not allowed' });
          return;
        }

        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data')) {
          sendJson(res, 400, { error: ErrorCode.INVALID_PARAM, message: '需要 multipart/form-data' });
          return;
        }

        const maxUploadSize = 100 * 1024 * 1024; // 100MB max body
        const body = await readBody(req, maxUploadSize);
        const parsed = parseMultipart(body, contentType);

        const uploadedFiles = [];
        for (const file of parsed.files) {
          const metadata: FileMetadata = {
            originalName: file.filename,
            mimeType: file.contentType,
            size: file.buffer.length,
          };

          const isPublic = parsed.fields['isPublic'] === 'true';
          const result = await fileService.uploadFile(file.buffer, metadata, {
            isPublic,
            ownerId: userId,
          });
          uploadedFiles.push(result);
        }

        sendJson(res, 201, { files: uploadedFiles });
        break;
      }

      // ── GET /api/files/:id ─────────────────────────────────────
      case 'file': {
        if (req.method === 'GET') {
          const { record, buffer } = await fileService.getFile(route.fileId!, userId);

          res.writeHead(200, {
            'Content-Type': record.mimeType,
            'Content-Length': String(buffer.length),
            'Content-Disposition': `inline; filename="${encodeURIComponent(record.originalName)}"`,
            'X-File-Id': record.fileId,
          });
          res.end(buffer);
        } else if (req.method === 'DELETE') {
          await fileService.deleteFile(route.fileId!, userId);
          sendJson(res, 200, { message: '文件已删除' });
        } else {
          sendJson(res, 405, { error: 405, message: 'Method not allowed' });
        }
        break;
      }

      // ── GET /api/files/:id/thumbnail ───────────────────────────
      case 'thumbnail': {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 405, message: 'Method not allowed' });
          return;
        }

        // Parse ?size=small|large
        const urlObj = new URL(url, 'http://localhost');
        const size = (urlObj.searchParams.get('size') || 'small') as 'small' | 'large';

        const { record, buffer } = await fileService.getThumbnail(route.fileId!, size, userId);

        res.writeHead(200, {
          'Content-Type': record.mimeType,
          'Content-Length': String(buffer.length),
          'Cache-Control': 'public, max-age=86400',
        });
        res.end(buffer);
        break;
      }

      // ── POST /api/files/upload-chunk ───────────────────────────
      case 'chunk-init': {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 405, message: 'Method not allowed' });
          return;
        }

        const body = await readBody(req, 1024 * 1024);
        const payload = JSON.parse(body.toString());

        // Init chunk upload: { metadata, totalChunks, isPublic }
        if (payload.metadata && payload.totalChunks) {
          const metadata: FileMetadata = payload.metadata;
          const isPublic = payload.isPublic ?? false;
          const fileId = await fileService.initChunkUpload(metadata, payload.totalChunks, {
            isPublic,
            ownerId: userId,
          });
          sendJson(res, 201, { fileId, totalChunks: payload.totalChunks });
        } else if (payload.fileId && payload.chunkIndex !== undefined) {
          // Upload individual chunk: { fileId, chunkIndex, data (base64) }
          const chunkBuffer = Buffer.from(payload.data, 'base64');
          await fileService.uploadChunk(payload.fileId, payload.chunkIndex, chunkBuffer);
          const progress = fileService.getChunkProgress(payload.fileId);
          sendJson(res, 200, { progress });
        } else {
          sendJson(res, 400, { error: ErrorCode.INVALID_PARAM, message: 'Invalid chunk upload request' });
        }
        break;
      }

      // ── Sticker routes ─────────────────────────────────────────

      // POST /api/files/stickers/upload
      case 'sticker-upload': {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 405, message: 'Method not allowed' });
          return;
        }
        if (!userId) {
          sendJson(res, 401, { error: ErrorCode.UNAUTHORIZED, message: '需要登录' });
          return;
        }

        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data')) {
          sendJson(res, 400, { error: ErrorCode.INVALID_PARAM, message: '需要 multipart/form-data' });
          return;
        }

        const body = await readBody(req, 10 * 1024 * 1024);
        const parsed = parseMultipart(body, contentType);

        if (parsed.files.length === 0) {
          sendJson(res, 400, { error: ErrorCode.INVALID_PARAM, message: '未找到贴图文件' });
          return;
        }

        const file = parsed.files[0];
        const metadata: FileMetadata = {
          originalName: file.filename,
          mimeType: file.contentType,
          size: file.buffer.length,
        };

        const result = await fileService.uploadSticker(file.buffer, metadata, {
          isPublic: parsed.fields['isPublic'] === 'true',
          userId,
        });
        sendJson(res, 201, result);
        break;
      }

      // GET /api/files/stickers
      case 'sticker-list': {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 405, message: 'Method not allowed' });
          return;
        }
        if (!userId) {
          sendJson(res, 401, { error: ErrorCode.UNAUTHORIZED, message: '需要登录' });
          return;
        }
        const stickerResult = fileService.getStickers(userId);
        sendJson(res, 200, stickerResult);
        break;
      }

      // GET /api/files/stickers/favorites
      case 'sticker-favorites': {
        if (req.method !== 'GET') {
          sendJson(res, 405, { error: 405, message: 'Method not allowed' });
          return;
        }
        if (!userId) {
          sendJson(res, 401, { error: ErrorCode.UNAUTHORIZED, message: '需要登录' });
          return;
        }
        const favStickers = fileService.getFavoriteStickers(userId);
        sendJson(res, 200, { stickers: favStickers, total: favStickers.length });
        break;
      }

      // GET /api/files/stickers/:id
      case 'sticker': {
        if (req.method === 'GET') {
          try {
            const { record, buffer } = await fileService.getStickerFile(route.stickerId!);
            res.writeHead(200, {
              'Content-Type': 'image/png',
              'Content-Length': String(buffer.length),
              'Cache-Control': 'public, max-age=31536000',
            });
            res.end(buffer);
          } catch {
            sendJson(res, 404, { error: ErrorCode.STICKER_NOT_FOUND, message: '贴图不存在' });
          }
        } else if (req.method === 'DELETE') {
          if (!userId) {
            sendJson(res, 401, { error: ErrorCode.UNAUTHORIZED, message: '需要登录' });
            return;
          }
          await fileService.deleteSticker(route.stickerId!, userId);
          sendJson(res, 200, { message: '贴图已删除' });
        } else {
          sendJson(res, 405, { error: 405, message: 'Method not allowed' });
        }
        break;
      }

      // POST/DELETE /api/files/stickers/:id/favorite
      case 'sticker-favorite': {
        if (!userId) {
          sendJson(res, 401, { error: ErrorCode.UNAUTHORIZED, message: '需要登录' });
          return;
        }
        if (req.method === 'POST') {
          fileService.favoriteSticker(userId, route.stickerId!);
          sendJson(res, 200, { message: '已收藏' });
        } else if (req.method === 'DELETE') {
          fileService.unfavoriteSticker(userId, route.stickerId!);
          sendJson(res, 200, { message: '已取消收藏' });
        } else {
          sendJson(res, 405, { error: 405, message: 'Method not allowed' });
        }
        break;
      }

      // ── POST /api/files/merge-chunks ───────────────────────────
      case 'chunk-merge': {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: 405, message: 'Method not allowed' });
          return;
        }

        const body = await readBody(req, 1024 * 1024);
        const payload = JSON.parse(body.toString());

        const result = await fileService.mergeChunks(payload.fileId);
        sendJson(res, 200, result);
        break;
      }

      default:
        sendJson(res, 404, { error: 404, message: 'Not found' });
    }
  } catch (err) {
    sendError(res, err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[file] listening on 0.0.0.0:${PORT}`);
});
