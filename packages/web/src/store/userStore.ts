import { create } from 'zustand';
import type { UserProfile } from '@/types';
import { getToken, setToken, removeToken } from '@/utils/token';

interface UserState {
  token: string | null;
  user: UserProfile | null;
  isLoggedIn: boolean;

  setAuth: (token: string, user: UserProfile) => void;
  setUser: (user: UserProfile) => void;
  logout: () => void;
  restoreSession: () => boolean;
}

export const useUserStore = create<UserState>((set) => ({
  token: getToken(),
  user: null,
  isLoggedIn: !!getToken(),

  setAuth: (token, user) => {
    setToken(token);
    set({ token, user, isLoggedIn: true });
  },

  setUser: (user) => set({ user }),

  logout: () => {
    removeToken();
    set({ token: null, user: null, isLoggedIn: false });
  },

  restoreSession: () => {
    const token = getToken();
    if (token) {
      set({ token, isLoggedIn: true });
      return true;
    }
    return false;
  },
}));
