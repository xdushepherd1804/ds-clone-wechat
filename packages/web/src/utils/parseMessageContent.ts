import type { Message, MessageBody } from '@/types';
import { MsgType } from '@/types';

export interface ParsedMessage extends Message {
  body: MessageBody;
  isRevoked: boolean;
}

export function parseMessageContent(msg: Message): ParsedMessage {
  let body: MessageBody = {};

  try {
    body = JSON.parse(msg.content);
  } catch {
    if (msg.msgType === MsgType.TEXT) {
      body = { text: msg.content };
    }
  }

  const isRevoked =
    msg.msgType === MsgType.SYSTEM && body.text === '消息已撤回';

  return { ...msg, body, isRevoked };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
