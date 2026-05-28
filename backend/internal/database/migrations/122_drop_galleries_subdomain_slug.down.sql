-- 122: reverse — re-add galleries.subdomain_slug + index + constraints.
--
-- The column is recreated as NULLABLE with no backfill. Reversing this
-- migration leaves the per-gallery subdomain feature non-functional (the
-- Go code references the column would need to be restored too — they
-- were deleted in commit 3efca3e). This down migration exists so
-- migration tooling can roll back as a schema operation; it is NOT a
-- complete feature rollback.

BEGIN;

ALTER TABLE galleries
  ADD COLUMN IF NOT EXISTS subdomain_slug VARCHAR(63);

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
