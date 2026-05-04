import { create } from 'zustand';
import type { Conversation, Message } from '@/types';

interface ChatState {
  conversations: Conversation[];
  activeConvId: string | null;
  messages: Record<string, Message[]>;
  loading: boolean;
  hasMore: Record<string, boolean>;
  loadingMore: boolean;
  typingUsers: Record<string, boolean>;
  messageSending: Record<string, boolean>;
  error: string | null;
  imageViewer: {
    visible: boolean;
    images: string[];
    current: number;
  };
  draftInputs: Record<string, string>;

  setConversations: (conversations: Conversation[]) => void;
  setActiveConvId: (convId: string | null) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (convId: string, updates: Partial<Conversation>) => void;
  setMessages: (convId: string, messages: Message[]) => void;
  addMessage: (convId: string, message: Message) => void;
  addMessages: (convId: string, messages: Message[]) => void;
  updateMessage: (convId: string, msgId: string, updates: Partial<Message>) => void;
  removeMessage: (convId: string, msgId: string) => void;
  setLoading: (loading: boolean) => void;
  setHasMore: (convId: string, hasMore: boolean) => void;
  setLoadingMore: (loadingMore: boolean) => void;
  setTypingUser: (convId: string, isTyping: boolean) => void;
  setMessageSending: (clientSeq: number, sending: boolean) => void;
  setError: (error: string | null) => void;
  openImageViewer: (images: string[], current: number) => void;
  closeImageViewer: () => void;
  setImageViewerIndex: (current: number) => void;
  setDraftInput: (convId: string, text: string) => void;
  clearDraftInput: (convId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConvId: null,
  messages: {},
  loading: false,
  hasMore: {},
  loadingMore: false,
  typingUsers: {},
  messageSending: {},
  error: null,
  imageViewer: { visible: false, images: [], current: 0 },
  draftInputs: {},

  setConversations: (conversations) => set({ conversations }),

  setActiveConvId: (convId) => set({ activeConvId: convId }),

  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),

  updateConversation: (convId, updates) =>
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.conversationId === convId ? { ...c, ...updates } : c,
      ),
    })),

  setMessages: (convId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [convId]: messages },
    })),

  addMessage: (convId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: [...(state.messages[convId] || []), message],
      },
    })),

  addMessages: (convId, messages) =>
    set((state) => {
      const existing = state.messages[convId] || [];
      const existingIds = new Set(existing.map((m) => m.msgId));
      const deduped = messages.filter((m) => !existingIds.has(m.msgId));
      return {
        messages: {
          ...state.messages,
          [convId]: [...deduped, ...existing],
        },
      };
    }),

  updateMessage: (convId, msgId, updates) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: (state.messages[convId] || []).map((m) =>
          m.msgId === msgId ? { ...m, ...updates } : m,
        ),
      },
    })),

  removeMessage: (convId, msgId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: (state.messages[convId] || []).filter((m) => m.msgId !== msgId),
      },
    })),

  setLoading: (loading) => set({ loading }),

  setHasMore: (convId, hasMore) =>
    set((state) => ({
      hasMore: { ...state.hasMore, [convId]: hasMore },
    })),

  setLoadingMore: (loadingMore) => set({ loadingMore }),

  setTypingUser: (convId, isTyping) =>
    set((state) => ({
      typingUsers: { ...state.typingUsers, [convId]: isTyping },
    })),

  setMessageSending: (clientSeq, sending) =>
    set((state) => ({
      messageSending: { ...state.messageSending, [clientSeq]: sending },
    })),

  setError: (error) => set({ error }),

  openImageViewer: (images, current) =>
    set({ imageViewer: { visible: true, images, current } }),

  closeImageViewer: () =>
    set({ imageViewer: { visible: false, images: [], current: 0 } }),

  setImageViewerIndex: (current) =>
    set((state) => ({
      imageViewer: { ...state.imageViewer, current },
    })),

  setDraftInput: (convId, text) =>
    set((state) => ({
      draftInputs: { ...state.draftInputs, [convId]: text },
    })),

  clearDraftInput: (convId) =>
    set((state) => {
      const drafts = { ...state.draftInputs };
      delete drafts[convId];
      return { draftInputs: drafts };
    }),
}));
