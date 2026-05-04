import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUserStore } from './userStore';

vi.mock('@/api/auth', () => ({
  getMe: vi.fn(),
}));

import { getMe } from '@/api/auth';

describe('userStore', () => {
  beforeEach(() => {
    useUserStore.setState({
      token: null,
      user: null,
      isLoggedIn: false,
      isLoading: false,
    });
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('has correct initial state', () => {
    const state = useUserStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isLoggedIn).toBe(false);
  });

  describe('setAuth', () => {
    it('sets token, user, and isLoggedIn', () => {
      const user = { id: 'u1', username: 'alice', nickname: 'Alice', avatar: null, phone: null, status: 'online' as const, lastSeenAt: null, createdAt: new Date().toISOString() };
      useUserStore.getState().setAuth('test-token', user);

      const state = useUserStore.getState();
      expect(state.token).toBe('test-token');
      expect(state.user?.username).toBe('alice');
      expect(state.isLoggedIn).toBe(true);
    });

    it('stores token in localStorage', () => {
      const user = { id: 'u1', username: 'alice', nickname: 'Alice', avatar: null, phone: null, status: 'online' as const, lastSeenAt: null, createdAt: new Date().toISOString() };
      useUserStore.getState().setAuth('my-token', user);

      expect(localStorage.getItem('wechat_clone_token')).toBe('my-token');
    });
  });

  describe('setUser', () => {
    it('updates only the user field', () => {
      useUserStore.setState({ token: 'existing-token', isLoggedIn: true });

      const updatedUser = { id: 'u1', username: 'alice', nickname: 'Alice Updated', avatar: 'https://example.com/avatar.png', phone: null, status: 'online' as const, lastSeenAt: null, createdAt: new Date().toISOString() };
      useUserStore.getState().setUser(updatedUser);

      const state = useUserStore.getState();
      expect(state.user?.nickname).toBe('Alice Updated');
      expect(state.token).toBe('existing-token');
      expect(state.isLoggedIn).toBe(true);
    });
  });

  describe('logout', () => {
    it('clears token, user, and isLoggedIn', () => {
      const user = { id: 'u1', username: 'alice', nickname: 'Alice', avatar: null, phone: null, status: 'online' as const, lastSeenAt: null, createdAt: new Date().toISOString() };
      useUserStore.getState().setAuth('token', user);

      useUserStore.getState().logout();

      const state = useUserStore.getState();
      expect(state.token).toBeNull();
      expect(state.user).toBeNull();
      expect(state.isLoggedIn).toBe(false);
    });

    it('removes token from localStorage', () => {
      const user = { id: 'u1', username: 'alice', nickname: 'Alice', avatar: null, phone: null, status: 'online' as const, lastSeenAt: null, createdAt: new Date().toISOString() };
      useUserStore.getState().setAuth('token', user);

      useUserStore.getState().logout();

      expect(localStorage.getItem('wechat_clone_token')).toBeNull();
    });
  });

  describe('restoreSession', () => {
    it('calls logout when no token in storage', async () => {
      await useUserStore.getState().restoreSession();
      expect(useUserStore.getState().isLoggedIn).toBe(false);
      expect(useUserStore.getState().isLoading).toBe(false);
    });

    it('calls getMe and sets user when token exists', async () => {
      const mockUser = { id: 'u1', username: 'alice', nickname: 'Alice', avatar: null, phone: null, status: 'online' as const, lastSeenAt: null, createdAt: new Date().toISOString() };
      vi.mocked(getMe).mockResolvedValue(mockUser);
      localStorage.setItem('wechat_clone_token', 'saved-token');

      await useUserStore.getState().restoreSession();

      expect(getMe).toHaveBeenCalled();
      expect(useUserStore.getState().isLoggedIn).toBe(true);
      expect(useUserStore.getState().token).toBe('saved-token');
      expect(useUserStore.getState().user?.username).toBe('alice');
    });

    it('calls logout when getMe fails', async () => {
      vi.mocked(getMe).mockRejectedValue(new Error('Unauthorized'));
      localStorage.setItem('wechat_clone_token', 'bad-token');

      await useUserStore.getState().restoreSession();

      expect(useUserStore.getState().isLoggedIn).toBe(false);
      expect(useUserStore.getState().token).toBeNull();
    });
  });

  describe('initial state from localStorage', () => {
    it('reads token from localStorage on creation', () => {
      localStorage.setItem('wechat_clone_token', 'pre-existing-token');

      useUserStore.setState({ token: 'pre-existing-token', isLoggedIn: true });

      const state = useUserStore.getState();
      expect(state.token).toBe('pre-existing-token');
      expect(state.isLoggedIn).toBe(true);
    });
  });
});
