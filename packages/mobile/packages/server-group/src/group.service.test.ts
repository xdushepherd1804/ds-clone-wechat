import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createGroupService, GroupError } from './group.service';

function makeMockPrisma() {
  return {
    user: { findMany: vi.fn() },
    group: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    groupMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    groupJoinRequest: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(async (ops: any[]) => {
      for (const op of ops) {
        if (typeof op === 'function') {
          await op();
        }
      }
    }),
  } as any;
}

describe('group.service', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    prisma = makeMockPrisma();
  });

  describe('createGroup', () => {
    it('throws if name is empty', async () => {
      const svc = createGroupService({ prisma });
      await expect(svc.createGroup({ name: '', ownerId: 'u1' })).rejects.toThrow(GroupError);
      await expect(svc.createGroup({ name: '   ', ownerId: 'u1' })).rejects.toThrow(GroupError);
    });

    it('throws if name is too long', async () => {
      const svc = createGroupService({ prisma });
      await expect(svc.createGroup({
        name: 'a'.repeat(101), ownerId: 'u1',
      })).rejects.toThrow(GroupError);
    });

    it('throws if a member does not exist', async () => {
      prisma.user.findMany.mockResolvedValue([{ id: 'u1', username: 'alice' }]);
      const svc = createGroupService({ prisma });
      await expect(svc.createGroup({
        name: 'Test', ownerId: 'u1', memberIds: ['u2', 'u3'],
      })).rejects.toThrow(GroupError);
    });

    it('creates a group with owner and members', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', username: 'alice' },
        { id: 'u2', username: 'bob' },
      ]);
      prisma.group.create.mockResolvedValue({
        id: 'g1', name: 'Test Group', avatar: null, ownerId: 'u1',
        announcement: '', memberCount: 2,
        createdAt: new Date(), updatedAt: new Date(),
      });

      const svc = createGroupService({ prisma });
      const group = await svc.createGroup({
        name: 'Test Group', ownerId: 'u1', memberIds: ['u2'],
      });

      expect(group.name).toBe('Test Group');
      expect(group.ownerId).toBe('u1');
      expect(group.memberCount).toBe(2);
    });

    it('deduplicates member IDs', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'u1', username: 'alice' },
        { id: 'u2', username: 'bob' },
      ]);
      prisma.group.create.mockResolvedValue({
        id: 'g1', name: 'My Group', avatar: null, ownerId: 'u1',
        announcement: '', memberCount: 2,
        createdAt: new Date(), updatedAt: new Date(),
      });

      const svc = createGroupService({ prisma });
      const group = await svc.createGroup({
        name: 'My Group', ownerId: 'u1', memberIds: ['u1', 'u2', 'u1'],
      });
      expect(group.memberCount).toBe(2);
    });
  });

  describe('getGroup', () => {
    it('throws if group not found', async () => {
      prisma.group.findUnique.mockResolvedValue(null);
      const svc = createGroupService({ prisma });
      await expect(svc.getGroup('g999')).rejects.toThrow(GroupError);
    });

    it('returns group info', async () => {
      prisma.group.findUnique.mockResolvedValue({
        id: 'g1', name: 'Test Group', avatar: null, ownerId: 'u1',
        announcement: '', memberCount: 5,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const svc = createGroupService({ prisma });
      const group = await svc.getGroup('g1');
      expect(group.id).toBe('g1');
      expect(group.name).toBe('Test Group');
    });
  });

  describe('updateGroup', () => {
    it('throws if operator is not admin or owner', async () => {
      prisma.groupMember.findUnique.mockResolvedValue(null);
      const svc = createGroupService({ prisma });
      await expect(svc.updateGroup('g1', 'u1', { name: 'New' })).rejects.toThrow(GroupError);
    });

    it('throws if new name is empty', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'owner' });
      const svc = createGroupService({ prisma });
      await expect(svc.updateGroup('g1', 'u1', { name: '' })).rejects.toThrow(GroupError);
    });

    it('updates group as owner', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'owner' });
      prisma.group.update.mockResolvedValue({
        id: 'g1', name: 'New Name', avatar: null, ownerId: 'u1',
        announcement: '', memberCount: 5,
        createdAt: new Date(), updatedAt: new Date(),
      });

      const svc = createGroupService({ prisma });
      const group = await svc.updateGroup('g1', 'u1', { name: 'New Name' });
      expect(group.name).toBe('New Name');
    });

    it('updates group as admin', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'admin' });
      prisma.group.update.mockResolvedValue({
        id: 'g1', name: 'Admin Update', avatar: null, ownerId: 'u2',
        announcement: 'New announcement', memberCount: 5,
        createdAt: new Date(), updatedAt: new Date(),
      });

      const svc = createGroupService({ prisma });
      const group = await svc.updateGroup('g1', 'u3', {
        name: 'Admin Update',
        announcement: 'New announcement',
      });
      expect(group.name).toBe('Admin Update');
    });
  });

  describe('getMembers', () => {
    it('throws if group not found', async () => {
      prisma.group.findUnique.mockResolvedValue(null);
      const svc = createGroupService({ prisma });
      await expect(svc.getMembers('g999')).rejects.toThrow(GroupError);
    });

    it('returns members', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: 'g1' });
      prisma.groupMember.findMany.mockResolvedValue([
        { id: 'm1', groupId: 'g1', userId: 'u1', role: 'owner', nicknameInGroup: null, joinedAt: new Date() },
        { id: 'm2', groupId: 'g1', userId: 'u2', role: 'member', nicknameInGroup: null, joinedAt: new Date() },
      ]);

      const svc = createGroupService({ prisma });
      const members = await svc.getMembers('g1');
      expect(members).toHaveLength(2);
      expect(members[0].role).toBe('owner');
    });
  });

  describe('addMembers', () => {
    it('throws if group not found', async () => {
      prisma.group.findUnique.mockResolvedValue(null);
      const svc = createGroupService({ prisma });
      await expect(svc.addMembers({
        groupId: 'g999', userIds: ['u2'], operatorId: 'u1',
      })).rejects.toThrow(GroupError);
    });

    it('throws if operator is not admin/owner', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: 'g1' });
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'member' });
      const svc = createGroupService({ prisma });
      await expect(svc.addMembers({
        groupId: 'g1', userIds: ['u3'], operatorId: 'u1',
      })).rejects.toThrow(GroupError);
    });

    it('adds new members', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: 'g1' });
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'owner' });
      prisma.groupMember.findMany.mockResolvedValue([]);
      prisma.groupMember.create.mockResolvedValue({});
      prisma.group.update.mockResolvedValue({});

      const svc = createGroupService({ prisma });
      await svc.addMembers({ groupId: 'g1', userIds: ['u2', 'u3'], operatorId: 'u1' });

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('skips already existing members', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: 'g1' });
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'owner' });
      prisma.groupMember.findMany.mockResolvedValue([
        { userId: 'u2' },
      ]);

      const svc = createGroupService({ prisma });
      await svc.addMembers({ groupId: 'g1', userIds: ['u2', 'u3'], operatorId: 'u1' });

      // Should only create for u3, not u2
      expect(prisma.groupMember.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeMember', () => {
    it('throws if member not found', async () => {
      prisma.groupMember.findUnique.mockResolvedValue(null);
      const svc = createGroupService({ prisma });
      await expect(svc.removeMember({
        groupId: 'g1', userId: 'u999', operatorId: 'u1',
      })).rejects.toThrow(GroupError);
    });

    it('throws when trying to remove owner', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'owner' });
      const svc = createGroupService({ prisma });
      await expect(svc.removeMember({
        groupId: 'g1', userId: 'u1', operatorId: 'u2',
      })).rejects.toThrow('不能移除群主');
    });

    it('allows member to remove themselves', async () => {
      prisma.groupMember.findUnique.mockResolvedValueOnce({ role: 'member' });
      prisma.groupMember.findUnique.mockResolvedValueOnce({ role: 'member' });
      prisma.groupMember.delete.mockResolvedValue({});
      prisma.group.update.mockResolvedValue({});

      const svc = createGroupService({ prisma });
      await expect(svc.removeMember({
        groupId: 'g1', userId: 'u1', operatorId: 'u1',
      })).resolves.toBeUndefined();
    });

    it('denies regular member from removing others', async () => {
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ role: 'member' }) // target
        .mockResolvedValueOnce({ role: 'member' }); // operator
      const svc = createGroupService({ prisma });
      await expect(svc.removeMember({
        groupId: 'g1', userId: 'u3', operatorId: 'u1',
      })).rejects.toThrow(GroupError);
    });
  });

  describe('updateMemberRole', () => {
    it('throws if operator is not owner', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'admin' });
      const svc = createGroupService({ prisma });
      await expect(svc.updateMemberRole({
        groupId: 'g1', userId: 'u2', role: 'admin', operatorId: 'u1',
      })).rejects.toThrow(GroupError);
    });

    it('throws when setting role to owner', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'owner' });
      const svc = createGroupService({ prisma });
      await expect(svc.updateMemberRole({
        groupId: 'g1', userId: 'u2', role: 'owner', operatorId: 'u1',
      })).rejects.toThrow(GroupError);
    });

    it('throws when target is owner', async () => {
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ role: 'owner' }) // operator check
        .mockResolvedValueOnce({ role: 'owner' }); // target check
      const svc = createGroupService({ prisma });
      await expect(svc.updateMemberRole({
        groupId: 'g1', userId: 'u2', role: 'admin', operatorId: 'u1',
      })).rejects.toThrow('不能修改群主的角色');
    });

    it('updates member role', async () => {
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ role: 'owner' }) // operator check
        .mockResolvedValueOnce({ role: 'member' }); // target check
      prisma.groupMember.update.mockResolvedValue({
        id: 'm2', groupId: 'g1', userId: 'u2', role: 'admin', nicknameInGroup: null, joinedAt: new Date(),
      });

      const svc = createGroupService({ prisma });
      const result = await svc.updateMemberRole({
        groupId: 'g1', userId: 'u2', role: 'admin', operatorId: 'u1',
      });
      expect(result.role).toBe('admin');
    });
  });

  describe('updateMemberNickname', () => {
    it('throws if nickname is empty', async () => {
      const svc = createGroupService({ prisma });
      await expect(svc.updateMemberNickname({
        groupId: 'g1', userId: 'u1', nicknameInGroup: '',
      })).rejects.toThrow(GroupError);
    });

    it('throws if member not found', async () => {
      prisma.groupMember.findUnique.mockResolvedValue(null);
      const svc = createGroupService({ prisma });
      await expect(svc.updateMemberNickname({
        groupId: 'g1', userId: 'u999', nicknameInGroup: 'NewNick',
      })).rejects.toThrow(GroupError);
    });

    it('updates the nickname', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({
        id: 'm1', groupId: 'g1', userId: 'u1', role: 'member',
      });
      prisma.groupMember.update.mockResolvedValue({
        id: 'm1', groupId: 'g1', userId: 'u1', role: 'member',
        nicknameInGroup: 'NewNick', joinedAt: new Date(),
      });

      const svc = createGroupService({ prisma });
      const result = await svc.updateMemberNickname({
        groupId: 'g1', userId: 'u1', nicknameInGroup: 'NewNick',
      });
      expect(result.nicknameInGroup).toBe('NewNick');
    });
  });

  describe('dissolveGroup', () => {
    it('throws if operator is not owner', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'admin' });
      const svc = createGroupService({ prisma });
      await expect(svc.dissolveGroup('g1', 'u1')).rejects.toThrow(GroupError);
    });

    it('deletes the group when called by owner', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'owner' });
      prisma.group.delete.mockResolvedValue({});

      const svc = createGroupService({ prisma });
      await expect(svc.dissolveGroup('g1', 'u1')).resolves.toBeUndefined();
      expect(prisma.group.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
    });
  });

  describe('joinGroup', () => {
    it('throws if group not found', async () => {
      prisma.group.findUnique.mockResolvedValue(null);
      const svc = createGroupService({ prisma });
      await expect(svc.joinGroup('g999', 'u1')).rejects.toThrow(GroupError);
    });

    it('throws if already a member', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: 'g1' });
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'member' });
      const svc = createGroupService({ prisma });
      await expect(svc.joinGroup('g1', 'u1')).rejects.toThrow(GroupError);
    });

    it('creates a join request', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: 'g1' });
      prisma.groupMember.findUnique.mockResolvedValue(null);
      prisma.groupJoinRequest.findUnique.mockResolvedValue(null);
      prisma.groupJoinRequest.create.mockResolvedValue({
        id: 'jr1', groupId: 'g1', userId: 'u1', message: 'hi',
        status: 'pending', createdAt: new Date(),
      });

      const svc = createGroupService({ prisma });
      const result = await svc.joinGroup('g1', 'u1', 'hi');
      expect(result.status).toBe('pending');
      expect(result.groupId).toBe('g1');
    });

    it('throws if duplicate pending request exists', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: 'g1' });
      prisma.groupMember.findUnique.mockResolvedValue(null);
      prisma.groupJoinRequest.findUnique.mockResolvedValue({
        id: 'jr1', groupId: 'g1', userId: 'u1', status: 'pending',
      });
      const svc = createGroupService({ prisma });
      await expect(svc.joinGroup('g1', 'u1')).rejects.toThrow(GroupError);
    });
  });

  describe('approveJoin', () => {
    it('throws if operator is not admin/owner', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'member' });
      const svc = createGroupService({ prisma });
      await expect(svc.approveJoin('g1', 'u2', 'u1', 'approve')).rejects.toThrow(GroupError);
    });

    it('throws if request not found', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'owner' });
      prisma.groupJoinRequest.findUnique.mockResolvedValue(null);
      const svc = createGroupService({ prisma });
      await expect(svc.approveJoin('g1', 'u2', 'u1', 'approve')).rejects.toThrow(GroupError);
    });

    it('approves join request and adds member', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'owner' });
      prisma.groupJoinRequest.findUnique.mockResolvedValue({
        id: 'jr1', groupId: 'g1', userId: 'u2', status: 'pending',
      });
      prisma.groupJoinRequest.update.mockResolvedValue({});
      prisma.groupMember.create.mockResolvedValue({});
      prisma.group.update.mockResolvedValue({});

      const svc = createGroupService({ prisma });
      await svc.approveJoin('g1', 'u2', 'u1', 'approve');

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('rejects join request', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'admin' });
      prisma.groupJoinRequest.findUnique.mockResolvedValue({
        id: 'jr1', groupId: 'g1', userId: 'u2', status: 'pending',
      });
      prisma.groupJoinRequest.update.mockResolvedValue({});

      const svc = createGroupService({ prisma });
      await svc.approveJoin('g1', 'u2', 'u1', 'reject');

      expect(prisma.groupJoinRequest.update).toHaveBeenCalledWith({
        where: { id: 'jr1' },
        data: { status: 'rejected' },
      });
    });
  });

  describe('quitGroup', () => {
    it('throws if not a member', async () => {
      prisma.groupMember.findUnique.mockResolvedValue(null);
      const svc = createGroupService({ prisma });
      await expect(svc.quitGroup('g1', 'u999')).rejects.toThrow(GroupError);
    });

    it('throws if owner tries to quit', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'owner' });
      const svc = createGroupService({ prisma });
      await expect(svc.quitGroup('g1', 'u1')).rejects.toThrow('群主不能退群');
    });

    it('allows member to quit', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'member' });
      prisma.groupMember.delete.mockResolvedValue({});
      prisma.group.update.mockResolvedValue({});

      const svc = createGroupService({ prisma });
      await expect(svc.quitGroup('g1', 'u1')).resolves.toBeUndefined();
    });
  });

  describe('setAnnouncement', () => {
    it('throws if operator is not admin/owner', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'member' });
      const svc = createGroupService({ prisma });
      await expect(svc.setAnnouncement('g1', 'u1', 'hello')).rejects.toThrow(GroupError);
    });

    it('sets announcement as owner', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'owner' });
      prisma.group.update.mockResolvedValue({
        id: 'g1', name: 'Test', avatar: null, ownerId: 'u1',
        announcement: 'hello', memberCount: 5,
        createdAt: new Date(), updatedAt: new Date(),
      });

      const svc = createGroupService({ prisma });
      const result = await svc.setAnnouncement('g1', 'u1', 'hello');
      expect(result.announcement).toBe('hello');
    });
  });

  describe('muteMember', () => {
    it('throws if operator is not admin/owner', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ role: 'member' });
      const svc = createGroupService({ prisma });
      await expect(svc.muteMember({
        groupId: 'g1', userId: 'u2', operatorId: 'u1', durationMinutes: 60,
      })).rejects.toThrow(GroupError);
    });

    it('throws if target is owner', async () => {
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ role: 'owner' }) // operator check
        .mockResolvedValueOnce({ role: 'owner' }); // target
      const svc = createGroupService({ prisma });
      await expect(svc.muteMember({
        groupId: 'g1', userId: 'u1', operatorId: 'u2', durationMinutes: 60,
      })).rejects.toThrow('不能禁言群主');
    });

    it('throws if muting self', async () => {
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ role: 'admin' }) // operator check
        .mockResolvedValueOnce({ role: 'member' }); // target
      const svc = createGroupService({ prisma });
      await expect(svc.muteMember({
        groupId: 'g1', userId: 'u1', operatorId: 'u1', durationMinutes: 60,
      })).rejects.toThrow('不能禁言自己');
    });

    it('mutes member successfully', async () => {
      prisma.groupMember.findUnique
        .mockResolvedValueOnce({ role: 'admin' })
        .mockResolvedValueOnce({ role: 'member' });
      prisma.groupMember.update.mockResolvedValue({});

      const svc = createGroupService({ prisma });
      await svc.muteMember({
        groupId: 'g1', userId: 'u2', operatorId: 'u1', durationMinutes: 30,
      });

      expect(prisma.groupMember.update).toHaveBeenCalled();
    });
  });

  describe('validateMentions', () => {
    it('returns error if sender is not a member', async () => {
      prisma.groupMember.findUnique.mockResolvedValue(null);
      const svc = createGroupService({ prisma });
      const result = await svc.validateMentions({
        groupId: 'g1', senderId: 'u999', mentions: ['u2'],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('你不是群成员');
    });

    it('returns error if sender is muted', async () => {
      const future = new Date(Date.now() + 3600000);
      prisma.groupMember.findUnique.mockResolvedValue({
        role: 'member', mutedUntil: future,
      });
      const svc = createGroupService({ prisma });
      const result = await svc.validateMentions({
        groupId: 'g1', senderId: 'u1', mentions: ['u2'],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('你已被禁言');
    });

    it('denies @all for non-admin members', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({
        role: 'member', mutedUntil: null,
      });
      const svc = createGroupService({ prisma });
      const result = await svc.validateMentions({
        groupId: 'g1', senderId: 'u1', mentions: ['@all'],
      });
      expect(result.valid).toBe(false);
      expect(result.error).toBe('只有群主或管理员才能使用@所有人');
    });

    it('allows @all for admin and returns all member IDs', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({
        role: 'admin', mutedUntil: null,
      });
      prisma.groupMember.findMany.mockResolvedValue([
        { userId: 'u2' }, { userId: 'u3' },
      ]);
      const svc = createGroupService({ prisma });
      const result = await svc.validateMentions({
        groupId: 'g1', senderId: 'u1', mentions: ['@all'],
      });
      expect(result.valid).toBe(true);
      expect(result.mentionedUserIds).toEqual(['u2', 'u3']);
    });

    it('validates individual mentions and filters non-members', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({
        role: 'member', mutedUntil: null,
      });
      prisma.groupMember.findMany.mockResolvedValue([
        { userId: 'u2' },
      ]);
      const svc = createGroupService({ prisma });
      const result = await svc.validateMentions({
        groupId: 'g1', senderId: 'u1', mentions: ['u2', 'u999'],
      });
      expect(result.valid).toBe(true);
      expect(result.mentionedUserIds).toEqual(['u2']);
    });
  });

  describe('isMuted', () => {
    it('returns false if member not found', async () => {
      prisma.groupMember.findUnique.mockResolvedValue(null);
      const svc = createGroupService({ prisma });
      const result = await svc.isMuted('g1', 'u999');
      expect(result).toBe(false);
    });

    it('returns false if not muted', async () => {
      prisma.groupMember.findUnique.mockResolvedValue({ mutedUntil: null });
      const svc = createGroupService({ prisma });
      const result = await svc.isMuted('g1', 'u1');
      expect(result).toBe(false);
    });

    it('returns true if muted and not expired', async () => {
      const future = new Date(Date.now() + 3600000);
      prisma.groupMember.findUnique.mockResolvedValue({ mutedUntil: future });
      const svc = createGroupService({ prisma });
      const result = await svc.isMuted('g1', 'u1');
      expect(result).toBe(true);
    });

    it('returns false if mute has expired', async () => {
      const past = new Date(Date.now() - 3600000);
      prisma.groupMember.findUnique.mockResolvedValue({ mutedUntil: past });
      const svc = createGroupService({ prisma });
      const result = await svc.isMuted('g1', 'u1');
      expect(result).toBe(false);
    });
  });
});
