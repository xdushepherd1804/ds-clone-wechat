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

export function getMsgPreview(msg: { msgType: number; content: string }): string {
  if (msg.msgType === MsgType.TEXT) {
    try {
      const body = JSON.parse(msg.content);
      return body.text ?? msg.content;
    } catch {
      return msg.content;
    }
  }
  if (msg.msgType === MsgType.IMAGE) return '[图片]';
  if (msg.msgType === MsgType.VOICE) return '[语音]';
  if (msg.msgType === MsgType.VIDEO) return '[视频]';
  if (msg.msgType === MsgType.FILE) {
    try {
      const body = JSON.parse(msg.content);
      return `[文件] ${body.fileName ?? ''}`;
    } catch {
      return '[文件]';
    }
  }
  if (msg.msgType === MsgType.SYSTEM) {
    try {
      const body = JSON.parse(msg.content);
      return body.text ?? '[系统消息]';
    } catch {
      return '[系统消息]';
    }
  }
  return msg.content;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
