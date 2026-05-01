import { useState, useCallback } from 'react';
import type { GroupRole, GroupInfo } from '@/types';
import {
  updateGroup,
  dissolveGroup,
  quitGroup,
  addGroupMembers,
  removeGroupMember,
  updateMemberRole,
} from '@/api';

export function useGroupActions(groupId: string) {
  const [loading, setLoading] = useState(false);

  const update = useCallback(
    async (data: { name?: string; avatar?: string; announcement?: string }): Promise<GroupInfo | null> => {
      setLoading(true);
      try {
        const result = await updateGroup(groupId, data);
        return result;
      } catch {
        return null;
      } finally {
        setLoading(false);
      }
    },
    [groupId],
  );

  const dissolve = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      await dissolveGroup(groupId);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const quit = useCallback(async (): Promise<boolean> => {
    setLoading(true);
    try {
      await quitGroup(groupId);
      return true;
    } catch {
      return false;
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  const addMembers = useCallback(
    async (userIds: string[]): Promise<boolean> => {
      setLoading(true);
      try {
        await addGroupMembers(groupId, { userIds });
        return true;
      } catch {
        return false;
      } finally {
        setLoading(false);
      }
    },
    [groupId],
  );

  const removeMember = useCallback(
    async (userId: string): Promise<boolean> => {
      setLoading(true);
      try {
        await removeGroupMember(groupId, { userId });
        return true;
      } catch {
        return false;
      } finally {
        setLoading(false);
      }
    },
    [groupId],
  );

  const changeMemberRole = useCallback(
    async (memberId: string, role: GroupRole): Promise<boolean> => {
      setLoading(true);
      try {
        await updateMemberRole(groupId, memberId, { userId: memberId, role });
        return true;
      } catch {
        return false;
      } finally {
        setLoading(false);
      }
    },
    [groupId],
  );

  return { loading, update, dissolve, quit, addMembers, removeMember, changeMemberRole };
}
