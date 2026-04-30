-- Migration: 000001_init
-- Description: Create initial PostgreSQL schema for WeChat Clone
-- Tables: users, contacts, groups, group_members, moments, moment_likes, moment_comments

-- ─── EXTENSIONS ───────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- for gen_random_uuid()

-- ─── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nickname      VARCHAR(100) NOT NULL,
    avatar        VARCHAR(500),
    phone         VARCHAR(20)  UNIQUE,
    status        VARCHAR(20)  NOT NULL DEFAULT 'offline',
    last_seen_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Index for login: username lookup
CREATE INDEX idx_users_username ON users (username);

-- Index for phone lookup
CREATE INDEX idx_users_phone ON users (phone);

-- Index for status filtering (online users)
CREATE INDEX idx_users_status ON users (status) WHERE status = 'online';

-- ─── CONTACTS ─────────────────────────────────────────────────────────────────
CREATE TABLE contacts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    remark     VARCHAR(100),
    tags       VARCHAR(50)[] NOT NULL DEFAULT '{}',
    status     VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- Prevent duplicate contact relationships
    CONSTRAINT uq_contacts_user_contact UNIQUE (user_id, contact_id),
    -- Prevent self-contact
    CONSTRAINT ck_contacts_no_self CHECK (user_id <> contact_id)
);

CREATE INDEX idx_contacts_user_id    ON contacts (user_id);
CREATE INDEX idx_contacts_contact_id ON contacts (contact_id);

-- ─── GROUPS ───────────────────────────────────────────────────────────────────
CREATE TABLE groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(100) NOT NULL,
    avatar       VARCHAR(500),
    owner_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    announcement TEXT,
    member_count INTEGER      NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_groups_owner_id ON groups (owner_id);

-- ─── GROUP MEMBERS ────────────────────────────────────────────────────────────
CREATE TABLE group_members (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id          UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role              VARCHAR(20) NOT NULL DEFAULT 'member',
    nickname_in_group VARCHAR(100),
    joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_group_members_group_user UNIQUE (group_id, user_id)
);

CREATE INDEX idx_group_members_group_id ON group_members (group_id);
CREATE INDEX idx_group_members_user_id  ON group_members (user_id);

-- ─── MOMENTS ──────────────────────────────────────────────────────────────────
CREATE TABLE moments (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content    TEXT,
    images     VARCHAR(500)[] NOT NULL DEFAULT '{}',
    location   VARCHAR(200),
    visibility VARCHAR(20)   NOT NULL DEFAULT 'public',
    created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Composite index for timeline queries: "show me my friends' moments, newest first"
CREATE INDEX idx_moments_user_timeline ON moments (user_id, created_at DESC);

-- ─── MOMENT LIKES ─────────────────────────────────────────────────────────────
CREATE TABLE moment_likes (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    moment_id  UUID        NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Prevent duplicate likes
    CONSTRAINT uq_moment_likes_moment_user UNIQUE (moment_id, user_id)
);

-- ─── MOMENT COMMENTS ──────────────────────────────────────────────────────────
CREATE TABLE moment_comments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    moment_id   UUID        NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reply_to_id UUID        REFERENCES moment_comments(id) ON DELETE SET NULL,
    content     TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for comment listing: "show comments on a moment, oldest first"
CREATE INDEX idx_moment_comments_moment_time ON moment_comments (moment_id, created_at);

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
