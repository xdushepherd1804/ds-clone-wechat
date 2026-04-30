import { useParams } from 'react-router-dom';
import { Typography } from 'antd';

const { Title } = Typography;

export default function ChatDetailPage() {
  const { conv_id } = useParams<{ conv_id: string }>();

  return (
    <div style={{ padding: 24 }}>
      <Title level={4}>会话 {conv_id}</Title>
    </div>
  );
}
