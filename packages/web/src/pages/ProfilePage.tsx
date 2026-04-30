import { Card, Typography, Button, Avatar, Space } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useUserStore } from '@/store';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

export default function ProfilePage() {
  const user = useUserStore((s) => s.user);
  const logout = useUserStore((s) => s.logout);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Space direction="vertical" align="center" style={{ width: '100%' }}>
          <Avatar size={80} icon={<UserOutlined />} src={user?.avatar} />
          <Title level={4}>{user?.nickname || '未登录'}</Title>
          <Text type="secondary">@{user?.username}</Text>
          <Button type="primary" danger onClick={handleLogout}>
            退出登录
          </Button>
        </Space>
      </Card>
    </div>
  );
}
