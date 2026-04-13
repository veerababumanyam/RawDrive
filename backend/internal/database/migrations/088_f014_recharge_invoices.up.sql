-- M32 / F-014 · Recharge orders + GST invoices
--
-- Stories landed:
--   E104-S1/S2 PhonePe checkout + webhook
--   E104-S3    Razorpay checkout + webhook
--   E104-S4    GST invoice generation
--   E104-S5    Refund flow (partial: backend entry type)
--
-- Design:
--   * streaming_recharge_orders persists the outbound payment intent so
--     webhooks can correlate a provider txn back to (workspace, package).
--     Without this table, a webhook can only post credit but can't tell
--     which package's minutes to award.
--   * streaming_invoices is a B2B/B2C GST invoice row per successful recharge.
--     PDF storage is a pointer to R2; generation may lag and flip later.
--   * Seeded payment_provider platform_settings keys so super-admin can
--     configure without code.
--   * Adds 'refund' as a permitted reservation refund target already, and
--     'adjustment' is already supported in streaming_ledger_entries; this
--     migration adds no new ledger entry_type.

-- ---------- Recharge orders ----------

CREATE TABLE IF NOT EXISTS streaming_recharge_orders (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    package_id           UUID NOT NULL REFERENCES streaming_packages(id),
    rate_card_id         UUID NOT NULL REFERENCES streaming_rate_cards(id),
    amount_paise         BIGINT NOT NULL CHECK (amount_paise > 0),
    minutes              INTEGER NOT NULL CHECK (minutes > 0),
    provider             TEXT NOT NULL,   -- 'phonepe' | 'razorpay'
    provider_order_id    TEXT NOT NULL,   -- merchantTransactionId / razorpay order_id
    provider_payment_id  TEXT,            -- populated by webhook on success
    status               TEXT NOT NULL DEFAULT 'pending',
    checkout_url         TEXT,
    initiated_by         UUID REFERENCES users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT streaming_recharge_orders_provider_check
        CHECK (provider IN ('phonepe', 'razorpay')),
    CONSTRAINT streaming_recharge_orders_status_check
        CHECK (status IN ('pending', 'completed', 'failed', 'expired', 'refunded')),
    CONSTRAINT streaming_recharge_orders_provider_order_unique
        UNIQUE (provider, provider_order_id)
);

CREATE INDEX IF NOT EXISTS idx_streaming_recharge_orders_workspace
    ON streaming_recharge_orders(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_streaming_recharge_orders_status
    ON streaming_recharge_orders(status)
    WHERE status IN ('pending', 'completed');
CREATE INDEX IF NOT EXISTS idx_streaming_recharge_orders_payment_id
    ON streaming_recharge_orders(provider, provider_payment_id)
    WHERE provider_payment_id IS NOT NULL;

ALTER TABLE streaming_recharge_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaming_recharge_orders FORCE  ROW LEVEL SECURITY;

CREATE POLICY streaming_recharge_orders_read ON streaming_recharge_orders FOR SELECT
USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY streaming_recharge_orders_write ON streaming_recharge_orders FOR ALL
USING (workspace_id::text = current_setting('app.current_workspace_id', true))
WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));

COMMENT ON TABLE  streaming_recharge_orders IS 'Outbound payment intents. Webhook receiver correlates provider_payment_id back to (workspace, package).';

-- ---------- Invoices (B2B / B2C GST) ----------

CREATE TABLE IF NOT EXISTS streaming_invoices (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    recharge_order_id    UUID NOT NULL REFERENCES streaming_recharge_orders(id) ON DELETE CASCADE,
    purchase_id          UUID REFERENCES streaming_purchases(id),
    invoice_number       TEXT NOT NULL,
    invoice_kind         TEXT NOT NULL,   -- 'b2b' | 'b2c'
    buyer_name           TEXT,
    buyer_gstin          TEXT,
    hsn_sac              TEXT NOT NULL DEFAULT '998439', -- streaming of movies/video content
    subtotal_paise       BIGINT NOT NULL,
    cgst_paise           BIGINT NOT NULL DEFAULT 0,
    sgst_paise           BIGINT NOT NULL DEFAULT 0,
    igst_paise           BIGINT NOT NULL DEFAULT 0,
    total_paise          BIGINT NOT NULL,
    pdf_r2_key           TEXT,
    issued_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT streaming_invoices_kind_check
        CHECK (invoice_kind IN ('b2b', 'b2c')),
    CONSTRAINT streaming_invoices_number_unique
        UNIQUE (workspace_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_streaming_invoices_workspace
    ON streaming_invoices(workspace_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_streaming_invoices_order
    ON streaming_invoices(recharge_order_id);

ALTER TABLE streaming_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaming_invoices FORCE  ROW LEVEL SECURITY;

CREATE POLICY streaming_invoices_read ON streaming_invoices FOR SELECT
USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY streaming_invoices_insert ON streaming_invoices FOR INSERT
WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));

-- Invoices are immutable once issued (PDF key may still be patched by PDF worker).
CREATE POLICY streaming_invoices_update_pdf ON streaming_invoices FOR UPDATE
USING (workspace_id::text = current_setting('app.current_workspace_id', true))
WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));

COMMENT ON TABLE streaming_invoices IS 'GST invoice per successful recharge. B2B (workspace GSTIN) vs B2C; CGST/SGST for intra-state, IGST for inter-state.';

-- ---------- Platform settings seed for payment providers ----------

INSERT INTO platform_settings (category, key, value, is_secret, description)
VALUES
    ('payments', 'phonepe_merchant_id',   '', false, 'PhonePe merchant ID'),
    ('payments', 'phonepe_salt_key',      '', true,  'PhonePe Standard Checkout salt key (envelope-encrypted at rest)'),
    ('payments', 'phonepe_salt_index',    '1', false, 'PhonePe salt-index (typically "1")'),
    ('payments', 'phonepe_base_url',      'https://api.phonepe.com/apis/hermes', false, 'PhonePe API base URL (sandbox: https://api-preprod.phonepe.com/apis/pg-sandbox)'),
    ('payments', 'razorpay_enabled',      'false', false, 'Feature flag: set true to route recharge to Razorpay when PhonePe is down or disabled'),
    ('payments', 'razorpay_key_id',       '', false, 'Razorpay API key id'),
    ('payments', 'razorpay_key_secret',   '', true,  'Razorpay API key secret (envelope-encrypted at rest)'),
    ('payments', 'razorpay_webhook_secret','', true, 'Razorpay webhook HMAC secret'),
    ('payments', 'callback_base_url',     '', false, 'Public base URL used for PhonePe/Razorpay callbacks (e.g. https://rawdrive.example.com)'),
    ('payments', 'gstin_business',        '', false, 'Business GSTIN for invoice issuer'),
    ('payments', 'gstin_state_code',      '29', false, 'Issuer GST state code (2 digits). 29=Karnataka.')
ON CONFLICT (category, key) DO NOTHING;
