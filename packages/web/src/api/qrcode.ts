import apiClient from './client';
import type { QrCodePayload, QrCodeScanResult, ApiResponse } from '@/types';

export async function getUserCardQrCode(
  uid: string,
  format: 'png' | 'json' = 'json',
): Promise<{ dataUrl: string; payload: QrCodePayload }> {
  const res = await apiClient.get<ApiResponse<{ dataUrl: string; payload: QrCodePayload }>>(
    `/qrcode/user-card`,
    { params: { uid, format } },
  );
  return res.data.data!;
}

export async function getGroupInviteQrCode(
  groupId: string,
  format: 'png' | 'json' = 'json',
): Promise<{ dataUrl: string; payload: QrCodePayload }> {
  const res = await apiClient.get<ApiResponse<{ dataUrl: string; payload: QrCodePayload }>>(
    `/qrcode/group-invite`,
    { params: { group_id: groupId, format } },
  );
  return res.data.data!;
}

export async function processScanResult(
  payload: QrCodePayload,
): Promise<QrCodeScanResult> {
  const res = await apiClient.post<ApiResponse<QrCodeScanResult>>(`/qrcode/scan-result`, {
    payload,
  });
  return res.data.data!;
}
