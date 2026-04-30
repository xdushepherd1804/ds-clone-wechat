import { Typography, Card, Avatar, Divider } from 'antd';
import { UserOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

export function ProfilePage() {
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <Title level={4}>Profile</Title>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar size={64} icon={<UserOutlined />} style={{ backgroundColor: '#07c160' }} />
          <div>
            <Title level={5} style={{ margin: 0 }}>User</Title>
            <Text type="secondary">WeChat ID: user_12345</Text>
          </div>
        </div>
        <Divider />
        <p>Profile details and settings will appear here.</p>
      </Card>
    </div>
  );
}
