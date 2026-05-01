/**
 * @wechat-clone/shared — shared types, constants, utilities, and database schema
 */

// ─── DB ────────────────────────────────────────────────────────────────────

export { RedisKeys, RedisKeyPatterns } from './db/redis-keys';
export { messageIndexes, messageBoxIndexes } from './db/mongo-indexes';

// ─── Config ─────────────────────────────────────────────────────────────────
// NOTE: Config module is Node.js-only (uses fs, path, yaml) and is NOT re-exported
// here to keep this barrel browser-safe. Server code should import from:
//   import { loadConfig } from '@wechat-clone/shared/config';
export type {
  AppConfig,
  AppSettings,
  GatewaySettings,
  ServiceEndpoint,
  ServicesConfig,
  DatabaseConfig,
  PostgresConfig,
  RedisConfig,
  MongoConfig,
  JwtConfig,
  ServiceRegistryEntry,
  ServiceRegistry,
  EnvName,
} from './config';

// ─── Types ─────────────────────────────────────────────────────────────────

export type * from './types/user';
export type * from './types/message';
export type * from './types/contact';
export type * from './types/group';
export type * from './types/moments';
export type * from './types/redpacket';
export type * from './types/api';
export type * from './types/ws';
export type * from './types/call';
export type * from './types/qrcode';
export type * from './types/sticker';

// Emoji
export { EMOJI_CATEGORIES, ALL_EMOJIS, searchEmojis } from './emoji/emoji-data';
export type { EmojiCategory } from './emoji/emoji-data';

// Enums — runtime + type
export { MsgType, MsgStatus, ChatType } from './types/message';

// ─── Constants ─────────────────────────────────────────────────────────────

export { ErrorCode, ErrorMessage } from './constants/error-codes';
export type { ErrorCodeValue } from './constants/error-codes';

export {
  MsgTypeLabel,
  MSG_CONTENT_MAX_LENGTH,
  VOICE_MAX_DURATION_SEC,
  FILE_MAX_SIZE,
  IMAGE_MAX_SIZE,
  VIDEO_MAX_SIZE,
} from './constants/msg-types';

export { CONFIG } from './constants/config';

// ─── Utils ─────────────────────────────────────────────────────────────────

export { generateId, generateShortId, extractTimestamp } from './utils/id-generator';
export {
  formatTime,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  isToday,
  isYesterday,
  now,
  nowISO,
} from './utils/time';
export {
  encrypt,
  decrypt,
  md5,
  sha256,
  randomToken,
  hashPassword,
  verifyPassword,
} from './utils/crypto';
export {
  isValidUsername,
  isValidPassword,
  isValidNickname,
  isValidPhone,
  isValidEmail,
  isValidUrl,
  isValidId,
  isValidMsgContent,
  sanitizeText,
} from './utils/validator';

// ─── Re-export Prisma types ────────────────────────────────────────────────

export type {
  User,
  Contact,
  Group,
  GroupMember,
  Moment as PrismaMoment,
  MomentLike as PrismaMomentLike,
  MomentComment as PrismaMomentComment,
  RedPacket,
  RedPacketRecord,
} from '@prisma/client';
