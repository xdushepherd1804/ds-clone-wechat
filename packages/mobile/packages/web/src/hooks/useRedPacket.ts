import { useState, useCallback } from 'react';
import {
  sendRedPacket,
  openRedPacket,
  getRedPacket,
  getSentHistory,
  getReceivedHistory,
} from '@/api/redpacket';
import type {
  RedPacketInfo,
  RedPacketDetail,
  RedPacketRecord,
  SendRedPacketInput,
  OpenRedPacketResult,
} from '@/types';

export function useSendRedPacket() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (input: SendRedPacketInput): Promise<RedPacketInfo | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await sendRedPacket(input);
      return result;
    } catch (err: any) {
      const message = err?.response?.data?.message || '发送红包失败';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { send, loading, error };
}

export function useOpenRedPacket() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = useCallback(async (packetId: string): Promise<OpenRedPacketResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await openRedPacket(packetId);
      return result;
    } catch (err: any) {
      const message = err?.response?.data?.message || '领取红包失败';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { open, loading, error };
}

export function useRedPacketDetail() {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<RedPacketDetail | null>(null);

  const fetch = useCallback(async (packetId: string) => {
    setLoading(true);
    try {
      const result = await getRedPacket(packetId);
      setDetail(result);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { detail, loading, fetch };
}

export function useRedPacketHistory() {
  const [sent, setSent] = useState<RedPacketInfo[]>([]);
  const [received, setReceived] = useState<RedPacketRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSent = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const result = await getSentHistory(page, pageSize);
      setSent(result.list);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReceived = useCallback(async (page = 1, pageSize = 20) => {
    setLoading(true);
    try {
      const result = await getReceivedHistory(page, pageSize);
      setReceived(result.list);
    } finally {
      setLoading(false);
    }
  }, []);

  return { sent, received, loading, fetchSent, fetchReceived };
}
