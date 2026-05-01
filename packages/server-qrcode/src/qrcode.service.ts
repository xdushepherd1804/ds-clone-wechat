/**
 * QR code service — generation and scan-result processing
 */
import type { QrCodePayload, QrCodeScanResult } from '@wechat-clone/shared';
import { ErrorCode, generateId } from '@wechat-clone/shared';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface QrCodeServiceDeps {
  /* future: PrismaClient, Redis */
}

export interface GenerateQrCodeInput {
  type: 'user_card' | 'group_invite';
  uid?: string;
  group_id?: string;
}

export interface ProcessScanInput {
  payload: QrCodePayload;
  currentUserId?: string;
}

// ─── Error ─────────────────────────────────────────────────────────────────

export class QrCodeError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = 'QrCodeError';
  }
}

// ─── Service ───────────────────────────────────────────────────────────────

export function createQrCodeService(_deps: QrCodeServiceDeps = {}) {
  /**
   * Build a QR code payload for user card
   */
  async function buildUserCardPayload(uid: string): Promise<QrCodePayload> {
    return {
      type: 'user_card',
      uid,
      created_at: Date.now(),
      expire_at: Date.now() + 7 * 24 * 3600 * 1000, // 7 days
    };
  }

  /**
   * Build a QR code payload for group invite
   */
  async function buildGroupInvitePayload(group_id: string): Promise<QrCodePayload> {
    const invite_code = generateId();
    return {
      type: 'group_invite',
      group_id,
      invite_code,
      created_at: Date.now(),
      expire_at: Date.now() + 24 * 3600 * 1000, // 24 hours
    };
  }

  /**
   * Process a scanned QR code and determine the action
   */
  async function processScan(input: ProcessScanInput): Promise<QrCodeScanResult> {
    const { payload, currentUserId } = input;

    // Check expiry
    if (payload.expire_at && Date.now() > payload.expire_at) {
      throw new QrCodeError(ErrorCode.QRCODE_EXPIRED, '二维码已过期');
    }

    switch (payload.type) {
      case 'user_card': {
        if (!payload.uid) {
          throw new QrCodeError(ErrorCode.QRCODE_INVALID, '无效的用户名片二维码');
        }
        if (currentUserId && payload.uid === currentUserId) {
          return { action: 'unknown', uid: payload.uid };
        }
        return { action: 'add_friend', uid: payload.uid };
      }

      case 'group_invite': {
        if (!payload.group_id || !payload.invite_code) {
          throw new QrCodeError(ErrorCode.QRCODE_INVALID, '无效的群邀请二维码');
        }
        return {
          action: 'join_group',
          group_id: payload.group_id,
          invite_code: payload.invite_code,
        };
      }

      default:
        throw new QrCodeError(ErrorCode.QRCODE_INVALID, '无法识别的二维码类型');
    }
  }

  return {
    buildUserCardPayload,
    buildGroupInvitePayload,
    processScan,
  };
}
