import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Input,
  Badge,
  Spin,
  Empty,
  Avatar,
  Typography,
  message as antMsg,
  Button,
  List,
} from 'antd';
import {
  UserOutlined,
  TeamOutlined,
  UserAddOutlined,
  SearchOutlined,
  PlusOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useContactStore } from '@/store';
import { useFetchContacts, useHandleFriendRequest, useContactSearch, useSendFriendRequest } from '@/hooks';
import { OnlineDot, QrCodeScanner } from '@/components';
import { getGroups } from '@/api/group';
import type { ContactItem, FriendRequest, GroupInfo } from '@/types';

const { Text } = Typography;

function groupByFirstLetter(
  contacts: ContactItem[],
): Record<string, ContactItem[]> {
  const groups: Record<string, ContactItem[]> = {};
  for (const c of contacts) {
    const displayName = c.remark || c.contact.nickname || '#';
    const letter = /^[A-Za-z]/.test(displayName)
      ? displayName[0].toUpperCase()
      : '#';
    if (!groups[letter]) groups[letter] = [];
    groups[letter].push(c);
  }
  const sorted: Record<string, ContactItem[]> = {};
  Object.keys(groups)
    .sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    })
    .forEach((k) => {
      sorted[k] = groups[k];
    });
  return sorted;
}

interface FriendRequestPanelProps {
  requests: FriendRequest[];
  onAccept: (id: string) => Promise<boolean>;
  onReject: (id: string) => Promise<boolean>;
}

function FriendRequestPanel({
  requests,
  onAccept,
  onReject,
}: FriendRequestPanelProps) {
  const [actingId, setActingId] = useState<string | null>(null);

  const handleAction = useCallback(
    async (id: string, action: 'accept' | 'reject') => {
      setActingId(id);
      const fn = action === 'accept' ? onAccept : onReject;
      const ok = await fn(id);
      if (ok) {
        antMsg.success(action === 'accept' ? '已接受好友申请' : '已拒绝好友申请');
      } else {
        antMsg.error(action === 'accept' ? '接受好友申请失败' : '拒绝好友申请失败');
      }
      setActingId(null);
    },
    [onAccept, onReject],
  );

  if (requests.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <Empty description="暂无好友申请" />
      </div>
    );
  }

  return (
    <div>
      {requests.map((req) => (
        <div
          key={req.id}
          style={{
            padding: '14px 16px',
            background: '#fff',
            marginBottom: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Avatar
            src={req.fromUser.avatar}
            icon={<UserOutlined />}
            size={40}
          />
          <div style={{ flex: 1 }}>
            <Text strong>{req.fromUser.nickname}</Text>
            {req.message && (
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  {req.message}
                </Text>
              </div>
            )}
          </div>
          {req.status === 'pending' ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={actingId === req.id}
                onClick={() => handleAction(req.id, 'accept')}
                style={{
                  border: 'none',
                  background: '#07c160',
                  color: '#fff',
                  padding: '4px 14px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                接受
              </button>
              <button
                disabled={actingId === req.id}
                onClick={() => handleAction(req.id, 'reject')}
                style={{
                  border: '1px solid #d9d9d9',
                  background: '#fff',
                  color: '#666',
                  padding: '4px 14px',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                拒绝
              </button>
            </div>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {req.status === 'accepted' ? '已接受' : '已拒绝'}
            </Text>
          )}
        </div>
      ))}
    </div>
  );
}

export function ContactsPage() {
  const navigate = useNavigate();
  const { contacts, friendRequests } = useContactStore();
  const { loading, refetch } = useFetchContacts();
  const { accept, reject } = useHandleFriendRequest();
  const { results: searchResults, loading: searching, search } = useContactSearch();
  const { send: sendRequest, loading: sending } = useSendFriendRequest();
  const [searchText, setSearchText] = useState('');
  const [groups, setGroups] = useState<GroupInfo[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [showFriendRequests, setShowFriendRequests] = useState(false);
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sentUids, setSentUids] = useState<Set<string>>(new Set());

  const loadGroups = useCallback(async () => {
    if (groupsLoaded) return;
    try {
      const data = await getGroups();
      setGroups(data);
    } catch {
      // groups are optional
    } finally {
      setGroupsLoaded(true);
    }
  }, [groupsLoaded]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const filteredContacts = useMemo(() => {
    if (!searchText.trim()) return contacts;
    const kw = searchText.toLowerCase();
    return contacts.filter(
      (c) =>
        c.contact.nickname.toLowerCase().includes(kw) ||
        (c.remark && c.remark.toLowerCase().includes(kw)),
    );
  }, [contacts, searchText]);

  const grouped = useMemo(
    () => groupByFirstLetter(filteredContacts),
    [filteredContacts],
  );

  const letters = Object.keys(grouped);

  const pendingCount = friendRequests.filter(
    (r) => r.status === 'pending',
  ).length;

  const scrollToLetter = useCallback((letter: string) => {
    const el = document.getElementById(`contact-letter-${letter}`);
    el?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleSearch = useCallback(
    (value: string) => {
      setSearchKeyword(value);
      if (value.trim()) {
        search(value.trim());
      }
    },
    [search],
  );

  const handleSendRequest = useCallback(
    async (uid: string) => {
      const ok = await sendRequest(uid);
      if (ok) {
        antMsg.success('好友请求已发送');
        setSentUids((prev) => new Set(prev).add(uid));
      } else {
        antMsg.error('发送失败');
      }
    },
    [sendRequest],
  );

  const contactUids = useMemo(
    () => new Set(contacts.map((c) => c.contactId)),
    [contacts],
  );

  if (showSearchPanel) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 12 }}>
          <button
            onClick={() => {
              setShowSearchPanel(false);
              setSearchKeyword('');
            }}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              fontSize: 16, padding: 0, color: '#07c160',
            }}
          >
            ← 返回通讯录
          </button>
          <span style={{ fontSize: 16, fontWeight: 600 }}>添加好友</span>
        </div>

        <Input.Search
          placeholder="输入用户名或昵称搜索..."
          value={searchKeyword}
          onChange={(e) => handleSearch(e.target.value)}
          onSearch={handleSearch}
          enterButton="搜索"
          size="large"
          loading={searching}
          style={{ marginBottom: 16 }}
          autoFocus
        />

        {searching ? (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
        ) : searchResults.length > 0 ? (
          <List
            dataSource={searchResults}
            renderItem={(item) => (
              <List.Item
                style={{ padding: '12px 16px', background: '#fff', marginBottom: 1, borderRadius: 4 }}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar src={item.avatar} icon={<UserOutlined />} size={40} />
                  }
                  title={
                    <span>
                      {item.nickname}
                      <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 13 }}>
                        @{item.username}
                      </Typography.Text>
                    </span>
                  }
                />
                {item.isContact || contactUids.has(item.id) ? (
                  <Button type="text" disabled icon={<CheckCircleOutlined />}>
                    已是好友
                  </Button>
                ) : sentUids.has(item.id) ? (
                  <Button type="text" disabled>
                    已发送请求
                  </Button>
                ) : (
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    loading={sending}
                    onClick={() => handleSendRequest(item.id)}
                    style={{ background: '#07c160', borderColor: '#07c160' }}
                  >
                    加好友
                  </Button>
                )}
              </List.Item>
            )}
          />
        ) : searchKeyword.trim() ? (
          <Empty description="未找到用户" />
        ) : (
          <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
            <SearchOutlined style={{ fontSize: 48, marginBottom: 16, display: 'block' }} />
            <Typography.Text type="secondary">
              输入对方的用户名或昵称，搜索并添加好友
            </Typography.Text>
          </div>
        )}
      </div>
    );
  }

  if (showFriendRequests) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 16,
            gap: 12,
          }}
        >
          <button
            onClick={() => {
              setShowFriendRequests(false);
              refetch();
            }}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 16,
              padding: 0,
              color: '#07c160',
            }}
          >
            ← 返回通讯录
          </button>
          <span style={{ fontSize: 16, fontWeight: 600 }}>好友申请</span>
        </div>
        <FriendRequestPanel
          requests={friendRequests}
          onAccept={accept}
          onReject={reject}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          maxWidth: 800,
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <Input.Search
            placeholder="搜索好友（昵称/备注）..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
            style={{ flex: 1 }}
          />
          <QrCodeScanner
            onScanSuccess={(action, params) => {
              if (action === 'add_friend' && params.uid) {
                navigate(`/contacts/${params.uid}`);
              } else if (action === 'join_group' && params.group_id) {
                navigate(`/chat/group/${params.group_id}`);
              }
            }}
          />
        </div>

        {!searchText.trim() && (
          <div
            style={{
              background: '#fff',
              borderRadius: 8,
              marginBottom: 16,
              overflow: 'hidden',
            }}
          >
            <div
              onClick={() => setShowFriendRequests(true)}
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #f0f0f0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <UserAddOutlined
                style={{ marginRight: 10, fontSize: 18, color: '#f5a623' }}
              />
              <span style={{ flex: 1 }}>新朋友</span>
              {pendingCount > 0 && (
                <Badge count={pendingCount} size="small" />
              )}
            </div>

            <div
              onClick={() => setShowSearchPanel(true)}
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #f0f0f0',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <PlusOutlined
                style={{ marginRight: 10, fontSize: 18, color: '#1890ff' }}
              />
              <span style={{ flex: 1 }}>添加好友</span>
              <Text type="secondary" style={{ fontSize: 12 }}>
                用户名/昵称搜索
              </Text>
            </div>

            <div
              onClick={() => navigate('/chat')}
              style={{
                padding: '14px 16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <TeamOutlined
                style={{ marginRight: 10, fontSize: 18, color: '#07c160' }}
              />
              <span style={{ flex: 1 }}>群聊</span>
              {groups.length > 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {groups.length}个群聊
                </Text>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  暂无群聊
                </Text>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : filteredContacts.length === 0 ? (
          <Empty
            description={
              searchText.trim() ? '未找到匹配的联系人' : '暂无联系人'
            }
          />
        ) : (
          letters.map((letter) => (
            <div key={letter} id={`contact-letter-${letter}`}>
              <div
                style={{
                  padding: '6px 16px',
                  background: '#f5f5f5',
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#999',
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}
              >
                {letter}
              </div>
              {grouped[letter].map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => navigate(`/chat/${contact.contactId}`)}
                  style={{
                    padding: '12px 16px',
                    background: '#fff',
                    marginBottom: 1,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    transition: 'background 0.15s',
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    navigate(`/contacts/${contact.contactId}`);
                  }}
                >
                  <Avatar
                    src={contact.contact.avatar}
                    icon={<UserOutlined />}
                    size={40}
                    style={{ marginRight: 12, flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      <OnlineDot status={contact.contact.status} />
                      <Text
                        strong
                        style={{ fontSize: 15 }}
                        ellipsis
                      >
                        {contact.remark || contact.contact.nickname}
                      </Text>
                    </div>
                    {contact.remark && (
                      <div style={{ marginLeft: 14 }}>
                        <Text
                          type="secondary"
                          style={{ fontSize: 12 }}
                          ellipsis
                        >
                          {contact.contact.nickname}
                        </Text>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {letters.length > 0 && !searchText.trim() && (
        <div
          style={{
            position: 'fixed',
            right: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            zIndex: 10,
            background: 'rgba(255,255,255,0.8)',
            borderRadius: 8,
            padding: '4px 2px',
          }}
        >
          {letters.map((letter) => (
            <button
              key={letter}
              onClick={() => scrollToLetter(letter)}
              style={{
                width: 24,
                height: 22,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                color: '#07c160',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {letter}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
