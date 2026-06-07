-- 188 — append-only biometric consent + face-search audit (DPDP/GDPR Art 9).
--
-- Both public biometric matching endpoints (POST .../photo-search and
-- .../face-match) process special-category biometric data on behalf of an
-- anonymous guest. Art 9 of the GDPR and India's DPDP require explicit consent
-- AND a durable, accountable record of every such processing event: who
-- searched, in which gallery, when, and how many photos the match returned.
--
-- This table is the audit ledger. It is APPEND-ONLY: every accepted request
-- writes exactly one immutable row; there is no UPDATE/withdraw path here (the
-- product-level consent ledger lives in consent_records — this is the
-- processing-event trail that proves the gate ran on every match).
--
-- Privacy posture (E2EE law): we store NO selfie image and NO selfie embedding.
-- The only subject identifier is session_subject — a SHA-256 hex digest of the
-- durable gallery-session token the guest already presented to unlock the
-- gallery. We deliberately hash it rather than store the raw token so the audit
-- ledger can never be replayed as a live session credential, while still
-- letting an operator correlate every search a single gated session performed.
-- session_subject is NULL for fully-public galleries where no session token is
-- required (no new PII is invented).
--
-- Scoping + isolation: rows are scoped by workspace_id + gallery_id and the
-- table carries RLS (app.current_workspace_id / app.workspace_id), matching the
-- face-table convention (migration 180 face_identity_contacts) so a session in
-- workspace A can never read workspace B's audit rows.

CREATE TABLE IF NOT EXISTS biometric_search_audit (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    gallery_id      UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    -- SHA-256 hex (64 chars) of the gated gallery-session token; NULL when the
    -- gallery is fully public and no session token was presented. Never the raw
    -- token, never a selfie, never an embedding.
    session_subject TEXT,
    -- Which biometric matching endpoint produced this event.
    endpoint        TEXT NOT NULL CHECK (endpoint IN ('photo_search', 'face_match')),
    consent_given   BOOLEAN NOT NULL,
    match_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE biometric_search_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS biometric_search_audit_workspace_isolation ON biometric_search_audit;
CREATE POLICY biometric_search_audit_workspace_isolation ON biometric_search_audit
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR workspace_id::text = current_setting('app.current_workspace_id', true)
        OR workspace_id::text = current_setting('app.workspace_id', true)
    );

-- Hot read path: "show me every biometric search in this gallery, newest first"
-- for the studio/DPO audit view.
CREATE INDEX IF NOT EXISTS idx_biometric_search_audit_gallery
    ON biometric_search_audit (workspace_id, gallery_id, created_at DESC);
