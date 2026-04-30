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
};
