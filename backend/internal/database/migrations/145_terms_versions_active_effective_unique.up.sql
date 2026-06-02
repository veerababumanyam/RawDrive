-- Migration 145: enforce a single currently-effective terms version
-- Migration 144 introduced the terms acceptance ledger and a non-unique active
-- index. This forward migration tightens the catalog invariant without
-- touching historical acceptance proof.

BEGIN;

-- Keep the lookup index aligned with TermsRepo.GetActiveVersion and enforce
-- migration 144's "one currently-effective active version" invariant. Future
-- dated terms may be staged while the current version remains active; a
-- trigger blocks publishing a second already-effective non-revoked row.
DROP INDEX IF EXISTS idx_terms_versions_active;

CREATE INDEX IF NOT EXISTS idx_terms_versions_active_lookup
    ON terms_versions (effective_at DESC, published_at DESC)
    WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION enforce_single_effective_terms_version()
RETURNS trigger AS $$
BEGIN
    IF NEW.revoked_at IS NULL AND NEW.effective_at <= now() THEN
        IF EXISTS (
            SELECT 1
            FROM terms_versions
            WHERE version <> NEW.version
              AND revoked_at IS NULL
              AND effective_at <= now()
        ) THEN
            RAISE EXCEPTION 'only one currently-effective terms version may be active';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_single_effective_terms_version ON terms_versions;
CREATE TRIGGER trg_enforce_single_effective_terms_version
    BEFORE INSERT OR UPDATE OF revoked_at, effective_at
    ON terms_versions
    FOR EACH ROW
    EXECUTE FUNCTION enforce_single_effective_terms_version();

COMMIT;
