import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { ContactItem, FriendRequest, ContactSearchResult } from '@wechat-clone/shared';
export interface ContactServiceDeps {
    prisma: PrismaClient;
    redis?: Redis | null;
}
export interface SendFriendRequestInput {
    fromUid: string;
    toUid: string;
    message?: string;
}
export interface HandleFriendRequestInput {
    requestId: string;
    action: 'accept' | 'reject';
    userId: string;
}
export interface SearchContactsInput {
    userId: string;
    keyword: string;
}
export declare class ContactError extends Error {
    name: string;
    code: number;
    constructor(code: number, message: string);
}
export declare function createContactService(deps: ContactServiceDeps): {
    getContacts: (userId: string) => Promise<ContactItem[]>;
    sendFriendRequest: (input: SendFriendRequestInput) => Promise<FriendRequest>;
    handleFriendRequest: (input: HandleFriendRequestInput) => Promise<void>;
    deleteContact: (userId: string, contactUid: string) => Promise<void>;
    updateRemark: (userId: string, contactUid: string, remark: string) => Promise<ContactItem>;
    updateTags: (userId: string, contactUid: string, tags: string[]) => Promise<ContactItem>;
    getFriendRequests: (userId: string) => Promise<FriendRequest[]>;
    blockUser: (userId: string, targetUid: string) => Promise<void>;
    unblockUser: (userId: string, targetUid: string) => Promise<void>;
    searchContacts: (input: SearchContactsInput) => Promise<ContactSearchResult[]>;
};
//# sourceMappingURL=contact.service.d.ts.map