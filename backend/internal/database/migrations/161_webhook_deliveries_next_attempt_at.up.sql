-- 161_webhook_deliveries_next_attempt_at.up.sql
-- Exponential backoff schedule for webhook delivery retries.
--
-- The delivery worker's claim lease (claimed_at, migration 157) gives only FLAT
-- retry spacing (~webhookClaimLease) and exists for crash recovery. A failing
-- subscriber should be retried on an EXPONENTIAL schedule (1m, 2m, 4m, ... capped)
-- instead. We add next_attempt_at: recordFailure stamps now() + backoff(attempt)
-- and clears claimed_at, and the claim predicate gates a 'failed' row on
-- next_attempt_at <= now(). claimed_at remains the crash lease (a row claimed but
-- never recorded). See backend/internal/worker/webhook_delivery_worker.go.

ALTER TABLE webhook_deliveries
    ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

-- The existing idx_webhook_deliveries_claim (created_at) WHERE status IN
-- ('pending','failed') still serves the claim scan; next_attempt_at is an extra
-- predicate on the already-narrowed candidate set.
