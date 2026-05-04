import { useState, useRef, useCallback } from 'react';
import { AudioOutlined, DeleteOutlined } from '@ant-design/icons';

interface VoiceRecorderProps {
  onRecord: (audioBlob: Blob, duration: number) => void;
  visible: boolean;
  onClose: () => void;
}

export default function VoiceRecorder({ onRecord, visible, onClose }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4',
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        const elapsed = (Date.now() - startTimeRef.current) / 1000;
        chunksRef.current = [];
        if (elapsed > 0.5) {
          onRecord(blob, Math.round(elapsed));
        }
        stream.getTracks().forEach((t) => t.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      mediaRecorder.start();
      setRecording(true);
      setDuration(0);
      startTimeRef.current = Date.now();

      timerRef.current = setInterval(() => {
        setDuration(Math.round((Date.now() - startTimeRef.current) / 1000));
      }, 200);
    } catch {
      // microphone access denied
    }
  }, [onRecord]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    onClose();
  }, [onClose]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    chunksRef.current = [];
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    onClose();
  }, [onClose]);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginBottom: 8,
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        padding: '24px 32px',
        textAlign: 'center',
        zIndex: 1000,
        minWidth: 200,
      }}
    >
      {!recording ? (
        <button
          onMouseDown={startRecording}
          onTouchStart={startRecording}
          style={{
            background: '#07c160',
            border: 'none',
            borderRadius: '50%',
            width: 80,
            height: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            margin: '0 auto',
          }}
          title="按住录音"
        >
          <AudioOutlined style={{ color: '#fff', fontSize: 32 }} />
        </button>
      ) : (
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: '#ff4d4f',
                animation: 'pulse 1s infinite',
              }}
            />
            <span style={{ fontSize: 20, fontFamily: 'monospace', fontWeight: 600 }}>
              {formatDuration(duration)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <button
              onClick={cancelRecording}
              style={{
                background: '#f5f5f5',
                border: '1px solid #d9d9d9',
                borderRadius: 8,
                padding: '8px 20px',
                cursor: 'pointer',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <DeleteOutlined /> 取消
            </button>
            <button
              onClick={stopRecording}
              style={{
                background: '#07c160',
                border: 'none',
                borderRadius: 8,
                padding: '8px 20px',
                cursor: 'pointer',
                color: '#fff',
                fontSize: 14,
              }}
            >
              发送
            </button>
          </div>
        </div>
      )}
      <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
        {recording ? '松手发送，右滑取消' : '按住开始录音'}
      </div>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
