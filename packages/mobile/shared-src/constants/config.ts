export const CONFIG = {
  /** 应用名称 */
  APP_NAME: 'WeChat Clone',

  /** API 前缀 */
  API_PREFIX: '/api/v1',

  /** 分页默认值 */
  PAGINATION: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
  },

  /** 消息限制 */
  MESSAGE: {
    /** 单次拉取历史消息最大条数 */
    MAX_SYNC_COUNT: 50,
    /** 会话列表最大显示数 */
    MAX_CONVERSATION_COUNT: 200,
    /** 消息撤回时限 (秒) */
    REVOKE_WINDOW_SEC: 120,
  },

  /** 群聊限制 */
  GROUP: {
    /** 群成员上限 */
    MAX_MEMBERS: 500,
    /** 群名称最大长度 */
    MAX_NAME_LENGTH: 30,
    /** 群公告最大长度 */
    MAX_ANNOUNCEMENT_LENGTH: 500,
  },

  /** 朋友圈限制 */
  MOMENT: {
    /** 单条朋友圈图片上限 */
    MAX_IMAGES: 9,
    /** 内容最大长度 */
    MAX_CONTENT_LENGTH: 2000,
  },

  /** WebSocket 连接 */
  WS: {
    /** 心跳间隔 (秒) */
    HEARTBEAT_INTERVAL_SEC: 30,
    /** 心跳超时 (秒) */
    HEARTBEAT_TIMEOUT_SEC: 60,
    /** 重连延迟 (毫秒) */
    RECONNECT_DELAY_MS: 1000,
    /** 最大重连延迟 (毫秒) */
    MAX_RECONNECT_DELAY_MS: 30000,
  },

  /** 安全 */
  SECURITY: {
    /** 密码哈希轮次 */
    BCRYPT_ROUNDS: 10,
    /** JWT 过期时间 (秒) */
    JWT_EXPIRES_IN: 7 * 24 * 3600,
    /** 最大登录尝试次数 */
    MAX_LOGIN_ATTEMPTS: 5,
    /** 登录锁定时间 (秒) */
    LOGIN_LOCK_SEC: 900,
  },

  /** 文件上传 */
  UPLOAD: {
    /** 头像最大 5 MB */
    AVATAR_MAX_SIZE: 5 * 1024 * 1024,
    /** 图片最大 20 MB */
    IMAGE_MAX_SIZE: 20 * 1024 * 1024,
    /** 文件最大 100 MB */
    FILE_MAX_SIZE: 100 * 1024 * 1024,
    /** 视频最大 200 MB */
    VIDEO_MAX_SIZE: 200 * 1024 * 1024,
    /** 允许的图片类型 */
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    /** 允许的文件类型 */
    ALLOWED_FILE_TYPES: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'application/zip',
    ],
  },
} as const;
