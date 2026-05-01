import React, { useState } from 'react';
import type { RedPacketInfo } from '@/types';

interface RedPacketMessageProps {
  packet: RedPacketInfo;
  onOpen?: (packetId: string) => void;
  opened?: boolean;
}

const RedPacketMessage: React.FC<RedPacketMessageProps> = ({
  packet,
  onOpen,
  opened = false,
}) => {
  const [isOpened, setIsOpened] = useState(opened);

  const handleClick = () => {
    if (isOpened || packet.status !== 'active') return;
    if (onOpen) {
      onOpen(packet.id);
      setIsOpened(true);
    }
  };

  const isFinished = packet.status === 'finished' || isOpened;
  const isExpired = packet.status === 'expired';

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'inline-block',
        padding: '12px 16px',
        borderRadius: 8,
        background: isFinished
          ? '#e8e8e8'
          : isExpired
            ? '#d9d9d9'
            : '#f56c6c',
        color: isFinished || isExpired ? '#999' : '#fff',
        cursor: isFinished || isExpired ? 'default' : 'pointer',
        maxWidth: 260,
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        {isFinished ? '红包已抢完' : isExpired ? '红包已过期' : '恭喜发财，大吉大利'}
      </div>
      <div style={{ fontSize: 12, opacity: 0.8 }}>
        {packet.blessing || '恭喜发财，大吉大利！'}
      </div>
      <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
        {packet.type === 'fixed' ? '普通红包' : '拼手气红包'}
      </div>
    </div>
  );
};

export default RedPacketMessage;
