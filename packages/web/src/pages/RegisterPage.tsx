import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card, Form, Input, Button, message, Typography } from 'antd';
import { UserOutlined, LockOutlined, SmileOutlined } from '@ant-design/icons';
import { register } from '@/api/auth';
import { useUserStore } from '@/store';

const { Title, Text } = Typography;

export default function RegisterPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useUserStore((s) => s.setAuth);

  const onFinish = async (values: {
    username: string;
    password: string;
    nickname: string;
  }) => {
    setLoading(true);
    try {
      const res = await register(values);
      setAuth(res.token, res.user);
      message.success('注册成功');
      navigate('/chat');
    } catch {
      message.error('注册失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f5f5f5' }}>
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ textAlign: 'center' }}>注册</Title>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" size="large" />
          </Form.Item>
          <Form.Item name="nickname" rules={[{ required: true, message: '请输入昵称' }]}>
            <Input prefix={<SmileOutlined />} placeholder="昵称" size="large" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block size="large">
              注册
            </Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          <Text>已有账号？</Text>
          <Link to="/login">立即登录</Link>
        </div>
      </Card>
    </div>
  );
}
