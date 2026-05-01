import { useState } from 'react';
import { UpOutlined, DownOutlined, CloseOutlined } from '@ant-design/icons';

interface GroupAnnouncementProps {
  announcement: string | null;
  editable?: boolean;
  onEdit?: () => void;
}

export default function GroupAnnouncement({
  announcement,
  editable,
  onEdit,
}: GroupAnnouncementProps) {
  const [expanded, setExpanded] = useState(false);

  if (!announcement) {
    if (editable) {
      return (
        <div
          style={{
            padding: '8px 16px',
            background: '#fffbe6',
            borderBottom: '1px solid #ffe58f',
            fontSize: 13,
            color: '#999',
            textAlign: 'center',
            cursor: 'pointer',
          }}
          onClick={onEdit}
        >
          暂无群公告，点击设置
        </div>
      );
    }
    return null;
  }

  const preview = announcement.length > 60 && !expanded
    ? announcement.slice(0, 60) + '...'
    : announcement;

  return (
    <div
      style={{
        padding: '8px 16px',
        background: '#fffbe6',
        borderBottom: '1px solid #ffe58f',
        fontSize: 13,
        color: '#666',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontWeight: 600, color: '#e6501a', flexShrink: 0, marginTop: 1 }}>
          公告
        </span>
        <span style={{ flex: 1, lineHeight: 1.6, wordBreak: 'break-word' }}>{preview}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {editable && (
            <span
              style={{ fontSize: 11, color: '#07c160', cursor: 'pointer' }}
              onClick={onEdit}
            >
              编辑
            </span>
          )}
          {announcement.length > 60 && (
            <span
              style={{ cursor: 'pointer', color: '#999', display: 'flex', alignItems: 'center' }}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <UpOutlined style={{ fontSize: 10 }} /> : <DownOutlined style={{ fontSize: 10 }} />}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
