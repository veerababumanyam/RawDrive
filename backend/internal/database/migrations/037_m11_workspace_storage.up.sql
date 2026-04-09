-- M11: Workspace storage accounting (ISS-012)
CREATE TABLE IF NOT EXISTS workspace_storage (
    workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
    used_bytes BIGINT NOT NULL DEFAULT 0,
    derivative_bytes BIGINT NOT NULL DEFAULT 0,
    grace_bytes BIGINT NOT NULL DEFAULT 0,
    quota_bytes BIGINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspace_storage_used ON workspace_storage (used_bytes);

-- Initialize storage tracking for existing workspaces
INSERT INTO workspace_storage (workspace_id, used_bytes, quota_bytes)
SELECT w.id, COALESCE(
    (SELECT SUM(a.size_bytes) FROM assets a WHERE a.workspace_id = w.id AND a.deleted_at IS NULL), 0
), 10737418240  -- 10GB default quota
FROM workspaces w
ON CONFLICT (workspace_id) DO NOTHING;
