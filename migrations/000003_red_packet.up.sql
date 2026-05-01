-- Migration: red packet system
CREATE TABLE IF NOT EXISTS red_packets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id VARCHAR(100),
  total_amount DOUBLE PRECISION NOT NULL,
  total_count INTEGER NOT NULL,
  remaining_count INTEGER NOT NULL,
  remaining_amount DOUBLE PRECISION NOT NULL,
  type VARCHAR(20) NOT NULL,
  blessing VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  expired_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_red_packets_sender ON red_packets(sender_id);
CREATE INDEX idx_red_packets_conv ON red_packets(conversation_id);
CREATE INDEX idx_red_packets_status_expired ON red_packets(status, expired_at);

CREATE TABLE IF NOT EXISTS red_packet_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id UUID NOT NULL REFERENCES red_packets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(packet_id, user_id)
);

CREATE INDEX idx_red_packet_records_user ON red_packet_records(user_id);
