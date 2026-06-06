-- Down for migration 172: remove the state index, CHECK constraint, and both
-- columns. Reversible and idempotent.

BEGIN;

DROP INDEX IF EXISTS idx_users_phone_reuse_state;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_reuse_state_check;

ALTER TABLE users
    DROP COLUMN IF EXISTS paid_phone_verified_at;

ALTER TABLE users
    DROP COLUMN IF EXISTS phone_reuse_state;

COMMIT;
