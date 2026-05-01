import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, Typography, Input, Spin, Badge, Empty, Alert, Avatar } from 'antd';
import { MessageOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { getConversations, getContacts } from '@/api';
import type { Conversation, ContactItem } from '@/types';
import { ChatType } from '@/types';

const { Title } = Typography;

export function ChatPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [convs, conts] = await Promise.all([
          getConversations(),
          getContacts(),
        ]);
        setConversations(convs);
        setContacts(conts);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load conversations';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleClick = (conv: Conversation) => {
    if (conv.chatType === ChatType.GROUP) {
      navigate(`/chat/group/${conv.targetId}`);
    } else {
      navigate(`/chat/${conv.targetId}`);
    }
  };

  const handleContactClick = (contact: ContactItem) => {
    navigate(`/chat/${contact.contactId}`);
  };

  const convTargetIds = new Set(
    conversations
      .filter((c) => c.chatType === ChatType.PRIVATE)
      .map((c) => c.targetId),
  );

  const contactsWithoutConv = contacts.filter(
    (c) => !convTargetIds.has(c.contactId),
  );

  const filterConv = (conv: Conversation) => {
    if (!search) return true;
    const name = conv.chatType === ChatType.GROUP
      ? `Group ${conv.targetId}`
      : conv.targetId;
    const lastMsgText = conv.lastMsg?.content ?? '';
    return name.toLowerCase().includes(search.toLowerCase()) ||
      lastMsgText.toLowerCase().includes(search.toLowerCase());
  };

  const filterContact = (c: ContactItem) => {
    if (!search) return true;
    const name = c.remark || c.contact.nickname || c.contact.username;
    return name.toLowerCase().includes(search.toLowerCase());
  };

  const filteredConvs = conversations.filter(filterConv);
  const filteredContacts = contactsWithoutConv.filter(filterContact);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
      <Title level={4}>Chats</Title>
      <Input.Search
        placeholder="Search conversations..."
        style={{ marginBottom: 16 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
      />

      {loading && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
        </div>
      )}

      {error && (
        <Alert
          type="error"
          message="Load failed"
          description={error}
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}

      {!loading && !error && filteredConvs.length === 0 && filteredContacts.length === 0 && (
        <Empty description="No conversations yet. Add friends via Contacts to start chatting." />
      )}

      {filteredConvs.length > 0 && (
        <>
          <Title level={5} style={{ marginTop: 0 }}>Recent</Title>
          <List
            dataSource={filteredConvs}
            renderItem={(item) => {
              const isGroup = item.chatType === ChatType.GROUP;
              const name = isGroup ? `Group ${item.targetId}` : item.targetId;
              return (
                <List.Item
                  onClick={() => handleClick(item)}
                  style={{ cursor: 'pointer', padding: '12px 16px', background: '#fff', marginBottom: 1, borderRadius: 4 }}
                >
                  <List.Item.Meta
                    avatar={
                      <Badge count={item.unreadCount} size="small" offset={[-2, 4]}>
                        <Avatar icon={isGroup ? <TeamOutlined /> : <UserOutlined />} />
                      </Badge>
                    }
                    title={name}
                    description={item.lastMsg?.content ?? ''}
                  />
                  <div style={{ color: '#999', fontSize: 12 }}>
                    {item.lastMsg?.createdAt
                      ? new Date(item.lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </div>
                </List.Item>
              );
            }}
          />
        </>
      )}

      {!loading && !error && filteredContacts.length > 0 && (
        <>
          <Title level={5}>Contacts</Title>
          <List
            dataSource={filteredContacts}
            renderItem={(item) => (
              <List.Item
                onClick={() => handleContactClick(item)}
                style={{ cursor: 'pointer', padding: '12px 16px', background: '#fff', marginBottom: 1, borderRadius: 4 }}
              >
                <List.Item.Meta
                  avatar={<Avatar icon={<UserOutlined />} />}
                  title={item.remark || item.contact.nickname || item.contact.username}
                  description="Start a conversation"
                />
                <MessageOutlined style={{ color: '#1677ff' }} />
              </List.Item>
            )}
          />
        </>
      )}
    </div>
  );
}
