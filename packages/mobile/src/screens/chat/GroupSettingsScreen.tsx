import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  StyleSheet,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { GroupInfo, GroupMember } from '@wechat-clone/shared';
import {
  getGroup,
  getGroupMembers,
  updateGroup,
  quitGroup,
  removeGroupMember,
  updateMemberRole,
} from '@/api/group';
import { useUserStore } from '@/store/userStore';
import { colors, spacing, fonts, sizes } from '@/theme';
import type { ChatStackParamList } from '@/navigation/types';

type GroupSettingsRoute = RouteProp<ChatStackParamList, 'GroupSettings'>;

export default function GroupSettingsScreen() {
  const route = useRoute<GroupSettingsRoute>();
  const navigation = useNavigation();
  const { groupId } = route.params;

  const currentUser = useUserStore((s) => s.user);

  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [groupId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [g, mems] = await Promise.all([
        getGroup(groupId),
        getGroupMembers(groupId),
      ]);
      setGroup(g);
      setMembers(mems);
    } catch {
      Alert.alert('错误', '加载群信息失败');
    } finally {
      setLoading(false);
    }
  };

  const isOwner = currentUser?.id === group?.ownerId;
  const isAdmin = group?.myRole === 'admin' || isOwner;
  const myMembership = members.find((m) => m.userId === currentUser?.id);

  const handleQuit = () => {
    Alert.alert(
      isOwner ? '解散群聊' : '退出群聊',
      isOwner ? '确定要解散群聊吗？此操作不可撤销' : '确定要退出群聊吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: isOwner ? '解散' : '退出',
          style: 'destructive',
          onPress: async () => {
            try {
              if (isOwner) {
                // Owners can't quit, they must transfer ownership first or dissolve
                // For now just navigate back
                Alert.alert('提示', '群主不能退出群聊，可以转让群主身份');
              } else {
                await quitGroup(groupId);
                navigation.goBack();
                navigation.goBack(); // Go back to chat list
              }
            } catch {
              Alert.alert('错误', '操作失败');
            }
          },
        },
      ],
    );
  };

  const handleRemoveMember = (member: GroupMember) => {
    if (!isAdmin) return;
    Alert.alert('移除成员', `确定要移除 ${member.user.nickname} 吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeGroupMember(groupId, member.userId);
            setMembers((prev) => prev.filter((m) => m.id !== member.id));
          } catch {
            Alert.alert('错误', '移除失败');
          }
        },
      },
    ]);
  };

  const renderMember = ({ item }: { item: GroupMember }) => {
    const isSelf = item.userId === currentUser?.id;
    const roleLabel =
      item.role === 'owner' ? '群主' : item.role === 'admin' ? '管理员' : '';

    return (
      <TouchableOpacity
        style={styles.memberItem}
        onLongPress={() => {
          if (isAdmin && !isSelf && item.role !== 'owner') {
            handleRemoveMember(item);
          }
        }}
        activeOpacity={isAdmin ? 0.7 : 1}
      >
        <View style={styles.memberAvatar}>
          <Text style={styles.memberAvatarText}>
            {(item.user.nickname || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>
            {item.user.nickname}
            {isSelf ? ' (我)' : ''}
          </Text>
          {roleLabel ? (
            <Text style={styles.memberRole}>{roleLabel}</Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Group Info */}
      <View style={styles.section}>
        <View style={styles.groupInfoCard}>
          <View style={styles.groupAvatar}>
            <Text style={styles.groupAvatarText}>
              {(group?.name || 'G').charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.groupName}>{group?.name}</Text>
          <Text style={styles.groupMeta}>
            {group?.memberCount || members.length} 人
          </Text>
        </View>
      </View>

      {/* Announcement */}
      {group?.announcement ? (
        <View style={styles.section}>
          <View style={styles.announcementContainer}>
            <Text style={styles.announcementLabel}>群公告</Text>
            <Text style={styles.announcementText}>{group.announcement}</Text>
          </View>
        </View>
      ) : null}

      {/* Members */}
      <View style={styles.section}>
        <View style={styles.membersHeader}>
          <Text style={styles.membersTitle}>
            群成员 ({members.length})
          </Text>
        </View>
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={renderMember}
          scrollEnabled={false}
        />
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.actionItem}
          onPress={handleQuit}
          activeOpacity={0.7}
        >
          <Text style={styles.dangerText}>
            {isOwner ? '解散群聊' : '退出群聊'}
          </Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: fonts.md,
    color: colors.textSecondary,
  },
  section: {
    backgroundColor: colors.white,
    marginBottom: spacing.sm,
  },
  groupInfoCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  groupAvatar: {
    width: sizes.avatarXl,
    height: sizes.avatarXl,
    borderRadius: sizes.borderRadius,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  groupAvatarText: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.white,
  },
  groupName: {
    fontSize: fonts.lg,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  groupMeta: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
  },
  announcementContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  announcementLabel: {
    fontSize: fonts.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  announcementText: {
    fontSize: fonts.md,
    color: colors.text,
    lineHeight: 20,
  },
  membersHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  membersTitle: {
    fontSize: fonts.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  memberAvatar: {
    width: sizes.avatarMd,
    height: sizes.avatarMd,
    borderRadius: sizes.borderRadius,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  memberAvatarText: {
    fontSize: fonts.md,
    fontWeight: '600',
    color: colors.white,
  },
  memberInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberName: {
    fontSize: fonts.md,
    color: colors.text,
    flex: 1,
  },
  memberRole: {
    fontSize: fonts.xs,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },
  actionItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  dangerText: {
    fontSize: fonts.md,
    color: colors.danger,
    fontWeight: '500',
  },
});
