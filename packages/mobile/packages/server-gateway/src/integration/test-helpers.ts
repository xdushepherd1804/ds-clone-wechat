/**
 * Integration test helpers — in-memory mocks for Prisma, MongoDB, and Redis
 * that support multi-service coordination across the wechat-clone stack.
 */
import { vi } from 'vitest';
// Re-exported from session for convenience
export { InMemorySessionStore } from '../../../server-auth/src/session';

// ─── In-memory Prisma ─────────────────────────────────────────────────────────

interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  nickname: string;
  avatar: string | null;
  phone: string | null;
  status: string;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface ContactRecord {
  id: string;
  userId: string;
  contactId: string;
  remark: string | null;
  tags: string[];
  status: string;
  createdAt: Date;
  contact: UserRecord;
}

interface GroupRecord {
  id: string;
  name: string;
  avatar: string | null;
  ownerId: string;
  announcement: string | null;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
}

interface GroupMemberRecord {
  id: string;
  groupId: string;
  userId: string;
  role: string;
  nicknameInGroup: string | null;
  joinedAt: Date;
}

interface MomentRecord {
  id: string;
  userId: string;
  content: string | null;
  images: string[];
  location: string | null;
  visibility: string;
  createdAt: Date;
}

interface MomentLikeRecord {
  id: string;
  momentId: string;
  userId: string;
  createdAt: Date;
}

interface MomentCommentRecord {
  id: string;
  momentId: string;
  userId: string;
  replyToId: string | null;
  content: string;
  createdAt: Date;
}

let _userIdCounter = 0;
function nextUserId(): string {
  return `user_${++_userIdCounter}`;
}

let _contactIdCounter = 0;
function nextContactId(): string {
  return `contact_${++_contactIdCounter}`;
}

let _groupIdCounter = 0;
function nextGroupId(): string {
  return `group_${++_groupIdCounter}`;
}

let _memberIdCounter = 0;
function nextMemberId(): string {
  return `member_${++_memberIdCounter}`;
}

let _momentIdCounter = 0;
function nextMomentId(): string {
  return `moment_${++_momentIdCounter}`;
}

let _likeIdCounter = 0;
function nextLikeId(): string {
  return `like_${++_likeIdCounter}`;
}

let _commentIdCounter = 0;
function nextCommentId(): string {
  return `comment_${++_commentIdCounter}`;
}

export function resetCounters(): void {
  _userIdCounter = 0;
  _contactIdCounter = 0;
  _groupIdCounter = 0;
  _memberIdCounter = 0;
  _momentIdCounter = 0;
  _likeIdCounter = 0;
  _commentIdCounter = 0;
}

export function makeMockPrisma() {
  const users = new Map<string, UserRecord>();
  const contacts = new Map<string, ContactRecord>();
  const groups = new Map<string, GroupRecord>();
  const groupMembers = new Map<string, GroupMemberRecord[]>();
  const moments = new Map<string, MomentRecord>();
  const momentLikes = new Map<string, MomentLikeRecord[]>();
  const momentComments = new Map<string, MomentCommentRecord[]>();

  const userModel = {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const key = (where.id ?? where.username ?? where.phone) as string | undefined;
      if (!key) return null;
      for (const u of users.values()) {
        if (u.id === key || u.username === key || u.phone === key) return { ...u };
      }
      return null;
    }),
    findMany: vi.fn(async (args?: { where?: Record<string, unknown>; select?: Record<string, boolean>; take?: number }) => {
      const result: UserRecord[] = [];
      const seen = new Set<string>();
      for (const u of users.values()) {
        if (seen.has(u.id)) continue;
        seen.add(u.id);
        if (args?.where) {
          const w = args.where;
          if (w.id && typeof w.id === 'object') {
            const idFilter = w.id as { in?: string[]; notIn?: string[] };
            if (idFilter.in && !idFilter.in.includes(u.id)) continue;
            if (idFilter.notIn && idFilter.notIn.includes(u.id)) continue;
          }
          if (w.OR) {
            const ors = w.OR as Array<Record<string, { contains: string; mode?: string }>>;
            const matches = ors.some((cond) => {
              for (const [field, filter] of Object.entries(cond)) {
                if (filter.contains) {
                  const val = (u as any)[field];
                  if (typeof val === 'string' && val.toLowerCase().includes(filter.contains.toLowerCase())) return true;
                }
              }
              return false;
            });
            if (!matches) continue;
          }
        }
        result.push({ ...u });
      }
      const limit = args?.take ?? result.length;
      return result.slice(0, limit);
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const record: UserRecord = {
        id: nextUserId(),
        username: data.username as string,
        passwordHash: data.passwordHash as string,
        nickname: data.nickname as string,
        avatar: (data.avatar as string) ?? null,
        phone: (data.phone as string) ?? null,
        status: 'offline',
        lastSeenAt: null,
        createdAt: now,
        updatedAt: now,
      };
      users.set(record.id, record);
      return { ...record };
    }),
    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const key = (where.id ?? where.username) as string;
      let record: UserRecord | undefined;
      for (const u of users.values()) {
        if (u.id === key || u.username === key) { record = u; break; }
      }
      if (!record) throw new Error('Not found');
      Object.assign(record, data, { updatedAt: new Date() });
      return { ...record };
    }),
  };

  const contactModel = {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const w = where as { userId_contactId?: { userId: string; contactId: string }; id?: string };
      if (w.userId_contactId) {
        for (const c of contacts.values()) {
          if (c.userId === w.userId_contactId.userId && c.contactId === w.userId_contactId.contactId) {
            return { ...c, contact: { ...c.contact } };
          }
        }
      }
      if (w.id) {
        const c = contacts.get(w.id);
        return c ? { ...c, contact: { ...c.contact } } : null;
      }
      return null;
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      for (const c of contacts.values()) {
        let match = true;
        for (const [k, v] of Object.entries(where)) {
          if ((c as any)[k] !== v) { match = false; break; }
        }
        if (match) return { ...c, contact: { ...c.contact } };
      }
      return null;
    }),
    findMany: vi.fn(async (args?: { where?: Record<string, unknown>; include?: Record<string, boolean>; orderBy?: Record<string, string>; take?: number }) => {
      const results: ContactRecord[] = [];
      for (const c of contacts.values()) {
        if (args?.where) {
          const w = args.where;
          let match = true;
          for (const [k, v] of Object.entries(w)) {
            if (k === 'OR') {
              const ors = v as Array<Record<string, { contains: string; mode?: string }>>;
              const orMatch = ors.some((cond) => {
                for (const [field, filter] of Object.entries(cond)) {
                  if (filter.contains) {
                    const val = field === 'contact.username' ? c.contact?.username
                      : field === 'contact.nickname' ? c.contact?.nickname
                      : field === 'remark' ? c.remark
                      : (c as any)[field];
                    if (typeof val === 'string' && val.toLowerCase().includes(filter.contains.toLowerCase())) return true;
                  }
                }
                return false;
              });
              if (!orMatch) { match = false; break; }
            } else if (k === 'userId') {
              if (Array.isArray(v)) {
                if (!v.includes(c.userId)) { match = false; break; }
              } else if (c.userId !== v) { match = false; break; }
            } else if (k === 'contactId') {
              if (c.contactId !== v) { match = false; break; }
            } else if (k === 'status') {
              if (c.status !== v) { match = false; break; }
            }
          }
          if (!match) continue;
        }
        results.push({ ...c, contact: { ...c.contact } });
      }
      const limit = args?.take ?? results.length;
      return results.slice(0, limit);
    }),
    create: vi.fn(async ({ data, include }: { data: Record<string, unknown>; include?: { contact: boolean } }) => {
      const now = new Date();
      const contactUser = users.get(data.contactId as string);
      const record: ContactRecord = {
        id: nextContactId(),
        userId: data.userId as string,
        contactId: data.contactId as string,
        remark: (data.remark as string) ?? null,
        tags: (data.tags as string[]) ?? [],
        status: (data.status as string) ?? 'active',
        createdAt: now,
        contact: contactUser ?? { id: data.contactId as string, username: '', passwordHash: '', nickname: '', avatar: null, phone: null, status: 'offline', lastSeenAt: null, createdAt: now, updatedAt: now },
      };
      contacts.set(record.id, record);
      if (include?.contact) return { ...record, contact: { ...record.contact } };
      return { ...record };
    }),
    update: vi.fn(async ({ where, data, include }: { where: Record<string, unknown>; data: Record<string, unknown>; include?: { contact: boolean } }) => {
      const c = contacts.get(where.id as string);
      if (!c) throw new Error('Not found');
      Object.assign(c, data, { createdAt: c.createdAt });
      if (include?.contact) return { ...c, contact: { ...c.contact } };
      return { ...c };
    }),
    delete: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const w = where as { userId_contactId?: { userId: string; contactId: string }; id?: string };
      if (w.id) { contacts.delete(w.id); return; }
      if (w.userId_contactId) {
        for (const [k, c] of contacts) {
          if (c.userId === w.userId_contactId.userId && c.contactId === w.userId_contactId.contactId) {
            contacts.delete(k);
            return;
          }
        }
      }
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const toDelete: string[] = [];
      for (const [k, c] of contacts) {
        let match = true;
        for (const [field, val] of Object.entries(where)) {
          if ((c as any)[field] !== val) { match = false; break; }
        }
        if (match) toDelete.push(k);
      }
      for (const k of toDelete) contacts.delete(k);
      return { count: toDelete.length };
    }),
  };

  const groupModel = {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const g = groups.get(where.id as string);
      return g ? { ...g } : null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const record: GroupRecord = {
        id: nextGroupId(),
        name: data.name as string,
        avatar: (data.avatar as string) ?? null,
        ownerId: data.ownerId as string,
        announcement: (data.announcement as string) ?? null,
        memberCount: data.memberCount as number,
        createdAt: now,
        updatedAt: now,
      };
      groups.set(record.id, record);

      // Handle nested members.create for createGroup
      const membersData = (data as any).members?.create;
      if (membersData && Array.isArray(membersData)) {
        const memberRecords: GroupMemberRecord[] = [];
        for (const m of membersData) {
          memberRecords.push({
            id: nextMemberId(),
            groupId: record.id,
            userId: m.userId,
            role: m.role ?? 'member',
            nicknameInGroup: null,
            joinedAt: now,
          });
        }
        groupMembers.set(record.id, memberRecords);
      }

      return { ...record };
    }),
    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const g = groups.get(where.id as string);
      if (!g) throw new Error('Not found');
      if (data.memberCount !== undefined) {
        const incr = data.memberCount as { increment: number } | { decrement: number };
        if ('increment' in incr) g.memberCount += incr.increment;
        if ('decrement' in incr) g.memberCount -= incr.decrement;
      } else {
        Object.assign(g, data, { updatedAt: new Date() });
      }
      return { ...g };
    }),
    delete: vi.fn(),
    findMany: vi.fn(async () => []),
  };

  const groupMemberModel = {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const w = where as { groupId_userId?: { groupId: string; userId: string }; id?: string };
      if (w.groupId_userId) {
        const members = groupMembers.get(w.groupId_userId.groupId) ?? [];
        const m = members.find((m) => m.userId === w.groupId_userId!.userId);
        return m ? { ...m } : null;
      }
      if (w.id) {
        for (const members of groupMembers.values()) {
          const m = members.find((m) => m.id === w.id);
          if (m) return { ...m };
        }
      }
      return null;
    }),
    findMany: vi.fn(async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: Record<string, string> }) => {
      if (where?.groupId) {
        const members = groupMembers.get(where.groupId as string) ?? [];
        const copy = members.map((m) => ({ ...m }));
        if (where?.userId && typeof where.userId === 'object') {
          const idFilter = where.userId as { in: string[] };
          return copy.filter((m) => idFilter.in.includes(m.userId));
        }
        return copy;
      }
      return [];
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const record: GroupMemberRecord = {
        id: nextMemberId(),
        groupId: data.groupId as string,
        userId: data.userId as string,
        role: (data.role as string) ?? 'member',
        nicknameInGroup: (data.nicknameInGroup as string) ?? null,
        joinedAt: now,
      };
      const members = groupMembers.get(record.groupId) ?? [];
      members.push(record);
      groupMembers.set(record.groupId, members);
      return { ...record };
    }),
    update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const w = where as { groupId_userId?: { groupId: string; userId: string } };
      if (w.groupId_userId) {
        const members = groupMembers.get(w.groupId_userId.groupId) ?? [];
        const m = members.find((m) => m.userId === w.groupId_userId!.userId);
        if (!m) throw new Error('Not found');
        Object.assign(m, data);
        return { ...m };
      }
      throw new Error('Not found');
    }),
    delete: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const w = where as { groupId_userId?: { groupId: string; userId: string } };
      if (w.groupId_userId) {
        const members = groupMembers.get(w.groupId_userId.groupId) ?? [];
        const idx = members.findIndex((m) => m.userId === w.groupId_userId!.userId);
        if (idx >= 0) {
          members.splice(idx, 1);
          groupMembers.set(w.groupId_userId.groupId, members);
        }
      }
    }),
  };

  const momentModel = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const record: MomentRecord = {
        id: nextMomentId(),
        userId: data.userId as string,
        content: (data.content as string) ?? null,
        images: (data.images as string[]) ?? [],
        location: (data.location as string) ?? null,
        visibility: (data.visibility as string) ?? 'public',
        createdAt: now,
      };
      moments.set(record.id, record);
      return { ...record };
    }),
    findUnique: vi.fn(async (args: { where: Record<string, unknown>; include?: Record<string, boolean> }) => {
      const m = moments.get(args.where.id as string);
      if (!m) return null;
      const result: any = { ...m };
      if (args.include?.likes) {
        result.likes = (momentLikes.get(m.id) ?? []).map((l) => ({ ...l }));
      }
      if (args.include?.comments) {
        result.comments = (momentComments.get(m.id) ?? []).map((c) => ({ ...c }));
      }
      return result;
    }),
    findMany: vi.fn(async (args?: { where?: Record<string, unknown>; include?: Record<string, boolean>; orderBy?: Record<string, string>; take?: number }) => {
      const results: any[] = [];
      for (const m of moments.values()) {
        if (args?.where) {
          const w = args.where;
          if (w.userId && typeof w.userId === 'object') {
            const inFilter = w.userId as { in: string[] };
            if (!inFilter.in.includes(m.userId)) continue;
          } else if (w.userId && m.userId !== w.userId) continue;
          if (w.visibility && typeof w.visibility === 'object') {
            const inFilter = w.visibility as { in: string[] };
            if (!inFilter.in.includes(m.visibility)) continue;
          }
          if (w.OR) {
            const ors = w.OR as Array<Record<string, unknown>>;
            const orMatch = ors.some((cond) => {
              for (const [k, v] of Object.entries(cond)) {
                if (typeof v === 'object' && v !== null) {
                  const inFilter = v as { in: string[] };
                  if (inFilter.in && !inFilter.in.includes((m as any)[k])) return false;
                } else if ((m as any)[k] !== v) return false;
              }
              return true;
            });
            if (!orMatch) continue;
          }
          if (w.createdAt && typeof w.createdAt === 'object') {
            const lt = w.createdAt as { lt: Date };
            if (lt.lt && m.createdAt >= lt.lt) continue;
          }
        }
        const result: any = { ...m };
        if (args?.include?.likes) {
          result.likes = (momentLikes.get(m.id) ?? []).map((l) => ({ ...l }));
        }
        if (args?.include?.comments) {
          result.comments = (momentComments.get(m.id) ?? []).map((c) => ({ ...c }));
        }
        results.push(result);
      }
      const limit = args?.take ?? 50;
      return results.slice(-limit);
    }),
    delete: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      moments.delete(where.id as string);
    }),
  };

  const momentLikeModel = {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const w = where as { momentId_userId?: { momentId: string; userId: string } };
      if (w.momentId_userId) {
        const likes = momentLikes.get(w.momentId_userId.momentId) ?? [];
        const l = likes.find((l) => l.userId === w.momentId_userId!.userId);
        return l ? { ...l } : null;
      }
      return null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const record: MomentLikeRecord = {
        id: nextLikeId(),
        momentId: data.momentId as string,
        userId: data.userId as string,
        createdAt: now,
      };
      const likes = momentLikes.get(record.momentId) ?? [];
      likes.push(record);
      momentLikes.set(record.momentId, likes);
      return { ...record };
    }),
    delete: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const w = where as { momentId_userId?: { momentId: string; userId: string } };
      if (w.momentId_userId) {
        const likes = momentLikes.get(w.momentId_userId.momentId) ?? [];
        const idx = likes.findIndex((l) => l.userId === w.momentId_userId!.userId);
        if (idx >= 0) {
          likes.splice(idx, 1);
          momentLikes.set(w.momentId_userId.momentId, likes);
        }
      }
    }),
  };

  const momentCommentModel = {
    findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const id = where.id as string;
      for (const comments of momentComments.values()) {
        const c = comments.find((c) => c.id === id);
        if (c) return { ...c };
      }
      return null;
    }),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const now = new Date();
      const record: MomentCommentRecord = {
        id: nextCommentId(),
        momentId: data.momentId as string,
        userId: data.userId as string,
        replyToId: (data.replyToId as string) ?? null,
        content: data.content as string,
        createdAt: now,
      };
      const comments = momentComments.get(record.momentId) ?? [];
      comments.push(record);
      momentComments.set(record.momentId, comments);
      return { ...record };
    }),
    delete: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const id = where.id as string;
      for (const [momentId, comments] of momentComments) {
        const idx = comments.findIndex((c) => c.id === id);
        if (idx >= 0) {
          comments.splice(idx, 1);
          momentComments.set(momentId, comments);
          return;
        }
      }
    }),
  };

  const txModels = {
    contact: {
      findUnique: contactModel.findUnique,
      create: contactModel.create,
      update: contactModel.update,
      delete: contactModel.delete,
      deleteMany: contactModel.deleteMany,
    },
    group: {
      update: groupModel.update,
    },
    groupMember: {
      create: groupMemberModel.create,
      delete: groupMemberModel.delete,
    },
  };

  const $transaction = vi.fn(async (opsOrFn: any) => {
    if (typeof opsOrFn === 'function') {
      return opsOrFn(txModels);
    }
    for (const op of opsOrFn) {
      if (typeof op === 'function') await op();
      else await op;
    }
  });

  return {
    user: userModel,
    contact: contactModel,
    group: groupModel,
    groupMember: groupMemberModel,
    moment: momentModel,
    momentLike: momentLikeModel,
    momentComment: momentCommentModel,
    $transaction,
    // expose internal stores for direct inspection
    _users: users,
    _contacts: contacts,
    _groups: groups,
    _groupMembers: groupMembers,
    _moments: moments,
    _momentLikes: momentLikes,
    _momentComments: momentComments,
  };
}

// ─── In-memory MongoDB ────────────────────────────────────────────────────────

export function makeMockMongo() {
  const messages: any[] = [];
  const messageBoxes: any[] = [];

  const msgCol = {
    insertOne: vi.fn(async (doc: any) => {
      messages.push({ ...doc });
      return { insertedId: 'mock-id' };
    }),
    insertMany: vi.fn(async (docs: any[]) => true),
    findOne: vi.fn(async (filter: any) => {
      return messages.find((m) => m.msgId === filter.msgId) ?? null;
    }),
    find: vi.fn((filter: any) => {
      const queryResult = {
        _filter: filter,
        _sort: null as any,
        _skip: 0,
        _limit: Infinity,
        sort: vi.fn(function (this: any, s: any) { this._sort = s; return this; }),
        skip: vi.fn(function (this: any, n: number) { this._skip = n; return this; }),
        limit: vi.fn(function (this: any, n: number) { this._limit = n; return this; }),
        toArray: vi.fn(async function (this: any) {
          let result: any[];
          if (filter?.msgId && typeof filter.msgId === 'object' && filter.msgId.$in) {
            const ids: string[] = filter.msgId.$in;
            result = messages.filter((m) => ids.includes(m.msgId));
          } else if (filter?.msgId) {
            result = messages.filter((m) => m.msgId === filter.msgId);
          } else {
            result = [...messages];
          }
          if (this._sort) {
            const key = Object.keys(this._sort)[0];
            const dir = this._sort[key];
            result.sort((a, b) => {
              const va = a[key] instanceof Date ? a[key].getTime() : a[key];
              const vb = b[key] instanceof Date ? b[key].getTime() : b[key];
              return dir === 1 ? va - vb : vb - va;
            });
          }
          if (this._skip) result = result.slice(this._skip);
          if (this._limit < Infinity) result = result.slice(0, this._limit);
          return result;
        }),
      };
      return queryResult;
    }),
    updateOne: vi.fn(async (filter: any, update: any) => {
      const msgId = filter.msgId;
      const msg = messages.find((m) => m.msgId === msgId);
      if (msg && update.$set) Object.assign(msg, update.$set);
      return { modifiedCount: 1 };
    }),
  };

  const msgBoxCol = {
    insertMany: vi.fn(async (docs: any[]) => {
      for (const d of docs) messageBoxes.push({ ...d });
      return { insertedCount: docs.length };
    }),
    find: vi.fn((filter: any) => {
      const queryResult = {
        _filter: filter,
        _sort: null as any,
        _limit: Infinity,
        sort: vi.fn(function (this: any, s: any) { this._sort = s; return this; }),
        limit: vi.fn(function (this: any, n: number) { this._limit = n; return this; }),
        toArray: vi.fn(async function (this: any) {
          let result = messageBoxes.filter((b) => {
            for (const [k, v] of Object.entries(filter)) {
              if (k === 'createdAt' && typeof v === 'object') {
                const lt = v as { $lt: Date };
                if (lt.$lt && b.createdAt >= lt.$lt) return false;
              } else if ((b as any)[k] !== v) return false;
            }
            return true;
          });
          if (this._sort) {
            const key = Object.keys(this._sort)[0];
            const dir = this._sort[key];
            result.sort((a, b) => {
              const va = a[key] instanceof Date ? a[key].getTime() : a[key];
              const vb = b[key] instanceof Date ? b[key].getTime() : b[key];
              return dir === 1 ? va - vb : vb - va;
            });
          }
          if (this._limit < Infinity) result = result.slice(0, this._limit);
          return result;
        }),
      };
      return queryResult;
    }),
    updateMany: vi.fn(async (filter: any, update: any) => {
      let count = 0;
      for (const b of messageBoxes) {
        let match = true;
        for (const [k, v] of Object.entries(filter)) {
          if ((b as any)[k] !== v) { match = false; break; }
        }
        if (match) {
          if (update.$set) Object.assign(b, update.$set);
          count++;
        }
      }
      return { modifiedCount: count };
    }),
    aggregate: vi.fn(() => ({
      toArray: vi.fn(async () => {
        const convMap = new Map<string, { lastMsgTime: Date; unreadCount: number; lastMsgId: string }>();
        for (const b of messageBoxes) {
          const existing = convMap.get(b.conversationId);
          if (!existing || b.createdAt > existing.lastMsgTime) {
            convMap.set(b.conversationId, {
              lastMsgTime: b.createdAt,
              unreadCount: b.isRead ? 0 : 1,
              lastMsgId: b.msgId,
            });
          } else if (!b.isRead && existing) {
            existing.unreadCount++;
          }
        }
        return Array.from(convMap.entries()).map(([convId, info]) => ({
          _id: convId,
          lastMsgTime: info.lastMsgTime,
          unreadCount: info.unreadCount,
          lastMsgId: info.lastMsgId,
        }));
      }),
    })),
  };

  return {
    collection: vi.fn((name: string) => {
      if (name === 'messages') return msgCol;
      if (name === 'message_boxes') return msgBoxCol;
      return null;
    }),
    _messages: messages,
    _messageBoxes: messageBoxes,
    _msgCol: msgCol,
    _msgBoxCol: msgBoxCol,
  };
}

// ─── In-memory Redis ──────────────────────────────────────────────────────────

export function makeMockRedis() {
  const store = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const sortedSets = new Map<string, Map<string, number>>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }),
    setex: vi.fn(async (key: string, _ttl: number, value: string) => { store.set(key, value); return 'OK'; }),
    del: vi.fn(async (key: string) => { store.delete(key); return 1; }),
    incr: vi.fn(async (key: string) => {
      const val = parseInt(store.get(key) ?? '0', 10) + 1;
      store.set(key, String(val));
      return val;
    }),
    expire: vi.fn(async (_key: string, _ttl: number) => 1),
    disconnect: vi.fn(),
    quit: vi.fn(async () => 'OK'),
    mget: vi.fn(async (keys: string[]) => keys.map((k) => store.get(k) ?? null)),
    lpop: vi.fn(async (key: string) => {
      const list = lists.get(key) ?? [];
      const val = list.shift();
      if (val !== undefined) lists.set(key, list);
      return val ?? null;
    }),
    rpush: vi.fn(async (key: string, value: string) => {
      const list = lists.get(key) ?? [];
      list.push(value);
      lists.set(key, list);
      return list.length;
    }),
    zadd: vi.fn(async (key: string, score: number, member: string) => {
      const set = sortedSets.get(key) ?? new Map();
      set.set(member, score);
      sortedSets.set(key, set);
      return 1;
    }),
    zrem: vi.fn(async (key: string, member: string) => {
      const set = sortedSets.get(key);
      if (!set) return 0;
      const removed = set.delete(member);
      sortedSets.set(key, set);
      return removed ? 1 : 0;
    }),
    zrevrange: vi.fn(async (_key: string, _start: number, _stop: number) => []),
    pipeline: vi.fn(() => {
      const ops: Array<() => void> = [];
      return {
        zadd: vi.fn(function (this: any, ..._args: any[]) {
          ops.push(() => {});
          return this;
        }),
        zrem: vi.fn(function (this: any, ..._args: any[]) {
          ops.push(() => {});
          return this;
        }),
        exec: vi.fn(async () => {
          for (const op of ops) op();
          return [];
        }),
      };
    }),
    _store: store,
    _lists: lists,
    _sortedSets: sortedSets,
  };
}

// ─── JWT helpers ───────────────────────────────────────────────────────────────

import { createHmac } from 'node:crypto';

export function makeJwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}

// ─── WebSocket test utilities ─────────────────────────────────────────────────

/**
 * Mask a payload per WebSocket protocol (client→server masking).
 */
export function maskPayload(payload: Buffer, maskKey?: Buffer): { masked: Buffer; key: Buffer } {
  const key = maskKey ?? Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) {
    masked[i] = payload[i] ^ key[i % 4];
  }
  return { masked, key };
}

/**
 * Build a complete WebSocket frame (client→server, masked).
 * Only supports payload < 126 bytes.
 */
export function makeClientFrame(opcode: number, payload: Buffer): Buffer {
  const { masked, key } = maskPayload(payload);
  const header = Buffer.alloc(2 + 4);
  header[0] = 0x80 | opcode; // FIN + opcode
  header[1] = 0x80 | payload.length; // MASK + length
  key.copy(header, 2);
  return Buffer.concat([header, masked]);
}

export function makeClientTextFrame(text: string): Buffer {
  return makeClientFrame(0x1, Buffer.from(text, 'utf-8'));
}

export function makeClientPingFrame(): Buffer {
  return makeClientFrame(0x9, Buffer.from('ping'));
}

export function makeClientCloseFrame(code = 1000): Buffer {
  const body = Buffer.alloc(2);
  body.writeUInt16BE(code, 0);
  return makeClientFrame(0x8, body);
}

/**
 * Create a mock TCP socket for WebSocket tests.
 */
export function makeSocket() {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {};
  let destroyed = false;
  let writable = true;
  const written: Buffer[] = [];

  return {
    listeners,
    written,
    destroyed: false,
    writable: true,
    write: vi.fn(function (this: any, data: Buffer | string) {
      if (this.destroyed || !this.writable) return false;
      written.push(Buffer.isBuffer(data) ? data : Buffer.from(data as string));
      return true;
    }),
    destroy: vi.fn(function (this: any) {
      this.destroyed = true;
      this.writable = false;
    }),
    on: vi.fn(function (this: any, event: string, handler: (...args: any[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
      return this;
    }),
    emit(event: string, ...args: any[]) {
      const handlers = listeners[event] || [];
      for (const h of handlers) h(...args);
    },
    removeAllListeners() {
      for (const key of Object.keys(listeners)) delete listeners[key];
    },
  };
}

// ─── Default test constants ──────────────────────────────────────────────────

export const TEST_JWT_SECRET = 'integration-test-secret-key-32chars';
