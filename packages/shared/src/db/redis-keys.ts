/**
 * Redis 键设计 — WeChat Clone
 *
 * 键命名约定:
 *   命名空间:类型:{参数}
 *
 * 数据类型选择:
 *   - STRING  → 简单 KV (Session, 在线标记)
 *   - HASH    → 对象属性需要独立读写 (用户信息缓存)
 *   - SET     → 无序去重集合 (群成员列表)
 *   - ZSET    → 有序集合 (最近联系人按时间排序)
 *   - LIST    → 消息队列 (离线消息)
 */

/** 键前缀 — 避免多项目共用 Redis 实例时冲突 */
const PREFIX = 'wc';

// ─── Session ─────────────────────────────────────────────────────────────────
// 用途: 用户登录态管理
// 类型: STRING (序列化 JSON)
// TTL:  7 天

export const RedisKeys = {
  /** 用户 Session 缓存 — session:{token} */
  session: (token: string) => `${PREFIX}:session:${token}`,

  /** Session TTL (秒) */
  SESSION_TTL: 7 * 24 * 3600,

  // ─── Online Status ─────────────────────────────────────────────────────────
  // 用途: 用户在线状态标记
  // 类型: STRING ("1" = 在线, 不存在 = 离线)
  // TTL:  心跳间隔 30s, 过期即视为离线

  /** 用户在线状态 — user:online:{uid} */
  userOnline: (uid: string) => `${PREFIX}:user:online:${uid}`,

  /** 在线状态 TTL (秒) — 30s 心跳 */
  ONLINE_TTL: 30,

  // ─── WebSocket Connection ───────────────────────────────────────────────────
  // 用途: 记录 WebSocket 连接信息 (网关节点、连接 ID)
  // 类型: HASH { node, connId, connectedAt }
  // TTL:  跟随连接生命周期

  /** WebSocket 连接信息 — ws:conn:{uid} */
  wsConn: (uid: string) => `${PREFIX}:ws:conn:${uid}`,

  // ─── Group Members Cache ────────────────────────────────────────────────────
  // 用途: 群成员列表热点缓存，减少 PostgreSQL 查询
  // 类型: SET (成员 uid 集合)
  // TTL:  不设过期，更新时重建

  /** 群成员缓存 — group:members:{gid} */
  groupMembers: (gid: string) => `${PREFIX}:group:members:${gid}`,

  // ─── User Profile Cache ────────────────────────────────────────────────────
  // 用途: 用户信息缓存，高频读取 (消息列表显示昵称/头像)
  // 类型: HASH { username, nickname, avatar }
  // TTL:  1 小时

  /** 用户信息缓存 — user:profile:{uid} */
  userProfile: (uid: string) => `${PREFIX}:user:profile:${uid}`,

  /** 用户信息缓存 TTL (秒) */
  USER_PROFILE_TTL: 3600,

  // ─── Recent Contacts ────────────────────────────────────────────────────────
  // 用途: 用户最近联系人列表，按最后消息时间排序
  // 类型: ZSET (member = contact_uid, score = last_message_timestamp)

  /** 最近联系人 — user:recent:{uid} */
  recentContacts: (uid: string) => `${PREFIX}:user:recent:${uid}`,

  // ─── Offline Message Queue ──────────────────────────────────────────────────
  // 用途: 离线消息队列，用户上线后拉取推送
  // 类型: LIST (FIFO, 消息 JSON)

  /** 离线消息队列 — user:offline:{uid} */
  offlineMessages: (uid: string) => `${PREFIX}:user:offline:${uid}`,

  // ─── Rate Limiting ──────────────────────────────────────────────────────────
  // 用途: API 速率限制计数器
  // 类型: STRING (计数器)
  // TTL:  窗口时长

  /** 速率限制键 — rate:{action}:{ip|uid}:{window} */
  rateLimit: (action: string, identifier: string, window: string) =>
    `${PREFIX}:rate:${action}:${identifier}:${window}`,

  // ─── Distributed Lock ──────────────────────────────────────────────────────
  // 用途: 分布式锁 (如创建群聊时防止并发重复)
  // 类型: STRING (NX + EX)

  /** 分布式锁 — lock:{resource} */
  lock: (resource: string) => `${PREFIX}:lock:${resource}`,
};

// ─── 键模式汇总 (用于运维/监控) ─────────────────────────────────────────────

/** 所有 Redis 键模式 — 供 SCAN/监控 使用 */
export const RedisKeyPatterns = {
  session: `${PREFIX}:session:*`,
  userOnline: `${PREFIX}:user:online:*`,
  wsConn: `${PREFIX}:ws:conn:*`,
  groupMembers: `${PREFIX}:group:members:*`,
  userProfile: `${PREFIX}:user:profile:*`,
  recentContacts: `${PREFIX}:user:recent:*`,
  offlineMessages: `${PREFIX}:user:offline:*`,
  rateLimit: `${PREFIX}:rate:*`,
  lock: `${PREFIX}:lock:*`,
};
