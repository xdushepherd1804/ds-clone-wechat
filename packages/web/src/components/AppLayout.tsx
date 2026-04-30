import { Outlet } from 'react-router-dom';
import { Layout } from 'antd';
import Sidebar from './Sidebar';

const { Header, Content } = Layout;

export default function AppLayout() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          background: '#07c160',
          padding: '0 24px',
        }}
      >
        <span style={{ color: '#fff', fontSize: 18, fontWeight: 600 }}>
          WeChat Clone
        </span>
      </Header>
      <Layout>
        <Sidebar />
        <Content style={{ background: '#f5f5f5', overflow: 'auto' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
