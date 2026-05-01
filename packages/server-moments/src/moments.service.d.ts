import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { MomentItem, MomentLike, MomentComment } from '@wechat-clone/shared';
export interface MomentsServiceDeps {
    prisma: PrismaClient;
    redis?: Redis | null;
}
export interface CreateMomentInput {
    userId: string;
    content?: string;
    images?: string[];
    location?: string;
    visibility?: string;
}
export interface DeleteMomentInput {
    momentId: string;
    userId: string;
}
export interface AddCommentInput {
    momentId: string;
    userId: string;
    content: string;
    replyToId?: string;
}
export interface DeleteCommentInput {
    momentId: string;
    commentId: string;
    userId: string;
}
export interface LikeMomentInput {
    momentId: string;
    userId: string;
}
export interface TimelineQuery {
    userId: string;
    before?: string;
    limit?: number;
}
export interface ToggleLikeResult {
    liked: boolean;
}
export declare class MomentError extends Error {
    name: string;
    code: number;
    constructor(code: number, message: string);
}
export declare function createMomentsService(deps: MomentsServiceDeps): {
    createMoment: (input: CreateMomentInput) => Promise<MomentItem>;
    deleteMoment: (input: DeleteMomentInput) => Promise<void>;
    getMomentById: (momentId: string, userId: string) => Promise<MomentItem>;
    getUserMoments: (targetUid: string, query: {
        userId: string;
        before?: string;
        limit?: number;
    }) => Promise<MomentItem[]>;
    getTimeline: (query: TimelineQuery) => Promise<MomentItem[]>;
    toggleLikeMoment: (input: LikeMomentInput) => Promise<ToggleLikeResult>;
    likeMoment: (input: LikeMomentInput) => Promise<MomentLike>;
    unlikeMoment: (input: LikeMomentInput) => Promise<void>;
    addComment: (input: AddCommentInput) => Promise<MomentComment>;
    deleteComment: (input: DeleteCommentInput) => Promise<void>;
};
//# sourceMappingURL=moments.service.d.ts.map