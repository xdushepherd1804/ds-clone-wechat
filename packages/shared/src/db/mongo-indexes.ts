/**
 * MongoDB 集合索引设计
 *
 * 数据库: wechat
 * 连接: mongodb://wechat:wechat_dev@localhost:27017/wechat
 *
 * 索引命名约定:
 *   - 单字段: idx_{collection}_{field}
 *   - 复合字段: idx_{collection}_{field1}_{field2}
 */

// ─── messages 集合 ───────────────────────────────────────────────────────────
//
// 消息主表 — 高写入、文档型存储。
// 写多读少 (写远多于更新)，消息体存储完整内容，不涉及关联查询。

export const messageIndexes = [
  // 业务主键 — 单条消息精确查找
  { spec: { msg_id: 1 }, options: { unique: true, name: 'idx_messages_msg_id' } },

  // 私聊会话时间线 — 按会话拉取历史消息 (分页)
  { spec: { from_uid: 1, to_uid: 1, created_at: -1 }, options: { name: 'idx_messages_private_timeline' } },

  // 群聊时间线 — 按群拉取历史消息 (分页)
  { spec: { to_group_id: 1, created_at: -1 }, options: { name: 'idx_messages_group_timeline' } },

  // 消息状态更新 — 标记已读/已送达时按 msg_id 定位
  { spec: { msg_id: 1, status: 1 }, options: { name: 'idx_messages_status' } },

  // TTL 索引 — 可选，用于自动清理旧消息 (示例保留 365 天)
  // { spec: { created_at: 1 }, options: { expireAfterSeconds: 31536000, name: 'idx_messages_ttl' } },
];

// ─── message_boxes 集合 ───────────────────────────────────────────────────────
//
// 用户消息箱 (收件箱模式) — 每个用户一个消息视图。
// 高并发写入，核心查询是"某用户未读消息列表"和"某会话消息列表"。

export const messageBoxIndexes = [
  // 用户最近消息 — 按用户分页查询消息列表 (按时间倒序)
  { spec: { user_id: 1, created_at: -1 }, options: { name: 'idx_message_boxes_user_timeline' } },

  // 会话消息列表 — 查看某个会话的完整消息
  { spec: { conversation_id: 1, created_at: -1 }, options: { name: 'idx_message_boxes_conversation' } },

  // 未读消息计数 — 查询某个用户某会话的未读消息
  { spec: { user_id: 1, conversation_id: 1, is_read: 1 }, options: { name: 'idx_message_boxes_unread' } },

  // 消息去重 — 防止同一消息重复投递
  { spec: { user_id: 1, msg_id: 1 }, options: { unique: true, name: 'idx_message_boxes_user_msg' } },
];

// ─── MongoDB 客户端索引创建脚本 ─────────────────────────────────────────────
//
// 使用方式:
//   npx tsx src/db/mongo-indexes.ts
//
// 生产环境建议通过迁移工具或 CI/CD 管理索引。

if (require.main === module) {
  void (async () => {
    // 仅导出定义，实际创建需连接 MongoDB 客户端
    console.log(JSON.stringify({ messageIndexes, messageBoxIndexes }, null, 2));
  })();
}
