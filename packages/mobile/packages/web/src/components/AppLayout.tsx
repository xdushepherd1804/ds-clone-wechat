import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { ConnectionStatus } from './ConnectionStatus';
import { useWS } from '@/hooks';

const { Header, Sider, Content } = Layout;

export function AppLayout() {
  useWS();

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={200} style={{ background: '#fff' }}>
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#07c160',
            color: '#fff',
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          WeChat Clone
        </div>
        <Sidebar />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#f5f5f5',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 16,
            fontWeight: 500,
            borderBottom: '1px solid #e8e8e8',
          }}
        >
          <span>WeChat Clone</span>
          <ConnectionStatus />
        </Header>
        <Content style={{ background: '#f5f5f5', minHeight: 'calc(100vh - 64px)', padding: 0 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
