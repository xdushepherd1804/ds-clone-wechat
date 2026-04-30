import { Typography } from 'antd';

const { Title, Text } = Typography;

export default function MomentsPage() {
  return (
    <div style={{ padding: 24 }}>
      <Title level={4}>朋友圈</Title>
      <Text type="secondary">朋友圈动态（开发中）</Text>
    </div>
  );
}
