export type GroupRole = 'owner' | 'admin' | 'member';

export interface GroupInfo {
  id: string;
  name: string;
  avatar: string | null;
  ownerId: string;
  announcement: string | null;
  memberCount: number;
  myRole?: GroupRole;
  myNicknameInGroup?: string;
  createdAt: string;
}

export interface GroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  nicknameInGroup: string | null;
  joinedAt: string;
  user: {
    id: string;
    nickname: string;
    avatar: string | null;
  };
}

export interface CreateGroupRequest {
  name: string;
  memberIds: string[];
  avatar?: string;
}

export interface UpdateGroupRequest {
  name?: string;
  avatar?: string;
  announcement?: string;
}

export interface AddGroupMembersRequest {
  userIds: string[];
}

export interface RemoveGroupMemberRequest {
  userId: string;
}

export interface UpdateMemberRoleRequest {
  userId: string;
  role: GroupRole;
}

export interface UpdateMemberNicknameRequest {
  nicknameInGroup: string;
}
