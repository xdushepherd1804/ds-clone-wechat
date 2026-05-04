import apiClient from './client';
import type {
  ApiResponse,
  QrCodePayload,
  QrCodeScanResult,
} from '@wechat-clone/shared';

export interface QrCodeData {
  dataUrl: string;
  payload: QrCodePayload;
}

export async function getUserCard(
  uid: string,
  format: 'json' | 'png' = 'json',
): Promise<QrCodeData> {
  const res = await apiClient.get<ApiResponse<QrCodeData>>(
    '/qrcode/user-card',
    { params: { uid, format } },
  );
  return res.data.data!;
}

export async function getGroupInvite(
  groupId: string,
  format: 'json' | 'png' = 'json',
): Promise<QrCodeData> {
  const res = await apiClient.get<ApiResponse<QrCodeData>>(
    '/qrcode/group-invite',
    { params: { group_id: groupId, format } },
  );
  return res.data.data!;
}

export async function getScanResult(
  payload: QrCodePayload,
): Promise<QrCodeScanResult> {
  const res = await apiClient.post<ApiResponse<QrCodeScanResult>>(
    '/qrcode/scan-result',
    { payload },
  );
  return res.data.data!;
}
