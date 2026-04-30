import { describe, it, expect } from 'vitest';
import { CONFIG } from './config';

describe('CONFIG', () => {
  it('APP_NAME is set', () => {
    expect(CONFIG.APP_NAME).toBe('WeChat Clone');
  });

  it('API_PREFIX is /api/v1', () => {
    expect(CONFIG.API_PREFIX).toBe('/api/v1');
  });

  describe('PAGINATION', () => {
    it('DEFAULT_LIMIT is 20', () => {
      expect(CONFIG.PAGINATION.DEFAULT_LIMIT).toBe(20);
    });

    it('MAX_LIMIT is 100', () => {
      expect(CONFIG.PAGINATION.MAX_LIMIT).toBe(100);
    });

    it('MAX_LIMIT >= DEFAULT_LIMIT', () => {
      expect(CONFIG.PAGINATION.MAX_LIMIT).toBeGreaterThanOrEqual(
        CONFIG.PAGINATION.DEFAULT_LIMIT,
      );
    });
  });

  describe('MESSAGE', () => {
    it('has reasonable sync and conversation limits', () => {
      expect(CONFIG.MESSAGE.MAX_SYNC_COUNT).toBe(50);
      expect(CONFIG.MESSAGE.MAX_CONVERSATION_COUNT).toBe(200);
    });

    it('revoke window is 2 minutes', () => {
      expect(CONFIG.MESSAGE.REVOKE_WINDOW_SEC).toBe(120);
    });
  });

  describe('GROUP', () => {
    it('MAX_MEMBERS is 500', () => {
      expect(CONFIG.GROUP.MAX_MEMBERS).toBe(500);
    });

    it('name and announcement lengths are reasonable', () => {
      expect(CONFIG.GROUP.MAX_NAME_LENGTH).toBe(30);
      expect(CONFIG.GROUP.MAX_ANNOUNCEMENT_LENGTH).toBe(500);
    });
  });

  describe('MOMENT', () => {
    it('MAX_IMAGES is 9', () => {
      expect(CONFIG.MOMENT.MAX_IMAGES).toBe(9);
    });

    it('MAX_CONTENT_LENGTH is 2000', () => {
      expect(CONFIG.MOMENT.MAX_CONTENT_LENGTH).toBe(2000);
    });
  });

  describe('WS', () => {
    it('heartbeat interval is 30s', () => {
      expect(CONFIG.WS.HEARTBEAT_INTERVAL_SEC).toBe(30);
    });

    it('heartbeat timeout > heartbeat interval', () => {
      expect(CONFIG.WS.HEARTBEAT_TIMEOUT_SEC).toBeGreaterThan(
        CONFIG.WS.HEARTBEAT_INTERVAL_SEC,
      );
    });

    it('reconnect delay is 1s', () => {
      expect(CONFIG.WS.RECONNECT_DELAY_MS).toBe(1000);
    });

    it('max reconnect delay is 30s', () => {
      expect(CONFIG.WS.MAX_RECONNECT_DELAY_MS).toBe(30000);
    });

    it('max reconnect delay >= reconnect delay', () => {
      expect(CONFIG.WS.MAX_RECONNECT_DELAY_MS).toBeGreaterThanOrEqual(
        CONFIG.WS.RECONNECT_DELAY_MS,
      );
    });
  });

  describe('SECURITY', () => {
    it('bcrypt rounds is 10', () => {
      expect(CONFIG.SECURITY.BCRYPT_ROUNDS).toBe(10);
    });

    it('JWT expires in 7 days', () => {
      expect(CONFIG.SECURITY.JWT_EXPIRES_IN).toBe(604800);
    });

    it('max login attempts is 5', () => {
      expect(CONFIG.SECURITY.MAX_LOGIN_ATTEMPTS).toBe(5);
    });

    it('login lock time is 15 minutes', () => {
      expect(CONFIG.SECURITY.LOGIN_LOCK_SEC).toBe(900);
    });
  });

  describe('UPLOAD', () => {
    it('avatar max size is 5 MB', () => {
      expect(CONFIG.UPLOAD.AVATAR_MAX_SIZE).toBe(5_242_880);
    });

    it('allowed image types includes common formats', () => {
      expect(CONFIG.UPLOAD.ALLOWED_IMAGE_TYPES).toContain('image/jpeg');
      expect(CONFIG.UPLOAD.ALLOWED_IMAGE_TYPES).toContain('image/png');
      expect(CONFIG.UPLOAD.ALLOWED_IMAGE_TYPES).toContain('image/gif');
      expect(CONFIG.UPLOAD.ALLOWED_IMAGE_TYPES).toContain('image/webp');
    });

    it('allowed file types includes common document formats', () => {
      expect(CONFIG.UPLOAD.ALLOWED_FILE_TYPES).toContain('application/pdf');
      expect(CONFIG.UPLOAD.ALLOWED_FILE_TYPES).toContain('text/plain');
    });

    it('size hierarchy: avatar < image < file < video', () => {
      expect(CONFIG.UPLOAD.AVATAR_MAX_SIZE).toBeLessThan(CONFIG.UPLOAD.IMAGE_MAX_SIZE);
      expect(CONFIG.UPLOAD.IMAGE_MAX_SIZE).toBeLessThan(CONFIG.UPLOAD.FILE_MAX_SIZE);
      expect(CONFIG.UPLOAD.FILE_MAX_SIZE).toBeLessThan(CONFIG.UPLOAD.VIDEO_MAX_SIZE);
    });
  });

  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(CONFIG)).toBe(true);
    expect(Object.isFrozen(CONFIG.PAGINATION)).toBe(true);
    expect(Object.isFrozen(CONFIG.UPLOAD.ALLOWED_IMAGE_TYPES)).toBe(true);
  });
});
