-- Migration 171: users.phone_normalized — the canonical phone identity column.
--
-- WHY (slice 1 of the phone-reuse epic): the users table historically enforced
-- one-account-per-phone with a byte-exact UNIQUE constraint (users_phone_key)
-- on the RAW phone string. With no normalization, "9876543210",
-- "+91 98765 43210" and "098765 43210" are stored as DISTINCT rows, so the rule
-- was trivially bypassable by reformatting. This column stores the canonical
-- digit-only identity (backend/internal/phone.Normalize) so the later
-- phone-reuse uniqueness rule can be enforced on IDENTITY, not typography.
--
-- This slice is intentionally INERT: it only adds the column + a lookup index.
-- New writes are populated write-through by the user repo; historical rows are
-- backfilled authoritatively (in Go, single source of truth) by
-- cmd/backfill-phone-reuse-state in the next slice (migration 172). No
-- uniqueness behavior changes here — users_phone_key stays in force until the
-- constraint-swap slice (migration 173). Additive + idempotent + reversible.
--
-- Numbered 171: 170 (refine_event_pricing_details) is the current max committed
-- on origin/main; 171 is the next free number (verified against origin/main).

BEGIN;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS phone_normalized VARCHAR(20);

COMMENT ON COLUMN users.phone_normalized IS
    'Canonical digit-only phone identity (see backend/internal/phone.Normalize). Populated write-through on register/profile/onboarding; historical rows backfilled by cmd/backfill-phone-reuse-state. The phone-reuse uniqueness rule is enforced on THIS column, not the raw phone.';

-- Non-unique lookup index: registration/onboarding will look up "is this
-- normalized phone already used?" before deciding free vs paid_pending. Partial
-- on NOT NULL keeps it small (many legacy rows have no phone). NOT a uniqueness
-- constraint — that lands in migration 173 as a partial UNIQUE index.
CREATE INDEX IF NOT EXISTS idx_users_phone_normalized
    ON users (phone_normalized)
    WHERE phone_normalized IS NOT NULL;

COMMIT;
