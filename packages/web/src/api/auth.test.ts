import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPost } = vi.hoisted(() => ({
  mockPost: vi.fn(),
}));

vi.mock('./client', () => ({
  default: {
    post: mockPost,
  },
}));

import { login, register, logout, refreshToken } from './auth';

describe('auth API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('calls POST /auth/login with credentials', async () => {
      const mockResponse = {
        data: { token: 'access-token', user: { id: '1', username: 'alice' }, expiresIn: 900 },
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const result = await login({ username: 'alice', password: 'password123' });

      expect(mockPost).toHaveBeenCalledWith('/auth/login', {
        username: 'alice',
        password: 'password123',
      });
      expect(result.token).toBe('access-token');
      expect(result.user.username).toBe('alice');
    });
  });

  describe('register', () => {
    it('calls POST /auth/register with user data', async () => {
      const mockResponse = {
        data: { token: 'access-token', user: { id: '1', username: 'newuser' }, expiresIn: 900 },
      };
      mockPost.mockResolvedValueOnce(mockResponse);

      const result = await register({
        username: 'newuser',
        password: 'password123',
        nickname: 'New User',
        phone: '+8613800138000',
      });

      expect(mockPost).toHaveBeenCalledWith('/auth/register', {
        username: 'newuser',
        password: 'password123',
        nickname: 'New User',
        phone: '+8613800138000',
      });
      expect(result.user.username).toBe('newuser');
    });
  });

  describe('logout', () => {
    it('calls POST /auth/logout', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });

      await logout();

      expect(mockPost).toHaveBeenCalledWith('/auth/logout');
    });

    it('does not throw on error', async () => {
      mockPost.mockRejectedValueOnce(new Error('Network error'));

      await expect(logout()).rejects.toThrow('Network error');
    });
  });

  describe('refreshToken', () => {
    it('calls POST /auth/refresh', async () => {
      mockPost.mockResolvedValueOnce({ data: { token: 'new-access-token' } });

      const result = await refreshToken();

      expect(mockPost).toHaveBeenCalledWith('/auth/refresh');
      expect(result.token).toBe('new-access-token');
    });
  });
});
