-- Restore the legacy app-layer media encryption key path for rollback only.

CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    encrypted_dek TEXT NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1,
    algorithm VARCHAR(20) NOT NULL DEFAULT 'AES-256-GCM',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rotated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_encryption_keys_workspace
    ON encryption_keys (workspace_id, key_version DESC);

ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS encryption_key_id UUID REFERENCES encryption_keys(id);
