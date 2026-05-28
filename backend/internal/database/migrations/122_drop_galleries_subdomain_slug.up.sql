-- 122: drop the deprecated galleries.subdomain_slug column.
--
-- Migration 120 added galleries.subdomain_slug as the per-gallery routing
-- key for `<gallery-slug>.rawdrive.in`. Migration 121 replaced that scheme
-- with per-workspace subdomains (`<biz-slug>-<biz-code>.rawdrive.in/<gallery-slug>`),
-- making the gallery-level column dead weight.
--
-- Part-1 deploy (3efca3e) removed every Go and TypeScript reference to the
-- column. By the time this migration runs, no running backend instance
-- reads or writes subdomain_slug — dropping the column is safe.
--
-- Drop order matters: the UNIQUE partial index references the column,
-- the CHECK constraints reference the column, so the column DROP must
-- come last (or DROP COLUMN CASCADE — but explicit drops are cleaner and
-- the down migration can recreate them in reverse).

BEGIN;

DROP INDEX IF EXISTS idx_galleries_subdomain_slug;

ALTER TABLE galleries
  DROP CONSTRAINT IF EXISTS subdomain_slug_valid_label;

ALTER TABLE galleries
  DROP CONSTRAINT IF EXISTS subdomain_slug_not_reserved;

ALTER TABLE galleries
  DROP COLUMN IF EXISTS subdomain_slug;

COMMIT;
