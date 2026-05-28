-- 121: per-workspace subdomain identity for *.rawdrive.in routing.
--
-- The earlier per-gallery scheme (migration 120: galleries.subdomain_slug)
-- gave every gallery its own subdomain. That's the wrong shape for a SaaS
-- where photographers want a single permanent branded URL — one subdomain
-- per business, galleries are paths under it. Migration 120 stays on disk
-- but its column is no longer the routing key after this lands; cleanup
-- migration to follow.
--
-- New URL shape:
--   https://<business_profile_slug>-<business_unique_code>.rawdrive.in/<gallery.slug>
--
-- Each workspace owns one subdomain. The unique_code is a globally-unique
-- random alphanumeric string — it's what the backend looks up by, because
-- two workspaces can share a business_profile_slug (e.g. two "Test" studios)
-- but their full subdomains differ via the random code suffix.

BEGIN;

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS business_profile_slug VARCHAR(54),
  ADD COLUMN IF NOT EXISTS business_unique_code VARCHAR(8);

-- Backfill business_profile_slug from workspace.name.
-- Sanitization mirrors gallery_subdomain.go's sanitizeForSubdomain:
--   1. lowercase
--   2. keep [a-z0-9], coerce spaces and existing hyphens to a single hyphen
--      separator (so "Black n white photography" → "black-n-white-photography",
--      not "blacknwhitephotography")
--   3. drop everything else (periods, exclamation marks, etc.)
--   4. collapse runs of hyphens to single
--   5. trim from both ends
-- Truncate to 54 chars (63 column max for full subdomain - 1 delim - 8 code).
WITH base AS (
  SELECT
    id,
    name,
    trim(both '-' from
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(name, '')), '[^a-z0-9 -]', '', 'g'),
          '[ -]+', '-', 'g'
        ),
        '^-+|-+$', '', 'g'
      )
    ) AS clean_name
  FROM workspaces
  WHERE business_profile_slug IS NULL
)
UPDATE workspaces w
SET business_profile_slug = (
  CASE
    -- Empty after sanitize (workspace name was punctuation only) → stable fallback
    WHEN b.clean_name = '' OR b.clean_name IS NULL THEN 'studio'
    -- Reserved label (api, www, admin, …) — prefix to avoid visual confusion.
    -- The full subdomain `<reserved>-<code>` is still unique via the code,
    -- but `api-a1b2c3d4.rawdrive.in` looks weird; prefixing produces
    -- `studio-api-a1b2c3d4.rawdrive.in` which reads as a studio name.
    WHEN b.clean_name IN (
      'www', 'api', 'app', 'admin', 'cdn', 'mail', 'ftp', 'static',
      'assets', 'blog', 'docs', 'support', 'status', 'billing',
      'payments', 'auth', 'login', 'register', 'mx', 'ns',
      'cobolt', 'rawdrive', 'localhost', 'test'
    ) THEN 'studio-' || substring(b.clean_name, 1, 47)
    -- Truncate to 54 chars then trim trailing hyphens if cutoff lands on one
    ELSE trim(both '-' from substring(b.clean_name, 1, 54))
  END
)
FROM base b
WHERE w.id = b.id;

-- Backfill business_unique_code with a random 8-char lowercase hex string.
-- Random per row, retried in app code on the rare collision (UNIQUE index
-- below catches it). Using md5(random()::text || id::text) keeps each row
-- independent so two NULL workspaces don't get the same backfill value.
UPDATE workspaces
SET business_unique_code = substring(md5(random()::text || id::text), 1, 8)
WHERE business_unique_code IS NULL;

-- DNS-label CHECK on business_profile_slug (after backfill so the
-- constraint doesn't blow up the migration).
ALTER TABLE workspaces
  ADD CONSTRAINT business_profile_slug_valid_label
  CHECK (
    business_profile_slug IS NULL OR (
      char_length(business_profile_slug) BETWEEN 1 AND 54 AND
      business_profile_slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' AND
      business_profile_slug !~ '--'
    )
  );

-- Unique code shape: exactly 8 lowercase alphanumerics
ALTER TABLE workspaces
  ADD CONSTRAINT business_unique_code_shape
  CHECK (
    business_unique_code IS NULL OR
    business_unique_code ~ '^[a-z0-9]{8}$'
  );

-- The lookup index — backend resolves workspace by code alone (the slug
-- half is for display + canonical-redirect; the code is the source of truth).
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_business_unique_code
  ON workspaces (business_unique_code)
  WHERE business_unique_code IS NOT NULL;

-- Defense-in-depth: the full subdomain must be unique too, even if the
-- code alone is unique. Helps catch any later schema drift where two
-- rows somehow got the same combo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_business_full_subdomain
  ON workspaces ((business_profile_slug || '-' || business_unique_code))
  WHERE business_profile_slug IS NOT NULL AND business_unique_code IS NOT NULL;

COMMIT;
