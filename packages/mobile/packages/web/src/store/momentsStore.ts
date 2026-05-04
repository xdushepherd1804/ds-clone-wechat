import { create } from 'zustand';
import type { MomentItem, MomentComment, MomentVisibility } from '@/types';
import * as momentsApi from '@/api/moments';

interface MomentsState {
  moments: MomentItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  cursor: string | null;
  error: string | null;

  fetchTimeline: () => Promise<void>;
  fetchMore: () => Promise<void>;
  refresh: () => Promise<void>;
  createMoment: (data: {
    content?: string;
    images?: string[];
    location?: string;
    visibility?: MomentVisibility;
  }) => Promise<MomentItem>;
  deleteMoment: (momentId: string) => Promise<void>;
  toggleLike: (momentId: string) => Promise<void>;
  addComment: (momentId: string, content: string, replyToId?: string) => Promise<MomentComment>;
  deleteComment: (momentId: string, commentId: string) => Promise<void>;
}

export const useMomentsStore = create<MomentsState>((set, get) => ({
  moments: [],
  loading: false,
  loadingMore: false,
  hasMore: true,
  cursor: null,
  error: null,

  fetchTimeline: async () => {
    set({ loading: true, error: null });
    try {
      const moments = await momentsApi.getTimeline({ limit: 20 });
      set({
        moments,
        loading: false,
        hasMore: moments.length >= 20,
        cursor: moments.length > 0 ? moments[moments.length - 1].createdAt : null,
      });
    } catch {
      set({ loading: false, error: '加载失败' });
    }
  },

  fetchMore: async () => {
    const { loadingMore, hasMore, cursor, moments } = get();
    if (loadingMore || !hasMore) return;
    set({ loadingMore: true });
    try {
      const more = await momentsApi.getTimeline({ cursor: cursor ?? undefined, limit: 20 });
      set({
        moments: [...moments, ...more],
        loadingMore: false,
        hasMore: more.length >= 20,
        cursor: more.length > 0 ? more[more.length - 1].createdAt : cursor,
      });
    } catch {
      set({ loadingMore: false });
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const moments = await momentsApi.getTimeline({ limit: 20 });
      set({
        moments,
        loading: false,
        hasMore: moments.length >= 20,
        cursor: moments.length > 0 ? moments[moments.length - 1].createdAt : null,
      });
    } catch {
      set({ loading: false, error: '刷新失败' });
    }
  },

  createMoment: async (data) => {
    const moment = await momentsApi.createMoment(data);
    if (moment && moment.id) {
      set((state) => ({ moments: [moment, ...state.moments] }));
    }
    return moment;
  },

  deleteMoment: async (momentId) => {
    await momentsApi.deleteMoment(momentId);
    set((state) => ({
      moments: state.moments.filter((m) => m.id !== momentId),
    }));
  },

  toggleLike: async (momentId) => {
    const result = await momentsApi.toggleLike(momentId);
    set((state) => ({
      moments: state.moments.map((m) => {
        if (m.id !== momentId) return m;
        if (result.liked) {
          return { ...m, likeCount: m.likeCount + 1 };
        }
        return { ...m, likeCount: Math.max(0, m.likeCount - 1) };
      }),
    }));
  },

  addComment: async (momentId, content, replyToId) => {
    const comment = await momentsApi.addComment(momentId, {
      content,
      ...(replyToId ? { replyToId } : {}),
    });
    set((state) => ({
      moments: state.moments.map((m) => {
        if (m.id !== momentId) return m;
        return {
          ...m,
          comments: [...m.comments, comment],
          commentCount: m.commentCount + 1,
        };
      }),
    }));
    return comment;
  },

  deleteComment: async (momentId, commentId) => {
    await momentsApi.deleteComment(momentId, commentId);
    set((state) => ({
      moments: state.moments.map((m) => {
        if (m.id !== momentId) return m;
        return {
          ...m,
          comments: m.comments.filter((c) => c.id !== commentId),
          commentCount: Math.max(0, m.commentCount - 1),
        };
      }),
    }));
  },
}));
