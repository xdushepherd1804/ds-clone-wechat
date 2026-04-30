import { List, Typography, Input } from 'antd';

const { Title } = Typography;

export function ContactsPage() {
  const contacts = [
    { uid: '1', name: 'Alice Wang', remark: 'Best friend' },
    { uid: '2', name: 'Bob Li', remark: 'Colleague' },
    { uid: '3', name: 'Carol Zhang', remark: '' },
  ];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <Title level={4}>Contacts</Title>
      <Input.Search placeholder="Search contacts..." style={{ marginBottom: 16 }} />
      <List
        dataSource={contacts}
        renderItem={(item) => (
          <List.Item style={{ cursor: 'pointer', padding: '12px 16px', background: '#fff', marginBottom: 1 }}>
            <List.Item.Meta title={item.name} description={item.remark || 'No remark'} />
          </List.Item>
        )}
      />
    </div>
  );
}
