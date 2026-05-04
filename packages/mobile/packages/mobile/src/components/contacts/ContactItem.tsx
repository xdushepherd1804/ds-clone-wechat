import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { ContactItem as ContactItemType } from '@wechat-clone/shared';
import { colors, spacing, fonts, sizes } from '@/theme';

interface ContactItemProps {
  item: ContactItemType;
  onPress: () => void;
}

export default function ContactItem({ item, onPress }: ContactItemProps) {
  const displayName = item.remark || item.contact.nickname;
  const initial = (displayName || '?').charAt(0).toUpperCase();

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarFallback}>{initial}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.nickname} numberOfLines={1}>
          {displayName}
        </Text>
        {item.remark && (
          <Text style={styles.remark} numberOfLines={1}>
            备注: {item.remark}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export function SectionHeader({ letter }: { letter: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
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
  info: {
    flex: 1,
  },
  nickname: {
    fontSize: fonts.md,
    fontWeight: '500',
    color: colors.text,
  },
  remark: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  sectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  sectionHeaderText: {
    fontSize: fonts.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
