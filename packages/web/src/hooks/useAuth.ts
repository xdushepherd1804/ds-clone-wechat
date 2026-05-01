import { useEffect } from 'react';
import { useUserStore } from '@/store';

export function useAuth() {
  const { isLoggedIn, isLoading, restoreSession, logout } = useUserStore();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return { isLoggedIn, isLoading, logout };
}
