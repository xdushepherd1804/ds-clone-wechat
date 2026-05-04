import axios from 'axios';
import { getToken, setToken, removeToken } from '@/utils/token';

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error || !token) {
      reject(error);
    } else {
      resolve(token);
    }
  });
  failedQueue = [];
}

async function attemptRefresh(): Promise<string | null> {
  try {
    const res = await axios.post('/api/auth/refresh');
    const newToken = res.data?.token || res.data?.data?.token;
    if (newToken) {
      setToken(newToken);
      return newToken;
    }
  } catch {
    // refresh failed
  }
  return null;
}

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const newToken = await attemptRefresh();
      if (newToken) {
        processQueue(null, newToken);
        isRefreshing = false;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }

      processQueue('refresh_failed', null);
      isRefreshing = false;
      removeToken();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default apiClient;
