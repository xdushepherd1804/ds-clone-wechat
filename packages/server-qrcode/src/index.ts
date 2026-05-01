/**
 * @wechat-clone/server-qrcode — QR code service
 */

export { createQrCodeService, QrCodeError } from './qrcode.service';
export type {
  QrCodeServiceDeps,
  GenerateQrCodeInput,
  ProcessScanInput,
} from './qrcode.service';
