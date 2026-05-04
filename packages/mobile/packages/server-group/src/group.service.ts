import type { PrismaClient } from '@prisma/client';
import { ErrorCode, ErrorMessage } from '@wechat-clone/shared';
import type { GroupInfo, GroupMember, GroupRole, GroupJoinRequestInfo } from '@wechat-clone/shared';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface GroupServiceDeps {
  prisma: PrismaClient;
}

export interface CreateGroupInput {
  name: string;
  ownerId: string;
  avatar?: string;
  memberIds?: string[];
}

export interface UpdateGroupInput {
  name?: string;
  avatar?: string;
  announcement?: string;
}

export interface AddMembersInput {
  groupId: string;
  userIds: string[];
  operatorId: string;
}

export interface RemoveMemberInput {
  groupId: string;
  userId: string;
  operatorId: string;
}

export interface UpdateMemberRoleInput {
  groupId: string;
  userId: string;
  role: GroupRole;
  operatorId: string;
}

export interface UpdateMemberNicknameInput {
  groupId: string;
  userId: string;
  nicknameInGroup: string;
}

export interface MuteMemberInput {
  groupId: string;
  userId: string;
  operatorId: string;
  durationMinutes: number;
}

export interface ValidateMentionsInput {
  groupId: string;
  senderId: string;
  mentions: string[];
}

export class GroupError extends Error {
  override name = 'GroupError';
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function requireOwner(prisma: PrismaClient, groupId: string, userId: string): Promise<void> {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!member || member.role !== 'owner') {
    throw new GroupError(ErrorCode.GROUP_PERMISSION_DENIED, '只有群主才能执行此操作');
  }
}

async function requireAdminOrOwner(prisma: PrismaClient, groupId: string, userId: string): Promise<void> {
  const member = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } },
  });
  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    throw new GroupError(ErrorCode.GROUP_PERMISSION_DENIED, '只有群主或管理员才能执行此操作');
  }
}

function mapToGroupInfo(group: any): GroupInfo {
  return {
    id: group.id,
    name: group.name,
    avatar: group.avatar,
    ownerId: group.ownerId,
    announcement: group.announcement,
    memberCount: group.memberCount,
    createdAt: group.createdAt instanceof Date ? group.createdAt.toISOString() : group.createdAt,
    updatedAt: group.updatedAt instanceof Date ? group.updatedAt.toISOString() : group.updatedAt,
  };
}

function mapToGroupMember(member: any): GroupMember {
  return {
    id: member.id,
    groupId: member.groupId,
    userId: member.userId,
    role: member.role as GroupMember['role'],
    nicknameInGroup: member.nicknameInGroup,
    mutedUntil: member.mutedUntil ?? null,
    joinedAt: member.joinedAt instanceof Date ? member.joinedAt.toISOString() : member.joinedAt,
  };
}

// ─── Service Factory ────────────────────────────────────────────────────────

export function createGroupService(deps: GroupServiceDeps) {
  const { prisma } = deps;

  // ─── Create Group ───────────────────────────────────────────────────────

  async function createGroup(input: CreateGroupInput): Promise<GroupInfo> {
    if (!input.name || input.name.trim().length === 0) {
      throw new GroupError(ErrorCode.INVALID_PARAM, '群名称不能为空');
    }
    if (input.name.length > 100) {
      throw new GroupError(ErrorCode.INVALID_PARAM, '群名称不能超过100个字符');
    }

    const memberIds = input.memberIds ?? [];
    const allUserIds = [...new Set([input.ownerId, ...memberIds])];

    // Verify all users exist
    const users = await prisma.user.findMany({
      where: { id: { in: allUserIds } },
    });
    if (users.length !== allUserIds.length) {
      throw new GroupError(ErrorCode.NOT_FOUND, '部分用户不存在');
    }

    const group = await prisma.group.create({
      data: {
        name: input.name.trim(),
        avatar: input.avatar ?? null,
        ownerId: input.ownerId,
        memberCount: allUserIds.length,
        members: {
          create: allUserIds.map((uid, idx) => ({
            userId: uid,
            role: uid === input.ownerId ? 'owner' : 'member',
          })),
        },
      },
    });

    return mapToGroupInfo(group);
  }

  // ─── Get Group ──────────────────────────────────────────────────────────

  async function getGroup(groupId: string): Promise<GroupInfo> {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new GroupError(ErrorCode.NOT_FOUND, '群组不存在');
    }
    return mapToGroupInfo(group);
  }

  // ─── Update Group ───────────────────────────────────────────────────────

  async function updateGroup(
    groupId: string,
    operatorId: string,
    input: UpdateGroupInput,
  ): Promise<GroupInfo> {
    await requireAdminOrOwner(prisma, groupId, operatorId);

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      if (!input.name.trim()) {
        throw new GroupError(ErrorCode.INVALID_PARAM, '群名称不能为空');
      }
      data.name = input.name.trim();
    }
    if (input.avatar !== undefined) data.avatar = input.avatar;
    if (input.announcement !== undefined) data.announcement = input.announcement;

    const group = await prisma.group.update({
      where: { id: groupId },
      data,
    });
    return mapToGroupInfo(group);
  }

  // ─── Get Members ────────────────────────────────────────────────────────

  async function getMembers(groupId: string): Promise<GroupMember[]> {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new GroupError(ErrorCode.NOT_FOUND, '群组不存在');
    }

    const members = await prisma.groupMember.findMany({
      where: { groupId },
      orderBy: { joinedAt: 'asc' },
    });
    return members.map(mapToGroupMember);
  }

  // ─── Add Members ────────────────────────────────────────────────────────

  async function addMembers(input: AddMembersInput): Promise<void> {
    const group = await prisma.group.findUnique({ where: { id: input.groupId } });
    if (!group) {
      throw new GroupError(ErrorCode.NOT_FOUND, '群组不存在');
    }

    await requireAdminOrOwner(prisma, input.groupId, input.operatorId);

    // Verify users exist
    const users = await prisma.user.findMany({
      where: { id: { in: input.userIds } },
    });

    // Get existing members to avoid duplicates
    const existingMembers = await prisma.groupMember.findMany({
      where: {
        groupId: input.groupId,
        userId: { in: input.userIds },
      },
    });
    const existingUserIds = new Set(existingMembers.map((m) => m.userId));

    const newUserIds = input.userIds.filter((uid) => !existingUserIds.has(uid));
    if (newUserIds.length === 0) return;

    await prisma.$transaction([
      ...newUserIds.map((userId) =>
        prisma.groupMember.create({
          data: { groupId: input.groupId, userId, role: 'member' },
        }),
      ),
      prisma.group.update({
        where: { id: input.groupId },
        data: { memberCount: { increment: newUserIds.length } },
      }),
    ]);
  }

  // ─── Remove Member ──────────────────────────────────────────────────────

  async function removeMember(input: RemoveMemberInput): Promise<void> {
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
    });
    if (!member) {
      throw new GroupError(ErrorCode.NOT_FOUND, '成员不存在');
    }

    // Cannot remove the owner
    if (member.role === 'owner') {
      throw new GroupError(ErrorCode.GROUP_PERMISSION_DENIED, '不能移除群主');
    }

    // Admin or owner can remove; members can only remove themselves
    const isSelf = input.operatorId === input.userId;
    const operatorMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: input.groupId, userId: input.operatorId } },
    });
    if (!isSelf && (!operatorMember || (operatorMember.role !== 'owner' && operatorMember.role !== 'admin'))) {
      throw new GroupError(ErrorCode.GROUP_PERMISSION_DENIED, '只有群主或管理员才能移除其他成员');
    }

    await prisma.$transaction([
      prisma.groupMember.delete({
        where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
      }),
      prisma.group.update({
        where: { id: input.groupId },
        data: { memberCount: { decrement: 1 } },
      }),
    ]);
  }

  // ─── Update Member Role ─────────────────────────────────────────────────

  async function updateMemberRole(input: UpdateMemberRoleInput): Promise<GroupMember> {
    await requireOwner(prisma, input.groupId, input.operatorId);

    if (input.role === 'owner') {
      throw new GroupError(ErrorCode.INVALID_PARAM, '不能将成员设置为群主');
    }

    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
    });
    if (!member) {
      throw new GroupError(ErrorCode.NOT_FOUND, '成员不存在');
    }
    if (member.role === 'owner') {
      throw new GroupError(ErrorCode.GROUP_PERMISSION_DENIED, '不能修改群主的角色');
    }

    const updated = await prisma.groupMember.update({
      where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
      data: { role: input.role },
    });
    return mapToGroupMember(updated);
  }

  // ─── Update Member Nickname ─────────────────────────────────────────────

  async function updateMemberNickname(input: UpdateMemberNicknameInput): Promise<GroupMember> {
    if (!input.nicknameInGroup || input.nicknameInGroup.trim().length === 0) {
      throw new GroupError(ErrorCode.INVALID_PARAM, '群昵称不能为空');
    }

    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
    });
    if (!member) {
      throw new GroupError(ErrorCode.NOT_FOUND, '成员不存在');
    }

    const updated = await prisma.groupMember.update({
      where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
      data: { nicknameInGroup: input.nicknameInGroup.trim() },
    });
    return mapToGroupMember(updated);
  }

  // ─── Dissolve Group ────────────────────────────────────────────────────

  async function dissolveGroup(groupId: string, operatorId: string): Promise<void> {
    await requireOwner(prisma, groupId, operatorId);

    await prisma.group.delete({ where: { id: groupId } });
  }

  // ─── Join Group (Request) ──────────────────────────────────────────────

  async function joinGroup(
    groupId: string,
    userId: string,
    message?: string,
  ): Promise<GroupJoinRequestInfo> {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) {
      throw new GroupError(ErrorCode.GROUP_NOT_FOUND, '群组不存在');
    }

    // Check if already a member
    const existingMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (existingMember) {
      throw new GroupError(ErrorCode.GROUP_MEMBER_ALREADY_EXISTS, '你已在群中');
    }

    // Check for duplicate pending request
    const existingRequest = await prisma.groupJoinRequest.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        throw new GroupError(ErrorCode.GROUP_MEMBER_ALREADY_EXISTS, '已提交过加入申请，请等待审批');
      }
      // Update previously rejected request to pending
      const updated = await prisma.groupJoinRequest.update({
        where: { id: existingRequest.id },
        data: { status: 'pending', message: message ?? null },
      });
      return {
        id: updated.id,
        groupId: updated.groupId,
        userId: updated.userId,
        message: updated.message,
        status: updated.status as GroupJoinRequestInfo['status'],
        createdAt: updated.createdAt.toISOString(),
      };
    }

    const request = await prisma.groupJoinRequest.create({
      data: { groupId, userId, message: message ?? null },
    });

    return {
      id: request.id,
      groupId: request.groupId,
      userId: request.userId,
      message: request.message,
      status: request.status as GroupJoinRequestInfo['status'],
      createdAt: request.createdAt.toISOString(),
    };
  }

  // ─── Approve / Reject Join ─────────────────────────────────────────────

  async function approveJoin(
    groupId: string,
    userId: string,
    operatorId: string,
    action: 'approve' | 'reject',
  ): Promise<void> {
    await requireAdminOrOwner(prisma, groupId, operatorId);

    const request = await prisma.groupJoinRequest.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!request || request.status !== 'pending') {
      throw new GroupError(ErrorCode.NOT_FOUND, '加入申请不存在或已处理');
    }

    if (action === 'approve') {
      await prisma.$transaction([
        prisma.groupJoinRequest.update({
          where: { id: request.id },
          data: { status: 'approved' },
        }),
        prisma.groupMember.create({
          data: { groupId, userId, role: 'member' },
        }),
        prisma.group.update({
          where: { id: groupId },
          data: { memberCount: { increment: 1 } },
        }),
      ]);
    } else {
      await prisma.groupJoinRequest.update({
        where: { id: request.id },
        data: { status: 'rejected' },
      });
    }
  }

  // ─── Quit Group ────────────────────────────────────────────────────────

  async function quitGroup(groupId: string, userId: string): Promise<void> {
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!member) {
      throw new GroupError(ErrorCode.GROUP_MEMBER_NOT_FOUND, '你不在群中');
    }
    if (member.role === 'owner') {
      throw new GroupError(ErrorCode.GROUP_PERMISSION_DENIED, '群主不能退群，请先转让群主或解散群组');
    }

    await prisma.$transaction([
      prisma.groupMember.delete({
        where: { groupId_userId: { groupId, userId } },
      }),
      prisma.group.update({
        where: { id: groupId },
        data: { memberCount: { decrement: 1 } },
      }),
    ]);
  }

  // ─── Set Announcement ──────────────────────────────────────────────────

  async function setAnnouncement(
    groupId: string,
    operatorId: string,
    announcement: string,
  ): Promise<GroupInfo> {
    await requireAdminOrOwner(prisma, groupId, operatorId);

    const group = await prisma.group.update({
      where: { id: groupId },
      data: { announcement },
    });
    return mapToGroupInfo(group);
  }

  // ─── Mute Member ───────────────────────────────────────────────────────

  async function muteMember(input: MuteMemberInput): Promise<void> {
    await requireAdminOrOwner(prisma, input.groupId, input.operatorId);

    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
    });
    if (!member) {
      throw new GroupError(ErrorCode.GROUP_MEMBER_NOT_FOUND, '成员不存在');
    }
    if (member.role === 'owner') {
      throw new GroupError(ErrorCode.GROUP_PERMISSION_DENIED, '不能禁言群主');
    }
    if (input.operatorId === input.userId) {
      throw new GroupError(ErrorCode.INVALID_PARAM, '不能禁言自己');
    }

    const mutedUntil = new Date(Date.now() + input.durationMinutes * 60 * 1000);

    await prisma.groupMember.update({
      where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
      data: { mutedUntil },
    });
  }

  // ─── Validate Mentions ─────────────────────────────────────────────────

  async function validateMentions(input: ValidateMentionsInput): Promise<{
    valid: boolean;
    mentionedUserIds: string[];
    error?: string;
  }> {
    // Check sender is a member
    const senderMembership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId: input.groupId, userId: input.senderId } },
    });
    if (!senderMembership) {
      return { valid: false, mentionedUserIds: [], error: '你不是群成员' };
    }

    // Check if muted
    if (senderMembership.mutedUntil && senderMembership.mutedUntil > new Date()) {
      return { valid: false, mentionedUserIds: [], error: '你已被禁言' };
    }

    // Handle @all
    const hasAtAll = input.mentions.includes('@all');
    const userMentions = input.mentions.filter((m) => m !== '@all');

    if (hasAtAll) {
      if (senderMembership.role !== 'owner' && senderMembership.role !== 'admin') {
        return { valid: false, mentionedUserIds: [], error: '只有群主或管理员才能使用@所有人' };
      }

      // @all resolves to all members except sender
      const allMembers = await prisma.groupMember.findMany({
        where: { groupId: input.groupId, userId: { not: input.senderId } },
        select: { userId: true },
      });
      return {
        valid: true,
        mentionedUserIds: allMembers.map((m) => m.userId),
      };
    }

    // Validate individual user mentions
    if (userMentions.length > 0) {
      const members = await prisma.groupMember.findMany({
        where: {
          groupId: input.groupId,
          userId: { in: userMentions },
        },
        select: { userId: true },
      });
      const validUserIds = new Set(members.map((m) => m.userId));
      const mentionedUserIds = userMentions.filter((uid) => validUserIds.has(uid));

      return { valid: true, mentionedUserIds };
    }

    return { valid: true, mentionedUserIds: [] };
  }

  // ─── Check Mute Status ─────────────────────────────────────────────────

  async function isMuted(groupId: string, userId: string): Promise<boolean> {
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!member || !member.mutedUntil) return false;
    return member.mutedUntil > new Date();
  }

  // ─── List User Groups ──────────────────────────────────────────────────

  async function listUserGroups(userId: string): Promise<GroupInfo[]> {
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: { group: true },
      orderBy: { joinedAt: 'desc' },
    });
    return memberships.map((m) => mapToGroupInfo(m.group));
  }

  return {
    createGroup,
    getGroup,
    updateGroup,
    getMembers,
    addMembers,
    removeMember,
    updateMemberRole,
    updateMemberNickname,
    dissolveGroup,
    joinGroup,
    approveJoin,
    quitGroup,
    setAnnouncement,
    muteMember,
    validateMentions,
    isMuted,
    listUserGroups,
  };
}
