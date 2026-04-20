-- M40 / Upload Credit Meter — 100: upload_sessions.credit_reservation_id
--
-- Adds a nullable FK from an in-flight upload session to its ledger reserve
-- entry. On CreateSession, chunked_upload.go calls credit.Reserve, gets back
-- a reservation id, and persists it on the session row so finalizeUpload
-- and Cancel paths can find the reservation to consume or refund.
--
-- Nullable by design: enterprise workspaces with unlimited_passthrough get a
-- ledger entry but no reservation (no balance tracking). Legacy sessions
-- created before M40 have no reservation either.

ALTER TABLE upload_sessions
    ADD COLUMN IF NOT EXISTS credit_reservation_id UUID
        REFERENCES upload_ledger_entries(id)
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_upload_sessions_credit_reservation
    ON upload_sessions (credit_reservation_id)
    WHERE credit_reservation_id IS NOT NULL;
