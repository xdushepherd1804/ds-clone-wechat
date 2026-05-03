import { useEffect, useCallback } from 'react';
import { useChatStore, useUserStore } from '@/store';
import { markAsRead } from '@/api';
import { getWSClient } from '@/ws';
import { ChatType, Message, MsgStatus } from '@/types';

const EMPTY_MSGS_READ: Message[] = [];

export function useMessageRead(conversationId: string, chatType: ChatType = ChatType.PRIVATE) {
  const messages = useChatStore((s) => s.messages[conversationId]) ?? EMPTY_MSGS_READ;
  const updateMessage = useChatStore((s) => s.updateMessage);
  const userId = useUserStore((s) => s.user?.id);

  useEffect(() => {
    if (!conversationId) return;

    const ws = getWSClient();
    const unsub = ws.on('ack', (data) => {
      const body = (data as { body: { msgId: string; status: string } }).body;
      if (!body?.msgId) return;
      updateMessage(conversationId, body.msgId, { status: body.status as MsgStatus });
    });

    return unsub;
  }, [conversationId, updateMessage]);

  const markRead = useCallback(async () => {
    if (!conversationId) return;
    try {
      await markAsRead(conversationId);
    } catch {
      // ignore
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !userId) return;
    markRead();
  }, [conversationId, userId, markRead]);

  const isMessageRead = useCallback(
    (msgId: string) => {
      const msg = messages.find((m) => m.msgId === msgId);
      return msg?.status === MsgStatus.READ;
    },
    [messages],
  );

  return { isMessageRead, markRead };
}
