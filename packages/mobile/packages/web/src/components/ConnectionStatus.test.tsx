import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus } from './ConnectionStatus';
import { useWSStore } from '@/store';

describe('ConnectionStatus', () => {
  beforeEach(() => {
    useWSStore.setState({
      status: 'disconnected',
      lastConnectedAt: null,
      reconnectAttempt: 0,
    });
  });

  it('renders disconnected state', () => {
    render(<ConnectionStatus />);
    expect(screen.getByText('未连接')).toBeDefined();
  });

  it('renders connecting state', () => {
    useWSStore.setState({ status: 'connecting' });
    render(<ConnectionStatus />);
    expect(screen.getByText('连接中…')).toBeDefined();
  });

  it('renders connected state', () => {
    useWSStore.setState({ status: 'connected' });
    render(<ConnectionStatus />);
    expect(screen.getByText('已连接')).toBeDefined();
  });
});
