import type { PrismaClient } from '@prisma/client';
import { ErrorCode, ErrorMessage } from '@wechat-clone/shared';
import type { ContactItem, FriendRequest, ContactSearchResult } from '@wechat-clone/shared';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ContactServiceDeps {
  prisma: PrismaClient;
}

export interface AddContactInput {
  userId: string;
  contactId: string;
  remark?: string;
}

export interface UpdateContactInput {
  remark?: string;
  tags?: string[];
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

// ─── Service Factory ────────────────────────────────────────────────────────

export function createContactService(deps: ContactServiceDeps) {
  const { prisma } = deps;

  // ─── Get Contacts ───────────────────────────────────────────────────────

  async function getContacts(userId: string): Promise<ContactItem[]> {
    const contacts = await prisma.contact.findMany({
      where: { userId },
      include: { contact: true },
      orderBy: { createdAt: 'desc' },
    });

    return contacts.map((c) => ({
      id: c.id,
      userId: c.userId,
      contactId: c.contactId,
      username: c.contact.username,
      nickname: c.contact.nickname,
      avatar: c.contact.avatar,
      remark: c.remark,
      tags: c.tags,
      status: c.contact.status as ContactItem['status'],
    }));
  }

  // ─── Add Contact ────────────────────────────────────────────────────────

  async function addContact(input: AddContactInput): Promise<ContactItem> {
    if (input.userId === input.contactId) {
      throw new ContactError(ErrorCode.INVALID_PARAM, '不能添加自己为好友');
    }

    const contactUser = await prisma.user.findUnique({ where: { id: input.contactId } });
    if (!contactUser) {
      throw new ContactError(ErrorCode.NOT_FOUND, '用户不存在');
    }

    const existing = await prisma.contact.findUnique({
      where: { userId_contactId: { userId: input.userId, contactId: input.contactId } },
    });
    if (existing) {
      throw new ContactError(ErrorCode.ALREADY_EXISTS, '已是好友');
    }

    const contact = await prisma.contact.create({
      data: {
        userId: input.userId,
        contactId: input.contactId,
        remark: input.remark ?? null,
      },
      include: { contact: true },
    });

    return {
      id: contact.id,
      userId: contact.userId,
      contactId: contact.contactId,
      username: contact.contact.username,
      nickname: contact.contact.nickname,
      avatar: contact.contact.avatar,
      remark: contact.remark,
      tags: contact.tags,
      status: contact.contact.status as ContactItem['status'],
    };
  }

  // ─── Update Contact ─────────────────────────────────────────────────────

  async function updateContact(
    userId: string,
    contactId: string,
    input: UpdateContactInput,
  ): Promise<ContactItem> {
    const contact = await prisma.contact.findFirst({
      where: { userId, id: contactId },
      include: { contact: true },
    });
    if (!contact) {
      throw new ContactError(ErrorCode.NOT_FOUND, '联系人不存在');
    }

    const updated = await prisma.contact.update({
      where: { id: contactId },
      data: {
        ...(input.remark !== undefined ? { remark: input.remark } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      },
      include: { contact: true },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      contactId: updated.contactId,
      username: updated.contact.username,
      nickname: updated.contact.nickname,
      avatar: updated.contact.avatar,
      remark: updated.remark,
      tags: updated.tags,
      status: updated.contact.status as ContactItem['status'],
    };
  }

  // ─── Delete Contact ─────────────────────────────────────────────────────

  async function deleteContact(userId: string, contactId: string): Promise<void> {
    const contact = await prisma.contact.findFirst({
      where: { userId, id: contactId },
    });
    if (!contact) {
      throw new ContactError(ErrorCode.NOT_FOUND, '联系人不存在');
    }
    await prisma.contact.delete({ where: { id: contactId } });
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

    const existingContact = await prisma.contact.findUnique({
      where: { userId_contactId: { userId: input.fromUid, contactId: input.toUid } },
    });
    if (existingContact) {
      throw new ContactError(ErrorCode.ALREADY_EXISTS, '已是好友');
    }

    // Store friend request as a special contact with pending status
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
        username: '', // would be populated from the sender
        nickname: '',
        avatar: null,
      },
      message: input.message ?? null,
      status: 'pending',
      createdAt: request.createdAt.toISOString(),
    };
  }

  // ─── Handle Friend Request ──────────────────────────────────────────────

  async function handleFriendRequest(input: HandleFriendRequestInput): Promise<void> {
    const request = await prisma.contact.findFirst({
      where: { id: input.requestId, userId: input.userId, status: 'pending' },
    });
    if (!request) {
      throw new ContactError(ErrorCode.NOT_FOUND, '好友请求不存在');
    }

    if (input.action === 'accept') {
      // Update the pending request to accepted
      await prisma.contact.update({
        where: { id: input.requestId },
        data: { status: 'active' },
      });

      // Create reciprocal contact
      const existingReciprocal = await prisma.contact.findUnique({
        where: { userId_contactId: { userId: request.contactId, contactId: request.userId } },
      });
      if (!existingReciprocal) {
        await prisma.contact.create({
          data: {
            userId: request.contactId,
            contactId: request.userId,
            status: 'active',
          },
        });
      }
    } else {
      // Reject: delete the pending request
      await prisma.contact.delete({ where: { id: input.requestId } });
    }
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
        username: r.contact.username,
        nickname: r.contact.nickname,
        avatar: r.contact.avatar,
      },
      message: r.remark,
      status: 'pending',
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // ─── Search Contacts ────────────────────────────────────────────────────

  async function searchContacts(input: SearchContactsInput): Promise<ContactSearchResult[]> {
    if (!input.keyword || input.keyword.trim().length === 0) {
      throw new ContactError(ErrorCode.INVALID_PARAM, '搜索关键词不能为空');
    }

    const contacts = await prisma.contact.findMany({
      where: {
        userId: input.userId,
        OR: [
          { contact: { username: { contains: input.keyword, mode: 'insensitive' } } },
          { contact: { nickname: { contains: input.keyword, mode: 'insensitive' } } },
          { remark: { contains: input.keyword, mode: 'insensitive' } },
        ],
      },
      include: { contact: true },
      take: 20,
    });

    return contacts.map((c) => ({
      id: c.id,
      userId: c.contactId,
      username: c.contact.username,
      nickname: c.contact.nickname,
      avatar: c.contact.avatar,
      remark: c.remark,
      status: c.contact.status as ContactSearchResult['status'],
    }));
  }

  return {
    getContacts,
    addContact,
    updateContact,
    deleteContact,
    sendFriendRequest,
    handleFriendRequest,
    getFriendRequests,
    searchContacts,
  };
}
