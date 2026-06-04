-- 157_webhook_deliveries_claimed_at.up.sql
-- Atomic lease-based job claim for the webhook delivery worker.
--
-- processBatch() ran a standalone SELECT ... FOR UPDATE SKIP LOCKED (the row
-- locks released on rows.Close, with no enclosing transaction) and only marked
-- the row completed/failed/dead AFTER the HTTP POST. So a second worker — or the
-- next 10s tick during a slow (up to 30s) delivery — could re-claim and re-POST
-- the same delivery, an externally-observable duplicate webhook. The status
-- column has no 'processing' value, so we add a claim lease: the worker stamps
-- claimed_at = now() in a single atomic claim; a delivery stays out of the
-- claimable set until it leaves the retryable set (completed/dead) or its lease
-- goes stale (crash recovery). The lease also spaces retries of 'failed' rows,
-- replacing the previous re-claim-every-poll hot loop.
-- See backend/internal/worker/webhook_delivery_worker.go.

ALTER TABLE webhook_deliveries
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Partial index supporting the claim scan (retryable rows by creation order).
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_claim
    ON webhook_deliveries (created_at)
    WHERE status IN ('pending', 'failed');
