import { useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import MessageList from '@/components/MessageList';
import ChatInput from '@/components/ChatInput';
import ImageViewer from '@/components/ImageViewer';
import { useMessages } from '@/hooks/useMessages';
import { useSendMessage } from '@/hooks/useSendMessage';
import { useTypingIndicator } from '@/hooks/useTypingIndicator';
import { useMessageRead } from '@/hooks/useMessageRead';
import { useChatStore, useContactStore } from '@/store';
import { ChatType } from '@/types';

export function ChatDetailPage() {
  const { conv_id } = useParams<{ conv_id: string }>();
  const navigate = useNavigate();
  const conversationId = conv_id || '';
  const contacts = useContactStore((s) => s.contacts);

  const chatTitle = useMemo(() => {
    const contact = contacts.find((c) => c.contactId === conversationId);
    if (contact) return contact.remark || contact.contact.nickname || contact.contact.username;
    return conversationId || '聊天';
  }, [contacts, conversationId]);

  const draftInput = useChatStore((s) => s.draftInputs[conversationId] || '');
  const { setDraftInput, clearDraftInput } = useChatStore.getState();

  const { messages, hasMore, loadingMore, loadMore, recallMessage } =
    useMessages(conversationId);

  const { sendText, sendImage, sendFile, sendVoice } =
    useSendMessage(conversationId);

  const { isTyping, onInputChange } =
    useTypingIndicator(conversationId, ChatType.PRIVATE);

  const { markRead } = useMessageRead(conversationId, ChatType.PRIVATE);

  const handleSendText = useCallback(() => {
    const text = draftInput.trim();
    if (!text) return;
    sendText(text);
    setDraftInput(conversationId, '');
    markRead();
  }, [draftInput, sendText, setDraftInput, conversationId, markRead]);

  const handleSendImage = useCallback(
    (url: string) => {
      sendImage(url);
      markRead();
    },
    [sendImage, markRead],
  );

  const handleSendFile = useCallback(
    (url: string, name: string, size: number) => {
      sendFile(url, name, size);
      markRead();
    },
    [sendFile, markRead],
  );

  const handleSendVoice = useCallback(
    (blob: Blob, duration: number) => {
      const reader = new FileReader();
      reader.onload = () => {
        sendVoice(reader.result as string, duration);
        markRead();
      };
      reader.readAsDataURL(blob);
    },
    [sendVoice, markRead],
  );

  const handleRecall = useCallback(
    (msgId: string) => {
      recallMessage(msgId);
    },
    [recallMessage],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', maxWidth: 900, margin: '0 auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          background: '#ededed',
          borderBottom: '1px solid #ddd',
        }}
      >
        <button
          onClick={() => navigate('/chat')}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ArrowLeftOutlined style={{ fontSize: 18, color: '#333' }} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            {chatTitle}
          </div>
          {isTyping && (
            <div style={{ fontSize: 12, color: '#07c160' }}>对方正在输入...</div>
          )}
        </div>
      </div>

      <MessageList
        messages={messages}
        hasMore={hasMore}
        loadingMore={loadingMore}
        loadMore={loadMore}
        onRecall={handleRecall}
        onImageClick={() => {}}
      />

      <ChatInput
        value={draftInput}
        onChange={(val) => setDraftInput(conversationId, val)}
        onSendText={handleSendText}
        onSendImage={handleSendImage}
        onSendFile={handleSendFile}
        onSendVoice={handleSendVoice}
        onInputChange={onInputChange}
      />

      <ImageViewer />
    </div>
  );
}
