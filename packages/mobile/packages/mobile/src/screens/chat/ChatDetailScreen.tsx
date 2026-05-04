import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useChatStore } from '@/store/chatStore';
import { getMessages, sendMessage, markRead } from '@/api/message';
import { getWSClient } from '@/ws/wsClient';
import { colors } from '@/theme';
import { MsgType, ChatType } from '@wechat-clone/shared';
import MessageList from '@/components/chat/MessageList';
import ChatInput from '@/components/chat/ChatInput';
import type { ChatStackParamList } from '@/navigation/types';
import { useUserStore } from '@/store/userStore';
import { generateId } from '@/utils/id-generator.rn';

type ChatDetailRoute = RouteProp<ChatStackParamList, 'ChatDetail'>;

export default function ChatDetailScreen() {
  const route = useRoute<ChatDetailRoute>();
  const { convId } = route.params;

  const activeConvId = useChatStore((s) => s.activeConvId);
  const messages = useChatStore((s) =>
    activeConvId ? s.messages[activeConvId] : undefined,
  );
  const hasMore = useChatStore((s) =>
    activeConvId ? s.hasMore[activeConvId] : true,
  );
  const loadingMore = useChatStore((s) => s.loadingMore);
  const setActiveConvId = useChatStore((s) => s.setActiveConvId);
  const setMessages = useChatStore((s) => s.setMessages);
  const addMessage = useChatStore((s) => s.addMessage);
  const addMessages = useChatStore((s) => s.addMessages);
  const setHasMore = useChatStore((s) => s.setHasMore);
  const setLoadingMore = useChatStore((s) => s.setLoadingMore);

  const currentUser = useUserStore((s) => s.user);

  // Set active conversation
  React.useEffect(() => {
    setActiveConvId(convId);
    markRead(convId).catch(() => {});
    return () => setActiveConvId(null);
  }, [convId]);

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    if (!convId) return;
    setLoadingMore(true);
    try {
      const data = await getMessages(convId, { limit: 20 });
      setMessages(convId, data);
      setHasMore(convId, data.length >= 20);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [convId]);

  React.useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Load more (infinite scroll up)
  const handleLoadMore = useCallback(async () => {
    if (!convId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const msgs = useChatStore.getState().messages[convId];
      const before = msgs && msgs.length > 0
        ? new Date(msgs[0].createdAt).getTime()
        : undefined;
      const data = await getMessages(convId, { before, limit: 20 });
      if (data.length > 0) {
        addMessages(convId, data);
      }
      setHasMore(convId, data.length >= 20);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [convId, loadingMore, hasMore]);

  // Send message
  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || !currentUser || !convId) return;

      const tempId = generateId();
      const tempMessage = {
        msgId: tempId,
        fromUid: currentUser.id,
        chatType: ChatType.PRIVATE,
        msgType: MsgType.TEXT,
        content: text.trim(),
        status: 'sending' as const,
        serverSeq: 0,
        createdAt: new Date().toISOString(),
      };

      // Optimistically add message
      addMessage(convId, tempMessage);

      try {
        // Try sending via WebSocket first
        const wsClient = getWSClient();
        if (wsClient.isConnected()) {
          wsClient.send({
            cmd: 'send_msg',
            seq: Date.now(),
            body: {
              chatType: 'private',
              msgType: MsgType.TEXT,
              content: text.trim(),
              clientSeq: Date.now(),
            },
          });
          return;
        }

        // Fallback to HTTP
        const sent = await sendMessage({
          conversationId: convId,
          chatType: ChatType.PRIVATE,
          msgType: MsgType.TEXT,
          content: text.trim(),
        });
        // Replace temp message with real one
        useChatStore.getState().updateMessage(convId, tempId, {
          msgId: sent.msgId,
          status: 'sent',
          serverSeq: sent.serverSeq,
        });
      } catch {
        useChatStore.getState().updateMessage(convId, tempId, {
          status: 'failed',
        });
      }
    },
    [convId, currentUser],
  );

  return (
    <View style={styles.container}>
      <MessageList
        messages={messages || []}
        onLoadMore={handleLoadMore}
        hasMore={hasMore}
        loadingMore={loadingMore}
      />
      <ChatInput onSend={handleSend} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
