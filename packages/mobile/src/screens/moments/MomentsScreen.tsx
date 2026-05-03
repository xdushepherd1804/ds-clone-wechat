import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { MomentItem } from '@wechat-clone/shared';
import { useMomentsStore } from '@/store/momentsStore';
import { useUserStore } from '@/store/userStore';
import { colors, spacing, fonts, sizes } from '@/theme';
import MomentCard from '@/components/moments/MomentCard';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MomentsStackParamList } from '@/navigation/types';

type MomentsNavProp = NativeStackNavigationProp<MomentsStackParamList, 'MomentsMain'>;

export default function MomentsScreen() {
  const navigation = useNavigation<MomentsNavProp>();
  const moments = useMomentsStore((s) => s.moments);
  const loading = useMomentsStore((s) => s.loading);
  const loadingMore = useMomentsStore((s) => s.loadingMore);
  const hasMore = useMomentsStore((s) => s.hasMore);
  const error = useMomentsStore((s) => s.error);
  const fetchTimeline = useMomentsStore((s) => s.fetchTimeline);
  const fetchMore = useMomentsStore((s) => s.fetchMore);
  const refresh = useMomentsStore((s) => s.refresh);
  const toggleLikeInStore = useMomentsStore((s) => s.toggleLike);

  const currentUser = useUserStore((s) => s.user);

  useEffect(() => {
    fetchTimeline();
  }, []);

  const handleToggleLike = useCallback(
    (momentId: string) => {
      toggleLikeInStore(momentId);
    },
    [toggleLikeInStore],
  );

  const handlePublish = () => {
    navigation.navigate('PublishMoment');
  };

  const handleEndReached = () => {
    if (!loadingMore && hasMore) {
      fetchMore();
    }
  };

  const isLiked = (item: MomentItem) => {
    if (!currentUser) return false;
    return item.likes.some((l) => l.userId === currentUser.id);
  };

  const renderItem = ({ item }: { item: MomentItem }) => (
    <MomentCard
      item={item}
      onToggleLike={() => handleToggleLike(item.id)}
      isLiked={isLiked(item)}
    />
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.footerText}>加载中...</Text>
      </View>
    );
  };

  const renderHeader = () => (
    <TouchableOpacity
      style={styles.publishButton}
      onPress={handlePublish}
      activeOpacity={0.7}
    >
      <Text style={styles.publishIcon}>📷</Text>
      <Text style={styles.publishText}>分享生活...</Text>
    </TouchableOpacity>
  );

  if (error && moments.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchTimeline}>
          <Text style={styles.retryText}>重试</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={moments}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={refresh}
            tintColor={colors.primary}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>暂无动态</Text>
              <Text style={styles.emptySubtext}>点击上方相机发布第一条朋友圈</Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    flexGrow: 1,
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  publishIcon: {
    fontSize: sizes.iconXl,
    marginRight: spacing.md,
  },
  publishText: {
    fontSize: fonts.md,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  footerText: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: fonts.md,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  emptySubtext: {
    fontSize: fonts.sm,
    color: colors.textTertiary,
  },
  errorText: {
    fontSize: fonts.md,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  retryButton: {
    backgroundColor: colors.primary,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  retryText: {
    fontSize: fonts.md,
    color: colors.white,
    fontWeight: '600',
  },
});
