import apiClient from './client';
import type {
  ContactItem,
  FriendRequest,
  SendFriendRequest,
  HandleFriendRequest,
  ContactSearchResult,
  ApiResponse,
} from '@wechat-clone/shared';

export async function getContacts(): Promise<ContactItem[]> {
  const res = await apiClient.get<ApiResponse<ContactItem[]>>('/contacts');
  return res.data.data ?? [];
}

export async function getFriendRequests(): Promise<FriendRequest[]> {
  const res = await apiClient.get<ApiResponse<FriendRequest[]>>('/contacts/friend-requests');
  return res.data.data ?? [];
}

export async function sendFriendRequest(
  toUid: string,
  message?: string,
): Promise<FriendRequest> {
  const payload: SendFriendRequest = { toUid, message };
  const res = await apiClient.post<ApiResponse<FriendRequest>>(
    '/contacts/friend-requests',
    payload,
  );
  return res.data.data!;
}

export async function handleFriendRequest(
  id: string,
  action: 'accept' | 'reject',
): Promise<void> {
  const payload: HandleFriendRequest = { action };
  await apiClient.put(`/contacts/friend-requests/${id}`, payload);
}

export async function deleteContact(uid: string): Promise<void> {
  await apiClient.delete(`/contacts/${uid}`);
}

export async function updateRemark(
  uid: string,
  remark: string,
): Promise<void> {
  await apiClient.put(`/contacts/${uid}/remark`, { remark });
}

export async function updateTags(uid: string, tags: string[]): Promise<void> {
  await apiClient.put(`/contacts/${uid}/tags`, { tags });
}

export async function blockContact(targetUid: string): Promise<void> {
  await apiClient.post(`/contacts/${targetUid}/block`);
}

export async function unblockContact(uid: string): Promise<void> {
  await apiClient.post(`/contacts/${uid}/unblock`);
}

export async function searchContacts(
  keyword: string,
): Promise<ContactSearchResult[]> {
  const res = await apiClient.get<ApiResponse<ContactSearchResult[]>>(
    '/contacts/search',
    { params: { keyword } },
  );
  return res.data.data ?? [];
}
