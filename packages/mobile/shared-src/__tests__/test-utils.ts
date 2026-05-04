/**
 * Shared test utilities — mock factories, assertions, and setup helpers.
 */

/** Create a frozen snapshot of a value for deterministic comparison */
export function snapshot<T>(value: T): Readonly<T> {
  return Object.freeze(structuredClone(value));
}

/** Generate a unique test ID with optional prefix */
export function tid(prefix = 'test'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Standard test user fixture */
export function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: tid('uid'),
    username: `user_${tid()}`,
    passwordHash: '$2b$10$placeholder',
    nickname: 'Test User',
    avatar: 'https://example.com/avatar.png',
    phone: `+86${String(Math.random()).slice(2, 13)}`,
    status: 'online',
    lastSeenAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Standard test contact fixture */
export function mockContact(overrides: Record<string, unknown> = {}) {
  return {
    user_id: tid('uid'),
    contact_id: tid('uid'),
    remark: '',
    tags: [],
    status: 'accepted',
    createdAt: new Date(),
    ...overrides,
  };
}

/** Standard test group fixture */
export function mockGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: tid('gid'),
    name: 'Test Group',
    avatar: 'https://example.com/group.png',
    ownerId: tid('uid'),
    announcement: '',
    memberCount: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

/** Standard test moment fixture */
export function mockMoment(overrides: Record<string, unknown> = {}) {
  return {
    id: tid('mid'),
    userId: tid('uid'),
    content: 'Test moment content',
    images: [],
    location: null,
    visibility: 'public',
    createdAt: new Date(),
    ...overrides,
  };
}

/** Standard test message fixture */
export function mockMessage(overrides: Record<string, unknown> = {}) {
  return {
    msg_id: tid('msg'),
    from_uid: tid('uid'),
    to_uid: tid('uid'),
    to_group_id: null,
    msg_type: 'text',
    content: { text: 'Hello, world!' },
    status: 'sent',
    created_at: new Date(),
    ...overrides,
  };
}
