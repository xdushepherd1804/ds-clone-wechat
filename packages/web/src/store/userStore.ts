import { create } from 'zustand';
import type { UserProfile } from '@/types';
import { getToken, setToken, removeToken } from '@/utils/token';
import { getMe } from '@/api/auth';

interface UserState {
  token: string | null;
  user: UserProfile | null;
  isLoggedIn: boolean;
  isLoading: boolean;

  setAuth: (token: string, user: UserProfile) => void;
  setUser: (user: UserProfile) => void;
  logout: () => void;
  restoreSession: () => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
  token: getToken(),
  user: null,
  isLoggedIn: false,
  isLoading: !!getToken(),

  setAuth: (token, user) => {
    setToken(token);
    set({ token, user, isLoggedIn: true, isLoading: false });
  },

  setUser: (user) => set({ user }),

  logout: () => {
    removeToken();
    set({ token: null, user: null, isLoggedIn: false, isLoading: false });
  },

  restoreSession: async () => {
    const token = getToken();
    if (!token) {
      set({ isLoading: false });
      return;
    }
    try {
      const user = await getMe();
      set({ token, user, isLoggedIn: true, isLoading: false });
    } catch {
      get().logout();
    }
  },
}));
