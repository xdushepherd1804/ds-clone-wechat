import { useEffect, useCallback, useRef } from 'react';
import { useChatStore, useUserStore } from '@/store';
import { getMessages } from '@/api';
import { getWSClient } from '@/ws';
import type { Message, WSNewMsgBody } from '@/types';
import { MsgType, MsgStatus, ChatType } from '@/types';

const PAGE_SIZE = 30;
const EMPTY_MSGS: Message[] = [];

export function useMessages(conversationId: string) {
  const messages = useChatStore((s) => s.messages[conversationId]) ?? EMPTY_MSGS;
  const hasMore = useChatStore((s) => s.hasMore[conversationId] ?? true);
  const loadingMore = useChatStore((s) => s.loadingMore);
  const userId = useUserStore((s) => s.user?.id);
  const activeConvId = useChatStore((s) => s.activeConvId);

  const {
    setMessages,
    addMessage,
    addMessages,
    updateMessage,
    removeMessage,
    setHasMore,
    setLoadingMore,
    setActiveConvId,
  } = useChatStore.getState();

  const loadedRef = useRef(false);

  useEffect(() => {
    if (!conversationId) return;
    setActiveConvId(conversationId);
  }, [conversationId, setActiveConvId]);

  const loadInitialMessages = useCallback(async () => {
    setLoadingMore(true);
    try {
      const msgs = await getMessages(conversationId, { limit: PAGE_SIZE });
      setMessages(conversationId, msgs.reverse());
      setHasMore(conversationId, msgs.length >= PAGE_SIZE);
      loadedRef.current = true;
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, setMessages, setHasMore, setLoadingMore]);

  useEffect(() => {
    if (!conversationId) return;
    loadedRef.current = false;
    loadInitialMessages();
  }, [conversationId, loadInitialMessages]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const existing = messages;
    if (existing.length === 0) return;

    setLoadingMore(true);
    try {
      const oldest = existing[0];
      const before = oldest.serverSeq;
      const older = await getMessages(conversationId, { before, limit: PAGE_SIZE });
      if (older.length > 0) {
        addMessages(conversationId, older.reverse());
      }
      setHasMore(conversationId, older.length >= PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, hasMore, loadingMore, messages, addMessages, setHasMore, setLoadingMore]);

  useEffect(() => {
    if (!conversationId || !userId) return;

    const ws = getWSClient();
    ws.connect();

    const unsub = ws.on('new_msg', (data) => {
      const body = (data as { body: WSNewMsgBody }).body;
      if (!body) return;

      const isPrivate = body.chatType === 'private';
      const isGroup = body.chatType === 'group';

      let relevant = false;
      if (isPrivate && conversationId) {
        const uidA = (body.toUid || body.fromUid);
        const uidB = body.fromUid;
        relevant = uidA === conversationId || uidB === conversationId;
      }
      if (isGroup && body.toGroupId) {
        relevant = body.toGroupId === conversationId;
      }

      if (!relevant) return;

      const msg: Message = {
        msgId: body.msgId,
        fromUid: body.fromUid,
        toUid: body.toUid,
        toGroupId: body.toGroupId,
        chatType: body.chatType as ChatType,
        msgType: body.msgType,
        content: body.content,
        status: MsgStatus.SENT,
        serverSeq: body.serverSeq,
        createdAt: body.createdAt,
      };

      addMessage(conversationId, msg);
    });

    const unsubAck = ws.on('ack', (data) => {
      const body = (data as { body: { msgId: string; status: string } }).body;
      if (!body?.msgId) return;
      updateMessage(conversationId, body.msgId, { status: body.status as MsgStatus });
    });

    return () => {
      unsub();
      unsubAck();
    };
  }, [conversationId, userId, addMessage, updateMessage]);

  const recallMessage = useCallback(
    (msgId: string) => {
      const msg = messages.find((m) => m.msgId === msgId);
      if (!msg) return false;

      const TWO_MINUTES = 2 * 60 * 1000;
      const elapsed = Date.now() - new Date(msg.createdAt).getTime();
      if (elapsed > TWO_MINUTES) return false;
      if (msg.fromUid !== userId) return false;

      updateMessage(conversationId, msgId, {
        msgType: MsgType.SYSTEM,
        content: JSON.stringify({ text: '消息已撤回' }),
      });
      return true;
    },
    [conversationId, messages, userId, updateMessage],
  );

  return {
    messages,
    hasMore,
    loadingMore,
    loadMore,
    recallMessage,
    loaded: loadedRef.current,
  };
}
