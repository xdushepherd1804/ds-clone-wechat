import axios from 'axios';
import { getToken, setToken, removeToken } from '@/utils/storage';

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
    const currentToken = await getToken();
    const res = await axios.post(
      'http://49.235.177.132:3000/api/auth/refresh',
      {},
      {
        headers: currentToken
          ? { Authorization: `Bearer ${currentToken}` }
          : undefined,
      },
    );
    const newToken = res.data?.token || res.data?.data?.token;
    if (newToken) {
      await setToken(newToken);
      return newToken;
    }
  } catch {
    // refresh failed
  }
  return null;
}

const apiClient = axios.create({
  baseURL: 'http://49.235.177.132:3000/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    const token = await getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

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
      await removeToken();
      // Do NOT redirect — just reject so the caller handles it
    }
    return Promise.reject(error);
  },
);

export default apiClient;
