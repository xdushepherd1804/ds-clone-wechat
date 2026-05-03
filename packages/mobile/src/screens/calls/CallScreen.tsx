import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import { useCallStore } from '@/store/callStore';
import { colors, spacing, fonts, sizes } from '@/theme';

export default function CallScreen() {
  const callType = useCallStore((s) => s.callType);
  const status = useCallStore((s) => s.status);
  const peer = useCallStore((s) => s.peer);
  const isMuted = useCallStore((s) => s.isMuted);
  const isSpeakerOn = useCallStore((s) => s.isSpeakerOn);
  const isVideoOff = useCallStore((s) => s.isVideoOff);
  const duration = useCallStore((s) => s.duration);
  const error = useCallStore((s) => s.error);

  const setMuted = useCallStore((s) => s.setMuted);
  const setSpeakerOn = useCallStore((s) => s.setSpeakerOn);
  const setVideoOff = useCallStore((s) => s.setVideoOff);
  const resetCall = useCallStore((s) => s.resetCall);
  const incrementDuration = useCallStore((s) => s.incrementDuration);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start duration timer when connected
  useEffect(() => {
    if (status === 'connected') {
      timerRef.current = setInterval(() => {
        incrementDuration();
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [status, incrementDuration]);

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleEndCall = () => {
    resetCall();
  };

  if (!peer || !callType) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.errorText}>通话信息不可用</Text>
          <TouchableOpacity style={styles.endCallButton} onPress={handleEndCall}>
            <Text style={styles.endCallText}>返回</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Remote video (full screen, only for video calls) */}
      {callType === 'video' && (
        <View style={styles.remoteVideoContainer}>
          {status === 'connected' ? (
            <RTCView
              streamURL=""
              style={styles.remoteVideo}
              objectFit="cover"
            />
          ) : (
            <View style={styles.remoteVideoPlaceholder}>
              <Text style={styles.avatarEmoji}>👤</Text>
            </View>
          )}
        </View>
      )}

      {/* Local video (PIP for video calls) */}
      {callType === 'video' && status === 'connected' && !isVideoOff && (
        <View style={styles.localVideoContainer}>
          <RTCView
            streamURL=""
            style={styles.localVideo}
            objectFit="cover"
            mirror
          />
        </View>
      )}

      {/* Peer info */}
      <View style={styles.peerInfo}>
        {peer.avatar ? (
          <Image source={{ uri: peer.avatar }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>
              {peer.username.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <Text style={styles.peerName}>{peer.username}</Text>
        <Text style={styles.callStatusText}>
          {status === 'calling'
            ? '正在呼叫...'
            : status === 'ringing'
              ? '等待接听...'
              : status === 'connected'
                ? formatDuration(duration)
                : status === 'ended'
                  ? '通话已结束'
                  : ''}
        </Text>
        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      {/* Control bar */}
      <View style={styles.controls}>
        <View style={styles.controlRow}>
          <TouchableOpacity
            style={[
              styles.controlButton,
              isMuted && styles.controlButtonActive,
            ]}
            onPress={() => setMuted(!isMuted)}
            activeOpacity={0.7}
          >
            <Text style={styles.controlIcon}>
              {isMuted ? '🔇' : '🎤'}
            </Text>
            <Text
              style={[
                styles.controlLabel,
                isMuted && styles.controlLabelActive,
              ]}
            >
              {isMuted ? '已静音' : '静音'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.controlButton,
              isSpeakerOn && styles.controlButtonActive,
            ]}
            onPress={() => setSpeakerOn(!isSpeakerOn)}
            activeOpacity={0.7}
          >
            <Text style={styles.controlIcon}>
              {isSpeakerOn ? '🔊' : '🔈'}
            </Text>
            <Text
              style={[
                styles.controlLabel,
                isSpeakerOn && styles.controlLabelActive,
              ]}
            >
              {isSpeakerOn ? '扬声器' : '听筒'}
            </Text>
          </TouchableOpacity>

          {callType === 'video' && (
            <TouchableOpacity
              style={[
                styles.controlButton,
                isVideoOff && styles.controlButtonActive,
              ]}
              onPress={() => setVideoOff(!isVideoOff)}
              activeOpacity={0.7}
            >
              <Text style={styles.controlIcon}>
                {isVideoOff ? '📷' : '📹'}
              </Text>
              <Text
                style={[
                  styles.controlLabel,
                  isVideoOff && styles.controlLabelActive,
                ]}
              >
                {isVideoOff ? '已关闭' : '摄像头'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          style={styles.endCallButton}
          onPress={handleEndCall}
          activeOpacity={0.8}
        >
          <Text style={styles.endCallIcon}>📞</Text>
          <Text style={styles.endCallText}>挂断</Text>
        </TouchableOpacity>
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
  peerInfo: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: spacing.lg,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatarText: {
    fontSize: fonts.xxl + 8,
    color: colors.white,
    fontWeight: '700',
  },
  avatarEmoji: {
    fontSize: 60,
  },
  peerName: {
    fontSize: fonts.xl,
    fontWeight: '600',
    color: colors.white,
    marginBottom: spacing.sm,
  },
  callStatusText: {
    fontSize: fonts.md,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: fonts.sm,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  controls: {
    paddingHorizontal: spacing.xxl,
    paddingBottom: spacing.xxl + 10,
    alignItems: 'center',
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: spacing.xxl,
  },
  controlButton: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: sizes.borderRadiusLg,
    backgroundColor: 'rgba(255,255,255,0.1)',
    minWidth: 70,
  },
  controlButtonActive: {
    backgroundColor: 'rgba(7, 193, 96, 0.3)',
  },
  controlIcon: {
    fontSize: sizes.iconXl,
    marginBottom: spacing.xs,
  },
  controlLabel: {
    fontSize: fonts.xs,
    color: colors.white,
  },
  controlLabelActive: {
    color: colors.primary,
  },
  endCallButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.danger,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallIcon: {
    fontSize: sizes.iconXl,
    transform: [{ rotate: '135deg' }],
  },
  endCallText: {
    fontSize: fonts.xs,
    color: colors.white,
    marginTop: 2,
  },
  remoteVideoContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  remoteVideo: {
    flex: 1,
  },
  remoteVideoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
  },
  localVideoContainer: {
    position: 'absolute',
    top: 60,
    right: spacing.md,
    width: 100,
    height: 150,
    borderRadius: sizes.borderRadiusLg,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  localVideo: {
    flex: 1,
  },
});
