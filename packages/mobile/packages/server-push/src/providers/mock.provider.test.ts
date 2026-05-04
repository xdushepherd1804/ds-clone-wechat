import { describe, it, expect, beforeEach } from 'vitest';
import { MockProvider } from './mock.provider';
import type { DeviceInfo, PushPayload } from './types';

describe('MockProvider', () => {
  let provider: MockProvider;
  const iosDevice: DeviceInfo = {
    userId: 'user1',
    platform: 'ios',
    deviceToken: 'ios-token-abc',
  };
  const androidDevice: DeviceInfo = {
    userId: 'user1',
    platform: 'android',
    deviceToken: 'fcm-token-xyz',
  };
  const webDevice: DeviceInfo = {
    userId: 'user2',
    platform: 'web',
    deviceToken: 'web-token-123',
  };

  const samplePayload: PushPayload = {
    title: '张三: 你好',
    body: '这是一条测试消息',
    data: { msgId: 'msg1', chatType: 'private' },
  };

  beforeEach(() => {
    provider = new MockProvider();
    provider.reset();
  });

  it('has type "mock"', () => {
    expect(provider.type).toBe('mock');
  });

  it('send stores the push record', async () => {
    await provider.send(iosDevice, samplePayload);

    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0].device).toEqual(iosDevice);
    expect(provider.sent[0].payload.title).toBe('张三: 你好');
    expect(provider.sent[0].payload.body).toBe('这是一条测试消息');
    expect(provider.sent[0].timestamp).toBeGreaterThan(0);
  });

  it('sendToMany stores records for all devices', async () => {
    const devices = [iosDevice, androidDevice, webDevice];
    await provider.sendToMany(devices, samplePayload);

    expect(provider.sent).toHaveLength(3);
    expect(provider.sent[0].device.platform).toBe('ios');
    expect(provider.sent[1].device.platform).toBe('android');
    expect(provider.sent[2].device.platform).toBe('web');
  });

  it('sendToMany with empty array does nothing', async () => {
    await provider.sendToMany([], samplePayload);
    expect(provider.sent).toHaveLength(0);
  });

  it('reset clears sent records', async () => {
    await provider.send(iosDevice, samplePayload);
    expect(provider.sent).toHaveLength(1);

    provider.reset();
    expect(provider.sent).toHaveLength(0);
  });

  it('stores different push types correctly', async () => {
    const friendRequestPayload: PushPayload = {
      title: '好友申请',
      body: '李四 请求加你为好友',
      data: { requestId: 'req1' },
    };

    const atMentionPayload: PushPayload = {
      title: '群聊消息',
      body: '张三 在群聊中@了你',
      data: { groupId: 'g1', msgId: 'msg2' },
    };

    const callPayload: PushPayload = {
      title: '通话邀请',
      body: '张三 邀请你语音通话',
      data: { callId: 'call1', callType: 'voice' },
    };

    await provider.send(iosDevice, friendRequestPayload);
    await provider.send(androidDevice, atMentionPayload);
    await provider.send(webDevice, callPayload);

    expect(provider.sent).toHaveLength(3);
    expect(provider.sent[0].payload.title).toBe('好友申请');
    expect(provider.sent[1].payload.title).toBe('群聊消息');
    expect(provider.sent[2].payload.title).toBe('通话邀请');
  });
});
