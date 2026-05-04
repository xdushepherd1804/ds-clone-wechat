import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Share,
  Platform,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { colors, spacing, fonts, sizes } from '@/theme';

interface QrCodeDisplayProps {
  dataUrl: string;
  username: string;
  avatar?: string;
}

export default function QrCodeDisplay({
  dataUrl,
  username,
  avatar,
}: QrCodeDisplayProps) {
  const handleShare = async () => {
    try {
      const fileName = `qr_${Date.now()}.png`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;

      const base64Data = dataUrl.includes('base64,')
        ? dataUrl.split('base64,')[1]
        : dataUrl;

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await Share.share({
        title: `${username} 的名片`,
        message: `扫一扫二维码，添加 ${username} 为好友`,
        url: Platform.OS === 'ios' ? fileUri : undefined,
      });
    } catch {
      Alert.alert('分享失败', '无法分享二维码，请重试');
    }
  };

  const handleSave = async () => {
    try {
      const base64Data = dataUrl.includes('base64,')
        ? dataUrl.split('base64,')[1]
        : dataUrl;

      const fileUri = `${FileSystem.documentDirectory}qr_${Date.now()}.png`;

      await FileSystem.writeAsStringAsync(fileUri, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      Alert.alert('保存成功', `二维码已保存到 ${fileUri}`);
    } catch {
      Alert.alert('保存失败', '无法保存二维码，请重试');
    }
  };

  return (
    <View style={styles.container}>
      {/* User info */}
      <View style={styles.userInfo}>
        {avatar ? (
          <Image source={{ uri: avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.username}>{username}</Text>
      </View>

      {/* QR code image */}
      <View style={styles.qrWrapper}>
        <Image
          source={{ uri: dataUrl }}
          style={styles.qrImage}
          resizeMode="contain"
        />
      </View>

      {/* Hint text */}
      <Text style={styles.hintText}>扫一扫上面的二维码，添加好友</Text>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleShare}
          activeOpacity={0.7}
        >
          <Text style={styles.actionIcon}>📤</Text>
          <Text style={styles.actionLabel}>分享</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleSave}
          activeOpacity={0.7}
        >
          <Text style={styles.actionIcon}>💾</Text>
          <Text style={styles.actionLabel}>保存</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  userInfo: {
    alignItems: 'center',
    marginBottom: spacing.xxl,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: spacing.sm,
  },
  avatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  avatarText: {
    fontSize: fonts.xl,
    color: colors.white,
    fontWeight: '700',
  },
  username: {
    fontSize: fonts.lg,
    fontWeight: '600',
    color: colors.text,
  },
  qrWrapper: {
    backgroundColor: colors.white,
    borderRadius: sizes.borderRadiusLg,
    padding: spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  hintText: {
    marginTop: spacing.lg,
    fontSize: fonts.sm,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    marginTop: spacing.xxl,
    gap: spacing.xxl,
  },
  actionButton: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: sizes.borderRadius,
    backgroundColor: colors.white,
    minWidth: 80,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  actionIcon: {
    fontSize: sizes.iconXl,
    marginBottom: spacing.xs,
  },
  actionLabel: {
    fontSize: fonts.xs,
    color: colors.text,
  },
});
