-- Migration: 000003_device_tokens
-- Description: Add device_tokens table for push notification device registration

CREATE TABLE device_tokens (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform     VARCHAR(10)  NOT NULL,
    device_token VARCHAR(500) NOT NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_device_tokens_user_token UNIQUE (user_id, device_token)
);

CREATE INDEX idx_device_tokens_user_id ON device_tokens (user_id);
