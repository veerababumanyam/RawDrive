-- 150 — align asset storage metadata with the actual S3-compatible driver.
--
-- RawDrive's managed storage is Backblaze B2 through the S3-compatible API,
-- and enterprise BYOS also routes through the same `s3` driver. The legacy
-- `r2` value is stale metadata from the Cloudflare era; leaving it in new or
-- existing asset rows makes production audits and driver routing ambiguous.

BEGIN;

ALTER TABLE assets
    ALTER COLUMN storage_driver SET DEFAULT 's3';

UPDATE assets
SET storage_driver = 's3',
    updated_at = now()
WHERE storage_driver = 'r2';

COMMIT;
