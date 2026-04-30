export type UserStatus = 'online' | 'offline' | 'busy' | 'invisible';

export interface UserProfile {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  phone: string | null;
  status: UserStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface UserPublicProfile {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  status: UserStatus;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: UserProfile;
  expiresIn: number;
}

export interface RegisterRequest {
  username: string;
  password: string;
  nickname: string;
  phone?: string;
}

export interface UpdateProfileRequest {
  nickname?: string;
  avatar?: string;
  phone?: string;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}
