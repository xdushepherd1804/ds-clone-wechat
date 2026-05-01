import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGet, mockPost, mockPatch, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockPatch: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock('./client', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    patch: mockPatch,
    delete: mockDelete,
  },
}));

import {
  getContacts,
  addContact,
  updateContact,
  deleteContact,
  getFriendRequests,
  sendFriendRequest,
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

  describe('addContact', () => {
    it('calls POST /contacts with data', async () => {
      mockPost.mockResolvedValueOnce({
        data: { data: makeContactItem({ id: 'c2', contact: { username: 'alice' } }) },
      });

      const result = await addContact({ contactId: 'u2', remark: 'Hello' });
      expect(mockPost).toHaveBeenCalledWith('/contacts', { contactId: 'u2', remark: 'Hello' });
      expect(result.contact.username).toBe('alice');
    });
  });

  describe('updateContact', () => {
    it('calls PATCH /contacts/:id with data', async () => {
      mockPatch.mockResolvedValueOnce({
        data: { data: makeContactItem({ id: 'c1', remark: 'Updated' }) },
      });

      const result = await updateContact('c1', { remark: 'Updated' });
      expect(mockPatch).toHaveBeenCalledWith('/contacts/c1', { remark: 'Updated' });
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
    it('calls PATCH /contacts/requests/:id with data', async () => {
      mockPatch.mockResolvedValueOnce({ data: {} });
      await handleFriendRequest('r1', { action: 'accept' });
      expect(mockPatch).toHaveBeenCalledWith('/contacts/requests/r1', { action: 'accept' });
    });
  });

  describe('searchContacts', () => {
    it('calls GET /contacts/search with keyword param', async () => {
      mockGet.mockResolvedValueOnce({
        data: { data: [{ id: 'c1', username: 'bob' }] },
      });

      const result = await searchContacts('bob');
      expect(mockGet).toHaveBeenCalledWith('/contacts/search', { params: { keyword: 'bob' } });
      expect(result).toHaveLength(1);
    });
  });
});
