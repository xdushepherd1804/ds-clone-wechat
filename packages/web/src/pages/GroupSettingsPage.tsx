import { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { Input, Button, Modal, message, Typography } from 'antd';
import { useGroupInfo } from '@/hooks/useGroupInfo';
import { useGroupMembers } from '@/hooks/useGroupMembers';
import { useGroupActions } from '@/hooks/useGroupActions';
import { useUserStore } from '@/store';
import GroupMemberManage from '@/components/GroupMemberManage';
import type { GroupRole } from '@/types';

const { Title, Text } = Typography;
const { TextArea } = Input;

export function GroupSettingsPage() {
  const { group_id } = useParams<{ group_id: string }>();
  const navigate = useNavigate();
  const groupId = group_id || '';

  const userId = useUserStore((s) => s.user?.id) || '';
  const { groupInfo, refresh: refreshGroup } = useGroupInfo(groupId);
  const { members, refresh: refreshMembers } = useGroupMembers(groupId);
  const groupActions = useGroupActions(groupId);

  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [editAnnouncement, setEditAnnouncement] = useState(false);
  const [announcementVal, setAnnouncementVal] = useState('');
  const [showMemberManage, setShowMemberManage] = useState(false);
  const [saving, setSaving] = useState(false);

  const isOwner = groupInfo?.myRole === 'owner';
  const isAdminOrOwner = groupInfo?.myRole === 'owner' || groupInfo?.myRole === 'admin';

  const handleSaveName = useCallback(async () => {
    if (!nameVal.trim()) {
      message.warning('群名称不能为空');
      return;
    }
    setSaving(true);
    const result = await groupActions.update({ name: nameVal.trim() });
    setSaving(false);
    if (result) {
      message.success('群名称已更新');
      setEditName(false);
      refreshGroup();
    } else {
      message.error('更新失败');
    }
  }, [nameVal, groupActions, refreshGroup]);

  const handleSaveAnnouncement = useCallback(async () => {
    setSaving(true);
    const result = await groupActions.update({ announcement: announcementVal.trim() });
    setSaving(false);
    if (result) {
      message.success('群公告已更新');
      setEditAnnouncement(false);
      refreshGroup();
    } else {
      message.error('更新失败');
    }
  }, [announcementVal, groupActions, refreshGroup]);

  const handleAddMembers = useCallback(
    async (userIds: string[]): Promise<boolean> => {
      const ok = await groupActions.addMembers(userIds);
      if (ok) refreshMembers();
      return ok;
    },
    [groupActions, refreshMembers],
  );

  const handleRemoveMember = useCallback(
    async (userId: string): Promise<boolean> => {
      const ok = await groupActions.removeMember(userId);
      if (ok) refreshMembers();
      return ok;
    },
    [groupActions, refreshMembers],
  );

  const handleChangeRole = useCallback(
    async (userId: string, role: GroupRole): Promise<boolean> => {
      const ok = await groupActions.changeMemberRole(userId, role);
      if (ok) refreshMembers();
      return ok;
    },
    [groupActions, refreshMembers],
  );

  const handleDissolve = useCallback(() => {
    Modal.confirm({
      title: '解散群聊',
      content: '确定要解散该群聊吗？此操作不可撤销，所有成员将被移出。',
      okText: '确定解散',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const ok = await groupActions.dissolve();
        if (ok) {
          message.success('群聊已解散');
          navigate('/chat', { replace: true });
        } else {
          message.error('操作失败');
        }
      },
    });
  }, [groupActions, navigate]);

  const handleQuit = useCallback(() => {
    Modal.confirm({
      title: '退出群聊',
      content: '确定要退出该群聊吗？',
      okText: '确定退出',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const ok = await groupActions.quit();
        if (ok) {
          message.success('已退出群聊');
          navigate('/chat', { replace: true });
        } else {
          message.error('操作失败');
        }
      },
    });
  }, [groupActions, navigate]);

  if (!groupId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999' }}>
        无效的群聊ID
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => navigate(`/chat/group/${groupId}`)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <ArrowLeftOutlined style={{ fontSize: 18, color: '#333' }} />
        </button>
        <Title level={4} style={{ margin: 0 }}>群设置</Title>
      </div>

      {/* Group Name */}
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ flex: 1 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>群名称</Text>
            {editName ? (
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <Input
                  value={nameVal}
                  onChange={(e) => setNameVal(e.target.value)}
                  maxLength={30}
                  placeholder="输入群名称"
                />
                <Button size="small" type="primary" onClick={handleSaveName} loading={saving}>
                  保存
                </Button>
                <Button size="small" onClick={() => setEditName(false)}>
                  取消
                </Button>
              </div>
            ) : (
              <div
                style={{ fontSize: 15, fontWeight: 500, marginTop: 2, cursor: isAdminOrOwner ? 'pointer' : 'default' }}
                onClick={() => {
                  if (isAdminOrOwner) {
                    setNameVal(groupInfo?.name || '');
                    setEditName(true);
                  }
                }}
              >
                {groupInfo?.name || '加载中...'}
                {isAdminOrOwner && (
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>点击编辑</Text>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Announcement */}
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 12,
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>群公告</Text>
        {editAnnouncement ? (
          <div style={{ marginTop: 6 }}>
            <TextArea
              value={announcementVal}
              onChange={(e) => setAnnouncementVal(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="输入群公告..."
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
              <Button size="small" type="primary" onClick={handleSaveAnnouncement} loading={saving}>
                保存
              </Button>
              <Button size="small" onClick={() => setEditAnnouncement(false)}>
                取消
              </Button>
            </div>
          </div>
        ) : (
          <div
            style={{ fontSize: 14, marginTop: 4, color: '#666', cursor: isAdminOrOwner ? 'pointer' : 'default', lineHeight: 1.6 }}
            onClick={() => {
              if (isAdminOrOwner) {
                setAnnouncementVal(groupInfo?.announcement || '');
                setEditAnnouncement(true);
              }
            }}
          >
            {groupInfo?.announcement || '暂无群公告'}
            {isAdminOrOwner && (
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>点击编辑</Text>
            )}
          </div>
        )}
      </div>

      {/* Members */}
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 12,
        }}
      >
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
          onClick={() => setShowMemberManage(true)}
        >
          <span style={{ fontSize: 14 }}>群成员 ({members.length})</span>
          <span style={{ color: '#999' }}>
            {isAdminOrOwner ? '管理' : '查看'} &gt;
          </span>
        </div>
      </div>

      {/* Danger Zone */}
      <div style={{ marginTop: 32 }}>
        {isOwner ? (
          <Button
            danger
            block
            onClick={handleDissolve}
            loading={groupActions.loading}
            style={{ marginBottom: 12 }}
          >
            解散群聊
          </Button>
        ) : (
          <Button
            danger
            block
            onClick={handleQuit}
            loading={groupActions.loading}
          >
            退出群聊
          </Button>
        )}
      </div>

      {/* Member Manage Modal */}
      <GroupMemberManage
        visible={showMemberManage}
        members={members}
        isOwner={isOwner}
        onClose={() => setShowMemberManage(false)}
        onAddMembers={handleAddMembers}
        onRemoveMember={handleRemoveMember}
        onChangeRole={handleChangeRole}
      />
    </div>
  );
}
