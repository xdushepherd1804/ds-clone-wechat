import { PhoneOutlined, PhoneFilled, AudioOutlined, VideoCameraOutlined } from '@ant-design/icons';
import type { CallParticipant, CallType } from '@/types';

interface IncomingCallProps {
  peer: CallParticipant;
  callType: CallType;
  onAccept: () => void;
  onReject: () => void;
}

export function IncomingCall({ peer, callType, onAccept, onReject }: IncomingCallProps) {
  const callLabel = callType === 'video' ? '视频通话' : '语音通话';

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 9999,
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
    }}>
      {/* Avatar */}
      <div style={{
        width: 100,
        height: 100,
        borderRadius: '50%',
        background: '#4a6fa5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 40,
        color: '#fff',
        marginBottom: 24,
      }}>
        {(peer.username || peer.uid)[0]?.toUpperCase()}
      </div>

      {/* Name */}
      <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>
        {peer.username || peer.uid}
      </div>

      {/* Call type */}
      <div style={{ fontSize: 15, color: '#aaa', marginBottom: 48, display: 'flex', alignItems: 'center', gap: 6 }}>
        {callType === 'video' ? <VideoCameraOutlined /> : <AudioOutlined />}
        {callLabel} 邀请
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 48, alignItems: 'center' }}>
        <button
          onClick={onReject}
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            border: 'none',
            background: '#e74c3c',
            color: '#fff',
            fontSize: 28,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 15px rgba(231, 76, 60, 0.4)',
          }}
        >
          <PhoneOutlined style={{ transform: 'rotate(135deg)' }} />
        </button>

        <button
          onClick={onAccept}
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            border: 'none',
            background: '#07c160',
            color: '#fff',
            fontSize: 32,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 15px rgba(7, 193, 96, 0.4)',
            animation: 'pulse 1.5s infinite',
          }}
        >
          <PhoneFilled />
        </button>
      </div>

      {/* Reject label */}
      <div style={{ marginTop: 32, fontSize: 13, color: '#777' }}>
        点击红色按钮拒绝
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { box-shadow: 0 4px 15px rgba(7, 193, 96, 0.4); }
          50% { box-shadow: 0 4px 30px rgba(7, 193, 96, 0.7); }
        }
      `}</style>
    </div>
  );
}
