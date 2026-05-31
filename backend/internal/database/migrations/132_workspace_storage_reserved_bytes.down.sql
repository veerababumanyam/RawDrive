DROP INDEX IF EXISTS idx_workspace_storage_reserved;

ALTER TABLE workspace_storage
    DROP COLUMN IF EXISTS reserved_bytes;
