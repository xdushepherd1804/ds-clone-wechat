import { useState, useEffect, useCallback } from 'react';
import type { GroupInfo } from '@/types';
import { getGroupInfo as apiGetGroupInfo } from '@/api';

export function useGroupInfo(groupId: string) {
  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGroupInfo = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    try {
      const info = await apiGetGroupInfo(groupId);
      setGroupInfo(info);
    } catch (err: unknown) {
      setError((err as Error).message || '获取群信息失败');
    } finally {
      setLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchGroupInfo();
  }, [fetchGroupInfo]);

  return { groupInfo, loading, error, refresh: fetchGroupInfo };
}
