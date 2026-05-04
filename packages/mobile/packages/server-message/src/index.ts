// @wechat-clone/server-message — messaging service
export { createMessageService, MessageError } from './message.service';
export type {
  MessageServiceDeps,
  SendMessageInput,
  RecallMessageInput,
  ConversationQuery,
  OfflineMessageEvent,
} from './message.service';
