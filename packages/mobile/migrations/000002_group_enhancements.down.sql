-- Revert: 000002_group_enhancements

DROP TABLE IF EXISTS group_join_requests;

ALTER TABLE group_members DROP COLUMN IF EXISTS muted_until;

ALTER TABLE groups DROP COLUMN IF EXISTS updated_at;
