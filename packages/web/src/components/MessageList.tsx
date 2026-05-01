import { useEffect, useRef, useCallback } from 'react';
import type { Message } from '@/types';
import { formatDate } from '@wechat-clone/shared';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  onRecall: (msgId: string) => void;
  onImageClick: (imageUrl: string) => void;
  chatType?: string;
  memberNames?: Record<string, string>;
}

function shouldShowTimeDivider(prev: Message, curr: Message): boolean {
  const prevDate = new Date(prev.createdAt).toDateString();
  const currDate = new Date(curr.createdAt).toDateString();
  return prevDate !== currDate;
}

export default function MessageList({
  messages,
  hasMore,
  loadingMore,
  loadMore,
  onRecall,
  onImageClick,
  chatType,
  memberNames,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMsgCount = useRef(messages.length);
  const isAtBottomRef = useRef(true);

  const scrollToBottom = useCallback((smooth = false) => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  }, []);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const { scrollTop, scrollHeight, clientHeight } = el;
    isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 60;

    if (scrollTop < 50 && hasMore && !loadingMore) {
      const oldScrollHeight = scrollHeight;
      loadMore();
      requestAnimationFrame(() => {
        if (containerRef.current) {
          const newScrollHeight = containerRef.current.scrollHeight;
          containerRef.current.scrollTop = newScrollHeight - oldScrollHeight;
        }
      });
    }
  }, [hasMore, loadingMore, loadMore]);

  useEffect(() => {
    const prevCount = prevMsgCount.current;
    prevMsgCount.current = messages.length;

    if (messages.length === 0) return;

    const isNewMessage = messages.length > prevCount;
    const lastMsg = messages[messages.length - 1];

    if (isNewMessage && isAtBottomRef.current) {
      scrollToBottom(true);
    } else if (prevCount === 0) {
      scrollToBottom(false);
    }
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    const el = containerRef.current;
    if (el) {
      el.addEventListener('scroll', handleScroll, { passive: true });
      return () => el.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        background: '#ededed',
      }}
    >
      {loadingMore && (
        <div style={{ textAlign: 'center', padding: 12 }}>
          <span style={{ fontSize: 12, color: '#999' }}>加载中...</span>
        </div>
      )}
      {!hasMore && messages.length > 0 && (
        <div style={{ textAlign: 'center', padding: 12 }}>
          <span style={{ fontSize: 12, color: '#ccc' }}>—— 没有更多消息了 ——</span>
        </div>
      )}

      {messages.map((msg, idx) => {
        const prev = idx > 0 ? messages[idx - 1] : null;
        const showDivider = prev ? shouldShowTimeDivider(prev, msg) : true;

        return (
          <div key={msg.msgId || idx}>
            {showDivider && (
              <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
                <span
                  style={{
                    fontSize: 11,
                    color: '#999',
                    background: '#ededed',
                    padding: '2px 8px',
                    borderRadius: 3,
                  }}
                >
                  {formatDate(msg.createdAt)}
                </span>
              </div>
            )}
            <MessageBubble
              message={msg}
              onRecall={onRecall}
              onImageClick={onImageClick}
              showSenderName={chatType === 'group' && msg.fromUid !== undefined}
              senderName={chatType === 'group' ? memberNames?.[msg.fromUid] || msg.fromUid : undefined}
            />
          </div>
        );
      })}

      <div ref={bottomRef} style={{ height: 8 }} />
    </div>
  );
}
