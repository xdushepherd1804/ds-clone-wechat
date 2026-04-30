import { useParams } from 'react-router-dom';
import { Typography } from 'antd';

const { Title } = Typography;

export function ChatDetailPage() {
  const { conv_id } = useParams<{ conv_id: string }>();
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <Title level={4}>Conversation: {conv_id}</Title>
      <div style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
        <p>Chat messages will appear here.</p>
      </div>
    </div>
  );
}
