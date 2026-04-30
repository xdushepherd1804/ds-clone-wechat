import { Form, Input, Button, Card, Typography, message } from 'antd';
import { useNavigate, Link } from 'react-router-dom';

const { Title } = Typography;

export function LoginPage() {
  const navigate = useNavigate();

  const onFinish = async (_values: { username: string; password: string }) => {
    navigate('/chat');
    message.success('Logged in successfully');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 64px)' }}>
      <Card style={{ width: 400 }}>
        <Title level={3} style={{ textAlign: 'center' }}>Login</Title>
        <Form onFinish={onFinish} layout="vertical">
          <Form.Item name="username" label="Username" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>Login</Button>
          </Form.Item>
        </Form>
        <div style={{ textAlign: 'center' }}>
          No account? <Link to="/register">Register</Link>
        </div>
      </Card>
    </div>
  );
}
