import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useUserStore } from '@/store/userStore';
import { colors, spacing, fonts, sizes } from '@/theme';
import { logout } from '@/api/auth';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ProfileStackParamList } from '@/navigation/types';

type ProfileNavProp = NativeStackNavigationProp<ProfileStackParamList, 'ProfileMain'>;

export default function ProfileScreen() {
  const navigation = useNavigation<ProfileNavProp>();
  const user = useUserStore((s) => s.user);
  const logoutAction = useUserStore((s) => s.logout);

  const handleLogout = () => {
    Alert.alert('退出登录', '确定要退出登录吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: async () => {
          try {
            await logout();
          } catch {
            // Ignore API error — still clear local state
          }
          logoutAction();
        },
      },
    ]);
  };

  const handleMyMoments = () => {
    if (user) {
      navigation.navigate('MyMoments', { userId: user.id });
    }
  };

  const initial = (user?.nickname || '?').charAt(0).toUpperCase();

  return (
    <View style={styles.container}>
      {/* User Info Card — Green themed */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.nickname}>{user?.nickname || '用户'}</Text>
          <Text style={styles.username}>微信号: {user?.username || ''}</Text>
        </View>
      </View>

      {/* Separator */}
      <View style={styles.sectionGap} />

      {/* Menu Items */}
      <View style={styles.menuSection}>
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.7}
          onPress={handleMyMoments}
        >
          <Text style={styles.menuIcon}>📷</Text>
          <Text style={styles.menuText}>我的朋友圈</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <View style={styles.menuSeparator} />
        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
          <Text style={styles.menuIcon}>💾</Text>
          <Text style={styles.menuText}>收藏</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <View style={styles.menuSeparator} />
        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
          <Text style={styles.menuIcon}>💳</Text>
          <Text style={styles.menuText}>钱包</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
        <View style={styles.menuSeparator} />
        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
          <Text style={styles.menuIcon}>😊</Text>
          <Text style={styles.menuText}>表情</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Separator */}
      <View style={styles.sectionGap} />

      {/* Settings */}
      <View style={styles.menuSection}>
        <TouchableOpacity style={styles.menuItem} activeOpacity={0.7}>
          <Text style={styles.menuIcon}>⚙️</Text>
          <Text style={styles.menuText}>设置</Text>
          <Text style={styles.menuArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Logout */}
      <View style={styles.logoutContainer}>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Text style={styles.logoutText}>退出登录</Text>
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
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    padding: spacing.lg,
  },
  avatar: {
    width: sizes.avatarXl,
    height: sizes.avatarXl,
    borderRadius: sizes.borderRadius,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '600',
    color: colors.primary,
  },
  userInfo: {
    flex: 1,
  },
  nickname: {
    fontSize: fonts.xl,
    fontWeight: '600',
    color: colors.white,
    marginBottom: spacing.xs,
  },
  username: {
    fontSize: fonts.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  sectionGap: {
    height: spacing.sm,
  },
  menuSection: {
    backgroundColor: colors.white,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuIcon: {
    fontSize: sizes.iconLg,
    marginRight: spacing.md,
  },
  menuText: {
    fontSize: fonts.md,
    color: colors.text,
    flex: 1,
  },
  menuArrow: {
    fontSize: fonts.lg,
    color: colors.textTertiary,
  },
  menuSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginLeft: 60,
  },
  logoutContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
  },
  logoutButton: {
    backgroundColor: colors.white,
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  logoutText: {
    color: colors.danger,
    fontSize: fonts.md,
    fontWeight: '600',
  },
});
