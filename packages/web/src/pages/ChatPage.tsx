import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, Typography, Input, Spin, Badge, Empty, Alert, Avatar, Button, Modal } from 'antd';
import { MessageOutlined, UserOutlined, TeamOutlined, PlusOutlined } from '@ant-design/icons';
import { getConversations, getContacts, getGroups } from '@/api';
import { createGroup } from '@/api/group';
import { useContactStore } from '@/store';
import type { Conversation, ContactItem, GroupInfo } from '@/types';
import { ChatType } from '@/types';
import { getMsgPreview } from '@/utils/parseMessageContent';

const { Title } = Typography;

function useNameMap(contacts: ContactItem[], groups: GroupInfo[]) {
  return useMemo(() => {
    const map = new Map<string, { name: string; avatar: string | null }>();
    for (const c of contacts) {
      map.set(c.contactId, {
        name: c.remark || c.contact.nickname || c.contact.username,
        avatar: c.contact.avatar,
      });
    }
    for (const g of groups) {
      map.set(g.id, { name: g.name, avatar: g.avatar });
    }
    return map;
  }, [contacts, groups]);
}

function getConvName(
  conv: Conversation,
  nameMap: Map<string, { name: string; avatar: string | null }>,
  storeContacts: ContactItem[],
) {
  const info = nameMap.get(conv.targetId);
  if (info) return info.name;
  const storeContact = storeContacts.find((c) => c.contactId === conv.targetId);
  if (storeContact) return storeContact.remark || storeContact.contact.nickname || storeContact.contact.username;
  return conv.chatType === ChatType.GROUP ? `Group ${conv.targetId}` : conv.targetId;
}

function getConvAvatar(conv: Conversation, nameMap: Map<string, { name: string; avatar: string | null }>) {
  const info = nameMap.get(conv.targetId);
  return info?.avatar ?? null;
}

export function ChatPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const storeContacts = useContactStore((s) => s.contacts);

  const nameMap = useNameMap(contacts, groups);

  const handleCreateGroup = async () => {
    if (!groupName.trim()) return;
    setCreating(true);
    try {
      const group = await createGroup({ name: groupName.trim(), memberIds: [] });
      setShowCreateGroup(false);
      setGroupName('');
      navigate(`/chat/group/${group.id}`);
    } catch {
      // silently fail
    } finally {
      setCreating(false);
    }
  };

  const load = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        getConversations(),
        getContacts(),
        getGroups(),
      ]);
      setConversations(results[0].status === 'fulfilled' ? results[0].value : []);
      setContacts(results[1].status === 'fulfilled' ? results[1].value : []);
      setGroups(results[2].status === 'fulfilled' ? results[2].value : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load conversations';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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
    const name = getConvName(conv, nameMap, storeContacts);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={4} style={{ margin: 0 }}>Chats</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setShowCreateGroup(true)}
          style={{ background: '#07c160', borderColor: '#07c160' }}
        >
          创建群聊
        </Button>
      </div>
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

      <Modal
        title="创建群聊"
        open={showCreateGroup}
        onOk={handleCreateGroup}
        onCancel={() => { setShowCreateGroup(false); setGroupName(''); }}
        confirmLoading={creating}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="输入群聊名称"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          onPressEnter={handleCreateGroup}
        />
      </Modal>

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
              const name = getConvName(item, nameMap, storeContacts);
              const avatar = getConvAvatar(item, nameMap);
              return (
                <List.Item
                  onClick={() => handleClick(item)}
                  style={{ cursor: 'pointer', padding: '12px 16px', background: '#fff', marginBottom: 1, borderRadius: 4 }}
                >
                  <List.Item.Meta
                    avatar={
                      <Badge count={item.unreadCount} size="small" offset={[-2, 4]}>
                        <Avatar src={avatar} icon={isGroup ? <TeamOutlined /> : <UserOutlined />} />
                      </Badge>
                    }
                    title={name}
                    description={item.lastMsg ? getMsgPreview(item.lastMsg) : ''}
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
