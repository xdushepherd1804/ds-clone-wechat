import { useEffect, useRef } from 'react';
import { useUserStore, useWSStore, useContactStore, useChatStore } from '@/store';
import { getWSClient } from '@/ws';
import type { WSNewMsgBody, WSOnlineStatusBody, Message } from '@/types';
import { MsgStatus } from '@/types';

/**
 * Global WebSocket lifecycle hook.
 * - Connects WS when user logs in, disconnects when user logs out.
 * - Subscribes to global events (online_status, new_msg unread tracking).
 * - Syncs connection state to useWSStore.
 */
export function useWS() {
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const isLoading = useUserStore((s) => s.isLoading);
  const token = useUserStore((s) => s.token);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Sync WSStore from WSClient state changes
  useEffect(() => {
    const ws = getWSClient();
    const wsStore = useWSStore.getState();

    const unsub = ws.onStateChange((state) => {
      wsStore.setStatus(state);
      if (state === 'connected') {
        wsStore.setLastConnectedAt(Date.now());
        wsStore.setReconnectAttempt(0);
      }
    });

    wsStore.setStatus(ws.state);

    return unsub;
  }, []);

  // Handle token expiry → logout
  useEffect(() => {
    const ws = getWSClient();
    const unsub = ws.onTokenExpired(() => {
      useUserStore.getState().logout();
    });
    return unsub;
  }, []);

  // Connect/disconnect WS based on auth state + global handlers
  useEffect(() => {
    if (isLoading) return;

    const ws = getWSClient();

    if (isLoggedIn && token) {
      ws.resetTokenExpired();
      ws.connect();

      const unsubOnlineStatus = ws.on('online_status', (data) => {
        const body = (data as { body: WSOnlineStatusBody }).body;
        if (!body?.userId) return;

        const { contacts, updateContact } = useContactStore.getState();
        const contact = contacts.find(
          (c) => c.contactId === body.userId || c.contact.id === body.userId,
        );
        if (contact) {
          updateContact(contact.id, {
            contact: { ...contact.contact, status: body.status },
          });
        }
      });

      const unsubNewMsg = ws.on('new_msg', (data) => {
        const body = (data as { body: WSNewMsgBody }).body;
        if (!body) return;

        const { activeConvId, updateConversation } = useChatStore.getState();

        let convId: string;
        if (body.chatType === 'group' && body.toGroupId) {
          convId = body.toGroupId;
        } else if (body.chatType === 'private') {
          convId = body.fromUid;
        } else {
          return;
        }

        // If not viewing this conversation, bump unread count in sidebar
        if (activeConvId !== convId) {
          const { conversations } = useChatStore.getState();
          const existingConv = conversations.find((c) => c.conversationId === convId);
          const currentUnread = existingConv?.unreadCount ?? 0;

          updateConversation(convId, {
            lastMsg: {
              msgId: body.msgId,
              fromUid: body.fromUid,
              toUid: body.toUid,
              toGroupId: body.toGroupId,
              chatType: body.chatType as Message['chatType'],
              msgType: body.msgType as Message['msgType'],
              content: body.content,
              status: MsgStatus.SENT,
              serverSeq: body.serverSeq,
              createdAt: body.createdAt,
            } as Message,
            unreadCount: currentUnread + 1,
            updatedAt: body.createdAt,
          });
        }
      });

      cleanupRef.current = () => {
        unsubOnlineStatus();
        unsubNewMsg();
      };
    } else {
      cleanupRef.current?.();
      cleanupRef.current = null;
      ws.disconnect();
    }

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [isLoggedIn, isLoading, token]);

  return {
    status: useWSStore((s) => s.status),
    isConnected: useWSStore((s) => s.status === 'connected'),
    lastConnectedAt: useWSStore((s) => s.lastConnectedAt),
  };
}
