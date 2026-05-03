import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import type { Message } from '@wechat-clone/shared';
import { MsgType, MsgStatus } from '@wechat-clone/shared';
import { colors, spacing, fonts, sizes } from '@/theme';
import { useUserStore } from '@/store/userStore';
import { formatTime } from '@wechat-clone/shared';
import RedPacketMessage from '@/components/redpacket/RedPacketMessage';
import OpenRedPacketModal from '@/components/redpacket/OpenRedPacketModal';

interface MessageBubbleProps {
  message: Message;
}

function StatusIcon({ status }: { status: MsgStatus }) {
  const iconMap: Record<string, string> = {
    [MsgStatus.SENDING]: '⏳',
    [MsgStatus.SENT]: '✓',
    [MsgStatus.DELIVERED]: '✓✓',
    [MsgStatus.READ]: '✓✓',
    [MsgStatus.FAILED]: '⚠️',
  };

  return (
    <Text style={styles.statusIcon}>{iconMap[status] || ''}</Text>
  );
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const currentUser = useUserStore((s) => s.user);
  const isMine = message.fromUid === currentUser?.id;

  const [redPacketModalVisible, setRedPacketModalVisible] = useState(false);
  const [redPacketId, setRedPacketId] = useState<string | null>(null);

  const isFailed = message.status === MsgStatus.FAILED;

  // Attempt to parse custom message content as JSON
  const parseCustomContent = (): Record<string, unknown> | null => {
    try {
      return JSON.parse(message.content) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  const handleOpenRedPacket = (packetId: string) => {
    setRedPacketId(packetId);
    setRedPacketModalVisible(true);
  };

  const renderContent = () => {
    switch (message.msgType) {
      case MsgType.TEXT:
        return (
          <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
            {message.content}
          </Text>
        );

      case MsgType.IMAGE:
        return (
          <View style={styles.imagePlaceholder}>
            {message.content.startsWith('http') ? (
              <Image
                source={{ uri: message.content }}
                style={styles.imageContent}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.imagePlaceholderText}>[图片]</Text>
            )}
          </View>
        );

      case MsgType.VOICE: {
        const parsed = parseCustomContent();
        const duration = (parsed?.duration as number) || 0;
        return (
          <TouchableOpacity style={styles.voiceContainer} activeOpacity={0.7}>
            <Text style={[styles.voiceIcon, isMine && styles.voiceIconMine]}>
              🎤
            </Text>
            <Text
              style={[styles.voiceDuration, isMine && styles.voiceDurationMine]}
            >
              {duration}"
            </Text>
          </TouchableOpacity>
        );
      }

      case MsgType.VIDEO:
        return (
          <View style={styles.videoContainer}>
            <View style={styles.videoThumbnail}>
              <Text style={styles.videoIcon}>🎬</Text>
              <Text style={styles.videoPlayIcon}>▶</Text>
            </View>
          </View>
        );

      case MsgType.FILE: {
        const parsed = parseCustomContent();
        const fileName = (parsed?.fileName as string) || '文件';
        const fileSize = (parsed?.fileSize as number) || 0;
        const sizeDisplay =
          fileSize > 1024 * 1024
            ? `${(fileSize / 1024 / 1024).toFixed(1)} MB`
            : `${(fileSize / 1024).toFixed(0)} KB`;
        return (
          <View style={styles.fileContainer}>
            <Text style={styles.fileIcon}>📎</Text>
            <View style={styles.fileInfo}>
              <Text
                style={[styles.fileName, isMine && styles.fileNameMine]}
                numberOfLines={1}
              >
                {fileName}
              </Text>
              <Text
                style={[
                  styles.fileSize,
                  isMine && styles.fileSizeMine,
                ]}
              >
                {sizeDisplay}
              </Text>
            </View>
          </View>
        );
      }

      case MsgType.CUSTOM: {
        const custom = parseCustomContent();
        if (!custom) {
          return (
            <Text
              style={[
                styles.messageText,
                isMine && styles.messageTextMine,
              ]}
            >
              {message.content}
            </Text>
          );
        }

        const customType = custom.type as string;

        // Red packet message
        if (customType === 'redpacket') {
          const blessing = custom.blessing as string | undefined;
          const senderName = custom.senderName as string || '好友';
          const packetId = custom.packetId as string;
          const isReceived = custom.isReceived as boolean || false;
          return (
            <>
              <RedPacketMessage
                blessing={blessing}
                senderName={senderName}
                isReceived={isReceived}
                onOpen={() => handleOpenRedPacket(packetId)}
              />
              {redPacketId && (
                <OpenRedPacketModal
                  visible={redPacketModalVisible}
                  packetId={redPacketId}
                  onClose={() => setRedPacketModalVisible(false)}
                />
              )}
            </>
          );
        }

        // Sticker message
        if (customType === 'sticker') {
          const stickerUrl = custom.url as string;
          return (
            <View style={styles.stickerContainer}>
              {stickerUrl ? (
                <Image
                  source={{ uri: stickerUrl }}
                  style={styles.stickerImage}
                  resizeMode="contain"
                />
              ) : (
                <Text style={styles.stickerEmoji}>
                  {(custom.emoji as string) || '😀'}
                </Text>
              )}
            </View>
          );
        }

        // Unknown custom type
        return (
          <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
            {JSON.stringify(custom)}
          </Text>
        );
      }

      case MsgType.SYSTEM:
        return (
          <View style={styles.systemMessage}>
            <Text style={styles.systemMessageText}>{message.content}</Text>
          </View>
        );

      default:
        return (
          <Text style={[styles.messageText, isMine && styles.messageTextMine]}>
            {message.content}
          </Text>
        );
    }
  };

  // System messages are centered, not in bubbles
  if (message.msgType === MsgType.SYSTEM) {
    return <View style={styles.systemContainer}>{renderContent()}</View>;
  }

  return (
    <View
      style={[
        styles.container,
        isMine ? styles.containerMine : styles.containerOther,
      ]}
    >
      {isMine && (
        <View style={styles.statusContainer}>
          {isFailed ? (
            <Text style={styles.failedIcon}>⚠️</Text>
          ) : (
            <StatusIcon status={message.status} />
          )}
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleOther,
          isFailed && styles.bubbleFailed,
          message.msgType === MsgType.CUSTOM && styles.bubbleCustom,
        ]}
      >
        {renderContent()}
      </View>
      {!isMine && (
        <View style={styles.otherAvatar}>
          <Text style={styles.avatarText}>👤</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    maxWidth: '85%',
  },
  containerMine: {
    alignSelf: 'flex-end',
  },
  containerOther: {
    alignSelf: 'flex-start',
  },
  bubble: {
    maxWidth: '100%',
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleMine: {
    backgroundColor: colors.sentBubble,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.receivedBubble,
    borderBottomLeftRadius: 4,
  },
  bubbleFailed: {
    opacity: 0.7,
  },
  bubbleCustom: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  messageText: {
    fontSize: fonts.md,
    color: colors.text,
    lineHeight: 20,
  },
  messageTextMine: {
    color: colors.text,
  },
  statusContainer: {
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  statusIcon: {
    fontSize: fonts.xs,
    color: colors.textSecondary,
  },
  failedIcon: {
    fontSize: fonts.sm,
  },
  otherAvatar: {
    width: sizes.avatarSm,
    height: sizes.avatarSm,
    borderRadius: sizes.borderRadius,
    backgroundColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing.xs,
  },
  avatarText: {
    fontSize: sizes.iconMd,
  },
  imagePlaceholder: {
    width: 150,
    height: 150,
    backgroundColor: colors.borderLight,
    borderRadius: sizes.borderRadius,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  imageContent: {
    width: 150,
    height: 150,
    borderRadius: sizes.borderRadius,
  },
  imagePlaceholderText: {
    color: colors.textSecondary,
    fontSize: fonts.sm,
  },
  // Voice message styles
  voiceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 60,
  },
  voiceIcon: {
    fontSize: fonts.xl,
    marginRight: spacing.sm,
  },
  voiceIconMine: {
    // no change needed for mine
  },
  voiceDuration: {
    fontSize: fonts.md,
    color: colors.text,
  },
  voiceDurationMine: {
    color: colors.text,
  },
  // Video message styles
  videoContainer: {
    width: 160,
    height: 120,
    backgroundColor: colors.borderLight,
    borderRadius: sizes.borderRadius,
    overflow: 'hidden',
  },
  videoThumbnail: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    position: 'relative',
  },
  videoIcon: {
    fontSize: 40,
  },
  videoPlayIcon: {
    position: 'absolute',
    fontSize: 24,
    color: colors.white,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 40,
    height: 40,
    borderRadius: 20,
    textAlign: 'center',
    lineHeight: 40,
    overflow: 'hidden',
    top: '50%',
    left: '50%',
    marginTop: -20,
    marginLeft: -20,
  },
  // File message styles
  fileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 120,
  },
  fileIcon: {
    fontSize: fonts.xl + 4,
    marginRight: spacing.sm,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: fonts.sm,
    fontWeight: '500',
    color: colors.text,
    maxWidth: 120,
  },
  fileNameMine: {
    color: colors.text,
  },
  fileSize: {
    fontSize: fonts.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  fileSizeMine: {
    color: colors.textSecondary,
  },
  // Sticker message styles
  stickerContainer: {
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerImage: {
    width: 120,
    height: 120,
  },
  stickerEmoji: {
    fontSize: 60,
  },
  // System message styles
  systemContainer: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  systemMessage: {
    backgroundColor: colors.borderLight,
    borderRadius: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  systemMessageText: {
    fontSize: fonts.xs,
    color: colors.textSecondary,
  },
});
