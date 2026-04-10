DROP INDEX IF EXISTS idx_workspaces_status_active;

ALTER TABLE workspaces
    DROP COLUMN IF EXISTS deleted_by,
    DROP COLUMN IF EXISTS deleted_at,
    DROP COLUMN IF EXISTS suspended_by,
    DROP COLUMN IF EXISTS suspended_reason,
    DROP COLUMN IF EXISTS suspended_at,
    DROP COLUMN IF EXISTS status;
