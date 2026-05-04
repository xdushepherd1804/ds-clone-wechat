import { Tooltip } from 'antd';
import { useWSStore } from '@/store';
import type { WSConnectionState } from '@/ws';

const statusConfig: Record<WSConnectionState, { color: string; label: string }> = {
  connected: { color: '#07c160', label: '已连接' },
  connecting: { color: '#faad14', label: '连接中…' },
  disconnected: { color: '#ff4d4f', label: '未连接' },
};

export function ConnectionStatus() {
  const status = useWSStore((s) => s.status);
  const cfg = statusConfig[status];

  return (
    <Tooltip title={`WebSocket: ${cfg.label}`}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          color: '#666',
          cursor: 'default',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: cfg.color,
            flexShrink: 0,
          }}
        />
        {cfg.label}
      </span>
    </Tooltip>
  );
}
