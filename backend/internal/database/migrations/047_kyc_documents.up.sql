-- M6 gap-fill: KYC document uploads for dealers
-- Frontend `KycDocumentUpload.tsx` posts file metadata here after R2 upload.
-- Originals live in R2 at `storage_key`; this table stores only metadata + review state.

CREATE TABLE IF NOT EXISTS kyc_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL
        CHECK (document_type IN ('pan', 'gst', 'bank_statement', 'address_proof', 'photo_id')),
    storage_key TEXT NOT NULL,
    filename TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_dealer_uploaded
    ON kyc_documents(dealer_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_status
    ON kyc_documents(status);

-- RLS: dealers can see their own docs; admins bypass via app.bypass_rls.
-- Matches the dealer_attributions pattern (dealer_id -> dealers -> user_id).
ALTER TABLE kyc_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kyc_documents_access ON kyc_documents;
CREATE POLICY kyc_documents_access ON kyc_documents
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR dealer_id IN (
            SELECT id FROM dealers
            WHERE user_id::text = current_setting('app.user_id', true)
        )
    );
