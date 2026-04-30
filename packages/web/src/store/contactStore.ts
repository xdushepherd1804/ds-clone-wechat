import { create } from 'zustand';
import type { ContactItem, FriendRequest } from '@/types';

interface ContactState {
  contacts: ContactItem[];
  friendRequests: FriendRequest[];
  loading: boolean;

  setContacts: (contacts: ContactItem[]) => void;
  addContact: (contact: ContactItem) => void;
  updateContact: (contactId: string, updates: Partial<ContactItem>) => void;
  removeContact: (contactId: string) => void;
  setFriendRequests: (requests: FriendRequest[]) => void;
  addFriendRequest: (request: FriendRequest) => void;
  updateFriendRequest: (requestId: string, updates: Partial<FriendRequest>) => void;
  setLoading: (loading: boolean) => void;
}

export const useContactStore = create<ContactState>((set) => ({
  contacts: [],
  friendRequests: [],
  loading: false,

  setContacts: (contacts) => set({ contacts }),

  addContact: (contact) =>
    set((state) => ({ contacts: [...state.contacts, contact] })),

  updateContact: (contactId, updates) =>
    set((state) => ({
      contacts: state.contacts.map((c) => (c.id === contactId ? { ...c, ...updates } : c)),
    })),

  removeContact: (contactId) =>
    set((state) => ({
      contacts: state.contacts.filter((c) => c.id !== contactId),
    })),

  setFriendRequests: (requests) => set({ friendRequests: requests }),

  addFriendRequest: (request) =>
    set((state) => ({ friendRequests: [request, ...state.friendRequests] })),

  updateFriendRequest: (requestId, updates) =>
    set((state) => ({
      friendRequests: state.friendRequests.map((r) =>
        r.id === requestId ? { ...r, ...updates } : r,
      ),
    })),

  setLoading: (loading) => set({ loading }),
}));
