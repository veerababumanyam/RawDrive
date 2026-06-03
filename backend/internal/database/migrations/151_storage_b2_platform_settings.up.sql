-- Managed Backblaze B2 storage settings.
--
-- Runtime lookup order is platform_settings first, then environment fallback.
-- These keys intentionally use b2_* names instead of the legacy r2_* rows
-- seeded by migration 039, because RawDrive's managed storage backend is
-- Backblaze B2 via the S3-compatible API.

BEGIN;

INSERT INTO platform_settings (category, key, value, is_secret, description) VALUES
  ('storage', 'b2_bucket_name', '', false, 'Backblaze B2 bucket name'),
  ('storage', 'b2_region', 'us-east-005', false, 'Backblaze B2 S3-compatible region'),
  ('storage', 'b2_endpoint', '', false, 'Backblaze B2 S3-compatible endpoint URL'),
  ('storage', 'b2_key_id', '', true, 'Backblaze B2 key ID / S3 access key ID'),
  ('storage', 'b2_application_key', '', true, 'Backblaze B2 application key / S3 secret access key'),
  ('storage', 'sse_mode', '', false, 'Storage server-side encryption mode: AES256 or SSE-C'),
  ('storage', 'sse_customer_key_hex', '', true, 'SSE-C customer key as 64 hex characters')
ON CONFLICT (category, key) DO NOTHING;

COMMIT;
