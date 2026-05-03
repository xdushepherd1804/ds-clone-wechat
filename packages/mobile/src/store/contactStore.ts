import { create } from 'zustand';
import type { ContactItem, FriendRequest } from '@wechat-clone/shared';
import {
  getContacts,
  getFriendRequests,
} from '@/api/contact';

export interface ContactState {
  contacts: ContactItem[];
  friendRequests: FriendRequest[];
  loading: boolean;

  fetchContacts: () => Promise<void>;
  fetchFriendRequests: () => Promise<void>;
  addContact: (contact: ContactItem) => void;
  removeContact: (uid: string) => void;
  updateContact: (uid: string, updates: Partial<ContactItem>) => void;
}

const EMPTY_CONTACTS: ContactItem[] = [];
const EMPTY_REQUESTS: FriendRequest[] = [];

export const useContactStore = create<ContactState>((set, get) => ({
  contacts: [],
  friendRequests: [],
  loading: false,

  fetchContacts: async () => {
    set({ loading: true });
    try {
      const data = await getContacts();
      set({ contacts: data });
    } catch {
      // silently fail
    } finally {
      set({ loading: false });
    }
  },

  fetchFriendRequests: async () => {
    try {
      const data = await getFriendRequests();
      set({ friendRequests: data });
    } catch {
      // silently fail
    }
  },

  addContact: (contact) =>
    set((state) => ({
      contacts: [...state.contacts, contact],
    })),

  removeContact: (uid) =>
    set((state) => ({
      contacts: (state.contacts || EMPTY_CONTACTS).filter(
        (c) => c.contactId !== uid,
      ),
    })),

  updateContact: (uid, updates) =>
    set((state) => ({
      contacts: (state.contacts || EMPTY_CONTACTS).map((c) =>
        c.contactId === uid ? { ...c, ...updates } : c,
      ),
    })),
}));
