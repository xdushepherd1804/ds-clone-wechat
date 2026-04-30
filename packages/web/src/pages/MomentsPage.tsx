import { Typography, Card } from 'antd';
import { PictureOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

export function MomentsPage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <Title level={4}>Moments</Title>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, background: '#07c160', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <PictureOutlined style={{ fontSize: 24, color: '#fff' }} />
          </div>
          <div>
            <Title level={5} style={{ margin: 0 }}>Welcome to Moments</Title>
            <Paragraph type="secondary" style={{ margin: 0 }}>Share your life with friends.</Paragraph>
          </div>
        </div>
      </Card>
    </div>
  );
}
