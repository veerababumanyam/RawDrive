-- Down for migration 144: photographer Terms-of-Service / copyright acceptance.
-- Drops the acceptance ledger, the version catalog, and the denormalized
-- user columns. The append-only ledger is intentionally dropped wholesale on
-- rollback (there is no partial-state to preserve when the feature is removed).

BEGIN;

-- Rules are dropped automatically with the table, but drop explicitly first so
-- a partial/older state without the table does not error.
DROP RULE IF EXISTS user_terms_acceptances_no_update ON user_terms_acceptances;
DROP RULE IF EXISTS user_terms_acceptances_no_delete ON user_terms_acceptances;

DROP TABLE IF EXISTS user_terms_acceptances;
DROP TABLE IF EXISTS terms_versions;

ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_version;
ALTER TABLE users DROP COLUMN IF EXISTS terms_accepted_at;

COMMIT;
