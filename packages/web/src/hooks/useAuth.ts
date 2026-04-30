import { useEffect } from 'react';
import { useUserStore } from '@/store';

export function useAuth() {
  const { isLoggedIn, restoreSession, logout } = useUserStore();

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  return { isLoggedIn, logout };
}
