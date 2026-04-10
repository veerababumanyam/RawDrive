-- Rollback: 058_admin_schema_alignment
--
-- WARNING: Dropping users.status and users.last_login_at will break the
-- admin user list, suspend, reactivate, and delete endpoints. Only run
-- this if rolling back the admin repository rewrite in the same step.

BEGIN;

DROP INDEX IF EXISTS idx_users_last_login;
DROP INDEX IF EXISTS idx_users_status_created;

ALTER TABLE users
    DROP COLUMN IF EXISTS status,
    DROP COLUMN IF EXISTS last_login_at;

ALTER TABLE workspaces
    DROP COLUMN IF EXISTS updated_at;

COMMIT;
