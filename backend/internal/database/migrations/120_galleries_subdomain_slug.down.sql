-- 120: rollback subdomain_slug column + index + constraints.

BEGIN;

DROP INDEX IF EXISTS idx_galleries_subdomain_slug;

ALTER TABLE galleries
  DROP CONSTRAINT IF EXISTS subdomain_slug_valid_label;

ALTER TABLE galleries
  DROP CONSTRAINT IF EXISTS subdomain_slug_not_reserved;

ALTER TABLE galleries
  DROP COLUMN IF EXISTS subdomain_slug;

COMMIT;
