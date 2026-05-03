import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { FriendRequest } from '@wechat-clone/shared';
import { formatRelativeTime } from '@wechat-clone/shared';
import { colors, spacing, fonts, sizes } from '@/theme';
import { handleFriendRequest } from '@/api/contact';
import { useContactStore } from '@/store/contactStore';

interface FriendRequestCardProps {
  request: FriendRequest;
}

export default function FriendRequestCard({ request }: FriendRequestCardProps) {
  const fetchFriendRequests = useContactStore((s) => s.fetchFriendRequests);

  const handleAccept = async () => {
    try {
      await handleFriendRequest(request.id, 'accept');
      await fetchFriendRequests();
    } catch {
      // silently fail
    }
  };

  const handleReject = async () => {
    try {
      await handleFriendRequest(request.id, 'reject');
      await fetchFriendRequests();
    } catch {
      // silently fail
    }
  };

  const time = formatRelativeTime(new Date(request.createdAt));

  return (
    <View style={styles.container}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>
          {request.fromUser.nickname.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.nickname} numberOfLines={1}>
            {request.fromUser.nickname}
          </Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        {request.message ? (
          <Text style={styles.message} numberOfLines={2}>
            {request.message}
          </Text>
        ) : null}
        {request.status === 'pending' ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={handleAccept}
              activeOpacity={0.7}
            >
              <Text style={styles.acceptText}>接受</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.rejectButton}
              onPress={handleReject}
              activeOpacity={0.7}
            >
              <Text style={styles.rejectText}>拒绝</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.statusText}>
            {request.status === 'accepted' ? '已接受' : '已拒绝'}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  avatar: {
    width: sizes.avatarLg,
    height: sizes.avatarLg,
    borderRadius: sizes.borderRadius,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    fontSize: fonts.lg,
    fontWeight: '600',
    color: colors.white,
  },
  content: {
    flex: 1,
  },
  headerRow: {
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
  message: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  acceptButton: {
    backgroundColor: colors.primary,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  acceptText: {
    fontSize: fonts.sm,
    color: colors.white,
    fontWeight: '600',
  },
  rejectButton: {
    backgroundColor: colors.background,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rejectText: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  statusText: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});
