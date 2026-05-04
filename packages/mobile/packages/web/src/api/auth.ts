import apiClient from './client';
import type { LoginRequest, LoginResponse, RegisterRequest, UserProfile } from '@/types';

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
  const res = await apiClient.get<{ user: UserProfile }>('/users/me');
  return res.data.user;
}
