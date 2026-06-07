-- Durable object-storage delete retry queue for hard-deleted assets.
--
-- Asset rows are removed immediately when users delete photos. The storage keys
-- must therefore be captured before the asset row is deleted so B2 cleanup can
-- retry safely if the request-time delete attempt or an app node crashes.

CREATE TABLE IF NOT EXISTS storage_deletion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    asset_id UUID,
    storage_key TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'deleted', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    claimed_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storage_deletion_jobs_claim
    ON storage_deletion_jobs (next_attempt_at, created_at)
    WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_storage_deletion_jobs_workspace
    ON storage_deletion_jobs (workspace_id, created_at DESC);
