import { MsgType } from '../types/message';

export const MsgTypeLabel: Record<MsgType, string> = {
  [MsgType.TEXT]: '文本',
  [MsgType.IMAGE]: '图片',
  [MsgType.VOICE]: '语音',
  [MsgType.VIDEO]: '视频',
  [MsgType.FILE]: '文件',
  [MsgType.LOCATION]: '位置',
  [MsgType.LINK]: '链接',
  [MsgType.SYSTEM]: '系统消息',
  [MsgType.CUSTOM]: '自定义消息',
};

export const MSG_CONTENT_MAX_LENGTH = 5000;
export const VOICE_MAX_DURATION_SEC = 60;
export const FILE_MAX_SIZE = 100 * 1024 * 1024; // 100 MB
export const IMAGE_MAX_SIZE = 20 * 1024 * 1024; // 20 MB
export const VIDEO_MAX_SIZE = 200 * 1024 * 1024; // 200 MB
