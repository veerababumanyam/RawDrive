-- Rollback migration 035: Remove platform_role from users
DROP INDEX IF EXISTS idx_users_platform_role;
ALTER TABLE users DROP COLUMN IF EXISTS platform_role;
