export interface ApiResponse<T = undefined> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  cursor?: string;
  hasMore: boolean;
}

export type PaginatedResponse<T> = ApiResponse<PaginatedData<T>>;

export interface PaginationParams {
  cursor?: string;
  limit?: number;
}

export interface ApiError {
  code: number;
  message: string;
  timestamp: number;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiEndpoint {
  path: string;
  method: HttpMethod;
  auth: boolean;
  description: string;
}

export const API_PREFIX = '/api/v1';
