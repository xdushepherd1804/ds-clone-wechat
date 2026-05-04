import type { GroupMember, GroupRole } from '@/types';
import { useOnlineStatuses } from '@/hooks/useOnlineStatus';
import { TeamOutlined, CloseOutlined } from '@ant-design/icons';

function memberDisplayName(m: GroupMember): string {
  return m.nicknameInGroup || m.userId;
}

interface GroupMemberListProps {
  visible: boolean;
  members: GroupMember[];
  currentUserId: string;
  isOwner: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onKickMember: (member: GroupMember) => void;
  onChangeRole: (member: GroupMember, role: GroupRole) => void;
  onSendMessage: (member: GroupMember) => void;
}

export default function GroupMemberList({
  visible,
  members,
  currentUserId,
  isOwner,
  isAdmin,
  onClose,
  onKickMember,
  onChangeRole,
  onSendMessage,
}: GroupMemberListProps) {
  const memberIds = members.map((m) => m.userId);
  const onlineStatuses = useOnlineStatuses(memberIds);

  if (!visible) return null;

  const canManage = isOwner || isAdmin;

  const onlineMembers = members.filter((m) => onlineStatuses[m.userId]?.isOnline);
  const offlineMembers = members.filter((m) => !onlineStatuses[m.userId]?.isOnline);
  const sortedMembers = [...onlineMembers, ...offlineMembers];

  return (
    <div
      style={{
        width: 260,
        borderLeft: '1px solid #e0e0e0',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #f0f0f0',
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        <span>
          <TeamOutlined style={{ marginRight: 6 }} />
          群成员 ({members.length})
        </span>
        <CloseOutlined
          style={{ cursor: 'pointer', fontSize: 14, color: '#999' }}
          onClick={onClose}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {sortedMembers.map((member) => {
          const name = memberDisplayName(member);
          const isOnline = onlineStatuses[member.userId]?.isOnline;
          const isSelf = member.userId === currentUserId;

          return (
            <div
              key={member.userId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = '#f5f5f5';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'transparent';
              }}
            >
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img
                  src={''}
                  alt=""
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 4,
                    background: '#e0e0e0',
                    objectFit: 'cover',
                  }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                {isOnline && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      right: -1,
                      width: 10,
                      height: 10,
                      background: '#07c160',
                      borderRadius: '50%',
                      border: '2px solid #fff',
                    }}
                  />
                )}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {name}
                  {isSelf && (
                    <span style={{ fontSize: 11, color: '#999', marginLeft: 4 }}>(我)</span>
                  )}
                </div>
                {member.role !== 'member' && (
                  <span
                    style={{
                      fontSize: 10,
                      color: member.role === 'owner' ? '#e6501a' : '#faad14',
                    }}
                  >
                    {member.role === 'owner' ? '群主' : '管理员'}
                  </span>
                )}
              </div>

              {canManage && !isSelf && (
                <div style={{ display: 'flex', gap: 4 }}>
                  {isOwner && member.role !== 'owner' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onChangeRole(
                          member,
                          member.role === 'admin' ? 'member' : 'admin',
                        );
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        fontSize: 11,
                        color: '#07c160',
                        padding: '2px 6px',
                      }}
                    >
                      {member.role === 'admin' ? '取消管理' : '设管理'}
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onKickMember(member);
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 11,
                      color: '#ff4d4f',
                      padding: '2px 6px',
                    }}
                  >
                    移出
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
