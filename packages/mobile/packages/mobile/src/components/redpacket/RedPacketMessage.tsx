import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, spacing, fonts, sizes } from '@/theme';

interface RedPacketMessageProps {
  blessing?: string;
  senderName: string;
  isReceived: boolean;
  onOpen: () => void;
}

export default function RedPacketMessage({
  blessing,
  senderName,
  isReceived,
  onOpen,
}: RedPacketMessageProps) {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onOpen}
      activeOpacity={0.8}
    >
      {/* Top section */}
      <View style={styles.topSection}>
        <View style={styles.iconContainer}>
          <Text style={styles.iconText}>🧧</Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {isReceived ? '领取红包' : `${senderName} 的红包`}
          </Text>
          {blessing ? (
            <Text style={styles.blessing} numberOfLines={1}>
              {blessing}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Bottom section */}
      <View style={styles.bottomSection}>
        <Text style={styles.bottomText}>
          {isReceived ? '已领取' : '查看红包'}
        </Text>
        <Text style={styles.arrow}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 220,
    backgroundColor: '#FA9D3B',
    borderRadius: sizes.borderRadius,
    overflow: 'hidden',
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  iconText: {
    fontSize: 24,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: fonts.md,
    fontWeight: '600',
    color: '#FFE4B5',
  },
  blessing: {
    fontSize: fonts.xs,
    color: 'rgba(255,228,181,0.8)',
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: spacing.md,
  },
  bottomSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  bottomText: {
    fontSize: fonts.xs,
    color: '#FFE4B5',
  },
  arrow: {
    fontSize: fonts.lg,
    color: '#FFE4B5',
  },
});
