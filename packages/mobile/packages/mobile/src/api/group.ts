import apiClient from './client';
import type {
  GroupInfo,
  GroupMember,
  CreateGroupRequest,
  UpdateGroupRequest,
  ApiResponse,
} from '@wechat-clone/shared';

export async function createGroup(
  name: string,
  memberIds: string[],
  avatar?: string,
): Promise<GroupInfo> {
  const payload: CreateGroupRequest = { name, memberIds, avatar };
  const res = await apiClient.post<ApiResponse<GroupInfo>>('/groups', payload);
  return res.data.data!;
}

export async function getGroups(): Promise<GroupInfo[]> {
  const res = await apiClient.get<ApiResponse<GroupInfo[]>>('/groups');
  return res.data.data ?? [];
}

export async function getGroup(id: string): Promise<GroupInfo> {
  const res = await apiClient.get<ApiResponse<GroupInfo>>(`/groups/${id}`);
  return res.data.data!;
}

export async function updateGroup(
  id: string,
  data: UpdateGroupRequest,
): Promise<GroupInfo> {
  const res = await apiClient.put<ApiResponse<GroupInfo>>(
    `/groups/${id}`,
    data,
  );
  return res.data.data!;
}

export async function deleteGroup(id: string): Promise<void> {
  await apiClient.delete(`/groups/${id}`);
}

export async function getGroupMembers(id: string): Promise<GroupMember[]> {
  const res = await apiClient.get<ApiResponse<GroupMember[]>>(
    `/groups/${id}/members`,
  );
  return res.data.data ?? [];
}

export async function addGroupMembers(
  id: string,
  userIds: string[],
): Promise<GroupMember[]> {
  const res = await apiClient.post<ApiResponse<GroupMember[]>>(
    `/groups/${id}/members`,
    { userIds },
  );
  return res.data.data!;
}

export async function removeGroupMember(
  id: string,
  userId: string,
): Promise<void> {
  await apiClient.delete(`/groups/${id}/members/${userId}`);
}

export async function updateMemberRole(
  id: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
): Promise<void> {
  await apiClient.put(`/groups/${id}/members/${userId}/role`, { role });
}

export async function quitGroup(id: string): Promise<void> {
  await apiClient.post(`/groups/${id}/quit`);
}
