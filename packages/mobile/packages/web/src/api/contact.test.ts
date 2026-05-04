import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPost, mockPut, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPut: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('./client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    delete: mockDelete,
  },
}));

import {
  getContacts,
  sendFriendRequest,
  updateContact,
  deleteContact,
  getFriendRequests,
  handleFriendRequest,
  searchContacts,
} from './contact';

function makeContactItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    userId: 'u1',
    contactId: 'u2',
    remark: null,
    tags: [],
    status: 'active' as const,
    contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null, status: 'offline' },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('contact API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getContacts', () => {
    it('calls GET /contacts', async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: [makeContactItem()] },
      });

      const result = await getContacts();
      expect(mockGet).toHaveBeenCalledWith('/contacts');
      expect(result).toHaveLength(1);
    });
  });

  describe('updateContact', () => {
    it('calls PUT /contacts/:id with data', async () => {
      mockPut.mockResolvedValueOnce({
        data: { data: makeContactItem({ id: 'c1', remark: 'Updated' }) },
      });

      const result = await updateContact('c1', { remark: 'Updated' });
      expect(mockPut).toHaveBeenCalledWith('/contacts/c1', { remark: 'Updated' });
      expect(result.remark).toBe('Updated');
    });
  });

  describe('deleteContact', () => {
    it('calls DELETE /contacts/:id', async () => {
      mockDelete.mockResolvedValueOnce({ data: {} });
      await deleteContact('c1');
      expect(mockDelete).toHaveBeenCalledWith('/contacts/c1');
    });
  });

  describe('getFriendRequests', () => {
    it('calls GET /contacts/requests', async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: [{ id: 'r1', status: 'pending' }] },
      });

      const result = await getFriendRequests();
      expect(mockGet).toHaveBeenCalledWith('/contacts/requests');
      expect(result).toHaveLength(1);
    });
  });

  describe('sendFriendRequest', () => {
    it('calls POST /contacts/requests with data', async () => {
      mockPost.mockResolvedValueOnce({
        data: { data: { id: 'r1', status: 'pending' } },
      });

      const result = await sendFriendRequest({ toUid: 'u2', message: 'Hi' });
      expect(mockPost).toHaveBeenCalledWith('/contacts/requests', { toUid: 'u2', message: 'Hi' });
      expect(result.status).toBe('pending');
    });
  });

  describe('handleFriendRequest', () => {
    it('calls PUT /contacts/requests/:id with data', async () => {
      mockPut.mockResolvedValueOnce({ data: {} });
      await handleFriendRequest('r1', { action: 'accept' });
      expect(mockPut).toHaveBeenCalledWith('/contacts/requests/r1', { action: 'accept' });
    });
  });

  describe('searchContacts', () => {
    it('calls POST /contacts/search with keyword body', async () => {
      mockPost.mockResolvedValueOnce({
        data: { data: [{ id: 'c1', username: 'bob', isContact: false }] },
      });

      const result = await searchContacts('bob');
      expect(mockPost).toHaveBeenCalledWith('/contacts/search', { keyword: 'bob' });
      expect(result).toHaveLength(1);
    });
  });
});
