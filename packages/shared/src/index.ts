/**
 * @wechat-clone/shared — shared types, constants, utilities, and database schema
 */

export { RedisKeys, RedisKeyPatterns } from './db/redis-keys';
export { messageIndexes, messageBoxIndexes } from './db/mongo-indexes';

// re-export generated Prisma client types (use @prisma/client for runtime)
export type {
  User,
  Contact,
  Group,
  GroupMember,
  Moment,
  MomentLike,
  MomentComment,
} from '@prisma/client';
