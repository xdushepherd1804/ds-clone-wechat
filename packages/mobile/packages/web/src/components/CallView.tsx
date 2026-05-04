import { useState, useEffect, useRef, useCallback } from 'react';
import {
  PhoneOutlined,
  AudioOutlined,
  AudioMutedOutlined,
  SoundOutlined,
  VideoCameraOutlined,
  VideoCameraFilled,
} from '@ant-design/icons';
import type { CallParticipant, CallType } from '@/types';
import { useCallStore } from '@/store';

interface CallViewProps {
  peer: CallParticipant;
  callType: CallType;
  callManager: {
    toggleMute: () => boolean;
    toggleSpeaker: () => boolean;
    toggleVideo: () => boolean;
    endCall: () => void;
    attachLocalStream: (el: HTMLVideoElement | null) => void;
    on: (event: string, handler: (data: unknown) => void) => () => void;
  };
}

export function CallView({ peer, callType, callManager }: CallViewProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [duration, setDuration] = useState(0);
  const [connected, setConnected] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Attach local stream
  useEffect(() => {
    callManager.attachLocalStream(localVideoRef.current);

    const unsubStream = callManager.on('stream', (stream) => {
      if (remoteVideoRef.current && stream instanceof MediaStream) {
        remoteVideoRef.current.srcObject = stream;
      }
    });

    const unsubConnected = callManager.on('connected', () => {
      setConnected(true);
    });

    const unsubMute = callManager.on('mute-change', (muted) => {
      setIsMuted(muted as boolean);
    });

    const unsubVideo = callManager.on('video-change', (off) => {
      setIsVideoOff(off as boolean);
    });

    return () => {
      unsubStream();
      unsubConnected();
      unsubMute();
      unsubVideo();
    };
  }, [callManager]);

  // Duration timer
  useEffect(() => {
    if (connected) {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [connected]);

  const handleToggleMute = useCallback(() => {
    const muted = callManager.toggleMute();
    setIsMuted(muted);
  }, [callManager]);

  const handleToggleSpeaker = useCallback(() => {
    const off = callManager.toggleSpeaker();
    setIsSpeakerOff(off);
  }, [callManager]);

  const handleToggleVideo = useCallback(() => {
    const off = callManager.toggleVideo();
    setIsVideoOff(off);
  }, [callManager]);

  const handleEndCall = useCallback(() => {
    callManager.endCall();
  }, [callManager]);

  const formatDuration = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9998,
      background: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      color: '#fff',
    }}>
      {/* Remote video (large) */}
      <div style={{
        flex: 1,
        position: 'relative',
        background: '#1a1a2e',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {callType === 'video' ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 120,
              height: 120,
              borderRadius: '50%',
              background: '#4a6fa5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
              margin: '0 auto 16px',
            }}>
              {(peer.username || peer.uid)[0]?.toUpperCase()}
            </div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>
              {peer.username || peer.uid}
            </div>
          </div>
        )}

        {/* Local video (small PIP) */}
        {callType === 'video' && (
          <div style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 140,
            height: 200,
            borderRadius: 12,
            overflow: 'hidden',
            border: '2px solid rgba(255,255,255,0.3)',
            background: '#333',
          }}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: isVideoOff ? 'none' : 'block',
              }}
            />
            {isVideoOff && (
              <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#444',
              }}>
                <VideoCameraFilled style={{ fontSize: 32, color: '#999' }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div style={{
        padding: '24px 16px 40px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
      }}>
        {/* Duration / name */}
        <div style={{ fontSize: 14, color: '#aaa' }}>
          {connected ? formatDuration(duration) : '连接中...'}
        </div>
        <div style={{ fontSize: 16, fontWeight: 500 }}>
          {peer.username || peer.uid}
        </div>

        {/* Control buttons */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {/* Mute */}
          <ControlButton
            icon={isMuted ? <AudioMutedOutlined /> : <AudioOutlined />}
            label={isMuted ? '取消静音' : '静音'}
            active={isMuted}
            onClick={handleToggleMute}
          />

          {/* Speaker */}
          <ControlButton
            icon={<SoundOutlined />}
            label={isSpeakerOff ? '扬声器关' : '扬声器'}
            active={isSpeakerOff}
            onClick={handleToggleSpeaker}
          />

          {/* Video toggle (video calls only) */}
          {callType === 'video' && (
            <ControlButton
              icon={<VideoCameraOutlined />}
              label={isVideoOff ? '打开视频' : '关闭视频'}
              active={isVideoOff}
              onClick={handleToggleVideo}
            />
          )}
        </div>

        {/* Hang up */}
        <button
          onClick={handleEndCall}
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            border: 'none',
            background: '#e74c3c',
            color: '#fff',
            fontSize: 26,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 15px rgba(231, 76, 60, 0.4)',
          }}
        >
          <PhoneOutlined style={{ transform: 'rotate(135deg)' }} />
        </button>

        <div style={{ fontSize: 13, color: '#666' }}>
          点击红色按钮挂断
        </div>
      </div>
    </div>
  );
}

// Small helper component for control buttons
function ControlButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <button
        onClick={onClick}
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          border: 'none',
          background: active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
          color: '#fff',
          fontSize: 20,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </button>
      <span style={{ fontSize: 11, color: '#999' }}>{label}</span>
    </div>
  );
}
