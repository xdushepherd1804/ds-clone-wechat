import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { openRedPacket, getRedPacket } from '@/api/redpacket';
import { colors, spacing, fonts, sizes } from '@/theme';
import type { RedPacketDetail } from '@wechat-clone/shared';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface OpenRedPacketModalProps {
  visible: boolean;
  packetId: string;
  onClose: () => void;
}

export default function OpenRedPacketModal({
  visible,
  packetId,
  onClose,
}: OpenRedPacketModalProps) {
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [detail, setDetail] = useState<RedPacketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scaleAnim] = useState(() => new Animated.Value(0));

  const handleOpen = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await openRedPacket(packetId);
      setAmount(result.amount);

      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();

      setOpened(true);

      const fullDetail = await getRedPacket(packetId);
      setDetail(fullDetail);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '打开红包失败，请重试',
      );
    } finally {
      setLoading(false);
    }
  }, [packetId, scaleAnim]);

  useEffect(() => {
    if (visible) {
      setOpened(false);
      setAmount(null);
      setDetail(null);
      setError(null);
      setLoading(false);
      scaleAnim.setValue(0);
    }
  }, [visible, scaleAnim]);

  const handleClose = () => {
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>

          {!opened ? (
            /* Unopened state */
            <View style={styles.content}>
              {error ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorIcon}>😢</Text>
                  <Text style={styles.errorText}>{error}</Text>
                  <TouchableOpacity
                    style={styles.retryButton}
                    onPress={handleOpen}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.retryText}>重试</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={styles.packetIcon}>🧧</Text>
                  <Text style={styles.title}>恭喜发财</Text>
                  <Text style={styles.subtitle}>大吉大利</Text>

                  <TouchableOpacity
                    style={styles.openButton}
                    onPress={handleOpen}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <Text style={styles.openButtonText}>开</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : (
            /* Opened state */
            <Animated.View
              style={[
                styles.content,
                { transform: [{ scale: scaleAnim }] },
              ]}
            >
              <Text style={styles.packetIcon}>🧧</Text>
              <Text style={styles.openedTitle}>已领取</Text>

              {amount !== null && (
                <View style={styles.amountContainer}>
                  <Text style={styles.amountSymbol}>¥</Text>
                  <Text style={styles.amountValue}>
                    {(amount / 100).toFixed(2)}
                  </Text>
                </View>
              )}

              <View style={styles.detailButton}>
                <TouchableOpacity
                  onPress={handleClose}
                  activeOpacity={0.7}
                >
                  <Text style={styles.detailButtonText}>
                    查看红包详情
                  </Text>
                </TouchableOpacity>
              </View>
            </Animated.View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: SCREEN_WIDTH * 0.8,
    backgroundColor: '#DC3C3C',
    borderRadius: sizes.borderRadiusLg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  closeIcon: {
    fontSize: fonts.sm,
    color: colors.white,
    fontWeight: '600',
  },
  content: {
    alignItems: 'center',
    paddingTop: spacing.md,
  },
  packetIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: fonts.xxl,
    fontWeight: '700',
    color: '#FFE4B5',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fonts.md,
    color: 'rgba(255,228,181,0.8)',
    marginBottom: spacing.xxl,
  },
  openButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginTop: spacing.md,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  openButtonText: {
    fontSize: fonts.xxl + 4,
    color: '#DC3C3C',
    fontWeight: '800',
  },
  openedTitle: {
    fontSize: fonts.lg,
    fontWeight: '600',
    color: '#FFE4B5',
    marginBottom: spacing.sm,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xxl,
  },
  amountSymbol: {
    fontSize: fonts.xl,
    color: '#FFE4B5',
    fontWeight: '600',
    marginTop: 4,
  },
  amountValue: {
    fontSize: fonts.xxl + 16,
    color: '#FFE4B5',
    fontWeight: '700',
  },
  detailButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xxl,
    borderRadius: sizes.borderRadius,
    borderWidth: 1,
    borderColor: 'rgba(255,228,181,0.5)',
  },
  detailButtonText: {
    fontSize: fonts.sm,
    color: '#FFE4B5',
  },
  errorContainer: {
    alignItems: 'center',
    paddingVertical: spacing.lg,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: fonts.sm,
    color: '#FFE4B5',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: '#FFD700',
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.sm,
  },
  retryText: {
    color: '#DC3C3C',
    fontSize: fonts.md,
    fontWeight: '600',
  },
});
