-- Migration 173: replace the global byte-exact phone uniqueness with a
-- normalization-aware, state-aware partial unique index (slice 3 of the
-- phone-reuse epic). THE enforcement migration.
--
-- Before: users_phone_key = UNIQUE(phone) on the RAW string (migration 002).
-- Bypassable by reformatting ("9876543210" vs "+91 98765 43210"), and it blocks
-- a legitimate paid second account on a phone that already has a free one.
--
-- After: at most ONE 'free' account per NORMALIZED phone. paid_pending /
-- paid_active / paid_expired rows are deliberately OUTSIDE the predicate so
-- additional PAID accounts on the same phone can coexist — exactly the business
-- rule (one free per phone; extras only if paid).
--
-- PRECONDITION: cmd/backfill-phone-reuse-state must have run so phone_normalized
-- is populated and any pre-existing free/free collisions are auto-resolved
-- (oldest keeps free, colliders -> paid_expired). The DO block below FAILS
-- CLOSED if any unresolved free collision remains — the index would otherwise
-- error mid-create and the rule was always to detect, never to silently lose a
-- real account.
--
-- Numbered 173: follows 171/172 in this epic; verified next free above
-- origin/main's 170.

BEGIN;

DO $$
DECLARE
    dup_groups int;
BEGIN
    SELECT count(*) INTO dup_groups FROM (
        SELECT phone_normalized
        FROM users
        WHERE phone_normalized IS NOT NULL
          AND phone_reuse_state = 'free'
        GROUP BY phone_normalized
        HAVING count(*) > 1
    ) d;
    IF dup_groups > 0 THEN
        RAISE EXCEPTION
            'phone-reuse migration 173 aborted: % normalized-phone group(s) still have >1 free account. Run: go run ./cmd/backfill-phone-reuse-state',
            dup_groups;
    END IF;
END $$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_normalized_free_unique
    ON users (phone_normalized)
    WHERE phone_normalized IS NOT NULL AND phone_reuse_state = 'free';

COMMENT ON INDEX users_phone_normalized_free_unique IS
    'At most one free account per normalized phone. Replaces users_phone_key (migration 002). Paid-state rows are outside the predicate so additional paid accounts on the same phone are allowed.';

COMMIT;
