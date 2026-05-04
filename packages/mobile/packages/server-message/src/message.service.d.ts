import type { PrismaClient } from '@prisma/client';
import type { Db } from 'mongodb';
import type { Redis } from 'ioredis';
import type { Message, Conversation, ChatType, MsgType } from '@wechat-clone/shared';
/** Payload passed to the offline-message callback for push notification integration */
export interface OfflineMessageEvent {
    msg: Message;
    recipientId: string;
    senderNickname: string;
}
export interface MessageServiceDeps {
    prisma: PrismaClient;
    mongo: Db | null;
    redis?: Redis | null;
    /** Called when a message is sent to an offline user — hook for push notifications */
    onOfflineMessage?: (event: OfflineMessageEvent) => void | Promise<void>;
}
export interface SendMessageInput {
    fromUid: string;
    toUid?: string;
    toGroupId?: string;
    chatType: ChatType;
    msgType: MsgType;
    content: string;
}
export interface RecallMessageInput {
    msgId: string;
    userId: string;
}
export interface ConversationQuery {
    userId: string;
    limit?: number;
    offset?: number;
}
export declare class MessageError extends Error {
    name: string;
    code: number;
    constructor(code: number, message: string);
}
export declare function createMessageService(deps: MessageServiceDeps): {
    sendMessage: (input: SendMessageInput) => Promise<Message>;
    getMessages: (conversationId: string, userId: string, options?: {
        before?: string;
        limit?: number;
    }) => Promise<Message[]>;
    getConversations: (userId: string, options?: {
        limit?: number;
        offset?: number;
    }) => Promise<Conversation[]>;
    markConversationRead: (conversationId: string, userId: string) => Promise<{
        updatedCount: number;
    }>;
    recallMessage: (input: RecallMessageInput) => Promise<Message>;
    getOfflineMessages: (userId: string) => Promise<Message[]>;
};
//# sourceMappingURL=message.service.d.ts.map