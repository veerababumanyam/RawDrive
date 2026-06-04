-- 159_assets_claimed_at.up.sql
-- Atomic lease-based job claim for the thumbnail / derivative worker.
--
-- assets.status='processing' is the post-upload "needs derivatives" state. The
-- thumbnail worker listed those rows (AssetRepo.ListRetryable / ListByStatus — a
-- plain SELECT with no row lock) and processed them, but the row stayed
-- 'processing' for the whole download → cwebp encode → upload window, so two
-- workers double-encoded every WebP variant and double-counted
-- workspace_storage.derivative_bytes. We add a claim lease: AssetRepo.ClaimRetryable
-- stamps claimed_at = now() inside a single UPDATE ... WHERE id IN (SELECT ... FOR
-- UPDATE SKIP LOCKED) statement, so each 'processing' asset is claimed by exactly
-- one worker until it reaches 'ready'/'failed' or its lease goes stale (crash
-- recovery). See backend/internal/worker/thumbnail_worker.go.

ALTER TABLE assets
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Partial index supporting the derivative-claim scan.
CREATE INDEX IF NOT EXISTS idx_assets_derivative_claim
    ON assets (created_at)
    WHERE status = 'processing' AND deleted_at IS NULL;
