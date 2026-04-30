import { useParams } from 'react-router-dom';
import { Typography } from 'antd';

const { Title } = Typography;

export default function ContactDetailPage() {
  const { uid } = useParams<{ uid: string }>();

  return (
    <div style={{ padding: 24 }}>
      <Title level={4}>联系人 {uid}</Title>
    </div>
  );
}
