-- M7 E20-S3: Workspace lifecycle management (suspend, soft-delete).
--
-- The admin command center needs to suspend workspaces (block access but
-- preserve data for billing disputes, abuse reports) and soft-delete them
-- (user requested account closure, 30-day retention before purge). This
-- migration adds the columns the AdminWorkspaceService reads and writes.

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'deleted')),
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
    ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id);

COMMENT ON COLUMN workspaces.status IS
    'active → suspended (admin action) → deleted (soft-delete, 30-day retention). Hard delete is via background purge worker.';

-- Partial index for the admin workspaces list — most queries filter by non-deleted.
CREATE INDEX IF NOT EXISTS idx_workspaces_status_active
    ON workspaces(status, created_at DESC)
    WHERE deleted_at IS NULL;
