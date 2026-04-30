import { Typography } from 'antd';

const { Title, Text } = Typography;

export default function ContactsPage() {
  return (
    <div style={{ padding: 24 }}>
      <Title level={4}>通讯录</Title>
      <Text type="secondary">联系人列表（开发中）</Text>
    </div>
  );
}
