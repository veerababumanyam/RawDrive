BEGIN;

CREATE TABLE IF NOT EXISTS gallery_workspace_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    owner_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    shared_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    storage_billed_to_workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    migrate_storage_usage BOOLEAN NOT NULL DEFAULT FALSE,
    migrated_original_bytes BIGINT NOT NULL DEFAULT 0,
    migrated_derivative_bytes BIGINT NOT NULL DEFAULT 0,
    storage_migrated_at TIMESTAMPTZ,
    shared_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT gallery_workspace_shares_not_self
        CHECK (owner_workspace_id <> shared_workspace_id),
    CONSTRAINT gallery_workspace_shares_storage_owner_or_shared
        CHECK (storage_billed_to_workspace_id IN (owner_workspace_id, shared_workspace_id)),
    CONSTRAINT gallery_workspace_shares_migrated_nonnegative
        CHECK (migrated_original_bytes >= 0 AND migrated_derivative_bytes >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS gallery_workspace_shares_active_uniq
    ON gallery_workspace_shares (gallery_id, shared_workspace_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS gallery_workspace_shares_gallery_idx
    ON gallery_workspace_shares (gallery_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS gallery_workspace_shares_shared_workspace_idx
    ON gallery_workspace_shares (shared_workspace_id)
    WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS gallery_workspace_shares_billed_workspace_idx
    ON gallery_workspace_shares (storage_billed_to_workspace_id)
    WHERE revoked_at IS NULL;

COMMIT;
