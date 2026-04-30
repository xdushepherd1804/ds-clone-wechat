import { useNavigate, useLocation } from 'react-router-dom';
import { Menu } from 'antd';
import {
  MessageOutlined,
  ContactsOutlined,
  PictureOutlined,
  UserOutlined,
} from '@ant-design/icons';

const items = [
  { key: '/chat', icon: <MessageOutlined />, label: '消息' },
  { key: '/contacts', icon: <ContactsOutlined />, label: '通讯录' },
  { key: '/moments', icon: <PictureOutlined />, label: '朋友圈' },
  { key: '/me', icon: <UserOutlined />, label: '我的' },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedKey = '/' + location.pathname.split('/')[1];

  return (
    <Menu
      mode="inline"
      selectedKeys={[selectedKey]}
      items={items}
      onClick={({ key }) => navigate(key)}
      style={{ width: 200, height: '100%', borderRight: '1px solid #f0f0f0' }}
    />
  );
}
