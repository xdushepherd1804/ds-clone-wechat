import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { ErrorCode, CONFIG } from '@wechat-clone/shared';
import { RedisKeys } from '@wechat-clone/shared/db/redis-keys';
import type { MomentItem, MomentLike, MomentComment } from '@wechat-clone/shared';

// ─── Redis key for timeline cache ────────────────────────────────────────────

const PREFIX = 'wc';
const timelineKey = (uid: string) => `${PREFIX}:moments:timeline:${uid}`;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MomentsServiceDeps {
  prisma: PrismaClient;
  redis?: Redis | null;
}

export interface CreateMomentInput {
  userId: string;
  content?: string;
  images?: string[];
  location?: string;
  visibility?: string;
}

export interface DeleteMomentInput {
  momentId: string;
  userId: string;
}

export interface AddCommentInput {
  momentId: string;
  userId: string;
  content: string;
  replyToId?: string;
}

export interface DeleteCommentInput {
  momentId: string;
  commentId: string;
  userId: string;
}

export interface LikeMomentInput {
  momentId: string;
  userId: string;
}

export interface TimelineQuery {
  userId: string;
  before?: string;
  limit?: number;
}

export interface ToggleLikeResult {
  liked: boolean;
}

export class MomentError extends Error {
  override name = 'MomentError';
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

interface UserProfile {
  id: string;
  nickname: string;
  avatar: string | null;
}

type LikeRow = {
  id: string;
  momentId: string;
  userId: string;
  createdAt: Date | string;
};

type CommentRow = {
  id: string;
  momentId: string;
  userId: string;
  replyToId: string | null;
  content: string;
  createdAt: Date | string;
};

function toISO(d: Date | string | undefined | null): string {
  if (d instanceof Date) return d.toISOString();
  return String(d ?? '');
}

function mapLike(l: LikeRow, profiles: Map<string, UserProfile>): MomentLike {
  return {
    id: l.id,
    momentId: l.momentId,
    userId: l.userId,
    createdAt: toISO(l.createdAt),
    user: profiles.get(l.userId) ?? { id: l.userId, nickname: '', avatar: null },
  };
}

function mapComment(
  c: CommentRow,
  profiles: Map<string, UserProfile>,
  replyToUserId?: string,
): MomentComment {
  const commentUser = profiles.get(c.userId);
  const replyUser = replyToUserId ? profiles.get(replyToUserId) : undefined;
  return {
    id: c.id,
    momentId: c.momentId,
    userId: c.userId,
    replyToId: c.replyToId,
    content: c.content,
    createdAt: toISO(c.createdAt),
    user: commentUser
      ? { id: commentUser.id, nickname: commentUser.nickname, avatar: commentUser.avatar }
      : { id: c.userId, nickname: '', avatar: null },
    ...(replyUser && c.replyToId
      ? { replyTo: { id: c.replyToId, nickname: replyUser.nickname } }
      : {}),
  };
}

function mapToMomentItem(
  moment: any,
  profiles: Map<string, UserProfile>,
  replyMap?: Map<string, string>,
): MomentItem {
  const likes: MomentLike[] = (moment.likes ?? []).map((l: LikeRow) => mapLike(l, profiles));
  const comments: MomentComment[] = (moment.comments ?? []).map((c: CommentRow) => {
    const replyToUserId = c.replyToId && replyMap ? replyMap.get(c.replyToId) : undefined;
    return mapComment(c, profiles, replyToUserId);
  });
  const author = profiles.get(moment.userId);

  return {
    id: moment.id,
    userId: moment.userId,
    content: moment.content ?? null,
    images: moment.images ?? [],
    location: moment.location ?? null,
    visibility: moment.visibility,
    likes,
    comments,
    likeCount: likes.length,
    commentCount: comments.length,
    createdAt: toISO(moment.createdAt),
    user: author
      ? { id: author.id, nickname: author.nickname, avatar: author.avatar }
      : { id: moment.userId, nickname: '', avatar: null },
  };
}

/** Collect all user IDs referenced in moments/likes/comments */
function collectUserIds(moments: any[]): string[] {
  const ids = new Set<string>();
  for (const m of moments) {
    ids.add(m.userId);
    for (const l of (m.likes ?? [])) ids.add(l.userId);
    for (const c of (m.comments ?? [])) {
      ids.add(c.userId);
      // replyToId is a comment ID, not a user ID — resolved separately
    }
  }
  return [...ids];
}

/** Batch fetch user profiles from DB, optionally hydrating from Redis */
async function fetchProfiles(
  prisma: PrismaClient,
  redis: Redis | null,
  uids: string[],
): Promise<Map<string, UserProfile>> {
  const map = new Map<string, UserProfile>();

  // Try Redis cache first
  const missed: string[] = [];
  if (redis) {
    const cacheKeys = uids.map((uid) => RedisKeys.userProfile(uid));
    try {
      const cached = await redis.mget(cacheKeys);
      for (let i = 0; i < uids.length; i++) {
        if (cached[i]) {
          try {
            map.set(uids[i], JSON.parse(cached[i]));
          } catch {
            missed.push(uids[i]);
          }
        } else {
          missed.push(uids[i]);
        }
      }
    } catch {
      missed.push(...uids);
    }
  } else {
    missed.push(...uids);
  }

  // Fetch missing from DB
  if (missed.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: missed } },
      select: { id: true, nickname: true, avatar: true },
    });
    for (const u of users) {
      const profile: UserProfile = { id: u.id, nickname: u.nickname, avatar: u.avatar };
      map.set(u.id, profile);
      // Write back to Redis
      if (redis) {
        try {
          await redis.set(
            RedisKeys.userProfile(u.id),
            JSON.stringify(profile),
            'EX',
            RedisKeys.USER_PROFILE_TTL,
          );
        } catch { /* ignore */ }
      }
    }
    // Fill in unknowns
    for (const uid of missed) {
      if (!map.has(uid)) {
        map.set(uid, { id: uid, nickname: '', avatar: null });
      }
    }
  }

  return map;
}

/** Fetch userIds for all reply-to comments in a batch */
async function fetchReplyUserMap(
  prisma: PrismaClient,
  comments: CommentRow[],
): Promise<Map<string, string>> {
  const replyIds = [...new Set(comments.map((c) => c.replyToId).filter(Boolean))] as string[];
  if (replyIds.length === 0) return new Map();

  const replied = await prisma.momentComment.findMany({
    where: { id: { in: replyIds } },
    select: { id: true, userId: true },
  });
  const map = new Map<string, string>();
  for (const r of replied) map.set(r.id, r.userId);
  return map;
}

/** Push a moment ID to all friends' timeline caches */
async function pushToFriendsTimelines(
  redis: Redis | null,
  prisma: PrismaClient,
  authorId: string,
  momentId: string,
  createdAt: Date,
) {
  if (!redis) return;

  // Get all users who have this author as a contact (friends)
  const reverseContacts = await prisma.contact.findMany({
    where: { contactId: authorId, status: 'active' },
    select: { userId: true },
  });
  const friendIds = reverseContacts.map((c) => c.userId);
  // Also push to author's own timeline
  friendIds.push(authorId);

  const score = createdAt.getTime();
  try {
    const pipeline = redis.pipeline();
    for (const uid of friendIds) {
      pipeline.zadd(timelineKey(uid), score, momentId);
    }
    await pipeline.exec();
  } catch { /* ignore */ }
}

/** Remove a moment ID from all friends' timeline caches */
async function removeFromTimelines(
  redis: Redis | null,
  prisma: PrismaClient,
  authorId: string,
  momentId: string,
) {
  if (!redis) return;

  const reverseContacts = await prisma.contact.findMany({
    where: { contactId: authorId, status: 'active' },
    select: { userId: true },
  });
  const friendIds = reverseContacts.map((c) => c.userId);
  friendIds.push(authorId);

  try {
    const pipeline = redis.pipeline();
    for (const uid of friendIds) {
      pipeline.zrem(timelineKey(uid), momentId);
    }
    await pipeline.exec();
  } catch { /* ignore */ }
}

/** Get friend IDs for a user */
async function getFriendIds(prisma: PrismaClient, userId: string): Promise<string[]> {
  const contacts = await prisma.contact.findMany({
    where: { userId, status: 'active' },
    select: { contactId: true },
  });
  return contacts.map((c) => c.contactId);
}

/** Check if two users are friends (bidirectional active contact) */
async function areFriends(
  prisma: PrismaClient,
  userId: string,
  otherId: string,
): Promise<boolean> {
  const contact = await prisma.contact.findUnique({
    where: {
      userId_contactId: { userId, contactId: otherId },
    },
  });
  return contact?.status === 'active';
}

// ─── Service Factory ────────────────────────────────────────────────────────

export function createMomentsService(deps: MomentsServiceDeps) {
  const { prisma, redis = null } = deps;

  // ─── Create Moment ──────────────────────────────────────────────────────

  async function createMoment(input: CreateMomentInput): Promise<MomentItem> {
    if (!input.content && (!input.images || input.images.length === 0)) {
      throw new MomentError(ErrorCode.INVALID_PARAM, '朋友圈内容不能为空');
    }

    if (input.content && input.content.length > CONFIG.MOMENT.MAX_CONTENT_LENGTH) {
      throw new MomentError(ErrorCode.INVALID_PARAM, `内容不能超过${CONFIG.MOMENT.MAX_CONTENT_LENGTH}字`);
    }

    if (input.images && input.images.length > CONFIG.MOMENT.MAX_IMAGES) {
      throw new MomentError(ErrorCode.INVALID_PARAM, `最多只能上传${CONFIG.MOMENT.MAX_IMAGES}张图片`);
    }

    if (input.visibility && !['public', 'friends', 'private'].includes(input.visibility)) {
      throw new MomentError(ErrorCode.INVALID_PARAM, '可见性参数无效');
    }

    const moment = await prisma.moment.create({
      data: {
        userId: input.userId,
        content: input.content ?? null,
        images: input.images ?? [],
        location: input.location ?? null,
        visibility: input.visibility ?? 'public',
      },
    });

    // Push to friends' timeline caches
    await pushToFriendsTimelines(redis, prisma, input.userId, moment.id, moment.createdAt);

    const profiles = await fetchProfiles(prisma, redis, [input.userId]);
    return mapToMomentItem({ ...moment, likes: [], comments: [] }, profiles);
  }

  // ─── Delete Moment ──────────────────────────────────────────────────────

  async function deleteMoment(input: DeleteMomentInput): Promise<void> {
    const moment = await prisma.moment.findUnique({ where: { id: input.momentId } });
    if (!moment) {
      throw new MomentError(ErrorCode.MOMENT_NOT_FOUND, '朋友圈不存在');
    }
    if (moment.userId !== input.userId) {
      throw new MomentError(ErrorCode.MOMENT_PERMISSION_DENIED, '只能删除自己的朋友圈');
    }

    await prisma.moment.delete({ where: { id: input.momentId } });

    // Remove from timeline caches
    await removeFromTimelines(redis, prisma, moment.userId, input.momentId);
  }

  // ─── Get Moment By ID ───────────────────────────────────────────────────

  async function getMomentById(momentId: string, userId: string): Promise<MomentItem> {
    const moment = await prisma.moment.findUnique({
      where: { id: momentId },
      include: { likes: true, comments: { orderBy: { createdAt: 'asc' } } },
    });

    if (!moment) {
      throw new MomentError(ErrorCode.MOMENT_NOT_FOUND, '朋友圈不存在');
    }

    // Visibility check
    if (moment.userId === userId) {
      // Own moment, always visible
    } else if (moment.visibility === 'private') {
      throw new MomentError(ErrorCode.MOMENT_PERMISSION_DENIED, '无权限查看该朋友圈');
    } else if (moment.visibility === 'friends') {
      const isFriend = await areFriends(prisma, userId, moment.userId);
      if (!isFriend) {
        throw new MomentError(ErrorCode.MOMENT_PERMISSION_DENIED, '无权限查看该朋友圈');
      }
    }
    // public: always visible

    const uids = collectUserIds([moment]);
    const replyMap = await fetchReplyUserMap(prisma, moment.comments ?? []);
    const profiles = await fetchProfiles(prisma, redis, uids);
    return mapToMomentItem(moment, profiles, replyMap);
  }

  // ─── Get User Moments ───────────────────────────────────────────────────

  async function getUserMoments(
    targetUid: string,
    query: { userId: string; before?: string; limit?: number },
  ): Promise<MomentItem[]> {
    // Determine visibility rules based on relationship
    let visibilityFilter: string[];

    if (targetUid === query.userId) {
      // Viewing own profile — all moments visible
      visibilityFilter = ['public', 'friends', 'private'];
    } else {
      const isFriend = await areFriends(prisma, query.userId, targetUid);
      if (isFriend) {
        visibilityFilter = ['public', 'friends'];
      } else {
        visibilityFilter = ['public'];
      }
    }

    const moments = await prisma.moment.findMany({
      where: {
        userId: targetUid,
        visibility: { in: visibilityFilter },
        ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
      },
      include: {
        likes: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.limit ?? 20, 50),
    });

    const uids = collectUserIds(moments);
    const allComments = moments.flatMap((m: any) => m.comments ?? []);
    const replyMap = await fetchReplyUserMap(prisma, allComments);
    const profiles = await fetchProfiles(prisma, redis, uids);
    return moments.map((m) => mapToMomentItem(m, profiles, replyMap));
  }

  // ─── Get Timeline ───────────────────────────────────────────────────────

  async function getTimeline(query: TimelineQuery): Promise<MomentItem[]> {
    const friendIds = await getFriendIds(prisma, query.userId);
    // Include user's own moments too
    const visibleUserIds = [query.userId, ...friendIds];

    const moments = await prisma.moment.findMany({
      where: {
        userId: { in: visibleUserIds },
        // Exclude private moments from others, but include our own
        OR: [
          { userId: query.userId },
          { userId: { in: friendIds }, visibility: { in: ['public', 'friends'] } },
        ],
        ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
      },
      include: {
        likes: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(query.limit ?? 20, 50),
    });

    const uids = collectUserIds(moments);
    const allComments = moments.flatMap((m: any) => m.comments ?? []);
    const replyMap = await fetchReplyUserMap(prisma, allComments);
    const profiles = await fetchProfiles(prisma, redis, uids);
    return moments.map((m) => mapToMomentItem(m, profiles, replyMap));
  }

  // ─── Toggle Like ────────────────────────────────────────────────────────

  async function toggleLikeMoment(input: LikeMomentInput): Promise<ToggleLikeResult> {
    const moment = await prisma.moment.findUnique({ where: { id: input.momentId } });
    if (!moment) {
      throw new MomentError(ErrorCode.MOMENT_NOT_FOUND, '朋友圈不存在');
    }

    const existing = await prisma.momentLike.findUnique({
      where: { momentId_userId: { momentId: input.momentId, userId: input.userId } },
    });

    if (existing) {
      await prisma.momentLike.delete({
        where: { momentId_userId: { momentId: input.momentId, userId: input.userId } },
      });
      return { liked: false };
    }

    await prisma.momentLike.create({
      data: { momentId: input.momentId, userId: input.userId },
    });
    return { liked: true };
  }

  // ─── Like Moment (for backward compatibility) ───────────────────────────

  async function likeMoment(input: LikeMomentInput): Promise<MomentLike> {
    const moment = await prisma.moment.findUnique({ where: { id: input.momentId } });
    if (!moment) {
      throw new MomentError(ErrorCode.MOMENT_NOT_FOUND, '朋友圈不存在');
    }

    const existing = await prisma.momentLike.findUnique({
      where: { momentId_userId: { momentId: input.momentId, userId: input.userId } },
    });
    if (existing) {
      throw new MomentError(ErrorCode.INVALID_PARAM, '已经点过赞了');
    }

    const like = await prisma.momentLike.create({
      data: { momentId: input.momentId, userId: input.userId },
    });

    const profiles = await fetchProfiles(prisma, redis, [input.userId]);
    return mapLike(like, profiles);
  }

  // ─── Unlike Moment (for backward compatibility) ─────────────────────────

  async function unlikeMoment(input: LikeMomentInput): Promise<void> {
    const existing = await prisma.momentLike.findUnique({
      where: { momentId_userId: { momentId: input.momentId, userId: input.userId } },
    });
    if (!existing) {
      throw new MomentError(ErrorCode.NOT_FOUND, '未点赞');
    }

    await prisma.momentLike.delete({
      where: { momentId_userId: { momentId: input.momentId, userId: input.userId } },
    });
  }

  // ─── Add Comment ────────────────────────────────────────────────────────

  async function addComment(input: AddCommentInput): Promise<MomentComment> {
    const moment = await prisma.moment.findUnique({ where: { id: input.momentId } });
    if (!moment) {
      throw new MomentError(ErrorCode.MOMENT_NOT_FOUND, '朋友圈不存在');
    }

    if (!input.content || input.content.trim().length === 0) {
      throw new MomentError(ErrorCode.INVALID_PARAM, '评论内容不能为空');
    }

    if (input.content.length > 500) {
      throw new MomentError(ErrorCode.INVALID_PARAM, '评论不能超过500字');
    }

    let replyToUserId: string | undefined;
    if (input.replyToId) {
      const replyTo = await prisma.momentComment.findUnique({ where: { id: input.replyToId } });
      if (!replyTo || replyTo.momentId !== input.momentId) {
        throw new MomentError(ErrorCode.COMMENT_NOT_FOUND, '回复的评论不存在');
      }
      replyToUserId = replyTo.userId;
    }

    const comment = await prisma.momentComment.create({
      data: {
        momentId: input.momentId,
        userId: input.userId,
        content: input.content.trim(),
        replyToId: input.replyToId ?? null,
      },
    });

    const uids = [comment.userId];
    if (replyToUserId) uids.push(replyToUserId);
    const profiles = await fetchProfiles(prisma, redis, uids);
    return mapComment(comment, profiles, replyToUserId);
  }

  // ─── Delete Comment ─────────────────────────────────────────────────────

  async function deleteComment(input: DeleteCommentInput): Promise<void> {
    const comment = await prisma.momentComment.findUnique({ where: { id: input.commentId } });
    if (!comment) {
      throw new MomentError(ErrorCode.COMMENT_NOT_FOUND, '评论不存在');
    }
    if (comment.momentId !== input.momentId) {
      throw new MomentError(ErrorCode.INVALID_PARAM, '评论不属于该朋友圈');
    }

    const moment = await prisma.moment.findUnique({ where: { id: input.momentId } });
    // Allow comment author or moment author to delete
    if (comment.userId !== input.userId && moment?.userId !== input.userId) {
      throw new MomentError(ErrorCode.MOMENT_PERMISSION_DENIED, '只能删除自己的评论');
    }

    await prisma.momentComment.delete({ where: { id: input.commentId } });
  }

  return {
    createMoment,
    deleteMoment,
    getMomentById,
    getUserMoments,
    getTimeline,
    toggleLikeMoment,
    likeMoment,
    unlikeMoment,
    addComment,
    deleteComment,
  };
}
