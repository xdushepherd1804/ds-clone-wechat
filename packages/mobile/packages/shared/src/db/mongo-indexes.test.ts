import { describe, it, expect } from 'vitest';
import { messageIndexes, messageBoxIndexes } from './mongo-indexes';

// Each index definition must have a `spec` and `options` with at least a `name`.
function isValidIndex(idx: unknown): boolean {
  if (!idx || typeof idx !== 'object') return false;
  const i = idx as Record<string, unknown>;
  return (
    typeof i.spec === 'object' &&
    i.spec !== null &&
    typeof i.options === 'object' &&
    i.options !== null &&
    typeof (i.options as Record<string, unknown>).name === 'string'
  );
}

function indexNames(indexes: Array<{ options: { name: string } }>): string[] {
  return indexes.map((i) => i.options.name);
}

// ─── messages 集合 ───────────────────────────────────────────────────────────

describe('messageIndexes', () => {
  it('has exactly 4 index definitions', () => {
    expect(messageIndexes).toHaveLength(4);
  });

  it.each(messageIndexes)('index $options.name is valid', (idx) => {
    expect(isValidIndex(idx)).toBe(true);
  });

  it('all index names are unique', () => {
    const names = indexNames(messageIndexes);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all index names have the idx_messages_ prefix', () => {
    for (const name of indexNames(messageIndexes)) {
      expect(name).toMatch(/^idx_messages_/);
    }
  });

  it('has a unique index on msg_id', () => {
    const idx = messageIndexes.find((i) => i.options.name === 'idx_messages_msg_id');
    expect(idx).toBeDefined();
    expect(idx!.options.unique).toBe(true);
    expect(idx!.spec).toEqual({ msg_id: 1 });
  });

  it('has a composite index for private message timeline', () => {
    const idx = messageIndexes.find((i) => i.options.name === 'idx_messages_private_timeline');
    expect(idx).toBeDefined();
    const spec = idx!.spec as Record<string, number>;
    expect(spec.from_uid).toBe(1);
    expect(spec.to_uid).toBe(1);
    expect(spec.created_at).toBe(-1);
  });

  it('has a composite index for group message timeline', () => {
    const idx = messageIndexes.find((i) => i.options.name === 'idx_messages_group_timeline');
    expect(idx).toBeDefined();
    const spec = idx!.spec as Record<string, number>;
    expect(spec.to_group_id).toBe(1);
    expect(spec.created_at).toBe(-1);
  });

  it('has an index for message status updates', () => {
    const idx = messageIndexes.find((i) => i.options.name === 'idx_messages_status');
    expect(idx).toBeDefined();
    const spec = idx!.spec as Record<string, number>;
    expect(spec.msg_id).toBe(1);
    expect(spec.status).toBe(1);
  });
});

// ─── message_boxes 集合 ───────────────────────────────────────────────────────

describe('messageBoxIndexes', () => {
  it('has exactly 4 index definitions', () => {
    expect(messageBoxIndexes).toHaveLength(4);
  });

  it.each(messageBoxIndexes)('index $options.name is valid', (idx) => {
    expect(isValidIndex(idx)).toBe(true);
  });

  it('all index names are unique', () => {
    const names = indexNames(messageBoxIndexes);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all index names have the idx_message_boxes_ prefix', () => {
    for (const name of indexNames(messageBoxIndexes)) {
      expect(name).toMatch(/^idx_message_boxes_/);
    }
  });

  it('has a composite index for user timeline', () => {
    const idx = messageBoxIndexes.find((i) => i.options.name === 'idx_message_boxes_user_timeline');
    expect(idx).toBeDefined();
    const spec = idx!.spec as Record<string, number>;
    expect(spec.user_id).toBe(1);
    expect(spec.created_at).toBe(-1);
  });

  it('has a composite index for conversation queries', () => {
    const idx = messageBoxIndexes.find(
      (i) => i.options.name === 'idx_message_boxes_conversation',
    );
    expect(idx).toBeDefined();
    const spec = idx!.spec as Record<string, number>;
    expect(spec.conversation_id).toBe(1);
    expect(spec.created_at).toBe(-1);
  });

  it('has a composite index for unread message counting', () => {
    const idx = messageBoxIndexes.find((i) => i.options.name === 'idx_message_boxes_unread');
    expect(idx).toBeDefined();
    const spec = idx!.spec as Record<string, number>;
    expect(spec.user_id).toBe(1);
    expect(spec.conversation_id).toBe(1);
    expect(spec.is_read).toBe(1);
  });

  it('has a unique composite index for message deduplication', () => {
    const idx = messageBoxIndexes.find((i) => i.options.name === 'idx_message_boxes_user_msg');
    expect(idx).toBeDefined();
    expect(idx!.options.unique).toBe(true);
    const spec = idx!.spec as Record<string, number>;
    expect(spec.user_id).toBe(1);
    expect(spec.msg_id).toBe(1);
  });
});

// ─── Cross-collection constraints ─────────────────────────────────────────────

describe('index consistency across collections', () => {
  it('no duplicate index names across both collections', () => {
    const allNames = [...indexNames(messageIndexes), ...indexNames(messageBoxIndexes)];
    expect(new Set(allNames).size).toBe(allNames.length);
  });

  it('both collections sort timelines by created_at descending', () => {
    const timelineIndexes = [
      ...messageIndexes.filter((i) => i.options.name.includes('timeline')),
      ...messageBoxIndexes.filter((i) => i.options.name.includes('timeline')),
    ];
    expect(timelineIndexes.length).toBeGreaterThanOrEqual(3);
    for (const idx of timelineIndexes) {
      const spec = idx.spec as Record<string, number>;
      expect(spec.created_at).toBe(-1);
    }
  });
});
