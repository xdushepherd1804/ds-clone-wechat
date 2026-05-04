import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  TextInput,
} from 'react-native';
import { formatRelativeTime } from '@wechat-clone/shared';
import type { Conversation } from '@wechat-clone/shared';
import { useChatStore } from '@/store/chatStore';
import { getConversations } from '@/api/message';
import { colors, spacing, fonts, sizes } from '@/theme';
import type { ChatListScreenProps } from '@/navigation/types';

const AVATAR_PLACEHOLDER = '👤';

function ConversationItem({
  item,
  onPress,
}: {
  item: Conversation;
  onPress: () => void;
}) {
  const lastMsgPreview = item.lastMsg
    ? item.lastMsg.content.length > 30
      ? item.lastMsg.content.substring(0, 30) + '...'
      : item.lastMsg.content
    : '暂无消息';

  const time = item.lastMsg
    ? formatRelativeTime(new Date(item.updatedAt))
    : '';

  return (
    <TouchableOpacity style={styles.conversationItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{AVATAR_PLACEHOLDER}</Text>
      </View>
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={styles.nickname} numberOfLines={1}>
            {item.targetId}
          </Text>
          {time ? <Text style={styles.time}>{time}</Text> : null}
        </View>
        <View style={styles.conversationFooter}>
          <Text style={styles.lastMsg} numberOfLines={1}>
            {lastMsgPreview}
          </Text>
          {item.unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {item.unreadCount > 99 ? '99+' : item.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ChatListScreen({ navigation }: ChatListScreenProps) {
  const conversations = useChatStore((s) => s.conversations);
  const loading = useChatStore((s) => s.loading);
  const setConversations = useChatStore((s) => s.setConversations);
  const setLoading = useChatStore((s) => s.setLoading);
  const setActiveConvId = useChatStore((s) => s.setActiveConvId);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getConversations();
      setConversations(data);
    } catch {
      // silently fail — user can pull to refresh
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handlePress = (convId: string, title: string) => {
    setActiveConvId(convId);
    navigation.navigate('ChatDetail', { convId, title });
  };

  const renderItem = ({ item }: { item: Conversation }) => (
    <ConversationItem
      item={item}
      onPress={() => handlePress(item.conversationId, item.targetId)}
    />
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索"
          placeholderTextColor={colors.textTertiary}
        />
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(item) => item.conversationId}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchConversations}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>暂无会话</Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.headerBg,
  },
  searchInput: {
    backgroundColor: colors.white,
    borderRadius: 8,
    height: 36,
    paddingHorizontal: spacing.md,
    fontSize: fonts.sm,
    color: colors.text,
  },
  listContent: {
    flexGrow: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
  },
  avatar: {
    width: sizes.avatarLg,
    height: sizes.avatarLg,
    borderRadius: sizes.borderRadius,
    backgroundColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: sizes.iconXl,
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  nickname: {
    fontSize: fonts.md,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  time: {
    fontSize: fonts.xs,
    color: colors.textSecondary,
  },
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMsg: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    flex: 1,
    marginRight: spacing.sm,
  },
  unreadBadge: {
    backgroundColor: colors.danger,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    color: colors.white,
    fontSize: fonts.xs,
    fontWeight: '600',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginLeft: 72,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: fonts.md,
    color: colors.textSecondary,
  },
});
