import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useCallStore } from '@/store/callStore';
import { colors, spacing, fonts, sizes } from '@/theme';

export default function IncomingCallScreen() {
  const callType = useCallStore((s) => s.callType);
  const peer = useCallStore((s) => s.peer);
  const setStatus = useCallStore((s) => s.setStatus);
  const resetCall = useCallStore((s) => s.resetCall);

  const handleAccept = () => {
    setStatus('connected');
  };

  const handleReject = () => {
    resetCall();
  };

  if (!peer) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>来电信息不可用</Text>
          <TouchableOpacity
            style={styles.rejectButtonLarge}
            onPress={handleReject}
            activeOpacity={0.8}
          >
            <Text style={styles.rejectText}>返回</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isVideo = callType === 'video';
  const callTypeLabel = isVideo ? '视频通话' : '语音通话';

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Background layers */}
      <View style={styles.backgroundTop} />
      <View style={styles.backgroundBottom} />

      {/* Content */}
      <View style={styles.content}>
        {/* Peer avatar */}
        <View style={styles.avatarContainer}>
          {peer.avatar ? (
            <Image source={{ uri: peer.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>
                {peer.username.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        {/* Call info */}
        <Text style={styles.peerName}>{peer.username}</Text>
        <Text style={styles.callTypeLabel}>
          {callTypeLabel}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <View style={styles.actionRow}>
          {/* Reject button */}
          <TouchableOpacity
            style={styles.rejectButton}
            onPress={handleReject}
            activeOpacity={0.8}
          >
            <View style={styles.rejectCircle}>
              <Text style={styles.actionIcon}>📞</Text>
            </View>
            <Text style={styles.actionLabel}>拒绝</Text>
          </TouchableOpacity>

          {/* Accept button */}
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={handleAccept}
            activeOpacity={0.8}
          >
            <View style={styles.acceptCircle}>
              <Text style={styles.actionIcon}>📞</Text>
            </View>
            <Text style={styles.actionLabel}>接听</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: '#2a2a2a',
  },
  backgroundBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: '#1a1a1a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  avatarContainer: {
    marginBottom: spacing.xxl,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  avatarText: {
    fontSize: fonts.xxl + 12,
    color: colors.white,
    fontWeight: '700',
  },
  peerName: {
    fontSize: fonts.xxl,
    fontWeight: '600',
    color: colors.white,
    marginBottom: spacing.sm,
  },
  callTypeLabel: {
    fontSize: fonts.lg,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: fonts.sm,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  actions: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: 60,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
  },
  rejectButton: {
    alignItems: 'center',
  },
  rejectCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  acceptButton: {
    alignItems: 'center',
  },
  acceptCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#07C160',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  actionIcon: {
    fontSize: sizes.iconXl,
  },
  actionLabel: {
    fontSize: fonts.sm,
    color: colors.white,
  },
  rejectText: {
    color: colors.white,
  },
  rejectButtonLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
});
