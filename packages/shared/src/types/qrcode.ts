/** QR code content types */
export interface QrCodePayload {
  type: 'user_card' | 'group_invite' | 'login';
  uid?: string;
  group_id?: string;
  invite_code?: string;
  login_token?: string;
  created_at?: number;
  expire_at?: number;
}

export interface QrCodeGenerateInput {
  type: 'user_card' | 'group_invite';
  uid?: string;
  group_id?: string;
  invite_code?: string;
  size?: number;
  includeLogo?: boolean;
}

export interface QrCodeScanResult {
  action: 'add_friend' | 'join_group' | 'login' | 'unknown';
  uid?: string;
  group_id?: string;
  invite_code?: string;
  login_token?: string;
}

export interface QrCodeError {
  code: number;
  message: string;
}
