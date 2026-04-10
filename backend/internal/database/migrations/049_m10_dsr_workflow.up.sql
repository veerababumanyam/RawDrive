-- M10 E27-S3: Data Subject Request workflow (DPDPA + GDPR).
--
-- Subjects use POST /api/v1/dsr to request access/erasure/rectify of their
-- personal data. The dsr_requests table tracks request lifecycle and stores
-- the export bundle for completed access requests.
--
-- Indexes are tuned for the two most common queries:
--   1. Find pending/processing requests (background worker poll)
--   2. Find recent requests by subject (dedup window check on submission)

CREATE TABLE IF NOT EXISTS dsr_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_email TEXT NOT NULL,
    subject_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('access', 'erasure', 'rectify')),
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    export_payload JSONB,
    failure_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_dsr_requests_status_requested
    ON dsr_requests(status, requested_at)
    WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS idx_dsr_requests_subject_email
    ON dsr_requests(subject_email, requested_at DESC);

COMMENT ON TABLE dsr_requests IS
    'M10 E27-S3 — Data Subject Request workflow per DPDPA & GDPR. Subjects request access/erasure/rectify here. Background worker dsr_purge_worker handles erasure across R2 + audit logs.';
