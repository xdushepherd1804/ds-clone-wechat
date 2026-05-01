import { useEffect, useCallback, useState } from 'react';
import { useContactStore } from '@/store';
import {
  getContacts,
  getFriendRequests,
  handleFriendRequest,
  searchContacts,
} from '@/api/contact';
import type { ContactItem, FriendRequest, ContactSearchResult } from '@/types';

export function useFetchContacts() {
  const { setContacts, setFriendRequests, setLoading, loading } =
    useContactStore();
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [contactData, requestData] = await Promise.all([
        getContacts(),
        getFriendRequests(),
      ]);
      setContacts(contactData);
      setFriendRequests(requestData);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || '加载通讯录失败';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [setContacts, setFriendRequests, setLoading]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { loading, error, refetch: fetch };
}

export function useHandleFriendRequest() {
  const { updateFriendRequest, addContact, removeContact, contacts } =
    useContactStore();
  const [loading, setLoading] = useState(false);

  const accept = useCallback(
    async (requestId: string): Promise<boolean> => {
      setLoading(true);
      try {
        await handleFriendRequest(requestId, { action: 'accept' });
        updateFriendRequest(requestId, { status: 'accepted' });
        await getContacts().then((data) => {
          const existingIds = new Set(contacts.map((c) => c.id));
          const newContacts = data.filter((c) => !existingIds.has(c.id));
          newContacts.forEach((c) => addContact(c));
        });
        return true;
      } catch {
        return false;
      } finally {
        setLoading(false);
      }
    },
    [updateFriendRequest, addContact, contacts],
  );

  const reject = useCallback(
    async (requestId: string): Promise<boolean> => {
      setLoading(true);
      try {
        await handleFriendRequest(requestId, { action: 'reject' });
        updateFriendRequest(requestId, { status: 'rejected' });
        return true;
      } catch {
        return false;
      } finally {
        setLoading(false);
      }
    },
    [updateFriendRequest],
  );

  return { accept, reject, loading };
}

export function useContactSearch() {
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchContacts(keyword);
      setResults(data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || '搜索失败';
      setError(msg);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, error, search };
}

export function useDeleteContact() {
  const { removeContact } = useContactStore();
  const [loading, setLoading] = useState(false);

  const remove = useCallback(
    async (contactId: string): Promise<boolean> => {
      setLoading(true);
      try {
        const { deleteContact } = await import('@/api/contact');
        await deleteContact(contactId);
        removeContact(contactId);
        return true;
      } catch {
        return false;
      } finally {
        setLoading(false);
      }
    },
    [removeContact],
  );

  return { remove, loading };
}
