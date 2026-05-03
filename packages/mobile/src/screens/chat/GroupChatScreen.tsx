import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useChatStore } from '@/store/chatStore';
import { useUserStore } from '@/store/userStore';
import { getMessages, sendMessage, markRead } from '@/api/message';
import { getGroup, getGroupMembers } from '@/api/group';
import { getWSClient } from '@/ws/wsClient';
import { colors, spacing, fonts, sizes } from '@/theme';
import { MsgType, ChatType, formatRelativeTime } from '@wechat-clone/shared';
import type { Message } from '@wechat-clone/shared';
import type { ChatStackParamList } from '@/navigation/types';
import { generateId } from '@/utils/id-generator.rn';

type GroupChatRoute = RouteProp<ChatStackParamList, 'GroupChat'>;

export default function GroupChatScreen() {
  const route = useRoute<GroupChatRoute>();
  const navigation = useNavigation();
  const { groupId } = route.params;

  const [inputText, setInputText] = useState('');
  const [groupName, setGroupName] = useState(route.params.title);
  const [members, setMembers] = useState<Map<string, string>>(new Map());

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

  // Fetch group info and members
  useEffect(() => {
    getGroup(groupId).then((g) => setGroupName(g.name)).catch(() => {});
    getGroupMembers(groupId)
      .then((mems) => {
        const map = new Map<string, string>();
        mems.forEach((m) => map.set(m.userId, m.user.nickname));
        setMembers(map);
      })
      .catch(() => {});
  }, [groupId]);

  // Set active conversation for group
  useEffect(() => {
    setActiveConvId(groupId);
    markRead(groupId).catch(() => {});
    return () => setActiveConvId(null);
  }, [groupId]);

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    if (!groupId) return;
    setLoadingMore(true);
    try {
      const data = await getMessages(groupId, { limit: 20 });
      setMessages(groupId, data);
      setHasMore(groupId, data.length >= 20);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Load more
  const handleLoadMore = useCallback(async () => {
    if (!groupId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const msgs = useChatStore.getState().messages[groupId];
      const before =
        msgs && msgs.length > 0
          ? new Date(msgs[0].createdAt).getTime()
          : undefined;
      const data = await getMessages(groupId, { before, limit: 20 });
      if (data.length > 0) {
        addMessages(groupId, data);
      }
      setHasMore(groupId, data.length >= 20);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [groupId, loadingMore, hasMore]);

  // Send message
  const handleSend = useCallback(async () => {
    if (!inputText.trim() || !currentUser || !groupId) return;

    const tempId = generateId();
    const tempMessage: Message = {
      msgId: tempId,
      fromUid: currentUser.id,
      chatType: ChatType.GROUP,
      msgType: MsgType.TEXT,
      content: inputText.trim(),
      status: 'sending' as const,
      serverSeq: 0,
      createdAt: new Date().toISOString(),
    };

    addMessage(groupId, tempMessage);
    setInputText('');

    try {
      const wsClient = getWSClient();
      if (wsClient.isConnected()) {
        wsClient.send({
          cmd: 'send_msg',
          seq: Date.now(),
          body: {
            chatType: 'group',
            toGroupId: groupId,
            msgType: MsgType.TEXT,
            content: inputText.trim(),
            clientSeq: Date.now(),
          },
        });
        return;
      }

      const sent = await sendMessage({
        conversationId: groupId,
        chatType: ChatType.GROUP,
        toGroupId: groupId,
        msgType: MsgType.TEXT,
        content: inputText.trim(),
      });
      useChatStore.getState().updateMessage(groupId, tempId, {
        msgId: sent.msgId,
        status: 'sent',
        serverSeq: sent.serverSeq,
      });
    } catch {
      useChatStore.getState().updateMessage(groupId, tempId, {
        status: 'failed',
      });
    }
  }, [inputText, currentUser, groupId]);

  const getSenderName = (fromUid: string) => {
    if (fromUid === currentUser?.id) return '';
    return members.get(fromUid) || '未知用户';
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMine = item.fromUid === currentUser?.id;
    const senderName = getSenderName(item.fromUid);
    const time = formatRelativeTime(new Date(item.createdAt));

    return (
      <View style={[styles.messageContainer, isMine && styles.messageContainerMine]}>
        {!isMine && senderName ? (
          <Text style={styles.senderName}>{senderName}</Text>
        ) : null}
        <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
          <Text style={styles.messageText}>{item.content}</Text>
        </View>
        {isMine && item.status === 'failed' ? (
          <Text style={styles.failedIcon}>⚠️</Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={messages || []}
        keyExtractor={(item) => item.msgId}
        renderItem={renderMessage}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        inverted
        contentContainerStyle={styles.listContent}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="输入消息..."
          placeholderTextColor={colors.textTertiary}
          value={inputText}
          onChangeText={setInputText}
          multiline={false}
        />
        <TouchableOpacity
          style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim()}
          activeOpacity={0.7}
        >
          <Text style={styles.sendText}>发送</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingVertical: spacing.sm,
  },
  messageContainer: {
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  messageContainerMine: {
    alignItems: 'flex-end',
  },
  senderName: {
    fontSize: fonts.xs,
    color: colors.textSecondary,
    marginBottom: 2,
    marginLeft: spacing.xs,
  },
  bubble: {
    maxWidth: '70%',
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleMine: {
    backgroundColor: colors.sentBubble,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.receivedBubble,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: fonts.md,
    color: colors.text,
    lineHeight: 20,
  },
  failedIcon: {
    fontSize: fonts.sm,
    marginTop: spacing.xs,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.headerBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fonts.md,
    color: colors.text,
    marginRight: spacing.sm,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendText: {
    fontSize: fonts.md,
    color: colors.white,
    fontWeight: '600',
  },
});
