import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('./client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
  },
}));

import {
  getConversations,
  getMessages,
  sendMessage,
  syncMessages,
  markAsRead,
} from './message';

describe('message API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getConversations', () => {
    it('calls GET /messages/conversations', async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: [{ conversationId: 'conv-1', targetId: 'u1' }] },
      });

      const result = await getConversations();
      expect(mockGet).toHaveBeenCalledWith('/messages/conversations');
      expect(result).toHaveLength(1);
    });
  });

  describe('getMessages', () => {
    it('calls GET /messages/:convId', async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: [{ msgId: 'm1', content: 'Hi' }] },
      });

      const result = await getMessages('conv-1');
      expect(mockGet).toHaveBeenCalledWith('/messages/conv-1', { params: undefined });
      expect(result).toHaveLength(1);
    });

    it('passes pagination params', async () => {
      mockGet.mockResolvedValueOnce({ data: { data: [] } });

      await getMessages('conv-1', { before: 1000, limit: 20 });
      expect(mockGet).toHaveBeenCalledWith('/messages/conv-1', {
        params: { before: 1000, limit: 20 },
      });
    });
  });

  describe('sendMessage', () => {
    it('calls POST /messages with message data', async () => {
      mockPost.mockResolvedValueOnce({
        data: { data: { msgId: 'm1', content: 'Hello', status: 'sent' } },
      });

      const result = await sendMessage({
        conversationId: 'conv-1',
        chatType: 'private',
        toUid: 'u2',
        msgType: 0,
        content: 'Hello',
      });

      expect(mockPost).toHaveBeenCalledWith('/messages', {
        conversationId: 'conv-1',
        chatType: 'private',
        toUid: 'u2',
        msgType: 0,
        content: 'Hello',
      });
      expect(result.msgId).toBe('m1');
    });
  });

  describe('syncMessages', () => {
    it('calls POST /messages/sync with sync data', async () => {
      mockPost.mockResolvedValueOnce({
        data: { newMsgs: [], newSyncKeys: [{ key: 1000, msgCount: 1 }] },
      });

      const result = await syncMessages({
        syncKeys: [{ key: 0, msgCount: 0 }],
      });

      expect(mockPost).toHaveBeenCalledWith('/messages/sync', {
        syncKeys: [{ key: 0, msgCount: 0 }],
      });
      expect(result.newMsgs).toEqual([]);
    });
  });

  describe('markAsRead', () => {
    it('calls POST /messages/:convId/read', async () => {
      mockPost.mockResolvedValueOnce({ data: {} });

      await markAsRead('conv-1');
      expect(mockPost).toHaveBeenCalledWith('/messages/conv-1/read');
    });
  });
});
