-- Down for 135 — drop the derivative-retry bookkeeping columns + index.

DROP INDEX IF EXISTS idx_assets_error_retryable;

ALTER TABLE assets
    DROP COLUMN IF EXISTS processing_attempts,
    DROP COLUMN IF EXISTS failed_permanently_at;
