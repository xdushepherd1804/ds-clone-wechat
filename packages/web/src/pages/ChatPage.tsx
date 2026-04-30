import { Typography } from 'antd';

const { Title, Text } = Typography;

export default function ChatPage() {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <Title level={3}>选择会话</Title>
      <Text type="secondary">从左侧菜单选择一个会话开始聊天</Text>
    </div>
  );
}
