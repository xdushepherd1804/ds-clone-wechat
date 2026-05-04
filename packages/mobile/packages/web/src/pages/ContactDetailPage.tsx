import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Typography,
  Card,
  Button,
  Avatar,
  Tag,
  Input,
  Space,
  Modal,
  Spin,
  message as antMsg,
} from 'antd';
import {
  UserOutlined,
  MessageOutlined,
  EditOutlined,
  DeleteOutlined,
  StopOutlined,
  PlusOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { useContactStore } from '@/store';
import { getContacts, updateContact, deleteContact } from '@/api/contact';
import { OnlineDot } from '@/components';
import type { ContactItem } from '@/types';

const { Title, Text } = Typography;

export function ContactDetailPage() {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const contacts = useContactStore((s) => s.contacts);
  const updateContactInStore = useContactStore((s) => s.updateContact);
  const removeContactFromStore = useContactStore((s) => s.removeContact);

  const [contact, setContact] = useState<ContactItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editRemark, setEditRemark] = useState(false);
  const [remarkValue, setRemarkValue] = useState('');
  const [savingRemark, setSavingRemark] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    const found = contacts.find(
      (c) => c.contactId === uid || c.contact.id === uid,
    );
    if (found) {
      setContact(found);
      setRemarkValue(found.remark || '');
      setLoading(false);
    } else {
      getContacts()
        .then((data) => {
          const match = data.find(
            (c) => c.contactId === uid || c.contact.id === uid,
          );
          if (match) {
            setContact(match);
            setRemarkValue(match.remark || '');
          } else {
            setError('联系人不存在');
          }
        })
        .catch(() => setError('加载联系人失败'))
        .finally(() => setLoading(false));
    }
  }, [uid, contacts]);

  const handleSaveRemark = useCallback(async () => {
    if (!contact) return;
    setSavingRemark(true);
    try {
      const updated = await updateContact(contact.id, {
        remark: remarkValue || '',
      });
      updateContactInStore(contact.id, { remark: remarkValue || '' });
      setContact(updated);
      setEditRemark(false);
      antMsg.success('备注已更新');
    } catch {
      antMsg.error('更新备注失败');
    } finally {
      setSavingRemark(false);
    }
  }, [contact, remarkValue, updateContactInStore]);

  const handleAddTag = useCallback(async () => {
    if (!contact || !newTag.trim()) return;
    const newTags = [...contact.tags, newTag.trim()];
    try {
      const updated = await updateContact(contact.id, { tags: newTags });
      updateContactInStore(contact.id, { tags: newTags });
      setContact(updated);
      setNewTag('');
      setShowTagInput(false);
      antMsg.success('标签已添加');
    } catch {
      antMsg.error('添加标签失败');
    }
  }, [contact, newTag, updateContactInStore]);

  const handleRemoveTag = useCallback(
    async (tag: string) => {
      if (!contact) return;
      const newTags = contact.tags.filter((t) => t !== tag);
      try {
        const updated = await updateContact(contact.id, { tags: newTags });
        updateContactInStore(contact.id, { tags: newTags });
        setContact(updated);
        antMsg.success('标签已移除');
      } catch {
        antMsg.error('移除标签失败');
      }
    },
    [contact, updateContactInStore],
  );

  const handleDelete = useCallback(() => {
    if (!contact) return;
    Modal.confirm({
      title: '删除好友',
      content: `确定要删除好友 ${contact.remark || contact.contact.nickname} 吗？`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteContact(contact.id);
          removeContactFromStore(contact.id);
          antMsg.success('好友已删除');
          navigate('/contacts', { replace: true });
        } catch {
          antMsg.error('删除好友失败');
        }
      },
    });
  }, [contact, removeContactFromStore, navigate]);

  const handleBlock = useCallback(() => {
    if (!contact) return;
    Modal.confirm({
      title: '拉黑好友',
      content: `拉黑后对方将无法给你发消息。确定要拉黑 ${contact.remark || contact.contact.nickname} 吗？`,
      okText: '拉黑',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const updated = await updateContact(contact.id, {
            status: 'blocked',
          });
          updateContactInStore(contact.id, { status: 'blocked' });
          setContact(updated);
          antMsg.success('已拉黑');
        } catch {
          antMsg.error('操作失败');
        }
      },
    });
  }, [contact, updateContactInStore]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !contact) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: 32 }}>
        <Card>
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Text type="secondary">{error || '联系人不存在'}</Text>
          </div>
        </Card>
      </div>
    );
  }

  const isOnline = contact.contact.status === 'online';
  const isBlocked = contact.status === 'blocked';

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 16,
          gap: 12,
        }}
      >
        <button
          onClick={() => navigate('/contacts')}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 16,
            padding: 0,
            color: '#07c160',
          }}
        >
          ← 返回
        </button>
        <Title level={4} style={{ margin: 0 }}>
          联系人详情
        </Title>
      </div>

      <Card>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <Avatar
              src={contact.contact.avatar}
              icon={<UserOutlined />}
              size={80}
            />
            <span
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: isOnline ? '#07c160' : '#ccc',
                border: '2px solid #fff',
              }}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <Text strong style={{ fontSize: 18 }}>
              {contact.contact.nickname}
            </Text>
          </div>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary">@{contact.contact.username}</Text>
          </div>
          <div style={{ marginTop: 4 }}>
            <OnlineDot status={contact.contact.status} />
            <Text type="secondary" style={{ fontSize: 13, marginLeft: 6 }}>
              {isOnline ? '在线' : '离线'}
            </Text>
          </div>
          {isBlocked && (
            <Tag color="error" style={{ marginTop: 8 }}>
              已拉黑
            </Tag>
          )}
        </div>

        <div
          style={{
            marginBottom: 20,
            padding: '12px 16px',
            background: '#fafafa',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TagOutlined />
              <Text type="secondary">备注</Text>
            </div>
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => setEditRemark(!editRemark)}
            />
          </div>
          {editRemark ? (
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <Input
                value={remarkValue}
                onChange={(e) => setRemarkValue(e.target.value)}
                placeholder="输入备注..."
                maxLength={30}
              />
              <Button
                type="primary"
                size="small"
                loading={savingRemark}
                onClick={handleSaveRemark}
              >
                保存
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setEditRemark(false);
                  setRemarkValue(contact.remark || '');
                }}
              >
                取消
              </Button>
            </div>
          ) : (
            <div style={{ marginTop: 4 }}>
              <Text>{contact.remark || '未设置'}</Text>
            </div>
          )}
        </div>

        <div
          style={{
            marginBottom: 20,
            padding: '12px 16px',
            background: '#fafafa',
            borderRadius: 8,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TagOutlined />
              <Text type="secondary">标签</Text>
            </div>
            <Button
              type="link"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => setShowTagInput(!showTagInput)}
            />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {contact.tags.map((tag) => (
              <Tag
                key={tag}
                closable
                onClose={() => handleRemoveTag(tag)}
              >
                {tag}
              </Tag>
            ))}
            {contact.tags.length === 0 && (
              <Text type="secondary" style={{ fontSize: 13 }}>
                暂无标签
              </Text>
            )}
          </div>
          {showTagInput && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="输入标签名..."
                maxLength={20}
                onPressEnter={handleAddTag}
              />
              <Button type="primary" size="small" onClick={handleAddTag}>
                添加
              </Button>
            </div>
          )}
        </div>

        <Space direction="vertical" style={{ width: '100%' }}>
          <Button
            type="primary"
            icon={<MessageOutlined />}
            block
            onClick={() => navigate(`/chat/${contact.contactId}`)}
          >
            发消息
          </Button>
          <div style={{ display: 'flex', gap: 12 }}>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={handleDelete}
              style={{ flex: 1 }}
            >
              删除好友
            </Button>
            {!isBlocked && (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={handleBlock}
                style={{ flex: 1 }}
              >
                拉黑
              </Button>
            )}
          </div>
        </Space>
      </Card>
    </div>
  );
}
