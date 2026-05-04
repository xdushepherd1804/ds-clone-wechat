import { useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '@/api/auth';
import { useUserStore } from '@/store';
import type { RegisterRequest } from '@/types';

const { Title } = Typography;

interface RegisterForm extends RegisterRequest {
  confirm: string;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useUserStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);

  const onFinish = async ({ username, password, nickname, phone }: RegisterForm) => {
    setLoading(true);
    try {
      const { token, user } = await register({ username, password, nickname, phone });
      setAuth(token, user);
      message.success('注册成功');
      navigate('/chat', { replace: true });
    } catch (err: any) {
      const msg = err?.response?.data?.message || '注册失败，请稍后重试';
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
          注册
        </Title>
        <Form<RegisterForm> onFinish={onFinish} layout="vertical" size="large">
          <Form.Item name="nickname" label="昵称" rules={[{ required: true, message: '请输入昵称' }]}>
            <Input placeholder="请输入昵称" />
          </Form.Item>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="请输入手机号（选填）" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[
            { required: true, message: '请输入密码' },
            { min: 6, message: '密码至少6位' },
          ]}>
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}
              style={{ background: '#07C160', borderColor: '#07C160', height: 44 }}>
              注册
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center', fontSize: 14, color: '#666' }}>
          已有账号？<Link to="/login" style={{ color: '#07C160' }}>立即登录</Link>
        </div>
      </Card>
    </div>
  );
}
