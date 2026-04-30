import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing the module under test
vi.mock('@/utils/token', () => ({
  getToken: vi.fn(() => null),
  setToken: vi.fn(),
  removeToken: vi.fn(),
}));

// Mock axios
const mockAxiosCreate = vi.fn();
const mockReqInterceptor = { use: vi.fn() };
const mockResInterceptor = { use: vi.fn() };

vi.mock('axios', () => {
  const mockInstance = {
    interceptors: {
      request: mockReqInterceptor,
      response: mockResInterceptor,
    },
  };
  return {
    default: {
      create: vi.fn(() => mockInstance),
    },
  };
});

describe('apiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks to capture fresh interceptor registrations
    mockReqInterceptor.use.mockReset();
    mockResInterceptor.use.mockReset();
  });

  it('creates axios instance with correct base config', async () => {
    const axios = await import('axios');
    // Re-import to trigger create
    vi.resetModules();
    await import('./client');

    expect(axios.default.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: '/api',
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });

  it('registers request interceptor', async () => {
    vi.resetModules();
    await import('./client');
    expect(mockReqInterceptor.use).toHaveBeenCalled();
  });

  it('registers response interceptor', async () => {
    vi.resetModules();
    await import('./client');
    expect(mockResInterceptor.use).toHaveBeenCalled();
  });
});

describe('request interceptor', () => {
  it('adds Authorization header when token exists', async () => {
    const { getToken } = await import('@/utils/token');
    vi.mocked(getToken).mockReturnValue('test-token-abc');

    vi.resetModules();
    await import('./client');

    // Get the request interceptor function that was registered
    const interceptorFn = mockReqInterceptor.use.mock.calls[0]?.[0];
    expect(interceptorFn).toBeDefined();

    const config = { headers: {} as Record<string, string> };
    const result = interceptorFn!(config);
    expect(result.headers.Authorization).toBe('Bearer test-token-abc');
  });

  it('does not add Authorization header when no token', async () => {
    const { getToken } = await import('@/utils/token');
    vi.mocked(getToken).mockReturnValue(null);

    vi.resetModules();
    await import('./client');

    const interceptorFn = mockReqInterceptor.use.mock.calls[0]?.[0];
    const config = { headers: {} as Record<string, string> };
    const result = interceptorFn!(config);
    expect(result.headers.Authorization).toBeUndefined();
  });
});

describe('response interceptor', () => {
  it('handles 401 by removing token and redirecting', async () => {
    const { removeToken } = await import('@/utils/token');

    // Mock window.location
    const originalLocation = window.location;
    const locationMock = { href: '' };
    Object.defineProperty(window, 'location', {
      value: locationMock,
      writable: true,
    });

    vi.resetModules();
    await import('./client');

    const errorInterceptorFn = mockResInterceptor.use.mock.calls[0]?.[1];
    expect(errorInterceptorFn).toBeDefined();

    const error = { response: { status: 401 } };
    try {
      await errorInterceptorFn!(error);
    } catch {
      // expected to reject
    }

    expect(removeToken).toHaveBeenCalled();
    expect(locationMock.href).toBe('/login');

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    });
  });

  it('passes through non-401 errors', async () => {
    vi.resetModules();
    await import('./client');

    const errorInterceptorFn = mockResInterceptor.use.mock.calls[0]?.[1];
    const error = { response: { status: 500 } };

    await expect(errorInterceptorFn!(error)).rejects.toEqual(error);
  });
});
