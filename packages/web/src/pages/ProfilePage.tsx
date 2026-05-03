import { Typography, Card, Avatar, Divider, Button, Space } from 'antd';
import { UserOutlined, LogoutOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '@/store';
import { logout as logoutApi } from '@/api/auth';

const { Title, Text } = Typography;

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, logout: storeLogout } = useUserStore();

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch {
      // proceed with local logout even if API call fails
    }
    storeLogout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <Title level={4}>Profile</Title>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar
            size={64}
            src={user?.avatar}
            icon={<UserOutlined />}
            style={{ backgroundColor: '#07c160' }}
          />
          <div>
            <Title level={5} style={{ margin: 0 }}>
              {user?.nickname || user?.username || 'User'}
            </Title>
            <Text type="secondary">
              WeChat ID: {user?.username ?? 'unknown'}
            </Text>
          </div>
        </div>
        <Divider />
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {user ? (
            <>
              <div>
                <Text type="secondary">Nickname</Text>
                <br />
                <Text>{user.nickname}</Text>
              </div>
              {user.phone && (
                <div>
                  <Text type="secondary">Phone</Text>
                  <br />
                  <Text>{user.phone}</Text>
                </div>
              )}
              <div>
                <Text type="secondary">Account created</Text>
                <br />
                <Text>{new Date(user.createdAt).toLocaleDateString()}</Text>
              </div>
            </>
          ) : (
            <p>Profile details and settings will appear here.</p>
          )}
          <Divider />
          <Button
            type="primary"
            danger
            icon={<LogoutOutlined />}
            onClick={handleLogout}
            block
          >
            Logout
          </Button>
        </Space>
      </Card>
    </div>
  );
}
