import { useEffect, useCallback, useRef } from 'react';
import { useChatStore } from '@/store';
import { getWSClient } from '@/ws';
import { ChatType } from '@/types';

export function useTypingIndicator(conversationId: string, chatType: ChatType = ChatType.PRIVATE) {
  const isTyping = useChatStore((s) => s.typingUsers[conversationId] || false);
  const { setTypingUser } = useChatStore.getState();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const ws = getWSClient();
    const unsub = ws.on('typing', (data) => {
      const body = (data as { body: { toUid?: string; toGroupId?: string; isTyping: boolean } }).body;
      if (!body) return;

      const relevant =
        (chatType === ChatType.PRIVATE && (body.toUid === conversationId)) ||
        (chatType === ChatType.GROUP && body.toGroupId === conversationId);

      if (relevant) {
        setTypingUser(conversationId, body.isTyping);
      }
    });

    return () => {
      unsub();
      setTypingUser(conversationId, false);
    };
  }, [conversationId, chatType, setTypingUser]);

  const sendTyping = useCallback(
    (typing: boolean) => {
      const ws = getWSClient();
      ws.send({
        cmd: 'typing',
        seq: Date.now(),
        body: {
          chatType,
          toUid: chatType === ChatType.PRIVATE ? conversationId : undefined,
          toGroupId: chatType === ChatType.GROUP ? conversationId : undefined,
          isTyping: typing,
        },
      });
    },
    [conversationId, chatType],
  );

  const onInputChange = useCallback(() => {
    sendTyping(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      sendTyping(false);
    }, 3000);
  }, [sendTyping]);

  return { isTyping, sendTyping, onInputChange };
}
