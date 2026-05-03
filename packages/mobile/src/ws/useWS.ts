import { useEffect, useRef } from 'react';
import { useUserStore } from '@/store/userStore';
import { useWSStore } from '@/store/wsStore';
import { useChatStore } from '@/store/chatStore';
import { getWSClient } from './wsClient';
import type { WSConnectionState } from './wsClient';

export function useWS() {
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const setStatus = useWSStore((s) => s.setStatus);
  const setLastConnectedAt = useWSStore((s) => s.setLastConnectedAt);
  const setReconnectAttempt = useWSStore((s) => s.setReconnectAttempt);

  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const addConversation = useChatStore((s) => s.addConversation);

  const unsubsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!isLoggedIn) return;

    const client = getWSClient();
    client.resetTokenExpired();

    // Subscribe to state changes
    const unsubState = client.onStateChange((state: WSConnectionState) => {
      setStatus(state);
      if (state === 'connected') {
        setLastConnectedAt(Date.now());
        setReconnectAttempt(0);
      }
    });

    // Subscribe to token expired
    const unsubToken = client.onTokenExpired(() => {
      useUserStore.getState().logout();
    });

    // Subscribe to new messages
    const unsubNewMsg = client.on('new_msg', (data: unknown) => {
      const msg = data as {
        body?: {
          msgId: string;
          fromUid: string;
          chatType: string;
          toUid?: string;
          toGroupId?: string;
          msgType: number;
          content: string;
          serverSeq: number;
          createdAt: string;
        };
      };
      if (!msg.body) return;

      const convId =
        msg.body.chatType === 'group'
          ? (msg.body.toGroupId ?? '')
          : [msg.body.fromUid, useUserStore.getState().user?.id]
              .filter(Boolean)
              .sort()
              .join('_');

      if (!convId) return;

      const message = {
        msgId: msg.body.msgId,
        fromUid: msg.body.fromUid,
        chatType: msg.body.chatType as 'private' | 'group',
        toUid: msg.body.toUid,
        toGroupId: msg.body.toGroupId,
        msgType: msg.body.msgType,
        content: msg.body.content,
        status: 'delivered' as const,
        serverSeq: msg.body.serverSeq,
        createdAt: msg.body.createdAt,
      };

      addMessage(convId, message);
    });

    // Subscribe to message acknowledgments
    const unsubAck = client.on('ack', (data: unknown) => {
      const ack = data as {
        body?: { msgId: string; status: string };
      };
      if (ack.body?.msgId && ack.body?.status) {
        // Update message status across all conversations
        const chatState = useChatStore.getState();
        Object.keys(chatState.messages).forEach((convId) => {
          chatState.updateMessage(convId, ack.body!.msgId, {
            status: ack.body!.status as 'delivered' | 'read',
          });
        });
      }
    });

    unsubsRef.current = [unsubState, unsubToken, unsubNewMsg, unsubAck];

    client.connect();

    return () => {
      unsubsRef.current.forEach((fn) => fn());
      unsubsRef.current = [];
    };
  }, [isLoggedIn]);

  return null;
}
