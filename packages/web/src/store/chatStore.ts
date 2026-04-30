import { create } from 'zustand';
import type { Conversation, Message } from '@/types';

interface ChatState {
  conversations: Conversation[];
  activeConvId: string | null;
  messages: Record<string, Message[]>;
  loading: boolean;

  setConversations: (conversations: Conversation[]) => void;
  setActiveConvId: (convId: string | null) => void;
  addConversation: (conversation: Conversation) => void;
  updateConversation: (convId: string, updates: Partial<Conversation>) => void;
  setMessages: (convId: string, messages: Message[]) => void;
  addMessage: (convId: string, message: Message) => void;
  updateMessage: (convId: string, msgId: string, updates: Partial<Message>) => void;
  setLoading: (loading: boolean) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConvId: null,
  messages: {},
  loading: false,

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

  updateMessage: (convId, msgId, updates) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [convId]: (state.messages[convId] || []).map((m) =>
          m.msgId === msgId ? { ...m, ...updates } : m,
        ),
      },
    })),

  setLoading: (loading) => set({ loading }),
}));
