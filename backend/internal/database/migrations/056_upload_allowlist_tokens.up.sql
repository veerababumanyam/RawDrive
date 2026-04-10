-- M16 E50-S2: Upload allowlist tokens for false-positive override flow
-- Super-admins issue one-time tokens bound to a specific manifest hash so a
-- photographer can retry an upload that was blocked in error. Tokens expire
-- after 24h and are single-use (used_at column).
-- Reference: _cobolt-output/latest/planning/stories/50-2-fp-override-token.md

CREATE TABLE IF NOT EXISTS upload_allowlist_tokens (
    token           BYTEA PRIMARY KEY,
    manifest_hash   TEXT NOT NULL,
    workspace_id    UUID NOT NULL,
    issued_by       UUID NOT NULL,
    justification   TEXT NOT NULL,
    issued_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ NULL
);

-- Foreign key to users (adds referential integrity if users table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE upload_allowlist_tokens
            ADD CONSTRAINT fk_upload_allowlist_tokens_issued_by
            FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- Lookup index: find active (unused, not expired) token by manifest hash.
CREATE INDEX IF NOT EXISTS idx_upload_allowlist_tokens_hash_active
    ON upload_allowlist_tokens (manifest_hash)
    WHERE used_at IS NULL;

-- Index for expiry cleanup worker.
CREATE INDEX IF NOT EXISTS idx_upload_allowlist_tokens_expires_at
    ON upload_allowlist_tokens (expires_at)
    WHERE used_at IS NULL;
