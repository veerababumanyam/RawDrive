-- Migration 145 rollback: restore the migration 144 active lookup index.

BEGIN;

DROP TRIGGER IF EXISTS trg_enforce_single_effective_terms_version ON terms_versions;
DROP FUNCTION IF EXISTS enforce_single_effective_terms_version();
DROP INDEX IF EXISTS idx_terms_versions_active_lookup;

CREATE INDEX IF NOT EXISTS idx_terms_versions_active
    ON terms_versions (published_at DESC)
    WHERE revoked_at IS NULL;

COMMIT;
