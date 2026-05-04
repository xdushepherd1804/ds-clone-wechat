import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import type { MomentItem } from '@wechat-clone/shared';
import { formatRelativeTime } from '@wechat-clone/shared';
import { colors, spacing, fonts, sizes } from '@/theme';
import ImageGrid from './ImageGrid';
import LikeButton from './LikeButton';
import CommentSection from './CommentSection';

interface MomentCardProps {
  item: MomentItem;
  onToggleLike: () => void;
  isLiked: boolean;
}

export default function MomentCard({
  item,
  onToggleLike,
  isLiked,
}: MomentCardProps) {
  const time = formatRelativeTime(new Date(item.createdAt));

  return (
    <View style={styles.container}>
      {/* Header: avatar + nickname + time */}
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarFallback}>
            {item.user.nickname.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.nickname}>{item.user.nickname}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
      </View>

      {/* Content text */}
      {item.content ? (
        <Text style={styles.content}>{item.content}</Text>
      ) : null}

      {/* Image grid */}
      {item.images && item.images.length > 0 ? (
        <ImageGrid images={item.images} />
      ) : null}

      {/* Location */}
      {item.location ? (
        <Text style={styles.location}>📍 {item.location}</Text>
      ) : null}

      {/* Action bar */}
      <View style={styles.actionBar}>
        <LikeButton
          liked={isLiked}
          count={item.likeCount}
          onPress={onToggleLike}
        />
        <View style={styles.commentCount}>
          <Text style={styles.commentIcon}>💬</Text>
          <Text style={styles.commentCountText}>
            {item.commentCount > 0 ? item.commentCount : ''}
          </Text>
        </View>
      </View>

      {/* Comment section */}
      {item.comments && item.comments.length > 0 ? (
        <View style={styles.commentDivider} />
      ) : null}
      <CommentSection momentId={item.id} comments={item.comments} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatar: {
    width: sizes.avatarMd,
    height: sizes.avatarMd,
    borderRadius: sizes.borderRadius,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarFallback: {
    fontSize: fonts.md,
    fontWeight: '600',
    color: colors.white,
  },
  headerText: {
    flex: 1,
  },
  nickname: {
    fontSize: fonts.md,
    fontWeight: '600',
    color: colors.text,
  },
  time: {
    fontSize: fonts.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  content: {
    fontSize: fonts.md,
    color: colors.text,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  location: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.lg,
  },
  commentCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  commentIcon: {
    fontSize: 16,
  },
  commentCountText: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
  },
  commentDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
});
