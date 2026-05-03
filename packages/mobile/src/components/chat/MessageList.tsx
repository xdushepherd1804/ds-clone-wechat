import React, { useRef, useEffect } from 'react';
import { FlatList, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import type { Message } from '@wechat-clone/shared';
import { isToday, isYesterday } from '@wechat-clone/shared';
import MessageBubble from './MessageBubble';
import { colors, spacing, fonts } from '@/theme';

interface MessageListProps {
  messages: Message[];
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}

function TimeDivider({ date }: { date: Date }) {
  let label: string;
  const now = new Date();

  if (isToday(date)) {
    label = '今天';
  } else if (isYesterday(date)) {
    label = '昨天';
  } else {
    label = `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  if (date.getFullYear() !== now.getFullYear()) {
    label = `${date.getFullYear()}年${label}`;
  }

  return (
    <View style={styles.timeDivider}>
      <Text style={styles.timeDividerText}>{label}</Text>
    </View>
  );
}

function shouldShowTimeDivider(messages: Message[], index: number): boolean {
  if (index === 0) return true;

  const current = new Date(messages[index].createdAt);
  const prev = new Date(messages[index - 1].createdAt);

  return (
    current.getDate() !== prev.getDate() ||
    current.getMonth() !== prev.getMonth() ||
    current.getFullYear() !== prev.getFullYear()
  );
}

export default function MessageList({
  messages,
  onLoadMore,
  hasMore,
  loadingMore,
}: MessageListProps) {
  const flatListRef = useRef<FlatList>(null);
  const prevLength = useRef(0);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > prevLength.current) {
      const isNewMessage = messages.length > 0 && prevLength.current > 0;
      if (isNewMessage) {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    }
    prevLength.current = messages.length;
  }, [messages.length]);

  const handleEndReached = () => {
    if (hasMore && !loadingMore) {
      onLoadMore();
    }
  };

  // Messages displayed newest at bottom
  const reversedMessages = [...messages].reverse();

  const renderItem = ({ item, index }: { item: Message; index: number }) => {
    const originalIndex = messages.length - 1 - index;

    return (
      <View>
        {(originalIndex === messages.length - 1 ||
          shouldShowTimeDivider(messages, originalIndex)) && (
          <TimeDivider date={new Date(item.createdAt)} />
        )}
        <MessageBubble message={item} />
      </View>
    );
  };

  return (
    <FlatList
      ref={flatListRef}
      data={reversedMessages}
      keyExtractor={(item) => item.msgId}
      renderItem={renderItem}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.3}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.loadingMore}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>暂无消息</Text>
        </View>
      }
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingVertical: spacing.sm,
    flexGrow: 1,
  },
  timeDivider: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  timeDividerText: {
    fontSize: fonts.xs,
    color: colors.textSecondary,
    backgroundColor: colors.borderLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  loadingMore: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fonts.md,
    color: colors.textSecondary,
  },
});
