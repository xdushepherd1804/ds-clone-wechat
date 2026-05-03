import { create } from 'zustand';
import type { Conversation, Message } from '@wechat-clone/shared';

export interface ChatState {
  conversations: Conversation[];
  activeConvId: string | null;
  messages: Record<string, Message[]>;
  loading: boolean;
  hasMore: Record<string, boolean>;
  loadingMore: boolean;
  error: string | null;

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
  setError: (error: string | null) => void;
}

const EMPTY_CONVERSATIONS: Conversation[] = [];
const EMPTY_MESSAGES: Message[] = [];

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConvId: null,
  messages: {},
  loading: false,
  hasMore: {},
  loadingMore: false,
  error: null,

  setConversations: (conversations) => set({ conversations }),

  setActiveConvId: (convId) => set({ activeConvId: convId }),

  addConversation: (conversation) =>
    set((state) => {
      const exists = state.conversations.some(
        (c) => c.conversationId === conversation.conversationId,
      );
      if (exists) {
        return {
          conversations: state.conversations.map((c) =>
            c.conversationId === conversation.conversationId ? conversation : c,
          ),
        };
      }
      return { conversations: [conversation, ...state.conversations] };
    }),

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
        [convId]: [
          ...(state.messages[convId] || EMPTY_MESSAGES),
          message,
        ],
      },
    })),

  addMessages: (convId, messages) =>
    set((state) => {
      const existing = state.messages[convId] || EMPTY_MESSAGES;
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
        [convId]: (state.messages[convId] || EMPTY_MESSAGES).map((m) =>
          m.msgId === msgId ? { ...m, ...updates } : m,
        ),
      },
    })),

  removeMessage: (convId, msgId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: (state.messages[convId] || EMPTY_MESSAGES).filter(
          (m) => m.msgId !== msgId,
        ),
      },
    })),

  setLoading: (loading) => set({ loading }),

  setHasMore: (convId, hasMore) =>
    set((state) => ({
      hasMore: { ...state.hasMore, [convId]: hasMore },
    })),

  setLoadingMore: (loadingMore) => set({ loadingMore }),

  setError: (error) => set({ error }),
}));
