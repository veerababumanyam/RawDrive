-- Issue #4 / RawDrive_NewUniqueIssues.xlsx Issue #5 (per-owner uniqueness):
-- enforce that one photographer cannot end up with two workspaces sharing
-- the same business name. The duplicate class lands today via the
-- partial-failure retry path in onboarding.SetProfile (see comment at
-- backend/internal/onboarding/onboarding.go:164-169 — "A future task can
-- add an 'existing workspace?' check here for full idempotency"). The DB
-- constraint is the canonical fix; the onboarding adapter is updated in
-- the same patch to short-circuit retries cleanly so users do not hit a
-- raw 23505 error during normal onboarding.
--
-- Uniqueness scope is INTENTIONALLY per-owner (owner_id, lower(name)),
-- NOT global. Two unrelated photographers may both legitimately call
-- their studio "Wedding Moments". A future global slug column can be
-- added separately if URL-level uniqueness is needed.

BEGIN;

-- 1. De-duplicate any existing rows that would violate the new constraint.
--    Strategy: keep the OLDEST row per (owner_id, lower(name)) tuple by
--    created_at; mark the rest with a sentinel rename so the unique index
--    can be created. We do NOT delete rows here — orphan workspaces may
--    have associated assets, members, or galleries that need a manual
--    review before being purged.
WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY owner_id, lower(name)
            ORDER BY created_at ASC, id ASC
        ) AS rn
    FROM workspaces
    WHERE owner_id IS NOT NULL
)
UPDATE workspaces
SET name = workspaces.name || ' (duplicate ' || ranked.id || ')'
FROM ranked
WHERE workspaces.id = ranked.id
  AND ranked.rn > 1;

-- 2. Create the case-insensitive unique index. Using a functional index on
--    lower(name) so "Wedding Moments" and "wedding moments" cannot both
--    be created by the same owner.
CREATE UNIQUE INDEX IF NOT EXISTS workspaces_owner_lower_name_uniq
    ON workspaces (owner_id, lower(name))
    WHERE owner_id IS NOT NULL;

COMMIT;
