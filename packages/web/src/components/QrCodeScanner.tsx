import { useState, useRef, useCallback } from 'react';
import { Button, Modal, message } from 'antd';
import { ScanOutlined } from '@ant-design/icons';
import { processScanResult } from '@/api/qrcode';
import type { QrCodePayload } from '@/types';

interface QrCodeScannerProps {
  onScanSuccess?: (action: string, params: { uid?: string; group_id?: string; invite_code?: string }) => void;
}

export default function QrCodeScanner({ onScanSuccess }: QrCodeScannerProps) {
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScanResult = useCallback(
    async (payload: QrCodePayload) => {
      try {
        const result = await processScanResult(payload);
        if (result.action === 'add_friend' && result.uid) {
          message.success('识别成功：添加好友');
          onScanSuccess?.('add_friend', { uid: result.uid });
          setOpen(false);
        } else if (result.action === 'join_group' && result.group_id) {
          message.success('识别成功：加入群聊');
          onScanSuccess?.('join_group', {
            group_id: result.group_id,
            invite_code: result.invite_code,
          });
          setOpen(false);
        } else if (result.action === 'unknown') {
          message.info('这是你自己的名片');
        } else {
          message.warning('无法识别的二维码');
        }
      } catch {
        message.error('二维码处理失败');
      }
    },
    [onScanSuccess],
  );

  const handleManualSubmit = useCallback(() => {
    if (!manualInput.trim()) {
      message.warning('请输入二维码内容');
      return;
    }
    try {
      const payload = JSON.parse(manualInput.trim()) as QrCodePayload;
      handleScanResult(payload);
    } catch {
      message.error('无效的二维码内容格式');
    }
  }, [manualInput, handleScanResult]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setScanning(true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const img = new Image();
          img.src = reader.result as string;
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
          });

          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            message.error('无法创建画布');
            setScanning(false);
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          const { default: jsQR } = await import('jsqr');
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            try {
              const payload = JSON.parse(code.data) as QrCodePayload;
              await handleScanResult(payload);
            } catch {
              message.warning('扫描结果: ' + code.data);
            }
          } else {
            message.error('未识别到二维码，请检查图片');
          }
        } catch {
          message.error('图片处理失败');
        } finally {
          setScanning(false);
        }
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    },
    [handleScanResult],
  );

  return (
    <>
      <Button
        type="primary"
        icon={<ScanOutlined />}
        onClick={() => setOpen(true)}
      >
        扫一扫
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />

      <Modal
        title="扫一扫"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={400}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 0' }}>
          <Button
            type="primary"
            block
            loading={scanning}
            onClick={() => fileInputRef.current?.click()}
          >
            从相册选择二维码图片
          </Button>

          <div style={{ textAlign: 'center', color: '#999' }}>— 或手动输入 —</div>

          <textarea
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="粘贴二维码内容 (JSON)"
            rows={3}
            style={{
              width: '100%',
              padding: 8,
              borderRadius: 6,
              border: '1px solid #d9d9d9',
              resize: 'vertical',
              fontFamily: 'monospace',
              fontSize: 12,
            }}
          />
          <Button onClick={handleManualSubmit} disabled={!manualInput.trim()}>
            提交
          </Button>
        </div>
      </Modal>
    </>
  );
}
