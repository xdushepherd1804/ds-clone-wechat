-- Migration: 000002_group_enhancements
-- Description: Add updated_at to groups, muted_until to group_members, and group_join_requests table

-- Add updated_at to groups
ALTER TABLE groups ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Add muted_until to group_members
ALTER TABLE group_members ADD COLUMN muted_until TIMESTAMPTZ;

-- Create group_join_requests table
CREATE TABLE group_join_requests (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id   UUID         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message    VARCHAR(200),
    status     VARCHAR(20)  NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT uq_group_join_requests_group_user UNIQUE (group_id, user_id)
);

CREATE INDEX idx_group_join_requests_group_id ON group_join_requests (group_id);
CREATE INDEX idx_group_join_requests_user_id  ON group_join_requests (user_id);
