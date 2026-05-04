import apiClient from './client';
import type { LoginRequest, LoginResponse, RegisterRequest, UserProfile } from '@wechat-clone/shared';

export async function login(data: LoginRequest): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/login', data);
  return res.data;
}

export async function register(data: RegisterRequest): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/register', data);
  return res.data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export async function refreshToken(): Promise<{ token: string }> {
  const res = await apiClient.post<{ token: string }>('/auth/refresh');
  return res.data;
}

export async function getMe(): Promise<UserProfile> {
  const res = await apiClient.get<{ data: { user: UserProfile } }>('/users/me');
  // Handle both shapes: { data: { user } } and { user }
  if (res.data.data?.user) {
    return res.data.data.user;
  }
  if ((res.data as unknown as { user: UserProfile }).user) {
    return (res.data as unknown as { user: UserProfile }).user;
  }
  throw new Error('Unexpected response format from /users/me');
}
