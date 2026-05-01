/**
 * @wechat-clone/server-group — group chat service
 */

export { createGroupService, GroupError } from './group.service';
export type {
  GroupServiceDeps,
  CreateGroupInput,
  UpdateGroupInput,
  AddMembersInput,
  RemoveMemberInput,
  UpdateMemberRoleInput,
  UpdateMemberNicknameInput,
  MuteMemberInput,
  ValidateMentionsInput,
} from './group.service';
