import { List, Typography, Input } from 'antd';

const { Title } = Typography;

export function ChatPage() {
  const conversations = [
    { id: '1', name: 'Alice Wang', lastMsg: 'See you tomorrow!', time: '10:30' },
    { id: '2', name: 'Bob Li', lastMsg: 'Got it, thanks!', time: '09:15' },
    { id: '3', name: 'Dev Team', lastMsg: 'Meeting at 3pm', time: 'Yesterday' },
  ];

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <Title level={4}>Chats</Title>
      <Input.Search placeholder="Search conversations..." style={{ marginBottom: 16 }} />
      <List
        dataSource={conversations}
        renderItem={(item) => (
          <List.Item style={{ cursor: 'pointer', padding: '12px 16px', background: '#fff', marginBottom: 1 }}>
            <List.Item.Meta title={item.name} description={item.lastMsg} />
            <div style={{ color: '#999', fontSize: 12 }}>{item.time}</div>
          </List.Item>
        )}
      />
    </div>
  );
}
