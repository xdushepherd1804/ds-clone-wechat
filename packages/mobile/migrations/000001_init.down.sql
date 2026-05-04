-- Migration: 000001_init (rollback)
-- Description: Drop all tables created by 000001_init.up.sql

-- Drop triggers first
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS moment_comments;
DROP TABLE IF EXISTS moment_likes;
DROP TABLE IF EXISTS moments;
DROP TABLE IF EXISTS group_members;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS contacts;
DROP TABLE IF EXISTS users;

-- Extension (optional to drop — leave it, harmless):
-- DROP EXTENSION IF EXISTS "pgcrypto";
