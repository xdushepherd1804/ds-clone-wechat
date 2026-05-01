import { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { useNavigate, Link } from 'react-router-dom';
import { login } from '@/api/auth';
import { useUserStore } from '@/store';
import type { LoginRequest } from '@/types';

const { Title } = Typography;

export function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useUserStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: LoginRequest) => {
    setLoading(true);
    try {
      const { token, user } = await login(values);
      setAuth(token, user);
      message.success('登录成功');
      navigate('/chat', { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.message || '登录失败，请检查用户名和密码';
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#f0f2f5',
        padding: '16px',
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 400,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <Title level={3} style={{ textAlign: 'center', color: '#07C160', marginBottom: 24 }}>
          登录
        </Title>
        <Form<LoginRequest> onFinish={onFinish} layout="vertical" size="large">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}
              style={{ background: '#07C160', borderColor: '#07C160', height: 44 }}>
              登录
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', fontSize: 14, color: '#666' }}>
          还没有账号？<Link to="/register" style={{ color: '#07C160' }}>立即注册</Link>
        </div>
      </Card>
    </div>
  );
}
