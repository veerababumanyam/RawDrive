-- 120: add globally-unique subdomain_slug to galleries for *.rawdrive.in routing.
--
-- The existing `slug` column is unique per-workspace only (idx_galleries_workspace_slug,
-- migration 012). That's insufficient for subdomain routing — two workspaces could
-- collide and resolve to the same `<slug>.rawdrive.in`. Rather than promote `slug` to
-- globally unique (destructive for any rare existing collision), we add a separate
-- subdomain_slug column with stricter constraints.
--
-- Constraints baked into the DB so app bugs can't violate them:
--   - VARCHAR(63)         RFC 1035 max DNS label length
--   - NOT IN reserved set defense-in-depth against the app validator
--   - regex match         single DNS label, no leading/trailing hyphen
--   - no '--'             no consecutive hyphens
--   - UNIQUE index        WHERE NOT NULL (partial — backfill is best-effort)

BEGIN;

ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS subdomain_slug VARCHAR(63);

-- Sanitization (used in both backfill passes — kept in a CTE so the
-- same logic produces the same value each time):
--   1. lowercase
--   2. drop everything except [a-z0-9-]
--   3. collapse runs of hyphens to a single hyphen
--   4. trim hyphens from both ends
-- After this, the candidate is RFC-1035-clean. Truncation happens per-pass
-- (different max body length depending on whether we append a UUID prefix).
-- The trim(both '-' ...) is applied AGAIN after truncation in case the
-- 63rd/56th character was itself a hyphen.

-- Backfill pass 1: copy `slug` where it's already globally unique among
-- non-deleted galleries.
WITH sanitized AS (
  SELECT
    g.id,
    trim(both '-' from
      regexp_replace(
        regexp_replace(lower(g.slug), '[^a-z0-9-]', '', 'g'),
        '-+', '-', 'g'
      )
    ) AS clean_slug
  FROM galleries g
  WHERE g.subdomain_slug IS NULL
    AND g.slug != ''
)
UPDATE galleries g
SET subdomain_slug = trim(both '-' from substring(s.clean_slug, 1, 63))
FROM sanitized s
WHERE g.id = s.id
  AND s.clean_slug != ''
  AND trim(both '-' from substring(s.clean_slug, 1, 63)) != ''
  AND NOT EXISTS (
    SELECT 1 FROM galleries g2
    WHERE g2.id != g.id
      AND lower(g2.slug) = lower(g.slug)
      AND g2.deleted_at IS NULL
  );

-- Backfill pass 2: collisions get the first 6 chars of gallery UUID appended
-- so they remain globally unique. 56 + 1 + 6 = 63, fits the column. The
-- UUID prefix is always hex (alphanumeric), so the final character is
-- guaranteed alphanumeric — no trailing-hyphen risk.
UPDATE galleries g
SET subdomain_slug = (
  CASE
    WHEN trim(both '-' from substring(
      trim(both '-' from
        regexp_replace(
          regexp_replace(lower(g.slug), '[^a-z0-9-]', '', 'g'),
          '-+', '-', 'g'
        )
      ), 1, 56
    )) = ''
    THEN 'g'
    ELSE trim(both '-' from substring(
      trim(both '-' from
        regexp_replace(
          regexp_replace(lower(g.slug), '[^a-z0-9-]', '', 'g'),
          '-+', '-', 'g'
        )
      ), 1, 56
    ))
  END
) || '-' || substring(g.id::text, 1, 6)
WHERE g.subdomain_slug IS NULL
  AND g.slug != '';

-- Reserved-label CHECK — defense-in-depth against the Go-side validator.
-- Future additions need a new migration; that's intentional friction so
-- nobody sneaks a reservation in via env config.
ALTER TABLE galleries
  ADD CONSTRAINT subdomain_slug_not_reserved
  CHECK (
    subdomain_slug IS NULL OR
    subdomain_slug NOT IN (
      'www', 'api', 'app', 'admin', 'cdn', 'mail', 'ftp', 'static',
      'assets', 'blog', 'docs', 'support', 'status', 'billing',
      'payments', 'auth', 'login', 'register', 'mx', 'ns',
      'cobolt', 'rawdrive', 'localhost', 'test'
    )
  );

-- DNS label rule + no consecutive hyphens. RFC 1035 says labels are
-- 1-63 alphanumerics-plus-hyphens, not starting or ending with hyphen.
-- We allow underscores nowhere (some DNS resolvers and the LE wildcard
-- cert don't deal with them cleanly).
ALTER TABLE galleries
  ADD CONSTRAINT subdomain_slug_valid_label
  CHECK (
    subdomain_slug IS NULL OR (
      subdomain_slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' AND
      subdomain_slug !~ '--'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_galleries_subdomain_slug
  ON galleries (subdomain_slug)
  WHERE subdomain_slug IS NOT NULL;

COMMIT;
