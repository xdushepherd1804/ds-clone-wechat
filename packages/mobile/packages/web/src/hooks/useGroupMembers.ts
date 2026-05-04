import { useState, useEffect, useCallback } from 'react';
import type { GroupMember } from '@/types';
import { getGroupMembers as apiGetGroupMembers } from '@/api';

export function useGroupMembers(groupId: string) {
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await apiGetGroupMembers(groupId);
      setMembers(list);
    } catch (err: unknown) {
      setError((err as Error).message || '获取成员列表失败');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  return { members, loading, error, refresh: fetchMembers };
}
