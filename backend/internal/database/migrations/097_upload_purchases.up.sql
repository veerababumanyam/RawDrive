-- M40 / Upload Credit Meter — 097: upload_purchases
--
-- Mirrors streaming_purchases (migration 074). One row per paid or granted
-- top-up. Webhook idempotency is enforced by UNIQUE (workspace_id,
-- idempotency_key) so double-deliveries from PhonePe / Razorpay are rejected
-- at the database layer — not just the application — which is the NFR-UCR-R1
-- hard contract.

CREATE TABLE IF NOT EXISTS upload_purchases (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id       UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    idempotency_key    TEXT NOT NULL,
    amount_credits     BIGINT NOT NULL CHECK (amount_credits > 0),
    amount_inr_paise   BIGINT NOT NULL CHECK (amount_inr_paise >= 0),
    gateway            TEXT NOT NULL CHECK (gateway IN ('phonepe', 'razorpay', 'manual')),
    gateway_order_id   TEXT,
    gateway_payment_id TEXT,
    invoice_number     TEXT,
    status             TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded')),
    dealer_referral_id UUID REFERENCES dealers(id),
    metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at       TIMESTAMPTZ,
    CONSTRAINT upload_purchases_workspace_idem_key UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_upload_purchases_workspace_created
    ON upload_purchases (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upload_purchases_status
    ON upload_purchases (status)
    WHERE status = 'pending';
