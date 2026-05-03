import { create } from 'zustand';
import type { MomentItem } from '@wechat-clone/shared';
import { getTimeline, createMoment, deleteMoment, toggleLike } from '@/api/moments';

export interface MomentsState {
  moments: MomentItem[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  cursor: string | null;
  error: string | null;

  fetchTimeline: () => Promise<void>;
  fetchMore: () => Promise<void>;
  refresh: () => Promise<void>;
  createMoment: (data: { content?: string; images?: string[]; location?: string }) => Promise<void>;
  deleteMoment: (id: string) => Promise<void>;
  toggleLike: (momentId: string) => Promise<void>;
  addComment: (momentId: string, commentId: string, comment: { id: string; content: string; userId: string; user: { id: string; nickname: string; avatar: string | null }; createdAt: string }) => void;
  deleteComment: (momentId: string, commentId: string) => void;
}

const EMPTY_MOMENTS: MomentItem[] = [];

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
      const data = await getTimeline(undefined, 20);
      set({
        moments: data.items,
        cursor: data.cursor ?? null,
        hasMore: data.hasMore,
        loading: false,
      });
    } catch {
      set({ loading: false, error: '加载失败' });
    }
  },

  fetchMore: async () => {
    const state = get();
    if (state.loadingMore || !state.hasMore) return;
    set({ loadingMore: true });
    try {
      const data = await getTimeline(state.cursor ?? undefined, 20);
      set((prev) => ({
        moments: [...prev.moments, ...data.items],
        cursor: data.cursor ?? null,
        hasMore: data.hasMore,
        loadingMore: false,
      }));
    } catch {
      set({ loadingMore: false, error: '加载更多失败' });
    }
  },

  refresh: async () => {
    set({ cursor: null, hasMore: true });
    await get().fetchTimeline();
  },

  createMoment: async (data) => {
    const moment = await createMoment(data);
    set((state) => ({
      moments: [moment, ...(state.moments || EMPTY_MOMENTS)],
    }));
  },

  deleteMoment: async (id) => {
    await deleteMoment(id);
    set((state) => ({
      moments: (state.moments || EMPTY_MOMENTS).filter((m) => m.id !== id),
    }));
  },

  toggleLike: async (momentId) => {
    try {
      const result = await toggleLike(momentId);
      set((state) => ({
        moments: (state.moments || EMPTY_MOMENTS).map((m) => {
          if (m.id !== momentId) return m;
          if (result.liked) {
            return {
              ...m,
              likeCount: m.likeCount + 1,
              likes: [
                ...m.likes,
                {
                  id: 'temp',
                  momentId,
                  userId: '',
                  user: { id: '', nickname: '' },
                  createdAt: new Date().toISOString(),
                },
              ],
            };
          }
          return {
            ...m,
            likeCount: Math.max(0, m.likeCount - 1),
            likes: m.likes.slice(0, -1),
          };
        }),
      }));
    } catch {
      // silently fail
    }
  },

  addComment: (momentId, _commentId, comment) =>
    set((state) => ({
      moments: (state.moments || EMPTY_MOMENTS).map((m) => {
        if (m.id !== momentId) return m;
        return {
          ...m,
          commentCount: m.commentCount + 1,
          comments: [...m.comments, comment],
        };
      }),
    })),

  deleteComment: (momentId, commentId) =>
    set((state) => ({
      moments: (state.moments || EMPTY_MOMENTS).map((m) => {
        if (m.id !== momentId) return m;
        return {
          ...m,
          commentCount: Math.max(0, m.commentCount - 1),
          comments: m.comments.filter((c) => c.id !== commentId),
        };
      }),
    })),
}));
