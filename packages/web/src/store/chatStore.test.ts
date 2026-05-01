import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './chatStore';
import { ChatType, MsgStatus, MsgType } from '@/types';
import type { Conversation, Message } from '@/types';

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    conversationId: 'conv-1',
    chatType: ChatType.PRIVATE,
    targetId: 'u2',
    lastMsg: null,
    unreadCount: 0,
    isTop: false,
    isMuted: false,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeMsg(overrides: Partial<Message> = {}): Message {
  return {
    msgId: 'msg-1',
    fromUid: 'u1',
    toUid: 'u2',
    chatType: ChatType.PRIVATE,
    msgType: MsgType.TEXT,
    content: 'Hello',
    status: MsgStatus.SENT,
    serverSeq: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('chatStore', () => {
  beforeEach(() => {
    useChatStore.setState({
      conversations: [],
      activeConvId: null,
      messages: {},
      loading: false,
    });
  });

  describe('initial state', () => {
    it('has empty conversations, no active conv, empty messages', () => {
      const state = useChatStore.getState();
      expect(state.conversations).toEqual([]);
      expect(state.activeConvId).toBeNull();
      expect(state.messages).toEqual({});
      expect(state.loading).toBe(false);
    });
  });

  describe('setConversations', () => {
    it('sets conversations list', () => {
      const convs = [makeConv(), makeConv({ conversationId: 'conv-2' })];
      useChatStore.getState().setConversations(convs);

      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(2);
      expect(state.conversations[0].conversationId).toBe('conv-1');
    });
  });

  describe('setActiveConvId', () => {
    it('sets the active conversation ID', () => {
      useChatStore.getState().setActiveConvId('conv-1');
      expect(useChatStore.getState().activeConvId).toBe('conv-1');
    });

    it('can set activeConvId to null', () => {
      useChatStore.getState().setActiveConvId('conv-1');
      useChatStore.getState().setActiveConvId(null);
      expect(useChatStore.getState().activeConvId).toBeNull();
    });
  });

  describe('addConversation', () => {
    it('adds a conversation to the front of the list', () => {
      useChatStore.getState().addConversation(makeConv({ conversationId: 'conv-2' }));
      useChatStore.getState().addConversation(makeConv({ conversationId: 'conv-1' }));

      const state = useChatStore.getState();
      expect(state.conversations).toHaveLength(2);
      expect(state.conversations[0].conversationId).toBe('conv-1');
    });
  });

  describe('updateConversation', () => {
    it('updates a conversation by ID', () => {
      useChatStore.getState().setConversations([
        makeConv({ conversationId: 'conv-1' }),
        makeConv({ conversationId: 'conv-2' }),
      ]);

      useChatStore.getState().updateConversation('conv-1', {
        unreadCount: 5,
        lastMsg: makeMsg({ msgId: 'new-msg' }),
      });

      const state = useChatStore.getState();
      const updated = state.conversations.find((c) => c.conversationId === 'conv-1');
      expect(updated?.unreadCount).toBe(5);
      expect(updated?.lastMsg?.msgId).toBe('new-msg');
    });

    it('does not modify other conversations', () => {
      useChatStore.getState().setConversations([
        makeConv({ conversationId: 'conv-1', unreadCount: 0 }),
        makeConv({ conversationId: 'conv-2', unreadCount: 0 }),
      ]);

      useChatStore.getState().updateConversation('conv-1', { unreadCount: 3 });

      const conv2 = useChatStore.getState().conversations.find((c) => c.conversationId === 'conv-2');
      expect(conv2?.unreadCount).toBe(0);
    });

    it('does nothing if convId does not exist', () => {
      useChatStore.getState().setConversations([makeConv({ conversationId: 'conv-1' })]);
      useChatStore.getState().updateConversation('conv-999', { unreadCount: 99 });

      expect(useChatStore.getState().conversations).toHaveLength(1);
    });
  });

  describe('setMessages', () => {
    it('sets messages for a conversation', () => {
      const msgs = [makeMsg({ msgId: 'm1' }), makeMsg({ msgId: 'm2' })];
      useChatStore.getState().setMessages('conv-1', msgs);

      const state = useChatStore.getState();
      expect(state.messages['conv-1']).toHaveLength(2);
    });

    it('overwrites existing messages for the same convId', () => {
      useChatStore.getState().setMessages('conv-1', [makeMsg({ msgId: 'm1' })]);
      useChatStore.getState().setMessages('conv-1', [makeMsg({ msgId: 'm2' })]);

      const state = useChatStore.getState();
      expect(state.messages['conv-1']).toHaveLength(1);
      expect(state.messages['conv-1'][0].msgId).toBe('m2');
    });
  });

  describe('addMessage', () => {
    it('appends a message to existing messages', () => {
      useChatStore.getState().setMessages('conv-1', [makeMsg({ msgId: 'm1' })]);
      useChatStore.getState().addMessage('conv-1', makeMsg({ msgId: 'm2' }));

      const state = useChatStore.getState();
      expect(state.messages['conv-1']).toHaveLength(2);
      expect(state.messages['conv-1'][1].msgId).toBe('m2');
    });

    it('creates a new array for convId that had no messages', () => {
      useChatStore.getState().addMessage('conv-new', makeMsg({ msgId: 'm1' }));

      const state = useChatStore.getState();
      expect(state.messages['conv-new']).toHaveLength(1);
    });
  });

  describe('updateMessage', () => {
    it('updates a message by msgId', () => {
      useChatStore.getState().setMessages('conv-1', [
        makeMsg({ msgId: 'm1', status: MsgStatus.SENT }),
        makeMsg({ msgId: 'm2', status: MsgStatus.SENT }),
      ]);

      useChatStore.getState().updateMessage('conv-1', 'm1', { status: MsgStatus.READ });

      const updated = useChatStore.getState().messages['conv-1'][0];
      expect(updated.status).toBe(MsgStatus.READ);
    });

    it('does nothing if msgId not found', () => {
      useChatStore.getState().setMessages('conv-1', [makeMsg({ msgId: 'm1' })]);
      useChatStore.getState().updateMessage('conv-1', 'm999', { status: MsgStatus.READ });

      const msg = useChatStore.getState().messages['conv-1'][0];
      expect(msg.status).toBe(MsgStatus.SENT);
    });
  });

  describe('setLoading', () => {
    it('sets the loading state', () => {
      useChatStore.getState().setLoading(true);
      expect(useChatStore.getState().loading).toBe(true);

      useChatStore.getState().setLoading(false);
      expect(useChatStore.getState().loading).toBe(false);
    });
  });
});
