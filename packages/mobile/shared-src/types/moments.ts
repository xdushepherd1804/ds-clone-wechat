export type MomentVisibility = 'public' | 'friends' | 'private';

export interface MomentItem {
  id: string;
  userId: string;
  content: string | null;
  images: string[];
  location: string | null;
  visibility: MomentVisibility;
  likes: MomentLike[];
  comments: MomentComment[];
  likeCount: number;
  commentCount: number;
  user: {
    id: string;
    nickname: string;
    avatar: string | null;
  };
  createdAt: string;
}

export interface MomentLike {
  id: string;
  momentId: string;
  userId: string;
  user: {
    id: string;
    nickname: string;
  };
  createdAt: string;
}

export interface MomentComment {
  id: string;
  momentId: string;
  userId: string;
  content: string;
  replyToId: string | null;
  replyTo?: {
    id: string;
    nickname: string;
  };
  user: {
    id: string;
    nickname: string;
    avatar: string | null;
  };
  createdAt: string;
}

export interface CreateMomentRequest {
  content?: string;
  images?: string[];
  location?: string;
  visibility?: MomentVisibility;
}

export interface DeleteMomentRequest {
  momentId: string;
}

export interface AddCommentRequest {
  content: string;
  replyToId?: string;
}

export interface DeleteCommentRequest {
  commentId: string;
}

export interface LikeMomentRequest {
  momentId: string;
}

export interface UnlikeMomentRequest {
  momentId: string;
}

export interface MomentFeedQuery {
  cursor?: string;
  limit?: number;
}
