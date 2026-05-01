import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPost, mockPatch, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('./client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    delete: mockDelete,
  },
}));

import {
  getGroups,
  createGroup,
  getGroupInfo,
  updateGroup,
  getGroupMembers,
  addGroupMembers,
  removeGroupMember,
  updateMemberRole,
  updateMemberNickname,
} from './group';

describe('group API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGroups', () => {
    it('calls GET /groups', async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: [{ id: 'g1', name: 'Test Group' }] },
      });

      const result = await getGroups();
      expect(mockGet).toHaveBeenCalledWith('/groups');
      expect(result).toHaveLength(1);
    });
  });

  describe('createGroup', () => {
    it('calls POST /groups with data', async () => {
      mockPost.mockResolvedValueOnce({
        data: { data: { id: 'g1', name: 'New Group' } },
      });

      const result = await createGroup({ name: 'New Group', memberIds: ['u1'] });
      expect(mockPost).toHaveBeenCalledWith('/groups', { name: 'New Group', memberIds: ['u1'] });
      expect(result.name).toBe('New Group');
    });
  });

  describe('getGroupInfo', () => {
    it('calls GET /groups/:id', async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: { id: 'g1', name: 'Group 1' } },
      });

      const result = await getGroupInfo('g1');
      expect(mockGet).toHaveBeenCalledWith('/groups/g1');
      expect(result.id).toBe('g1');
    });
  });

  describe('updateGroup', () => {
    it('calls PATCH /groups/:id with data', async () => {
      mockPatch.mockResolvedValueOnce({
        data: { data: { id: 'g1', name: 'Updated Group' } },
      });

      const result = await updateGroup('g1', { name: 'Updated Group' });
      expect(mockPatch).toHaveBeenCalledWith('/groups/g1', { name: 'Updated Group' });
      expect(result.name).toBe('Updated Group');
    });
  });

  describe('getGroupMembers', () => {
    it('calls GET /groups/:id/members', async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: [{ id: 'm1', userId: 'u1', role: 'owner' }] },
      });

      const result = await getGroupMembers('g1');
      expect(mockGet).toHaveBeenCalledWith('/groups/g1/members');
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('owner');
    });
  });

  describe('addGroupMembers', () => {
    it('calls POST /groups/:id/members with data', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });

      await addGroupMembers('g1', { userIds: ['u2', 'u3'] });
      expect(mockPost).toHaveBeenCalledWith('/groups/g1/members', { userIds: ['u2', 'u3'] });
    });
  });

  describe('removeGroupMember', () => {
    it('calls DELETE /groups/:id/members with data', async () => {
      mockDelete.mockResolvedValueOnce({ data: {} });

      await removeGroupMember('g1', { userId: 'u2' });
      expect(mockDelete).toHaveBeenCalledWith('/groups/g1/members', { data: { userId: 'u2' } });
    });
  });

  describe('updateMemberRole', () => {
    it('calls PATCH /groups/:id/members/:memberId/role with data', async () => {
      mockPatch.mockResolvedValueOnce({ data: {} });

      await updateMemberRole('g1', 'm2', { userId: 'u1', role: 'admin' });
      expect(mockPatch).toHaveBeenCalledWith('/groups/g1/members/m2/role', { userId: 'u1', role: 'admin' });
    });
  });

  describe('updateMemberNickname', () => {
    it('calls PATCH /groups/:id/members/nickname with data', async () => {
      mockPatch.mockResolvedValueOnce({ data: {} });

      await updateMemberNickname('g1', { nicknameInGroup: 'MyNick' });
      expect(mockPatch).toHaveBeenCalledWith('/groups/g1/members/nickname', { nicknameInGroup: 'MyNick' });
    });
  });
});
