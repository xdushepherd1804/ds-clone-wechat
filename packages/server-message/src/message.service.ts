import type { PrismaClient } from '@prisma/client';
import type { Collection, Db, Filter, Sort } from 'mongodb';
import type { Redis } from 'ioredis';
import { ErrorCode, isValidMsgContent, generateId, RedisKeys } from '@wechat-clone/shared';
import type { Message, Conversation, MsgStatus, ChatType, MsgType } from '@wechat-clone/shared';

// ─── Types ─────────────────────────────────────────────────────────────────

/** Payload passed to the offline-message callback for push notification integration */
export interface OfflineMessageEvent {
  msg: Message;
  recipientId: string;
  senderNickname: string;
}

export interface MessageServiceDeps {
  prisma: PrismaClient;
  mongo: Db | null;
  redis?: Redis | null;
  /** Called when a message is sent to an offline user — hook for push notifications */
  onOfflineMessage?: (event: OfflineMessageEvent) => void | Promise<void>;
}

export interface SendMessageInput {
  fromUid: string;
  toUid?: string;
  toGroupId?: string;
  chatType: ChatType;
  msgType: MsgType;
  content: string;
}

export interface RecallMessageInput {
  msgId: string;
  userId: string;
}

export interface ConversationQuery {
  userId: string;
  limit?: number;
  offset?: number;
}

export class MessageError extends Error {
  override name = 'MessageError';
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function msgCollection(db: Db): Collection {
  return db.collection('messages');
}

function msgBoxCollection(db: Db): Collection {
  return db.collection('message_boxes');
}

function buildConversationId(uid1: string, uid2: string): string {
  const [a, b] = uid1 < uid2 ? [uid1, uid2] : [uid2, uid1];
  return `conv:${a}:${b}`;
}

function buildGroupConversationId(groupId: string): string {
  return `conv:group:${groupId}`;
}

function parseConversationId(convId: string): { type: 'private' | 'group'; targetId?: string; participants?: string[] } {
  if (convId.startsWith('conv:group:')) {
    return { type: 'group', targetId: convId.slice('conv:group:'.length) };
  }
  const parts = convId.split(':');
  if (parts.length === 3 && parts[0] === 'conv') {
    return { type: 'private', participants: [parts[1], parts[2]] };
  }
  throw new MessageError(ErrorCode.INVALID_PARAM, '无效的会话ID');
}

function mapDocToMessage(doc: any): Message {
  return {
    msgId: doc.msgId,
    fromUid: doc.fromUid,
    toUid: doc.toUid ?? undefined,
    toGroupId: doc.toGroupId ?? undefined,
    chatType: doc.chatType as ChatType,
    msgType: doc.msgType as MsgType,
    content: typeof doc.content === 'string' ? doc.content : JSON.stringify(doc.content),
    status: doc.status as MsgStatus,
    clientSeq: doc.clientSeq,
    serverSeq: doc.serverSeq ?? 0,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
}

// ─── Service Factory ────────────────────────────────────────────────────────

export function createMessageService(deps: MessageServiceDeps) {
  const { prisma, mongo, redis = null } = deps;

  let seqCounter = 0;
  const nextSeq = () => ++seqCounter;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  async function getSenderNickname(senderId: string): Promise<string> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: senderId },
        select: { nickname: true },
      });
      return user?.nickname || '';
    } catch {
      return '';
    }
  }

  // ─── Redis cache helpers ─────────────────────────────────────────────────

  const CONV_CACHE_TTL = 300;

  function convCacheKey(userId: string): string {
    return `wc:conv:cache:${userId}`;
  }

  async function cacheConversations(userId: string, conversations: Conversation[]): Promise<void> {
    if (!redis) return;
    try {
      await redis.setex(convCacheKey(userId), CONV_CACHE_TTL, JSON.stringify(conversations));
    } catch { /* ignore */ }
  }

  async function getCachedConversations(userId: string): Promise<Conversation[] | null> {
    if (!redis) return null;
    try {
      const raw = await redis.get(convCacheKey(userId));
      if (raw) return JSON.parse(raw) as Conversation[];
    } catch { /* ignore */ }
    return null;
  }

  async function invalidateConvCache(userId: string): Promise<void> {
    if (!redis) return;
    try { await redis.del(convCacheKey(userId)); } catch { /* ignore */ }
  }

  // ─── Send Message ────────────────────────────────────────────────────────

  async function sendMessage(input: SendMessageInput): Promise<Message> {
    if (!isValidMsgContent(input.content)) {
      throw new MessageError(ErrorCode.INVALID_PARAM, '消息内容无效');
    }

    if (input.chatType === 'private' && !input.toUid) {
      throw new MessageError(ErrorCode.INVALID_PARAM, '私聊需要指定接收者');
    }
    if (input.chatType === 'group' && !input.toGroupId) {
      throw new MessageError(ErrorCode.INVALID_PARAM, '群聊需要指定群组');
    }

    // Verify recipient/group exists
    if (input.chatType === 'private') {
      const recipient = await prisma.user.findUnique({ where: { id: input.toUid! } });
      if (!recipient) {
        throw new MessageError(ErrorCode.NOT_FOUND, '接收者不存在');
      }
    } else {
      const group = await prisma.group.findUnique({ where: { id: input.toGroupId! } });
      if (!group) {
        throw new MessageError(ErrorCode.NOT_FOUND, '群组不存在');
      }
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: input.toGroupId!, userId: input.fromUid } },
      });
      if (!membership) {
        throw new MessageError(ErrorCode.GROUP_PERMISSION_DENIED, '你不是该群成员');
      }
    }

    const now = new Date();
    const convId = input.chatType === 'private'
      ? buildConversationId(input.fromUid, input.toUid!)
      : buildGroupConversationId(input.toGroupId!);

    const msg: Message = {
      msgId: generateId(),
      fromUid: input.fromUid,
      toUid: input.toUid ?? undefined,
      toGroupId: input.toGroupId ?? undefined,
      chatType: input.chatType as ChatType,
      msgType: input.msgType as MsgType,
      content: input.content,
      status: 'sent' as MsgStatus,
      serverSeq: nextSeq(),
      createdAt: now.toISOString(),
    };

    if (mongo) {
      await msgCollection(mongo).insertOne(msg);

      // Determine recipients for message boxes
      const recipients: string[] = [];
      if (input.chatType === 'private') {
        recipients.push(input.fromUid, input.toUid!);
      } else {
        const members = await prisma.groupMember.findMany({
          where: { groupId: input.toGroupId! },
          select: { userId: true },
        });
        recipients.push(...members.map((m) => m.userId));
      }

      // Write to message_boxes for each recipient
      const boxEntries = recipients.map((uid) => ({
        msgId: msg.msgId,
        userId: uid,
        conversationId: convId,
        isRead: uid === input.fromUid,
        createdAt: now,
      }));
      await msgBoxCollection(mongo).insertMany(boxEntries);

      // Redis: offline queue for offline recipients, update recent contacts, invalidate cache
      if (redis) {
        for (const uid of recipients) {
          if (uid === input.fromUid) continue;
          try {
            const isOnline = await redis.get(RedisKeys.userOnline(uid));
            if (isOnline !== '1') {
              await redis.rpush(RedisKeys.offlineMessages(uid), JSON.stringify(msg));
              // Trigger push notification for offline user
              if (deps.onOfflineMessage) {
                const senderName = await getSenderNickname(input.fromUid);
                await Promise.resolve(deps.onOfflineMessage({
                  msg,
                  recipientId: uid,
                  senderNickname: senderName,
                }));
              }
            }
          } catch { /* ignore */ }
        }
        for (const uid of recipients) {
          try {
            await redis.zadd(RedisKeys.recentContacts(uid), now.getTime(), convId);
            await invalidateConvCache(uid);
          } catch { /* ignore */ }
        }
      }
    }

    return msg;
  }

  // ─── Get Messages (history) ──────────────────────────────────────────────

  async function getMessages(
    conversationId: string,
    userId: string,
    options?: { before?: string; limit?: number },
  ): Promise<Message[]> {
    if (!mongo) return [];

    const limit = Math.min(options?.limit ?? 50, 100);

    const filter: Filter<any> = { userId, conversationId };
    if (options?.before) {
      filter.createdAt = { $lt: new Date(options.before) };
    }

    const boxes = await msgBoxCollection(mongo)
      .find(filter)
      .sort({ createdAt: -1 } as Sort)
      .limit(limit)
      .toArray();

    if (boxes.length === 0) return [];

    const msgIds = boxes.map((b: any) => b.msgId);
    const msgs = await msgCollection(mongo)
      .find({ msgId: { $in: msgIds } } as Filter<any>)
      .toArray();

    const msgMap = new Map<string, any>();
    for (const m of msgs) {
      msgMap.set(m.msgId, m);
    }

    return boxes
      .map((box: any) => {
        const msg = msgMap.get(box.msgId);
        return msg ? mapDocToMessage(msg) : null;
      })
      .filter((m): m is Message => m !== null);
  }

  // ─── Get Conversations ───────────────────────────────────────────────────

  async function getConversations(
    userId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<Conversation[]> {
    if (!mongo) return [];

    const limit = Math.min(options?.limit ?? 20, 100);
    const offset = options?.offset ?? 0;

    // Try Redis cache
    const cached = await getCachedConversations(userId);
    if (cached) {
      return cached.slice(offset, offset + limit);
    }

    // Aggregate message_boxes to build conversation list
    const pipeline = [
      { $match: { userId } },
      { $sort: { createdAt: -1 as const } },
      {
        $group: {
          _id: '$conversationId',
          lastMsgTime: { $max: '$createdAt' },
          unreadCount: { $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] } },
          lastMsgId: { $first: '$msgId' },
        },
      },
      { $sort: { lastMsgTime: -1 as const } },
      { $skip: offset },
      { $limit: limit },
    ];

    const results = await msgBoxCollection(mongo).aggregate(pipeline).toArray();

    const lastMsgIds = results.map((r: any) => r.lastMsgId).filter(Boolean);
    const msgs = lastMsgIds.length > 0
      ? await msgCollection(mongo).find({ msgId: { $in: lastMsgIds } } as Filter<any>).toArray()
      : [];
    const msgMap = new Map<string, any>();
    for (const m of msgs) {
      msgMap.set(m.msgId, m);
    }

    const conversations: Conversation[] = [];
    for (const r of results) {
      const convId = r._id as string;
      let chatType: ChatType = 'private';
      let targetId = '';
      try {
        const parsed = parseConversationId(convId);
        chatType = parsed.type as ChatType;
        targetId = parsed.type === 'group'
          ? (parsed.targetId ?? '')
          : (parsed.participants?.find((p) => p !== userId) ?? '');
      } catch {
        // If parsing fails, keep defaults
      }
      const lastMsg = msgMap.get(r.lastMsgId);

      conversations.push({
        conversationId: convId,
        chatType,
        targetId,
        lastMsg: lastMsg ? mapDocToMessage(lastMsg) : null,
        unreadCount: r.unreadCount ?? 0,
        isTop: false,
        isMuted: false,
        updatedAt: r.lastMsgTime instanceof Date ? r.lastMsgTime.toISOString() : String(r.lastMsgTime),
      });
    }

    // Cache result
    await cacheConversations(userId, conversations);

    return conversations;
  }

  // ─── Mark Conversation Read ──────────────────────────────────────────────

  async function markConversationRead(
    conversationId: string,
    userId: string,
  ): Promise<{ updatedCount: number }> {
    if (!mongo) {
      throw new MessageError(ErrorCode.CONVERSATION_NOT_FOUND, '数据库不可用');
    }

    const result = await msgBoxCollection(mongo).updateMany(
      { userId, conversationId, isRead: false },
      { $set: { isRead: true } },
    );

    await invalidateConvCache(userId);

    return { updatedCount: result.modifiedCount };
  }

  // ─── Recall Message ──────────────────────────────────────────────────────

  async function recallMessage(input: RecallMessageInput): Promise<Message> {
    if (!mongo) {
      throw new MessageError(ErrorCode.MSG_NOT_FOUND, '消息不存在');
    }

    const msg = await msgCollection(mongo).findOne({ msgId: input.msgId }) as Message | null;
    if (!msg) {
      throw new MessageError(ErrorCode.MSG_NOT_FOUND, '消息不存在');
    }
    if (msg.fromUid !== input.userId) {
      throw new MessageError(ErrorCode.FORBIDDEN, '只能撤回自己的消息');
    }

    const twoMinutes = 2 * 60 * 1000;
    const msgTime = new Date(msg.createdAt).getTime();
    if (Date.now() - msgTime > twoMinutes) {
      throw new MessageError(ErrorCode.INVALID_PARAM, '超过2分钟的消息无法撤回');
    }

    await msgCollection(mongo).updateOne(
      { msgId: input.msgId },
      { $set: { status: 'recalled' } },
    );

    return { ...msg, status: 'recalled' as MsgStatus };
  }

  // ─── Get Offline Messages ────────────────────────────────────────────────

  async function getOfflineMessages(userId: string): Promise<Message[]> {
    if (!redis) return [];

    const messages: Message[] = [];
    try {
      const key = RedisKeys.offlineMessages(userId);
      while (true) {
        const raw = await redis.lpop(key);
        if (!raw) break;
        try {
          messages.push(JSON.parse(raw) as Message);
        } catch {
          // Skip corrupted entries
        }
      }
    } catch {
      // Redis error
    }

    return messages;
  }

  return {
    sendMessage,
    getMessages,
    getConversations,
    markConversationRead,
    recallMessage,
    getOfflineMessages,
  };
}
