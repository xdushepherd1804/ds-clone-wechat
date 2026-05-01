import { useState, useEffect } from 'react';
import { Card, Spin, message, Tabs, Button, Space } from 'antd';
import { QrcodeOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getUserCardQrCode } from '@/api/qrcode';
import { useUserStore } from '@/store';

export default function QrCodePage() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const user = useUserStore((s) => s.user);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    getUserCardQrCode(user.id, 'json')
      .then(({ dataUrl }) => setQrDataUrl(dataUrl))
      .catch(() => message.error('获取二维码失败'))
      .finally(() => setLoading(false));
  }, [user?.id]);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px' }}>
      <Tabs
        centered
        items={[
          {
            key: 'my-qr',
            label: (
              <span>
                <QrcodeOutlined /> 我的二维码
              </span>
            ),
            children: (
              <Card>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}>
                    <Spin size="large" />
                  </div>
                ) : qrDataUrl ? (
                  <div style={{ textAlign: 'center' }}>
                    <img
                      src={qrDataUrl}
                      alt="用户名片二维码"
                      style={{ width: 260, height: 260, marginBottom: 16 }}
                    />
                    <div style={{ marginTop: 8 }}>
                      <UserOutlined /> {user?.nickname || user?.username || '用户'}
                    </div>
                    <div style={{ color: '#999', fontSize: 12, marginTop: 4 }}>
                      扫一扫二维码，添加我为好友
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                    请先登录
                  </div>
                )}
              </Card>
            ),
          },
          {
            key: 'scan',
            label: (
              <span>
                <TeamOutlined /> 扫一扫
              </span>
            ),
            children: (
              <Card>
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <QrcodeOutlined style={{ fontSize: 64, color: '#07c160' }} />
                  <p style={{ marginTop: 16, color: '#666' }}>
                    扫描好友的二维码即可添加好友
                  </p>
                  <Space direction="vertical" size={12} style={{ marginTop: 16 }}>
                    <Button
                      type="primary"
                      size="large"
                      onClick={() => navigate('/contacts')}
                    >
                      前往通讯录扫码
                    </Button>
                    <Button
                      size="large"
                      onClick={() => navigate('/groups')}
                    >
                      扫描群邀请二维码
                    </Button>
                  </Space>
                </div>
              </Card>
            ),
          },
        ]}
      />
    </div>
  );
}
