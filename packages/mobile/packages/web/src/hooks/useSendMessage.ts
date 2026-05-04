import { useCallback, useRef } from 'react';
import { useChatStore, useUserStore } from '@/store';
import { sendMessage as apiSendMessage } from '@/api';
import { getWSClient } from '@/ws';
import type { Message, WSSendMsgBody } from '@/types';
import { MsgType, MsgStatus, ChatType } from '@/types';

let clientSeqCounter = 0;

export function useSendMessage(conversationId: string) {
  const addMessage = useChatStore((s) => s.addMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const setMessageSending = useChatStore((s) => s.setMessageSending);
  const userId = useUserStore((s) => s.user?.id);
  const seqRef = useRef(0);

  const send = useCallback(
    async (params: {
      msgType: MsgType;
      content: string;
      toUid?: string;
      toGroupId?: string;
      chatType: ChatType;
    }) => {
      if (!userId) return;

      const clientSeq = ++clientSeqCounter;
      seqRef.current = clientSeq;

      const optimistic: Message = {
        msgId: `temp_${clientSeq}`,
        fromUid: userId,
        toUid: params.toUid,
        toGroupId: params.toGroupId,
        chatType: params.chatType,
        msgType: params.msgType,
        content: params.content,
        status: MsgStatus.SENDING,
        clientSeq,
        serverSeq: 0,
        createdAt: new Date().toISOString(),
      };

      addMessage(conversationId, optimistic);
      setMessageSending(clientSeq, true);

      try {
        const sent = await apiSendMessage({
          conversationId,
          chatType: params.chatType,
          toUid: params.toUid,
          toGroupId: params.toGroupId,
          msgType: params.msgType,
          content: params.content,
        });

        updateMessage(conversationId, `temp_${clientSeq}`, {
          msgId: sent.msgId,
          status: sent.status,
          serverSeq: sent.serverSeq,
          clientSeq: undefined,
        });
      } catch {
        updateMessage(conversationId, `temp_${clientSeq}`, {
          status: MsgStatus.FAILED,
        });
      } finally {
        setMessageSending(clientSeq, false);
      }
    },
    [conversationId, userId, addMessage, updateMessage, setMessageSending],
  );

  const sendText = useCallback(
    (text: string, chatType: ChatType = ChatType.PRIVATE) => {
      return send({
        msgType: MsgType.TEXT,
        content: JSON.stringify({ text }),
        toUid: chatType === ChatType.PRIVATE ? conversationId : undefined,
        toGroupId: chatType === ChatType.GROUP ? conversationId : undefined,
        chatType,
      });
    },
    [conversationId, send],
  );

  const sendImage = useCallback(
    (imageUrl: string, chatType: ChatType = ChatType.PRIVATE) => {
      return send({
        msgType: MsgType.IMAGE,
        content: JSON.stringify({ imageUrl, imageThumbUrl: imageUrl }),
        toUid: chatType === ChatType.PRIVATE ? conversationId : undefined,
        toGroupId: chatType === ChatType.GROUP ? conversationId : undefined,
        chatType,
      });
    },
    [conversationId, send],
  );

  const sendFile = useCallback(
    (fileUrl: string, fileName: string, fileSize: number, chatType: ChatType = ChatType.PRIVATE) => {
      return send({
        msgType: MsgType.FILE,
        content: JSON.stringify({ fileUrl, fileName, fileSize }),
        toUid: chatType === ChatType.PRIVATE ? conversationId : undefined,
        toGroupId: chatType === ChatType.GROUP ? conversationId : undefined,
        chatType,
      });
    },
    [conversationId, send],
  );

  const sendVoice = useCallback(
    (voiceUrl: string, voiceDuration: number, chatType: ChatType = ChatType.PRIVATE) => {
      return send({
        msgType: MsgType.VOICE,
        content: JSON.stringify({ voiceUrl, voiceDuration }),
        toUid: chatType === ChatType.PRIVATE ? conversationId : undefined,
        toGroupId: chatType === ChatType.GROUP ? conversationId : undefined,
        chatType,
      });
    },
    [conversationId, send],
  );

  return { sendText, sendImage, sendFile, sendVoice, send };
}
