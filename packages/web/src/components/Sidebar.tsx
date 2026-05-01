import { useNavigate, useLocation } from 'react-router-dom';
import { Menu } from 'antd';
import {
  MessageOutlined,
  ContactsOutlined,
  PictureOutlined,
  UserOutlined,
  MonitorOutlined,
  QrcodeOutlined,
} from '@ant-design/icons';

const items = [
  { key: '/chat', icon: <MessageOutlined />, label: '消息' },
  { key: '/contacts', icon: <ContactsOutlined />, label: '通讯录' },
  { key: '/moments', icon: <PictureOutlined />, label: '朋友圈' },
  { key: '/me', icon: <UserOutlined />, label: '我的' },
  { key: '/monitor', icon: <MonitorOutlined />, label: '监控' },
  { key: '/qrcode', icon: <QrcodeOutlined />, label: '二维码' },
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
      style={{ height: '100%', borderRight: 'none' }}
    />
  );
}
