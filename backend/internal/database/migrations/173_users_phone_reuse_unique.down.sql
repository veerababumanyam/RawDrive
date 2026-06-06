-- Down for migration 173: drop the partial unique index and restore the
-- original global byte-exact uniqueness.
--
-- NOTE: re-adding users_phone_key may FAIL if raw-duplicate phones now exist
-- (which is precisely what the forward migration enables). That is acceptable
-- for a manual rollback — resolve the duplicates first, or drop this statement.

BEGIN;

DROP INDEX IF EXISTS users_phone_normalized_free_unique;

ALTER TABLE users ADD CONSTRAINT users_phone_key UNIQUE (phone);

COMMIT;
