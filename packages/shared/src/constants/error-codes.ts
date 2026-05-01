/** 业务错误码定义 */
export const ErrorCode = {
  SUCCESS: 0,

  // 通用错误 1xxx
  UNKNOWN: 1000,
  INVALID_PARAM: 1001,
  RATE_LIMITED: 1002,
  INTERNAL_ERROR: 1003,
  NOT_FOUND: 1004,
  FORBIDDEN: 1005,

  // 认证 2xxx
  UNAUTHORIZED: 2000,
  TOKEN_EXPIRED: 2001,
  TOKEN_INVALID: 2002,
  LOGIN_FAILED: 2003,
  USERNAME_TAKEN: 2004,
  PASSWORD_TOO_WEAK: 2005,
  OLD_PASSWORD_WRONG: 2006,

  // 消息 3xxx
  MSG_SEND_FAILED: 3000,
  MSG_NOT_FOUND: 3001,
  CONVERSATION_NOT_FOUND: 3002,
  MSG_ALREADY_READ: 3003,

  // 通讯录 4xxx
  CONTACT_ALREADY_EXISTS: 4000,
  CONTACT_NOT_FOUND: 4001,
  FRIEND_REQUEST_NOT_FOUND: 4002,
  FRIEND_REQUEST_ALREADY_HANDLED: 4003,
  CONTACT_BLOCKED: 4004,

  // 群聊 5xxx
  GROUP_NOT_FOUND: 5000,
  GROUP_PERMISSION_DENIED: 5001,
  GROUP_MEMBER_ALREADY_EXISTS: 5002,
  GROUP_MEMBER_NOT_FOUND: 5003,
  GROUP_FULL: 5004,

  // 朋友圈 6xxx
  MOMENT_NOT_FOUND: 6000,
  MOMENT_PERMISSION_DENIED: 6001,
  COMMENT_NOT_FOUND: 6002,

  // 文件 7xxx
  FILE_TOO_LARGE: 7000,
  FILE_TYPE_NOT_ALLOWED: 7001,
  FILE_UPLOAD_FAILED: 7002,
  FILE_NOT_FOUND: 7003,

  // 音视频通话 9xxx
  CALL_NOT_FOUND: 9000,
  CALL_ALREADY_IN_CALL: 9001,
  CALL_USER_BUSY: 9002,
  CALL_TIMEOUT: 9003,
  CALL_REJECTED: 9004,
  CALL_SIGNALING_FAILED: 9005,

  // 红包 8xxx
  RED_PACKET_NOT_FOUND: 8000,
  RED_PACKET_EXPIRED: 8001,
  RED_PACKET_FINISHED: 8002,
  RED_PACKET_ALREADY_OPENED: 8003,
  RED_PACKET_INSUFFICIENT_BALANCE: 8004,

  // 二维码 10xxx
  QRCODE_GENERATE_FAILED: 10000,
  QRCODE_INVALID: 10001,
  QRCODE_EXPIRED: 10002,
  INVITE_CODE_INVALID: 10003,
  INVITE_CODE_EXPIRED: 10004,

  // 贴图 11xxx
  STICKER_NOT_FOUND: 11000,
  STICKER_UPLOAD_FAILED: 11001,
  STICKER_ALREADY_FAVORITED: 11002,
  STICKER_NOT_FAVORITED: 11003,
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ErrorMessage: Record<ErrorCodeValue, string> = {
  [ErrorCode.SUCCESS]: 'success',

  [ErrorCode.UNKNOWN]: '未知错误',
  [ErrorCode.INVALID_PARAM]: '参数错误',
  [ErrorCode.RATE_LIMITED]: '请求过于频繁',
  [ErrorCode.INTERNAL_ERROR]: '服务器内部错误',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.FORBIDDEN]: '无权限访问',

  [ErrorCode.UNAUTHORIZED]: '未登录或登录已过期',
  [ErrorCode.TOKEN_EXPIRED]: '登录已过期',
  [ErrorCode.TOKEN_INVALID]: '无效的令牌',
  [ErrorCode.LOGIN_FAILED]: '用户名或密码错误',
  [ErrorCode.USERNAME_TAKEN]: '用户名已被注册',
  [ErrorCode.PASSWORD_TOO_WEAK]: '密码强度不足',
  [ErrorCode.OLD_PASSWORD_WRONG]: '原密码错误',

  [ErrorCode.MSG_SEND_FAILED]: '消息发送失败',
  [ErrorCode.MSG_NOT_FOUND]: '消息不存在',
  [ErrorCode.CONVERSATION_NOT_FOUND]: '会话不存在',
  [ErrorCode.MSG_ALREADY_READ]: '消息已读',

  [ErrorCode.CONTACT_ALREADY_EXISTS]: '联系人已存在',
  [ErrorCode.CONTACT_NOT_FOUND]: '联系人不存在',
  [ErrorCode.FRIEND_REQUEST_NOT_FOUND]: '好友申请不存在',
  [ErrorCode.FRIEND_REQUEST_ALREADY_HANDLED]: '好友申请已处理',
  [ErrorCode.CONTACT_BLOCKED]: '对方已将你拉黑',

  [ErrorCode.GROUP_NOT_FOUND]: '群聊不存在',
  [ErrorCode.GROUP_PERMISSION_DENIED]: '无权限操作',
  [ErrorCode.GROUP_MEMBER_ALREADY_EXISTS]: '用户已在群中',
  [ErrorCode.GROUP_MEMBER_NOT_FOUND]: '群成员不存在',
  [ErrorCode.GROUP_FULL]: '群成员已满',

  [ErrorCode.MOMENT_NOT_FOUND]: '朋友圈不存在',
  [ErrorCode.MOMENT_PERMISSION_DENIED]: '无权限查看',
  [ErrorCode.COMMENT_NOT_FOUND]: '评论不存在',

  [ErrorCode.FILE_TOO_LARGE]: '文件过大',
  [ErrorCode.FILE_TYPE_NOT_ALLOWED]: '文件类型不支持',
  [ErrorCode.FILE_UPLOAD_FAILED]: '文件上传失败',
  [ErrorCode.FILE_NOT_FOUND]: '文件不存在',

  [ErrorCode.CALL_NOT_FOUND]: '通话不存在',
  [ErrorCode.CALL_ALREADY_IN_CALL]: '您正在通话中',
  [ErrorCode.CALL_USER_BUSY]: '对方正在通话中',
  [ErrorCode.CALL_TIMEOUT]: '对方无人接听',
  [ErrorCode.CALL_REJECTED]: '对方已拒绝',
  [ErrorCode.CALL_SIGNALING_FAILED]: '信令发送失败',

  [ErrorCode.RED_PACKET_NOT_FOUND]: '红包不存在',
  [ErrorCode.RED_PACKET_EXPIRED]: '红包已过期',
  [ErrorCode.RED_PACKET_FINISHED]: '红包已抢完',
  [ErrorCode.RED_PACKET_ALREADY_OPENED]: '已领取过该红包',
  [ErrorCode.RED_PACKET_INSUFFICIENT_BALANCE]: '余额不足',

  [ErrorCode.QRCODE_GENERATE_FAILED]: '二维码生成失败',
  [ErrorCode.QRCODE_INVALID]: '无效的二维码',
  [ErrorCode.QRCODE_EXPIRED]: '二维码已过期',
  [ErrorCode.INVITE_CODE_INVALID]: '无效的邀请码',
  [ErrorCode.INVITE_CODE_EXPIRED]: '邀请码已过期',

  [ErrorCode.STICKER_NOT_FOUND]: '贴图不存在',
  [ErrorCode.STICKER_UPLOAD_FAILED]: '贴图上传失败',
  [ErrorCode.STICKER_ALREADY_FAVORITED]: '已收藏该贴图',
  [ErrorCode.STICKER_NOT_FAVORITED]: '未收藏该贴图',
};
