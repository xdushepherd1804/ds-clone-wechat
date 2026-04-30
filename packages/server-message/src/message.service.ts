import type { PrismaClient } from '@prisma/client';
import type { Collection, Db } from 'mongodb';
import { ErrorCode, ErrorMessage, isValidMsgContent, generateId } from '@wechat-clone/shared';
import type { Message, Conversation, MsgType, MsgStatus, ChatType } from '@wechat-clone/shared';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface MessageServiceDeps {
  prisma: PrismaClient;
  mongo: Db | null;
}

export interface SendMessageInput {
  fromUid: string;
  toUid?: string;
  toGroupId?: string;
  chatType: ChatType;
  msgType: MsgType;
  content: string | Record<string, unknown>;
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

function convCollection(db: Db): Collection {
  return db.collection('conversations');
}

function buildConversationId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join(':');
}

// ─── Service Factory ────────────────────────────────────────────────────────

export function createMessageService(deps: MessageServiceDeps) {
  const { prisma, mongo } = deps;

  // ─── Send Message ────────────────────────────────────────────────────────

  async function sendMessage(input: SendMessageInput): Promise<Message> {
    if (!isValidMsgContent(typeof input.content === 'string' ? input.content : JSON.stringify(input.content))) {
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
      // Verify sender is a group member
      const membership = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId: input.toGroupId!, userId: input.fromUid } },
      });
      if (!membership) {
        throw new MessageError(ErrorCode.PERMISSION_DENIED, '你不是该群成员');
      }
    }

    const now = new Date();
    const msg: Message = {
      msgId: generateId(),
      fromUid: input.fromUid,
      toUid: input.toUid ?? null,
      toGroupId: input.toGroupId ?? null,
      chatType: input.chatType,
      msgType: input.msgType,
      content: input.content as Message['content'],
      status: 'sent' as MsgStatus,
      createdAt: now.toISOString(),
    };

    // Store in MongoDB if available, otherwise return in-memory
    if (mongo) {
      await msgCollection(mongo).insertOne(msg);

      // Update conversation
      const convId = input.chatType === 'private'
        ? buildConversationId(input.fromUid, input.toUid!)
        : input.toGroupId!;

      await convCollection(mongo).updateOne(
        { conversationId: convId },
        {
          $set: {
            chatType: input.chatType,
            lastMessage: msg,
            updatedAt: now,
          },
          $setOnInsert: {
            conversationId: convId,
            createdAt: now,
            participants: input.chatType === 'private'
              ? [input.fromUid, input.toUid]
              : [input.fromUid],
          },
        },
        { upsert: true },
      );
    }

    return msg;
  }

  // ─── Recall Message ──────────────────────────────────────────────────────

  async function recallMessage(input: RecallMessageInput): Promise<Message> {
    if (!mongo) {
      throw new MessageError(ErrorCode.NOT_FOUND, '消息不存在');
    }

    const msg = await msgCollection(mongo).findOne({ msgId: input.msgId }) as Message | null;
    if (!msg) {
      throw new MessageError(ErrorCode.NOT_FOUND, '消息不存在');
    }
    if (msg.fromUid !== input.userId) {
      throw new MessageError(ErrorCode.PERMISSION_DENIED, '只能撤回自己的消息');
    }

    const twoMinutes = 2 * 60 * 1000;
    const msgTime = new Date(msg.createdAt).getTime();
    if (Date.now() - msgTime > twoMinutes) {
      throw new MessageError(ErrorCode.INVALID_PARAM, '超过2分钟的消息无法撤回');
    }

    await msgCollection(mongo).updateOne(
      { msgId: input.msgId },
      { $set: { status: 'recalled' as MsgStatus } },
    );

    return { ...msg, status: 'recalled' as MsgStatus };
  }

  // ─── Get Conversations ───────────────────────────────────────────────────

  async function getConversations(query: ConversationQuery): Promise<Conversation[]> {
    if (!mongo) return [];

    const filter: Record<string, unknown> = {
      participants: query.userId,
    };

    const docs = await convCollection(mongo)
      .find(filter)
      .sort({ updatedAt: -1 })
      .skip(query.offset ?? 0)
      .limit(Math.min(query.limit ?? 20, 100))
      .toArray();

    return docs.map((doc: any) => ({
      conversationId: doc.conversationId,
      chatType: doc.chatType,
      participants: doc.participants,
      lastMessage: doc.lastMessage,
      unreadCount: doc.unreadCount ?? 0,
      updatedAt: doc.updatedAt?.toISOString(),
    }));
  }

  // ─── Get Messages ────────────────────────────────────────────────────────

  async function getMessages(
    conversationId: string,
    options?: { before?: string; limit?: number },
  ): Promise<Message[]> {
    if (!mongo) return [];

    const filter: Record<string, unknown> = {
      $or: [
        { conversationId },
        { toGroupId: conversationId },
        { toUid: conversationId, fromUid: { $exists: true } },
      ],
    };

    // More precise: check both from and to
    // For direct messages: msg where (fromUid, toUid) or (fromUid = conv user, toUid = other)
    // Simplified for testing: just filter by conversationId
    const query: Record<string, unknown> = {
      $or: [
        { msgId: { $regex: `^${conversationId}` } }, // won't match anything, placeholder
      ],
    };

    // Build a real query
    const parts = conversationId.split(':');
    if (parts.length === 2) {
      // Private conversation
      query.$or = [
        { fromUid: parts[0], toUid: parts[1] },
        { fromUid: parts[1], toUid: parts[0] },
      ];
    } else {
      // Group conversation
      query.$or = [{ toGroupId: conversationId }];
    }

    if (options?.before) {
      query.createdAt = { $lt: new Date(options.before) };
    }

    const cursor = msgCollection(mongo)
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(options?.limit ?? 50, 100));

    const docs = await cursor.toArray();
    return docs.map((doc: any) => ({
      msgId: doc.msgId,
      fromUid: doc.fromUid,
      toUid: doc.toUid ?? null,
      toGroupId: doc.toGroupId ?? null,
      chatType: doc.chatType,
      msgType: doc.msgType,
      content: doc.content,
      status: doc.status,
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    }));
  }

  return {
    sendMessage,
    recallMessage,
    getConversations,
    getMessages,
  };
}
