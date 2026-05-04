import { useState, useRef, useCallback, type KeyboardEvent, type ClipboardEvent, type ChangeEvent } from 'react';
import {
  SmileOutlined,
  PictureOutlined,
  FileAddOutlined,
  AudioOutlined,
  SendOutlined,
} from '@ant-design/icons';
import EmojiPicker from './EmojiPicker';
import VoiceRecorder from './VoiceRecorder';
import { IMAGE_MAX_SIZE, FILE_MAX_SIZE, MSG_CONTENT_MAX_LENGTH } from '@wechat-clone/shared';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSendText: () => void;
  onSendImage: (url: string) => void;
  onSendFile: (url: string, name: string, size: number) => void;
  onSendVoice: (blob: Blob, duration: number) => void;
  onInputChange: () => void;
  disabled?: boolean;
}

export default function ChatInput({
  value,
  onChange,
  onSendText,
  onSendImage,
  onSendFile,
  onSendVoice,
  onInputChange,
  disabled,
}: ChatInputProps) {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSendText();
      }
    }
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    onInputChange();
    autoResize();
  };

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const handleEmojiSelect = (emoji: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      onChange(value + emoji);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newVal = value.slice(0, start) + emoji + value.slice(end);
    onChange(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + emoji.length;
    });
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) processImageFile(file);
        return;
      }
    }
  };

  const processImageFile = (file: File) => {
    if (file.size > IMAGE_MAX_SIZE) {
      alert('图片大小不能超过 20MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onSendImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const processFile = (file: File) => {
    if (file.size > FILE_MAX_SIZE) {
      alert('文件大小不能超过 100MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onSendFile(reader.result as string, file.name, file.size);
    };
    reader.readAsDataURL(file);
  };

  const handleImageSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImageFile(file);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleVoiceRecord = useCallback(
    (blob: Blob, duration: number) => {
      onSendVoice(blob, duration);
    },
    [onSendVoice],
  );

  return (
    <div
      style={{
        borderTop: '1px solid #e8e8e8',
        background: '#f5f5f5',
        padding: '8px 12px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        <button
          onClick={() => { setShowEmoji(!showEmoji); setShowVoice(false); }}
          style={toolBtnStyle}
          title="表情"
        >
          <SmileOutlined style={{ fontSize: 20, color: '#666' }} />
        </button>
        <button
          onClick={() => imageInputRef.current?.click()}
          style={toolBtnStyle}
          title="图片"
        >
          <PictureOutlined style={{ fontSize: 20, color: '#666' }} />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={toolBtnStyle}
          title="文件"
        >
          <FileAddOutlined style={{ fontSize: 20, color: '#666' }} />
        </button>
        <button
          onClick={() => { setShowVoice(!showVoice); setShowEmoji(false); }}
          style={toolBtnStyle}
          title="语音"
        >
          <AudioOutlined style={{ fontSize: 20, color: '#666' }} />
        </button>

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageSelect}
        />
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="说点什么..."
          rows={1}
          disabled={disabled}
          style={{
            flex: 1,
            border: '1px solid #e0e0e0',
            borderRadius: 8,
            padding: '8px 12px',
            resize: 'none',
            fontSize: 14,
            lineHeight: 1.5,
            outline: 'none',
            fontFamily: 'inherit',
            background: '#fff',
            maxHeight: 120,
          }}
        />
        <button
          onClick={onSendText}
          disabled={disabled || !value.trim()}
          style={{
            background: value.trim() && !disabled ? '#07c160' : '#c0c0c0',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            padding: '8px 16px',
            fontSize: 14,
            cursor: value.trim() && !disabled ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
          }}
        >
          <SendOutlined /> 发送
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        <EmojiPicker
          visible={showEmoji}
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmoji(false)}
        />
        <VoiceRecorder
          visible={showVoice}
          onRecord={handleVoiceRecord}
          onClose={() => setShowVoice(false)}
        />
      </div>
    </div>
  );
}

const toolBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  padding: '4px 8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
