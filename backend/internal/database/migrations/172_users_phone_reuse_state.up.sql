-- Migration 172: users.phone_reuse_state + users.paid_phone_verified_at
-- (slice 2 of the phone-reuse epic).
--
-- WHY: the phone-reuse rule is "one FREE account per normalized phone; extra
-- accounts only if paid; a lapsed paid account does not become a second free
-- account." That requires a per-account state. We model it as VARCHAR + CHECK
-- (matching subscriptions.status, migration 059) rather than a PG ENUM, because
-- adding a value to a PG ENUM later cannot run inside a transaction — VARCHAR +
-- CHECK is consistent with the codebase and trivially evolvable.
--
-- States:
--   free          the phone's single free slot (DEFAULT for every existing row)
--   paid_pending  2nd+ account on a used phone; NO workspace/quota until paid
--   paid_active    paid_pending that completed a provider-verified payment
--   paid_expired   was paid_active and lapsed/cancelled, OR a backfilled collider
--                  that lost the free slot — must renew/pay or use another phone
--
-- This slice only adds the columns (every existing row defaults to 'free').
-- cmd/backfill-phone-reuse-state then sets paid_active / paid_expired correctly
-- and auto-resolves pre-existing normalized-phone collisions. No uniqueness
-- behavior changes here (users_phone_key stays until migration 173). Additive,
-- idempotent, reversible.
--
-- Numbered 172: follows 171 (users_phone_normalized) in this epic; verified next
-- free above origin/main's 170.

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone_reuse_state VARCHAR(20) NOT NULL DEFAULT 'free',
    ADD COLUMN IF NOT EXISTS paid_phone_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN users.phone_reuse_state IS
    'Phone-reuse lifecycle: free | paid_pending | paid_active | paid_expired. One free slot per normalized phone is enforced by the partial unique index in migration 173. paid_pending holds no workspace/quota until a provider-verified payment.';
COMMENT ON COLUMN users.paid_phone_verified_at IS
    'When a paid-reuse account''s payment was provider-verified (set on the paid_pending -> paid_active transition; backfilled to now() for existing paid accounts).';

-- Idempotent CHECK: drop-then-add so re-running the migration cannot fail on a
-- pre-existing constraint of the same name.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_reuse_state_check;
ALTER TABLE users ADD CONSTRAINT users_phone_reuse_state_check
    CHECK (phone_reuse_state IN ('free', 'paid_pending', 'paid_active', 'paid_expired'));

-- Lookup index for the access-time paid_expired guard (slice 5) and admin views
-- that filter by state.
CREATE INDEX IF NOT EXISTS idx_users_phone_reuse_state
    ON users (phone_reuse_state);

COMMIT;
