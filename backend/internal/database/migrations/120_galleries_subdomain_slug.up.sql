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

-- Backfill pass 1: copy `slug` where it's already globally unique among
-- non-deleted galleries. Sanitizes defensively in case any legacy row
-- bypassed generateSlug (drops non-[a-z0-9-], trims leading hyphens).
WITH sanitized AS (
  SELECT
    id,
    regexp_replace(
      regexp_replace(lower(slug), '[^a-z0-9-]', '', 'g'),
      '^-+', ''
    ) AS clean_slug
  FROM galleries
  WHERE subdomain_slug IS NULL
    AND slug != ''
)
UPDATE galleries g
SET subdomain_slug = substring(s.clean_slug, 1, 63)
FROM sanitized s
WHERE g.id = s.id
  AND s.clean_slug != ''
  AND length(s.clean_slug) >= 1
  AND NOT EXISTS (
    SELECT 1 FROM galleries g2
    WHERE g2.id != g.id
      AND lower(g2.slug) = lower(g.slug)
      AND g2.deleted_at IS NULL
  );

-- Backfill pass 2: collisions get the first 6 chars of gallery UUID appended
-- so they remain globally unique. 56 + 1 + 6 = 63, fits the column.
UPDATE galleries
SET subdomain_slug =
  substring(
    regexp_replace(
      regexp_replace(lower(slug), '[^a-z0-9-]', '', 'g'),
      '^-+', ''
    ),
    1, 56
  ) || '-' || substring(id::text, 1, 6)
WHERE subdomain_slug IS NULL
  AND slug != '';

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
