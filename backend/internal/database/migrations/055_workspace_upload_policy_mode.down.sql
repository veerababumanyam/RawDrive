-- M16 E49-S1: Rollback workspace upload policy mode

DROP INDEX IF EXISTS idx_workspaces_upload_policy_mode;

ALTER TABLE workspaces
    DROP COLUMN IF EXISTS upload_policy_mode;
