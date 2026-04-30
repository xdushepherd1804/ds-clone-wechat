import { useParams } from 'react-router-dom';
import { Typography, Card, Button } from 'antd';

const { Title } = Typography;

export function ContactDetailPage() {
  const { uid } = useParams<{ uid: string }>();
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <Title level={4}>Contact: {uid}</Title>
      <Card>
        <p>Contact details will appear here.</p>
        <Button type="primary" style={{ marginTop: 8 }}>Send Message</Button>
      </Card>
    </div>
  );
}
