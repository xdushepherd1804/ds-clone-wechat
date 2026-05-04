import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';

// The useAuth hook imports from useUserStore directly, which uses zustand.
// Since zustand stores are plain JS objects, we can manipulate them directly.

// Mock the store module
const mockRestoreSession = vi.fn(() => true);
const mockLogout = vi.fn();

vi.mock('@/store', () => ({
  useUserStore: Object.assign(
    vi.fn((selector?: any) => {
      const state = {
        isLoggedIn: true,
        isLoading: false,
        restoreSession: mockRestoreSession,
        logout: mockLogout,
      };
      return selector ? selector(state) : state;
    }),
    {
      getState: () => ({
        isLoggedIn: true,
        isLoading: false,
        restoreSession: mockRestoreSession,
        logout: mockLogout,
      }),
      setState: vi.fn(),
      subscribe: vi.fn(),
    },
  ),
}));

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRestoreSession.mockReturnValue(true);
  });

  it('calls restoreSession on mount', () => {
    renderHook(() => useAuth());
    expect(mockRestoreSession).toHaveBeenCalled();
  });

  it('returns isLoggedIn from store', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoggedIn).toBe(true);
  });

  it('returns isLoading from store', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  it('returns logout from store', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.logout).toBe(mockLogout);
  });

  it('can call logout', () => {
    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.logout();
    });

    expect(mockLogout).toHaveBeenCalled();
  });

  it('calls restoreSession only once on mount', () => {
    const { rerender } = renderHook(() => useAuth());
    rerender();
    // restoreSession is called as an effect, so it's called once on mount
    expect(mockRestoreSession).toHaveBeenCalledTimes(1);
  });
});
