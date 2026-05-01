import type { PrismaClient } from '@prisma/client';
import type { Db, Collection as MongoCollection } from 'mongodb';
import { ErrorCode } from '@wechat-clone/shared';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface SearchServiceDeps {
  prisma: PrismaClient;
  mongo?: Db | null;
}

export interface SearchMessagesInput {
  userId: string;
  keyword: string;
  convId?: string;
  page?: number;
  size?: number;
}

export interface SearchContactsInput {
  userId: string;
  keyword: string;
}

export interface SearchGroupsInput {
  userId: string;
  keyword: string;
}

export interface SearchAllInput {
  userId: string;
  keyword: string;
}

export interface MessageSearchResult {
  msgId: string;
  fromUid: string;
  toUid?: string;
  toGroupId?: string;
  conversationId: string;
  chatType: string;
  content: string;
  highlight: string;
  createdAt: string;
}

export interface GroupSearchResult {
  id: string;
  name: string;
  avatar: string | null;
  memberCount: number;
  isMember: boolean;
}

export interface ContactSearchResult {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  isContact: boolean;
}

export interface SearchAllResult {
  messages: MessageSearchResult[];
  contacts: ContactSearchResult[];
  groups: GroupSearchResult[];
}

export class SearchError extends Error {
  override name = 'SearchError';
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function msgCollection(db: Db): MongoCollection {
  return db.collection('messages');
}

function msgBoxCollection(db: Db): MongoCollection {
  return db.collection('message_boxes');
}

function highlightText(text: string, keyword: string): string {
  if (!keyword) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

function buildConversationKey(msg: any): string {
  if (msg.toGroupId) {
    return `conv:group:${msg.toGroupId}`;
  }
  // Sort uids deterministically for private conversations
  const uids = [msg.fromUid, msg.toUid].filter(Boolean).sort();
  return `conv:${uids[0]}:${uids[1]}`;
}

// ─── Service Factory ───────────────────────────────────────────────────────

export function createSearchService(deps: SearchServiceDeps) {
  const { prisma, mongo = null } = deps;

  // ─── Search Messages ─────────────────────────────────────────────────────

  async function searchMessages(input: SearchMessagesInput): Promise<{
    items: MessageSearchResult[];
    total: number;
    page: number;
    size: number;
  }> {
    if (!input.keyword || input.keyword.trim().length === 0) {
      throw new SearchError(ErrorCode.INVALID_PARAM, '搜索关键词不能为空');
    }

    const keyword = input.keyword.trim();
    const page = Math.max(input.page ?? 1, 1);
    const size = Math.min(input.size ?? 20, 100);

    if (!mongo) {
      return { items: [], total: 0, page, size };
    }

    // 1. Find matching messages by content regex
    const matchedMessages = await msgCollection(mongo)
      .find({
        msgType: 1,
        content: { $regex: keyword, $options: 'i' },
      })
      .project({ msgId: 1, fromUid: 1, toUid: 1, toGroupId: 1, chatType: 1, content: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    if (matchedMessages.length === 0) {
      return { items: [], total: 0, page, size };
    }

    const matchedIds = matchedMessages.map((m: any) => m.msgId);

    // 2. Check which ones belong to the user's message_boxes
    const boxFilter: any = {
      userId: input.userId,
      msgId: { $in: matchedIds },
    };
    if (input.convId) {
      boxFilter.conversationId = input.convId;
    }

    const userBoxes = await msgBoxCollection(mongo)
      .find(boxFilter)
      .project({ msgId: 1, conversationId: 1 })
      .toArray();

    const boxMap = new Map<string, string>();
    for (const b of userBoxes) {
      boxMap.set(b.msgId, b.conversationId);
    }

    // 3. Filter and map results
    const allItems: MessageSearchResult[] = [];
    for (const msg of matchedMessages) {
      const convId = boxMap.get(msg.msgId);
      if (!convId) continue;

      allItems.push({
        msgId: msg.msgId,
        fromUid: msg.fromUid,
        toUid: msg.toUid,
        toGroupId: msg.toGroupId,
        conversationId: convId,
        chatType: msg.chatType ?? (msg.toGroupId ? 'group' : 'private'),
        content: msg.content,
        highlight: highlightText(msg.content, keyword),
        createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : String(msg.createdAt),
      });
    }

    const total = allItems.length;
    const start = (page - 1) * size;
    const items = allItems.slice(start, start + size);

    return { items, total, page, size };
  }

  // ─── Search Contacts ────────────────────────────────────────────────────

  async function searchContacts(input: SearchContactsInput): Promise<{
    items: ContactSearchResult[];
    total: number;
  }> {
    if (!input.keyword || input.keyword.trim().length === 0) {
      throw new SearchError(ErrorCode.INVALID_PARAM, '搜索关键词不能为空');
    }

    const keyword = input.keyword.trim();

    // Search user's contacts first
    const contacts = await prisma.contact.findMany({
      where: {
        userId: input.userId,
        status: 'active',
        OR: [
          { contact: { username: { contains: keyword, mode: 'insensitive' } } },
          { contact: { nickname: { contains: keyword, mode: 'insensitive' } } },
          { remark: { contains: keyword, mode: 'insensitive' } },
        ],
      },
      include: { contact: true },
      take: 20,
    });

    const friendIds = new Set(contacts.map((c) => c.contactId));
    const items: ContactSearchResult[] = contacts.map((c) => ({
      id: c.contact.id,
      username: c.contact.username,
      nickname: c.contact.nickname,
      avatar: c.contact.avatar,
      isContact: true,
    }));

    // Fill remaining slots with global user search
    if (items.length < 20) {
      const remaining = 20 - items.length;
      const globalUsers = await prisma.user.findMany({
        where: {
          id: { notIn: [input.userId, ...friendIds] },
          OR: [
            { username: { contains: keyword, mode: 'insensitive' } },
            { nickname: { contains: keyword, mode: 'insensitive' } },
          ],
        },
        select: { id: true, username: true, nickname: true, avatar: true },
        take: remaining,
      });

      for (const user of globalUsers) {
        items.push({
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar,
          isContact: false,
        });
      }
    }

    return { items, total: items.length };
  }

  // ─── Search Groups ───────────────────────────────────────────────────────

  async function searchGroups(input: SearchGroupsInput): Promise<{
    items: GroupSearchResult[];
    total: number;
  }> {
    if (!input.keyword || input.keyword.trim().length === 0) {
      throw new SearchError(ErrorCode.INVALID_PARAM, '搜索关键词不能为空');
    }

    const keyword = input.keyword.trim();

    const groups = await prisma.group.findMany({
      where: {
        name: { contains: keyword, mode: 'insensitive' },
      },
      include: {
        members: {
          where: { userId: input.userId },
          select: { userId: true },
        },
      },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    });

    const items: GroupSearchResult[] = groups.map((g) => ({
      id: g.id,
      name: g.name,
      avatar: g.avatar,
      memberCount: g.memberCount,
      isMember: g.members.length > 0,
    }));

    return { items, total: items.length };
  }

  // ─── Search All (Aggregated) ─────────────────────────────────────────────

  async function searchAll(input: SearchAllInput): Promise<SearchAllResult> {
    if (!input.keyword || input.keyword.trim().length === 0) {
      throw new SearchError(ErrorCode.INVALID_PARAM, '搜索关键词不能为空');
    }

    const [msgResult, contactResult, groupResult] = await Promise.all([
      searchMessages({ ...input, page: 1, size: 5 }).catch(() => ({ items: [], total: 0, page: 1, size: 5 })),
      searchContacts(input).catch(() => ({ items: [], total: 0 })),
      searchGroups(input).catch(() => ({ items: [], total: 0 })),
    ]);

    return {
      messages: (msgResult as any).items ?? [],
      contacts: (contactResult as any).items ?? [],
      groups: (groupResult as any).items ?? [],
    };
  }

  // ─── Init Search Indexes ─────────────────────────────────────────────────

  async function initSearchIndexes(): Promise<{ created: string[] }> {
    const created: string[] = [];

    if (mongo) {
      try {
        // Text index on messages.content for full-text search
        await msgCollection(mongo).createIndex(
          { content: 'text' },
          { name: 'search_content_text', background: true },
        );
        created.push('messages.content_text');

        // Compound index for message_box lookup
        await msgBoxCollection(mongo).createIndex(
          { userId: 1, msgId: 1 },
          { name: 'search_box_user_msg', background: true },
        );
        created.push('message_boxes.user_msg');
      } catch {
        // Indexes may already exist
      }
    }

    return { created };
  }

  return {
    searchMessages,
    searchContacts,
    searchGroups,
    searchAll,
    initSearchIndexes,
  };
}
