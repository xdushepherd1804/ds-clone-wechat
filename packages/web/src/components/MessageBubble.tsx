import { useState } from 'react';
import type { Message } from '@/types';
import { MsgType, MsgStatus } from '@/types';
import { useUserStore, useChatStore } from '@/store';
import { parseMessageContent, formatFileSize } from '@/utils/parseMessageContent';
import { formatTime } from '@wechat-clone/shared';
import {
  PlayCircleOutlined,
  FileOutlined,
  DownloadOutlined,
  CheckOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';

interface MessageBubbleProps {
  message: Message;
  onRecall?: (msgId: string) => void;
  onImageClick?: (imageUrl: string) => void;
  showSenderName?: boolean;
  senderName?: string;
}

export default function MessageBubble({ message, onRecall, onImageClick, showSenderName, senderName }: MessageBubbleProps) {
  const userId = useUserStore((s) => s.user?.id);
  const isMe = message.fromUid === userId;
  const parsed = parseMessageContent(message);
  const [showMenu, setShowMenu] = useState(false);

  const time = formatTime(message.createdAt);
  const canRecall =
    isMe &&
    message.msgType !== MsgType.SYSTEM &&
    Date.now() - new Date(message.createdAt).getTime() < 2 * 60 * 1000 &&
    message.status !== MsgStatus.SENDING;

  const statusIcon = () => {
    if (message.status === MsgStatus.SENDING) {
      return <span style={{ fontSize: 11, color: '#999' }}>○</span>;
    }
    if (message.status === MsgStatus.FAILED) {
      return <ExclamationCircleOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />;
    }
    if (message.status === MsgStatus.READ) {
      return <CheckOutlined style={{ color: '#07c160', fontSize: 14 }} />;
    }
    if (message.status === MsgStatus.DELIVERED) {
      return <CheckOutlined style={{ color: '#999', fontSize: 14 }} />;
    }
    return null;
  };

  if (parsed.isRevoked) {
    return (
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <span style={{ color: '#999', fontSize: 12, background: '#f5f5f5', padding: '2px 12px', borderRadius: 4 }}>
          {isMe ? '你撤回了一条消息' : '对方撤回了一条消息'}
        </span>
      </div>
    );
  }

  if (message.msgType === MsgType.SYSTEM) {
    return (
      <div style={{ textAlign: 'center', padding: '8px 0' }}>
        <span style={{ color: '#999', fontSize: 12 }}>{parsed.body.text}</span>
      </div>
    );
  }

  const renderContent = () => {
    switch (message.msgType) {
      case MsgType.TEXT:
        return (
          <span style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {parsed.body.text || ''}
          </span>
        );

      case MsgType.IMAGE:
        return (
          <div
            style={{ cursor: 'pointer', maxWidth: 240, borderRadius: 8, overflow: 'hidden' }}
            onClick={() => {
              const url = parsed.body.imageUrl || parsed.body.imageThumbUrl;
              if (url) {
                useChatStore.getState().openImageViewer([url], 0);
              }
            }}
          >
            <img
              src={parsed.body.imageThumbUrl || parsed.body.imageUrl}
              alt="图片"
              style={{ width: '100%', display: 'block', maxHeight: 320, objectFit: 'cover' }}
              loading="lazy"
            />
          </div>
        );

      case MsgType.VOICE:
        return <VoiceBubble body={parsed.body} isMe={isMe} />;

      case MsgType.VIDEO:
        return (
          <div
            style={{ cursor: 'pointer', maxWidth: 240, borderRadius: 8, overflow: 'hidden', position: 'relative' }}
          >
            <img
              src={parsed.body.videoThumbUrl || parsed.body.videoUrl}
              alt="视频"
              style={{ width: '100%', display: 'block', maxHeight: 320, objectFit: 'cover' }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0,0,0,0.3)',
              }}
            >
              <PlayCircleOutlined style={{ fontSize: 40, color: '#fff' }} />
            </div>
          </div>
        );

      case MsgType.FILE:
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              background: isMe ? 'rgba(255,255,255,0.2)' : '#f0f0f0',
              borderRadius: 8,
              minWidth: 200,
              cursor: 'pointer',
            }}
            onClick={() => {
              if (parsed.body.fileUrl) window.open(parsed.body.fileUrl, '_blank');
            }}
          >
            <FileOutlined style={{ fontSize: 28, color: isMe ? '#fff' : '#666' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: isMe ? '#fff' : '#333',
                }}
              >
                {parsed.body.fileName || '未知文件'}
              </div>
              <div style={{ fontSize: 11, color: isMe ? 'rgba(255,255,255,0.7)' : '#999' }}>
                {parsed.body.fileSize ? formatFileSize(parsed.body.fileSize) : '--'}
              </div>
            </div>
            <DownloadOutlined style={{ color: isMe ? '#fff' : '#999', fontSize: 16 }} />
          </div>
        );

      default:
        return <span style={{ color: '#999', fontSize: 12 }}>[暂不支持的消息类型]</span>;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isMe ? 'flex-end' : 'flex-start',
        padding: '4px 16px',
      }}
    >
      {showSenderName && !isMe && senderName && (
        <span
          style={{
            fontSize: 11,
            color: '#999',
            marginBottom: 2,
            paddingLeft: 4,
          }}
        >
          {senderName}
        </span>
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: isMe ? 'row-reverse' : 'row',
          alignItems: 'flex-end',
          gap: 8,
          maxWidth: '75%',
        }}
      >
        <div
          onContextMenu={(e) => {
            e.preventDefault();
            if (canRecall) setShowMenu(true);
          }}
          style={{
            position: 'relative',
            padding: '8px 12px',
            borderRadius: 8,
            background: isMe ? '#95ec69' : '#fff',
            color: isMe ? '#000' : '#333',
            boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
            wordBreak: 'break-word',
          }}
        >
          {renderContent()}
          {showMenu && (
            <div
              style={{
                position: 'absolute',
                top: -36,
                [isMe ? 'right' : 'left']: 0,
                background: '#333',
                color: '#fff',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                zIndex: 10,
              }}
              onClick={() => {
                onRecall?.(message.msgId);
                setShowMenu(false);
              }}
              onMouseLeave={() => setShowMenu(false)}
            >
              撤回
            </div>
          )}
        </div>

        {isMe && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {statusIcon()}
            <span style={{ fontSize: 11, color: '#999' }}>{time}</span>
          </div>
        )}
        {!isMe && (
          <span style={{ fontSize: 11, color: '#999' }}>{time}</span>
        )}
      </div>
    </div>
  );
}

function VoiceBubble({ body, isMe }: { body: { voiceUrl?: string; voiceDuration?: number }; isMe: boolean }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = { current: null as HTMLAudioElement | null };

  const duration = body.voiceDuration || 0;
  const barWidth = Math.min(120, Math.max(40, duration * 4));

  const handlePlay = () => {
    if (!body.voiceUrl) return;
    if (playing) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlaying(false);
      return;
    }
    const audio = new Audio(body.voiceUrl);
    audio.onended = () => setPlaying(false);
    audio.onerror = () => setPlaying(false);
    audio.play().catch(() => setPlaying(false));
    audioRef.current = audio;
    setPlaying(true);
  };

  return (
    <div
      onClick={handlePlay}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        cursor: 'pointer',
        minWidth: 80,
        padding: '4px 0',
      }}
    >
      <PlayCircleOutlined
        style={{
          fontSize: 20,
          color: playing ? '#07c160' : isMe ? '#333' : '#666',
        }}
      />
      <div
        style={{
          width: barWidth,
          height: 8,
          background: playing
            ? 'linear-gradient(90deg, #07c160 50%, #e0e0e0 50%)'
            : '#e0e0e0',
          borderRadius: 4,
          transition: 'width 0.15s',
        }}
      />
      <span style={{ fontSize: 12, color: '#999' }}>
        {duration}"
      </span>
    </div>
  );
}
