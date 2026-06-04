-- 155_gallery_email_events_claimed_at.up.sql
-- Atomic lease-based job claim for the email automation worker.
--
-- gallery_email_events had no in-flight ("claimed") state: sendDue() listed
-- pending + due rows with a plain SELECT and only marked them sent/failed AFTER
-- the SMTP send, so two workers (or two overlapping ticks) could read the same
-- row and send the client the same branded email twice. The status CHECK has no
-- 'processing' value to flip to, so we add a claim lease instead: the worker
-- stamps claimed_at = now() inside a single UPDATE ... WHERE id IN (SELECT ...
-- FOR UPDATE SKIP LOCKED) RETURNING claim. A row stays out of the claimable set
-- until it leaves 'pending' (sent/failed/skipped) or its claim lease goes stale
-- (crash recovery). See backend/internal/worker/email_automation_worker.go.

ALTER TABLE gallery_email_events
    ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Partial index supporting the claim scan: pending, unsent, ordered by due time.
CREATE INDEX IF NOT EXISTS idx_gallery_email_events_claim
    ON gallery_email_events (scheduled_for)
    WHERE status = 'pending' AND sent_at IS NULL;
