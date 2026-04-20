-- M40 / Upload Credit Meter — 100 down
DROP INDEX IF EXISTS idx_upload_sessions_credit_reservation;
ALTER TABLE upload_sessions
    DROP COLUMN IF EXISTS credit_reservation_id;
