-- 135 — AREA-UPLOADER-2 (audit 2026-05-31): durable retry + dead-letter for
-- assets whose WebP derivative generation failed.
--
-- WebP derivative generation is best-effort/out-of-band: chunked_upload
-- finalize sets the asset status='processing' and the thumbnail worker drives
-- generation on a poll. If cwebp is missing or generation errors, the
-- thumbnail worker flips the asset to status='error' and stops — nothing ever
-- retries it, so the asset lands PERMANENTLY with no derivatives (broken
-- gallery thumbnails) and the failure is silent (only a log line at the time).
--
-- These columns give the new bounded-retry sweep a place to count attempts and
-- a terminal marker for assets that have exhausted their retries:
--   - processing_attempts: incremented each time a failed asset is re-queued by
--     the retry sweep, so the sweep can cap retries instead of looping forever.
--   - failed_permanently_at: stamped when retries are exhausted. A non-null
--     value is the explicit terminal/dead-letter state the gallery UI and
--     metrics can surface ("derivative generation failed") instead of leaving
--     the asset silently stuck in status='error'.
--
-- Both are additive and nullable/defaulted, so existing rows and the existing
-- thumbnail worker path are unaffected.

ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS processing_attempts   integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS failed_permanently_at timestamptz;

-- Partial index so the retry sweep's "status='error' AND not yet permanently
-- failed" scan stays cheap as the assets table grows.
CREATE INDEX IF NOT EXISTS idx_assets_error_retryable
    ON assets (updated_at)
    WHERE status = 'error' AND failed_permanently_at IS NULL AND deleted_at IS NULL;
