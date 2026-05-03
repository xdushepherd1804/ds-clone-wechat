import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserProfile } from '@wechat-clone/shared';
import { getToken, setToken, removeToken } from '@/utils/storage';
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

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      isLoggedIn: false,
      isLoading: true,

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
        if (get().isLoggedIn) {
          set({ isLoading: false });
          return;
        }
        const token = await getToken();
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
    }),
    {
      name: 'user-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isLoggedIn: state.isLoggedIn,
      }),
    },
  ),
);
