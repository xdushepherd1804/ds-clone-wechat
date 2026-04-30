export type {
  UserProfile,
  UserPublicProfile,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  UpdateProfileRequest,
  ChangePasswordRequest,
  UserStatus,
} from '@wechat-clone/shared';

export type {
  Message,
  MessageBody,
  Conversation,
  SyncKey,
  SyncRequest,
  SyncResponse,
} from '@wechat-clone/shared';

export { MsgType, MsgStatus, ChatType } from '@wechat-clone/shared';

export type {
  ContactItem,
  AddContactRequest,
  UpdateContactRequest,
  FriendRequest,
  SendFriendRequest,
  HandleFriendRequest,
  ContactSearchResult,
  ContactStatus,
} from '@wechat-clone/shared';

export type {
  GroupInfo,
  GroupMember,
  CreateGroupRequest,
  UpdateGroupRequest,
  AddGroupMembersRequest,
  RemoveGroupMemberRequest,
  UpdateMemberRoleRequest,
  UpdateMemberNicknameRequest,
  GroupRole,
} from '@wechat-clone/shared';

export type {
  MomentItem,
  MomentLike,
  MomentComment,
  CreateMomentRequest,
  DeleteMomentRequest,
  AddCommentRequest,
  DeleteCommentRequest,
  LikeMomentRequest,
  UnlikeMomentRequest,
  MomentFeedQuery,
  MomentVisibility,
} from '@wechat-clone/shared';

export type {
  ApiResponse,
  PaginatedData,
  PaginatedResponse,
  PaginationParams,
  ApiError,
  HttpMethod,
  ApiEndpoint,
} from '@wechat-clone/shared';

export { ErrorCode, ErrorMessage } from '@wechat-clone/shared';

export type {
  WSRequest,
  WSResponse,
  WSHeartbeatBody,
  WSSendMsgBody,
  WSNewMsgBody,
  WSAckMsgBody,
  WSTypingBody,
  WSOnlineStatusBody,
  WSCmd,
  WSResponseCmd,
} from '@wechat-clone/shared';

export type { ErrorCodeValue } from '@wechat-clone/shared';
