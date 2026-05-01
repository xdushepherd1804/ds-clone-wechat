import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { ErrorCode, RedisKeys } from '@wechat-clone/shared';
import type { ContactItem, FriendRequest, ContactSearchResult } from '@wechat-clone/shared';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ContactServiceDeps {
  prisma: PrismaClient;
  redis?: Redis | null;
}

export interface SendFriendRequestInput {
  fromUid: string;
  toUid: string;
  message?: string;
}

export interface HandleFriendRequestInput {
  requestId: string;
  action: 'accept' | 'reject';
  userId: string;
}

export interface SearchContactsInput {
  userId: string;
  keyword: string;
}

export class ContactError extends Error {
  override name = 'ContactError';
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function mapToContactItem(c: any, isOnline: boolean): ContactItem {
  return {
    id: c.id,
    userId: c.userId,
    contactId: c.contactId,
    remark: c.remark,
    tags: c.tags,
    status: c.status as ContactItem['status'],
    contact: {
      id: c.contact.id,
      username: c.contact.username,
      nickname: c.contact.nickname,
      avatar: c.contact.avatar,
      status: isOnline ? 'online' : 'offline',
    },
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
  };
}

async function checkOnlineBatch(
  redis: Redis | null,
  uids: string[],
): Promise<Set<string>> {
  if (!redis || uids.length === 0) return new Set();
  try {
    const keys = uids.map((uid) => RedisKeys.userOnline(uid));
    const results = await redis.mget(keys);
    const online = new Set<string>();
    for (let i = 0; i < results.length; i++) {
      if (results[i] === '1') online.add(uids[i]);
    }
    return online;
  } catch {
    return new Set();
  }
}

// ─── Service Factory ────────────────────────────────────────────────────────

export function createContactService(deps: ContactServiceDeps) {
  const { prisma, redis = null } = deps;

  // ─── Get Contacts ───────────────────────────────────────────────────────

  async function getContacts(userId: string): Promise<ContactItem[]> {
    const contacts = await prisma.contact.findMany({
      where: { userId, status: 'active' },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
    });

    const contactUids = contacts.map((c) => c.contactId);
    const onlineSet = await checkOnlineBatch(redis, contactUids);

    return contacts.map((c) => mapToContactItem(c, onlineSet.has(c.contactId)));
  }

  // ─── Send Friend Request ────────────────────────────────────────────────

  async function sendFriendRequest(input: SendFriendRequestInput): Promise<FriendRequest> {
    if (input.fromUid === input.toUid) {
      throw new ContactError(ErrorCode.INVALID_PARAM, '不能向自己发送好友请求');
    }

    const targetUser = await prisma.user.findUnique({ where: { id: input.toUid } });
    if (!targetUser) {
      throw new ContactError(ErrorCode.NOT_FOUND, '用户不存在');
    }

    // Check if already friends (active)
    const existingContact = await prisma.contact.findUnique({
      where: { userId_contactId: { userId: input.fromUid, contactId: input.toUid } },
    });
    if (existingContact) {
      if (existingContact.status === 'active') {
        throw new ContactError(ErrorCode.CONTACT_ALREADY_EXISTS, '已是好友');
      }
      if (existingContact.status === 'blocked') {
        throw new ContactError(ErrorCode.CONTACT_BLOCKED, '对方已将你拉黑');
      }
    }

    // Check if target has blocked the sender
    const blockedByTarget = await prisma.contact.findUnique({
      where: { userId_contactId: { userId: input.toUid, contactId: input.fromUid } },
    });
    if (blockedByTarget?.status === 'blocked') {
      throw new ContactError(ErrorCode.CONTACT_BLOCKED, '对方已将你拉黑');
    }

    // Check for duplicate pending request
    const pendingRequest = await prisma.contact.findFirst({
      where: {
        userId: input.toUid,
        contactId: input.fromUid,
        status: 'pending',
      },
    });
    if (pendingRequest) {
      throw new ContactError(ErrorCode.CONTACT_ALREADY_EXISTS, '已发送过好友请求，请等待对方处理');
    }

    // Get sender info for the response
    const sender = await prisma.user.findUnique({ where: { id: input.fromUid } });

    const request = await prisma.contact.create({
      data: {
        userId: input.toUid,
        contactId: input.fromUid,
        remark: input.message ?? null,
        status: 'pending',
      },
      include: { contact: true },
    });

    return {
      id: request.id,
      fromUid: input.fromUid,
      toUid: input.toUid,
      fromUser: {
        id: input.fromUid,
        nickname: sender?.nickname ?? '',
        avatar: sender?.avatar ?? null,
      },
      message: input.message ?? null,
      status: 'pending' as const,
      createdAt: request.createdAt.toISOString(),
    };
  }

  // ─── Handle Friend Request ──────────────────────────────────────────────

  async function handleFriendRequest(input: HandleFriendRequestInput): Promise<void> {
    const request = await prisma.contact.findFirst({
      where: { id: input.requestId, userId: input.userId, status: 'pending' },
    });
    if (!request) {
      throw new ContactError(ErrorCode.FRIEND_REQUEST_NOT_FOUND, '好友请求不存在或已处理');
    }

    if (input.action === 'accept') {
      await prisma.$transaction(async (tx) => {
        // Update the pending request to active
        await tx.contact.update({
          where: { id: input.requestId },
          data: { status: 'active' },
        });

        // Create reciprocal contact for the sender
        const existingReciprocal = await tx.contact.findUnique({
          where: { userId_contactId: { userId: request.contactId, contactId: request.userId } },
        });
        if (!existingReciprocal) {
          await tx.contact.create({
            data: {
              userId: request.contactId,
              contactId: request.userId,
              status: 'active',
            },
          });
        }
      });
    } else {
      await prisma.contact.delete({ where: { id: input.requestId } });
    }
  }

  // ─── Delete Contact ─────────────────────────────────────────────────────

  async function deleteContact(userId: string, contactUid: string): Promise<void> {
    // Delete the user's view of the contact
    const userContact = await prisma.contact.findUnique({
      where: { userId_contactId: { userId, contactId: contactUid } },
    });
    if (!userContact) {
      throw new ContactError(ErrorCode.CONTACT_NOT_FOUND, '联系人不存在');
    }

    await prisma.$transaction([
      prisma.contact.delete({
        where: { userId_contactId: { userId, contactId: contactUid } },
      }),
      // Also delete the reciprocal direction if it exists
      prisma.contact.deleteMany({
        where: { userId: contactUid, contactId: userId },
      }),
    ]);
  }

  // ─── Update Remark ──────────────────────────────────────────────────────

  async function updateRemark(
    userId: string,
    contactUid: string,
    remark: string,
  ): Promise<ContactItem> {
    const contact = await prisma.contact.findUnique({
      where: { userId_contactId: { userId, contactId: contactUid } },
      include: { contact: true },
    });
    if (!contact) {
      throw new ContactError(ErrorCode.CONTACT_NOT_FOUND, '联系人不存在');
    }

    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: { remark },
      include: { contact: true },
    });

    const online = redis
      ? ((await redis.get(RedisKeys.userOnline(contactUid))) === '1')
      : false;

    return mapToContactItem(updated, online);
  }

  // ─── Update Tags ────────────────────────────────────────────────────────

  async function updateTags(
    userId: string,
    contactUid: string,
    tags: string[],
  ): Promise<ContactItem> {
    const contact = await prisma.contact.findUnique({
      where: { userId_contactId: { userId, contactId: contactUid } },
      include: { contact: true },
    });
    if (!contact) {
      throw new ContactError(ErrorCode.CONTACT_NOT_FOUND, '联系人不存在');
    }

    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: { tags },
      include: { contact: true },
    });

    const online = redis
      ? ((await redis.get(RedisKeys.userOnline(contactUid))) === '1')
      : false;

    return mapToContactItem(updated, online);
  }

  // ─── Get Friend Requests ────────────────────────────────────────────────

  async function getFriendRequests(userId: string): Promise<FriendRequest[]> {
    const requests = await prisma.contact.findMany({
      where: { userId, status: 'pending' },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
    });

    return requests.map((r) => ({
      id: r.id,
      fromUid: r.contactId,
      toUid: r.userId,
      fromUser: {
        id: r.contact.id,
        nickname: r.contact.nickname,
        avatar: r.contact.avatar,
      },
      message: r.remark,
      status: 'pending' as const,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ─── Block User ─────────────────────────────────────────────────────────

  async function blockUser(userId: string, targetUid: string): Promise<void> {
    if (userId === targetUid) {
      throw new ContactError(ErrorCode.INVALID_PARAM, '不能拉黑自己');
    }

    // Update or create a blocked contact record
    const existing = await prisma.contact.findUnique({
      where: { userId_contactId: { userId, contactId: targetUid } },
    });

    if (existing) {
      if (existing.status === 'blocked') {
        return; // Already blocked
      }
      await prisma.contact.update({
        where: { id: existing.id },
        data: { status: 'blocked' },
      });
    } else {
      await prisma.contact.create({
        data: {
          userId,
          contactId: targetUid,
          status: 'blocked',
        },
      });
    }
  }

  // ─── Unblock User ───────────────────────────────────────────────────────

  async function unblockUser(userId: string, targetUid: string): Promise<void> {
    const existing = await prisma.contact.findUnique({
      where: { userId_contactId: { userId, contactId: targetUid } },
    });

    if (!existing || existing.status !== 'blocked') {
      throw new ContactError(ErrorCode.CONTACT_NOT_FOUND, '未拉黑该用户');
    }

    await prisma.contact.delete({
      where: { userId_contactId: { userId, contactId: targetUid } },
    });
  }

  // ─── Search Contacts ────────────────────────────────────────────────────

  async function searchContacts(input: SearchContactsInput): Promise<ContactSearchResult[]> {
    if (!input.keyword || input.keyword.trim().length === 0) {
      throw new ContactError(ErrorCode.INVALID_PARAM, '搜索关键词不能为空');
    }

    const keyword = input.keyword.trim();

    // Search user's own contacts
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

    // Build set of matched contact IDs for isContact flag
    const friendIds = new Set(contacts.map((c) => c.contactId));

    const results: ContactSearchResult[] = contacts.map((c) => ({
      id: c.contact.id,
      username: c.contact.username,
      nickname: c.contact.nickname,
      avatar: c.contact.avatar,
      isContact: true,
    }));

    // If we have fewer than 20 results, also search globally (non-contacts)
    if (results.length < 20) {
      const remaining = 20 - results.length;
      const globalUsers = await prisma.user.findMany({
        where: {
          id: {
            notIn: [input.userId, ...friendIds],
          },
          OR: [
            { username: { contains: keyword, mode: 'insensitive' } },
            { nickname: { contains: keyword, mode: 'insensitive' } },
          ],
        },
        select: { id: true, username: true, nickname: true, avatar: true },
        take: remaining,
      });

      for (const user of globalUsers) {
        results.push({
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          avatar: user.avatar,
          isContact: false,
        });
      }
    }

    return results;
  }

  return {
    getContacts,
    sendFriendRequest,
    handleFriendRequest,
    deleteContact,
    updateRemark,
    updateTags,
    getFriendRequests,
    blockUser,
    unblockUser,
    searchContacts,
  };
}
