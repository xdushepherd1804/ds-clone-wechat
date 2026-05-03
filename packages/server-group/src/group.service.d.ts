import type { PrismaClient } from '@prisma/client';
import type { GroupInfo, GroupMember, GroupRole, GroupJoinRequestInfo } from '@wechat-clone/shared';
export interface GroupServiceDeps {
    prisma: PrismaClient;
}
export interface CreateGroupInput {
    name: string;
    ownerId: string;
    avatar?: string;
    memberIds?: string[];
}
export interface UpdateGroupInput {
    name?: string;
    avatar?: string;
    announcement?: string;
}
export interface AddMembersInput {
    groupId: string;
    userIds: string[];
    operatorId: string;
}
export interface RemoveMemberInput {
    groupId: string;
    userId: string;
    operatorId: string;
}
export interface UpdateMemberRoleInput {
    groupId: string;
    userId: string;
    role: GroupRole;
    operatorId: string;
}
export interface UpdateMemberNicknameInput {
    groupId: string;
    userId: string;
    nicknameInGroup: string;
}
export interface MuteMemberInput {
    groupId: string;
    userId: string;
    operatorId: string;
    durationMinutes: number;
}
export interface ValidateMentionsInput {
    groupId: string;
    senderId: string;
    mentions: string[];
}
export declare class GroupError extends Error {
    name: string;
    code: number;
    constructor(code: number, message: string);
}
export declare function createGroupService(deps: GroupServiceDeps): {
    createGroup: (input: CreateGroupInput) => Promise<GroupInfo>;
    getGroup: (groupId: string) => Promise<GroupInfo>;
    updateGroup: (groupId: string, operatorId: string, input: UpdateGroupInput) => Promise<GroupInfo>;
    getMembers: (groupId: string) => Promise<GroupMember[]>;
    addMembers: (input: AddMembersInput) => Promise<void>;
    removeMember: (input: RemoveMemberInput) => Promise<void>;
    updateMemberRole: (input: UpdateMemberRoleInput) => Promise<GroupMember>;
    updateMemberNickname: (input: UpdateMemberNicknameInput) => Promise<GroupMember>;
    dissolveGroup: (groupId: string, operatorId: string) => Promise<void>;
    joinGroup: (groupId: string, userId: string, message?: string) => Promise<GroupJoinRequestInfo>;
    approveJoin: (groupId: string, userId: string, operatorId: string, action: "approve" | "reject") => Promise<void>;
    quitGroup: (groupId: string, userId: string) => Promise<void>;
    setAnnouncement: (groupId: string, operatorId: string, announcement: string) => Promise<GroupInfo>;
    muteMember: (input: MuteMemberInput) => Promise<void>;
    validateMentions: (input: ValidateMentionsInput) => Promise<{
        valid: boolean;
        mentionedUserIds: string[];
        error?: string;
    }>;
    isMuted: (groupId: string, userId: string) => Promise<boolean>;
    listUserGroups: (userId: string) => Promise<GroupInfo[]>;
};
//# sourceMappingURL=group.service.d.ts.map