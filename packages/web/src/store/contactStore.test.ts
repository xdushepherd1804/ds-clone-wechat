import { describe, it, expect, beforeEach } from 'vitest';
import { useContactStore } from './contactStore';
import type { ContactItem, FriendRequest } from '@/types';

function makeContact(overrides: Partial<ContactItem> = {}): ContactItem {
  return {
    id: 'c1',
    userId: 'u1',
    contactId: 'u2',
    remark: null,
    tags: [],
    status: 'active',
    contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null, status: 'offline' },
    createdAt: new Date().toISOString(),
    ...overrides,
  } as ContactItem;
}

function makeFriendRequest(overrides: Partial<FriendRequest> = {}): FriendRequest {
  return {
    id: 'r1',
    fromUid: 'u3',
    toUid: 'u1',
    fromUser: { id: 'u3', nickname: 'Eve', avatar: null },
    message: 'Hello!',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  } as FriendRequest;
}

describe('contactStore', () => {
  beforeEach(() => {
    useContactStore.setState({
      contacts: [],
      friendRequests: [],
      loading: false,
    });
  });

  describe('initial state', () => {
    it('has empty contacts, empty requests, loading false', () => {
      const state = useContactStore.getState();
      expect(state.contacts).toEqual([]);
      expect(state.friendRequests).toEqual([]);
      expect(state.loading).toBe(false);
    });
  });

  describe('setContacts', () => {
    it('sets the contacts list', () => {
      const contacts = [makeContact(), makeContact({ id: 'c2' })];
      useContactStore.getState().setContacts(contacts);

      const state = useContactStore.getState();
      expect(state.contacts).toHaveLength(2);
    });
  });

  describe('addContact', () => {
    it('appends a contact to the list', () => {
      useContactStore.getState().setContacts([makeContact()]);
      useContactStore.getState().addContact(makeContact({ id: 'c2' }));

      const state = useContactStore.getState();
      expect(state.contacts).toHaveLength(2);
    });
  });

  describe('updateContact', () => {
    it('updates a contact by ID', () => {
      useContactStore.getState().setContacts([
        makeContact({ id: 'c1', remark: null }),
        makeContact({ id: 'c2', remark: null }),
      ]);

      useContactStore.getState().updateContact('c1', { remark: 'Best friend' });

      const updated = useContactStore.getState().contacts.find((c) => c.id === 'c1');
      expect(updated?.remark).toBe('Best friend');
    });

    it('does not modify other contacts', () => {
      useContactStore.getState().setContacts([makeContact({ id: 'c1' })]);
      useContactStore.getState().updateContact('c2', { remark: 'X' });

      const c1 = useContactStore.getState().contacts[0];
      expect(c1.remark).toBeNull();
    });
  });

  describe('removeContact', () => {
    it('removes a contact by ID', () => {
      useContactStore.getState().setContacts([
        makeContact({ id: 'c1' }),
        makeContact({ id: 'c2' }),
      ]);

      useContactStore.getState().removeContact('c1');

      const state = useContactStore.getState();
      expect(state.contacts).toHaveLength(1);
      expect(state.contacts[0].id).toBe('c2');
    });

    it('does nothing if contact not found', () => {
      useContactStore.getState().setContacts([makeContact({ id: 'c1' })]);
      useContactStore.getState().removeContact('c999');

      expect(useContactStore.getState().contacts).toHaveLength(1);
    });
  });

  describe('setFriendRequests', () => {
    it('sets the friend requests list', () => {
      const requests = [makeFriendRequest(), makeFriendRequest({ id: 'r2' })];
      useContactStore.getState().setFriendRequests(requests);

      expect(useContactStore.getState().friendRequests).toHaveLength(2);
    });
  });

  describe('addFriendRequest', () => {
    it('adds a friend request to the front of the list', () => {
      useContactStore.getState().setFriendRequests([makeFriendRequest({ id: 'r1' })]);
      useContactStore.getState().addFriendRequest(makeFriendRequest({ id: 'r2' }));

      const state = useContactStore.getState();
      expect(state.friendRequests).toHaveLength(2);
      expect(state.friendRequests[0].id).toBe('r2');
    });
  });

  describe('updateFriendRequest', () => {
    it('updates a friend request by ID', () => {
      useContactStore.getState().setFriendRequests([
        makeFriendRequest({ id: 'r1', status: 'pending' }),
      ]);

      useContactStore.getState().updateFriendRequest('r1', { status: 'accepted' });

      const updated = useContactStore.getState().friendRequests[0];
      expect(updated.status).toBe('accepted');
    });
  });

  describe('setLoading', () => {
    it('sets loading state', () => {
      useContactStore.getState().setLoading(true);
      expect(useContactStore.getState().loading).toBe(true);

      useContactStore.getState().setLoading(false);
      expect(useContactStore.getState().loading).toBe(false);
    });
  });
});
