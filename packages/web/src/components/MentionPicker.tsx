import { useState, useRef, useEffect, useCallback } from 'react';
import type { GroupMember } from '@/types';
import { useOnlineStatuses } from '@/hooks/useOnlineStatus';

function memberDisplayName(m: GroupMember): string {
  return m.nicknameInGroup || m.userId;
}

interface MentionPickerProps {
  visible: boolean;
  members: GroupMember[];
  filterText: string;
  onSelect: (member: GroupMember) => void;
  onClose: () => void;
  isAdminOrOwner: boolean;
  onSelectAll?: () => void;
}

export default function MentionPicker({
  visible,
  members,
  filterText,
  onSelect,
  onClose,
  isAdminOrOwner,
  onSelectAll,
}: MentionPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const memberIds = members.map((m) => m.userId);
  const onlineStatuses = useOnlineStatuses(memberIds);

  const filterLower = filterText.toLowerCase();
  const filtered = members.filter((m) => {
    const name = memberDisplayName(m);
    return name.toLowerCase().includes(filterLower);
  });

  const resolveSelectedIndex = useCallback(() => {
    if (filtered.length === 0) return;
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(0);
    }
  }, [filtered.length, selectedIndex]);

  useEffect(() => {
    resolveSelectedIndex();
  }, [resolveSelectedIndex]);

  useEffect(() => {
    if (!visible) {
      setSelectedIndex(0);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!visible) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [visible, filtered, selectedIndex, onSelect, onClose]);

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.children;
      if (items[selectedIndex]) {
        (items[selectedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 4,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
        maxHeight: 240,
        overflowY: 'auto',
        zIndex: 100,
      }}
      ref={listRef}
    >
      {isAdminOrOwner && filterLower.length === 0 && (
        <div
          style={{
            padding: '8px 12px',
            cursor: 'pointer',
            borderBottom: '1px solid #f0f0f0',
            color: '#e6501a',
            fontWeight: 600,
            fontSize: 14,
          }}
          onClick={() => onSelectAll?.()}
          onMouseEnter={() => setSelectedIndex(-1)}
        >
          @所有人
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: 13 }}>
          未找到匹配的成员
        </div>
      )}

      {filtered.map((member, idx) => {
        const name = memberDisplayName(member);
        const isOnline = onlineStatuses[member.userId]?.isOnline;
        const isSelected = idx === selectedIndex;

        return (
          <div
            key={member.userId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              cursor: 'pointer',
              background: isSelected ? '#f0f0f0' : 'transparent',
              transition: 'background 0.1s',
            }}
            onMouseEnter={() => setSelectedIndex(idx)}
            onClick={() => onSelect(member)}
          >
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <img
                src={''}
                alt=""
                style={{
                  width: 32,
                  height: 32,
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
            <span style={{ fontSize: 14, color: '#333' }}>{name}</span>
            {member.role !== 'member' && (
              <span
                style={{
                  fontSize: 10,
                  color: '#fff',
                  background: member.role === 'owner' ? '#e6501a' : '#faad14',
                  padding: '1px 4px',
                  borderRadius: 2,
                }}
              >
                {member.role === 'owner' ? '群主' : '管理员'}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
