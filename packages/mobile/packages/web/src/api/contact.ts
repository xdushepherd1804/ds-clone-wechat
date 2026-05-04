import apiClient from './client';
import type {
  ContactItem,
  AddContactRequest,
  UpdateContactRequest,
  FriendRequest,
  SendFriendRequest,
  HandleFriendRequest,
  ContactSearchResult,
  ApiResponse,
  PaginatedResponse,
} from '@/types';

export async function getContacts(): Promise<ContactItem[]> {
  const res = await apiClient.get<ApiResponse<ContactItem[]>>('/contacts');
  return res.data.data!;
}

export async function sendFriendRequest(data: SendFriendRequest): Promise<FriendRequest> {
  const res = await apiClient.post<ApiResponse<FriendRequest>>('/contacts/requests', data);
  return res.data.data!;
}

export async function updateContact(
  contactId: string,
  data: UpdateContactRequest,
): Promise<ContactItem> {
  const res = await apiClient.put<ApiResponse<ContactItem>>(`/contacts/${contactId}`, data);
  return res.data.data!;
}

export async function deleteContact(contactId: string): Promise<void> {
  await apiClient.delete(`/contacts/${contactId}`);
}

export async function getFriendRequests(): Promise<FriendRequest[]> {
  const res = await apiClient.get<ApiResponse<FriendRequest[]>>('/contacts/requests');
  return res.data.data!;
}

export async function handleFriendRequest(
  requestId: string,
  data: HandleFriendRequest,
): Promise<void> {
  await apiClient.put(`/contacts/requests/${requestId}`, data);
}

export async function searchContacts(
  keyword: string,
): Promise<ContactSearchResult[]> {
  const res = await apiClient.post<ApiResponse<ContactSearchResult[]>>('/contacts/search', { keyword });
  return res.data.data!;
}
