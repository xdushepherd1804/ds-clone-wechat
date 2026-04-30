import { Layout, Menu } from 'antd';
import { MessageOutlined, ContactsOutlined, PictureOutlined, UserOutlined } from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';

const { Header, Content } = Layout;

const menuItems = [
  { key: '/chat', icon: <MessageOutlined />, label: 'Chat' },
  { key: '/contacts', icon: <ContactsOutlined />, label: 'Contacts' },
  { key: '/moments', icon: <PictureOutlined />, label: 'Moments' },
  { key: '/me', icon: <UserOutlined />, label: 'Profile' },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = menuItems.find((item) => location.pathname.startsWith(item.key))?.key ?? '/chat';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', background: '#07c160', padding: '0 24px' }}>
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>
          WeChat Clone
        </div>
        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 1, background: 'transparent', borderBottom: 'none', marginLeft: 24 }}
          theme="dark"
        />
      </Header>
      <Content style={{ background: '#f5f5f5', minHeight: 'calc(100vh - 64px)' }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
