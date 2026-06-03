-- Migration 152 rollback.
-- Drops ONLY the partial index + the three columns added by 152. Additive
-- inverse: does not touch assets.status, processing_error, or any other column.

BEGIN;

DROP INDEX IF EXISTS idx_assets_retryable;

ALTER TABLE assets
    DROP COLUMN IF EXISTS decode_format,
    DROP COLUMN IF EXISTS next_retry_at,
    DROP COLUMN IF EXISTS retry_count;

COMMIT;
