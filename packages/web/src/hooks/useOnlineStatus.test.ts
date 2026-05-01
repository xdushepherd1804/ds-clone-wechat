import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useOnlineStatus, useOnlineStatuses } from './useOnlineStatus';
import { useContactStore } from '@/store';
import type { ContactItem } from '@/types';

function makeContact(overrides: Partial<ContactItem> = {}): ContactItem {
  return {
    id: 'c1',
    userId: 'u1',
    contactId: 'u2',
    remark: null,
    tags: [],
    status: 'active',
    contact: {
      id: 'u2',
      username: 'bob',
      nickname: 'Bob',
      avatar: null,
      status: 'online',
    },
    createdAt: new Date().toISOString(),
    ...overrides,
  } as ContactItem;
}

describe('useOnlineStatus', () => {
  beforeEach(() => {
    useContactStore.setState({ contacts: [], friendRequests: [], loading: false });
  });

  it('returns online true when contact status is online', () => {
    useContactStore.setState({
      contacts: [makeContact({ contactId: 'u2', contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null, status: 'online' } })],
    });

    const { result } = renderHook(() => useOnlineStatus('u2'));
    expect(result.current.isOnline).toBe(true);
    expect(result.current.status).toBe('online');
  });

  it('returns online false when contact status is offline', () => {
    useContactStore.setState({
      contacts: [makeContact({ contactId: 'u2', contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null, status: 'offline' } })],
    });

    const { result } = renderHook(() => useOnlineStatus('u2'));
    expect(result.current.isOnline).toBe(false);
    expect(result.current.status).toBe('offline');
  });

  it('returns offline for unknown userId', () => {
    const { result } = renderHook(() => useOnlineStatus('unknown'));
    expect(result.current.isOnline).toBe(false);
    expect(result.current.status).toBe('offline');
  });

  it('matches by contactId or contact.id', () => {
    useContactStore.setState({
      contacts: [makeContact({ contactId: 'u2', contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null, status: 'online' } })],
    });

    const byContactId = renderHook(() => useOnlineStatus('u2')).result;
    expect(byContactId.current.isOnline).toBe(true);

    const byContactField = renderHook(() => useOnlineStatus('u2')).result;
    expect(byContactField.current.isOnline).toBe(true);
  });
});

describe('useOnlineStatuses', () => {
  beforeEach(() => {
    useContactStore.setState({ contacts: [], friendRequests: [], loading: false });
  });

  it('returns statuses for multiple user IDs', () => {
    useContactStore.setState({
      contacts: [
        makeContact({ contactId: 'u2', contact: { id: 'u2', username: 'bob', nickname: 'Bob', avatar: null, status: 'online' } }),
        makeContact({ id: 'c2', contactId: 'u3', contact: { id: 'u3', username: 'carol', nickname: 'Carol', avatar: null, status: 'offline' } }),
      ],
    });

    const { result } = renderHook(() => useOnlineStatuses(['u2', 'u3', 'u4']));
    expect(result.current['u2'].isOnline).toBe(true);
    expect(result.current['u3'].isOnline).toBe(false);
    expect(result.current['u4'].isOnline).toBe(false);
  });

  it('returns empty object for empty array', () => {
    const { result } = renderHook(() => useOnlineStatuses([]));
    expect(Object.keys(result.current)).toHaveLength(0);
  });
});
