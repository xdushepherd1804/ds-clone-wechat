import { useContactStore } from '@/store';

export function useOnlineStatus(userId: string): {
  isOnline: boolean;
  status: string;
} {
  const contacts = useContactStore((s) => s.contacts);
  const contact = contacts.find(
    (c) => c.contactId === userId || c.contact.id === userId,
  );
  const status = contact?.contact.status || 'offline';
  return {
    isOnline: status === 'online',
    status,
  };
}

export function useOnlineStatuses(
  userIds: string[],
): Record<string, { isOnline: boolean; status: string }> {
  const contacts = useContactStore((s) => s.contacts);
  const result: Record<string, { isOnline: boolean; status: string }> = {};
  for (const uid of userIds) {
    const contact = contacts.find(
      (c) => c.contactId === uid || c.contact.id === uid,
    );
    const status = contact?.contact.status || 'offline';
    result[uid] = { isOnline: status === 'online', status };
  }
  return result;
}
