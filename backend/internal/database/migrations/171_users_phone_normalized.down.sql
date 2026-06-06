-- Down for migration 171: remove the lookup index and the phone_normalized
-- column. Reversible and idempotent. No data loss beyond the derived column
-- (raw users.phone is untouched).

BEGIN;

DROP INDEX IF EXISTS idx_users_phone_normalized;

ALTER TABLE users
    DROP COLUMN IF EXISTS phone_normalized;

COMMIT;
