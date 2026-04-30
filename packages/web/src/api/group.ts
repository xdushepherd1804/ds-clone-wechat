import apiClient from './client';
import type {
  GroupInfo,
  GroupMember,
  CreateGroupRequest,
  UpdateGroupRequest,
  AddGroupMembersRequest,
  RemoveGroupMemberRequest,
  UpdateMemberRoleRequest,
  UpdateMemberNicknameRequest,
  ApiResponse,
} from '@/types';

export async function getGroups(): Promise<GroupInfo[]> {
  const res = await apiClient.get<ApiResponse<GroupInfo[]>>('/groups');
  return res.data.data!;
}

export async function createGroup(data: CreateGroupRequest): Promise<GroupInfo> {
  const res = await apiClient.post<ApiResponse<GroupInfo>>('/groups', data);
  return res.data.data!;
}

export async function getGroupInfo(groupId: string): Promise<GroupInfo> {
  const res = await apiClient.get<ApiResponse<GroupInfo>>(`/groups/${groupId}`);
  return res.data.data!;
}

export async function updateGroup(
  groupId: string,
  data: UpdateGroupRequest,
): Promise<GroupInfo> {
  const res = await apiClient.patch<ApiResponse<GroupInfo>>(`/groups/${groupId}`, data);
  return res.data.data!;
}

export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const res = await apiClient.get<ApiResponse<GroupMember[]>>(`/groups/${groupId}/members`);
  return res.data.data!;
}

export async function addGroupMembers(
  groupId: string,
  data: AddGroupMembersRequest,
): Promise<void> {
  await apiClient.post(`/groups/${groupId}/members`, data);
}

export async function removeGroupMember(
  groupId: string,
  data: RemoveGroupMemberRequest,
): Promise<void> {
  await apiClient.delete(`/groups/${groupId}/members`, { data });
}

export async function updateMemberRole(
  groupId: string,
  memberId: string,
  data: UpdateMemberRoleRequest,
): Promise<void> {
  await apiClient.patch(`/groups/${groupId}/members/${memberId}/role`, data);
}

export async function updateMemberNickname(
  groupId: string,
  data: UpdateMemberNicknameRequest,
): Promise<void> {
  await apiClient.patch(`/groups/${groupId}/members/nickname`, data);
}
