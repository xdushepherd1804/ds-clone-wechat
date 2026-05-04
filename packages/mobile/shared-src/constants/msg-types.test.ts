import { describe, it, expect } from 'vitest';
import {
  MsgTypeLabel,
  MSG_CONTENT_MAX_LENGTH,
  VOICE_MAX_DURATION_SEC,
  FILE_MAX_SIZE,
  IMAGE_MAX_SIZE,
  VIDEO_MAX_SIZE,
} from './msg-types';
import { MsgType } from '../types/message';

describe('MsgTypeLabel', () => {
  it('has a label for every MsgType enum value', () => {
    for (const type of Object.values(MsgType).filter((v) => typeof v === 'number')) {
      expect(MsgTypeLabel[type as MsgType]).toBeDefined();
    }
  });

  it('TEXT label is 文本', () => {
    expect(MsgTypeLabel[MsgType.TEXT]).toBe('文本');
  });

  it('SYSTEM label is 系统消息', () => {
    expect(MsgTypeLabel[MsgType.SYSTEM]).toBe('系统消息');
  });

  it('CUSTOM label is 自定义消息', () => {
    expect(MsgTypeLabel[MsgType.CUSTOM]).toBe('自定义消息');
  });
});

describe('message constants', () => {
  it('MSG_CONTENT_MAX_LENGTH is 5000', () => {
    expect(MSG_CONTENT_MAX_LENGTH).toBe(5000);
  });

  it('VOICE_MAX_DURATION_SEC is 60', () => {
    expect(VOICE_MAX_DURATION_SEC).toBe(60);
  });

  it('FILE_MAX_SIZE is 100 MB', () => {
    expect(FILE_MAX_SIZE).toBe(104_857_600);
  });

  it('IMAGE_MAX_SIZE is 20 MB', () => {
    expect(IMAGE_MAX_SIZE).toBe(20_971_520);
  });

  it('VIDEO_MAX_SIZE is 200 MB', () => {
    expect(VIDEO_MAX_SIZE).toBe(209_715_200);
  });

  it('size constants are correctly ordered', () => {
    expect(IMAGE_MAX_SIZE).toBeLessThan(FILE_MAX_SIZE);
    expect(FILE_MAX_SIZE).toBeLessThan(VIDEO_MAX_SIZE);
  });
});
