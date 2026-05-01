import { useState } from 'react';
import { Modal, Input, Button, message, List, Avatar, Tag } from 'antd';
import { UserAddOutlined, UserDeleteOutlined, CrownOutlined } from '@ant-design/icons';
import type { GroupMember, GroupRole } from '@/types';

function memberDisplayName(m: GroupMember): string {
  return m.nicknameInGroup || m.userId;
}

interface GroupMemberManageProps {
  visible: boolean;
  members: GroupMember[];
  isOwner: boolean;
  onClose: () => void;
  onAddMembers: (userIds: string[]) => Promise<boolean>;
  onRemoveMember: (userId: string) => Promise<boolean>;
  onChangeRole: (userId: string, role: GroupRole) => Promise<boolean>;
}

export default function GroupMemberManage({
  visible,
  members,
  isOwner,
  onClose,
  onAddMembers,
  onRemoveMember,
  onChangeRole,
}: GroupMemberManageProps) {
  const [addMode, setAddMode] = useState(false);
  const [inviteIds, setInviteIds] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAddMembers = async () => {
    const ids = inviteIds
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      message.warning('请输入要邀请的用户ID');
      return;
    }
    setLoading(true);
    const ok = await onAddMembers(ids);
    setLoading(false);
    if (ok) {
      message.success('邀请成功');
      setInviteIds('');
      setAddMode(false);
    } else {
      message.error('邀请失败，请检查用户ID是否正确');
    }
  };

  const handleRemove = async (userId: string) => {
    Modal.confirm({
      title: '确认移出',
      content: '确定要将该成员移出群聊吗？',
      okText: '确定',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const ok = await onRemoveMember(userId);
        if (ok) {
          message.success('已移出群聊');
        } else {
          message.error('操作失败');
        }
      },
    });
  };

  const handleRoleChange = async (userId: string, newRole: GroupRole) => {
    const ok = await onChangeRole(userId, newRole);
    if (ok) {
      message.success(newRole === 'admin' ? '已设为管理员' : '已取消管理员');
    } else {
      message.error('操作失败');
    }
  };

  return (
    <Modal
      title="管理群成员"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={500}
      destroyOnClose
    >
      <div style={{ marginBottom: 16 }}>
        {!addMode ? (
          <Button
            type="dashed"
            icon={<UserAddOutlined />}
            onClick={() => setAddMode(true)}
            block
          >
            邀请新成员
          </Button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Input.TextArea
              placeholder="输入用户ID，多个用逗号分隔"
              value={inviteIds}
              onChange={(e) => setInviteIds(e.target.value)}
              rows={2}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                type="primary"
                size="small"
                onClick={handleAddMembers}
                loading={loading}
              >
                确认邀请
              </Button>
              <Button size="small" onClick={() => { setAddMode(false); setInviteIds(''); }}>
                取消
              </Button>
            </div>
          </div>
        )}
      </div>

      <List
        dataSource={members}
        renderItem={(member) => {
          const name = memberDisplayName(member);
          return (
            <List.Item
              actions={
                isOwner && member.role !== 'owner'
                  ? [
                      member.role === 'admin' ? (
                        <Button
                          key="demote"
                          size="small"
                          onClick={() => handleRoleChange(member.userId, 'member')}
                        >
                          取消管理员
                        </Button>
                      ) : (
                        <Button
                          key="promote"
                          size="small"
                          onClick={() => handleRoleChange(member.userId, 'admin')}
                        >
                          <CrownOutlined /> 设为管理员
                        </Button>
                      ),
                      <Button
                        key="remove"
                        size="small"
                        danger
                        onClick={() => handleRemove(member.userId)}
                      >
                        <UserDeleteOutlined /> 移出
                      </Button>,
                    ]
                  : undefined
              }
            >
              <List.Item.Meta
                avatar={
                  <Avatar size="small">
                    {name[0]}
                  </Avatar>
                }
                title={
                  <span>
                    {name}
                    {member.role === 'owner' && (
                      <Tag color="orange" style={{ marginLeft: 4, fontSize: 10 }}>群主</Tag>
                    )}
                    {member.role === 'admin' && (
                      <Tag color="gold" style={{ marginLeft: 4, fontSize: 10 }}>管理员</Tag>
                    )}
                  </span>
                }
                description={`ID: ${member.userId}`}
              />
            </List.Item>
          );
        }}
      />
    </Modal>
  );
}
