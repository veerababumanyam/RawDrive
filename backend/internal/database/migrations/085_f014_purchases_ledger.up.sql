-- M31 / F-014 · Streaming purchases + append-only credit ledger
--
-- Story: E102-S1 + E102-S4
--
-- Design:
--   * streaming_purchases captures a one-time package top-up. Each purchase
--     references the rate_card_version active at purchase time (never the
--     package directly), so rate changes cannot retro-price old purchases.
--   * streaming_ledger_entries is append-only. Every credit movement
--     (purchase, reserve, consume, refund, overage) is a new row; no row
--     is ever updated. The running balance is derived by summing signed
--     amount_paise for a workspace. Balance reads go through the
--     streaming_credit_balances view (created below).
--   * Idempotency is enforced by a UNIQUE constraint on
--     (workspace_id, idempotency_key). A retry with the same key returns
--     the existing row without double-posting.

-- ---------- Purchases ----------

CREATE TABLE IF NOT EXISTS streaming_purchases (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    package_id           UUID NOT NULL REFERENCES streaming_packages(id),
    rate_card_id         UUID NOT NULL REFERENCES streaming_rate_cards(id),
    amount_paise         BIGINT NOT NULL CHECK (amount_paise > 0),
    minutes_credited     INTEGER NOT NULL CHECK (minutes_credited > 0),
    provider             TEXT,          -- 'phonepe' | 'razorpay' | NULL for platform grant
    provider_txn_id      TEXT,
    idempotency_key      TEXT NOT NULL,
    purchased_by         UUID REFERENCES users(id),
    purchased_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT streaming_purchases_idempotency_unique
        UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_streaming_purchases_workspace
    ON streaming_purchases(workspace_id, purchased_at DESC);
CREATE INDEX IF NOT EXISTS idx_streaming_purchases_provider_txn
    ON streaming_purchases(provider, provider_txn_id)
    WHERE provider_txn_id IS NOT NULL;

ALTER TABLE streaming_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaming_purchases FORCE  ROW LEVEL SECURITY;

CREATE POLICY streaming_purchases_read ON streaming_purchases FOR SELECT
USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY streaming_purchases_insert ON streaming_purchases FOR INSERT
WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));

COMMENT ON TABLE streaming_purchases IS 'Prepaid package top-ups. provider NULL = platform grant/bonus.';

-- ---------- Ledger (append-only) ----------

CREATE TABLE IF NOT EXISTS streaming_ledger_entries (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    entry_type           TEXT NOT NULL,  -- purchase | reserve | consume | refund | overage | adjustment
    amount_paise         BIGINT NOT NULL,  -- signed: purchase/refund positive, reserve/consume/overage negative
    minutes_delta        INTEGER NOT NULL DEFAULT 0,  -- signed minutes movement (reserve = -, refund = +, consume = 0)
    purchase_id          UUID REFERENCES streaming_purchases(id),
    reservation_id       UUID,  -- soft link to streaming_reservations (created in 086)
    stream_id            UUID REFERENCES streams(id) ON DELETE SET NULL,
    idempotency_key      TEXT NOT NULL,
    memo                 TEXT,
    created_by           UUID REFERENCES users(id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT streaming_ledger_entries_type_check
        CHECK (entry_type IN ('purchase', 'reserve', 'consume', 'refund', 'overage', 'adjustment')),
    CONSTRAINT streaming_ledger_entries_idempotency_unique
        UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_streaming_ledger_workspace_created
    ON streaming_ledger_entries(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_streaming_ledger_reservation
    ON streaming_ledger_entries(reservation_id)
    WHERE reservation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_streaming_ledger_stream
    ON streaming_ledger_entries(stream_id)
    WHERE stream_id IS NOT NULL;

ALTER TABLE streaming_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaming_ledger_entries FORCE  ROW LEVEL SECURITY;

CREATE POLICY streaming_ledger_entries_read ON streaming_ledger_entries FOR SELECT
USING (workspace_id::text = current_setting('app.current_workspace_id', true));

CREATE POLICY streaming_ledger_entries_insert ON streaming_ledger_entries FOR INSERT
WITH CHECK (workspace_id::text = current_setting('app.current_workspace_id', true));

-- Append-only enforcement: block UPDATE and DELETE entirely via a restrictive trigger.
CREATE OR REPLACE FUNCTION streaming_ledger_immutable_guard()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'streaming_ledger_entries is append-only: % not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS streaming_ledger_entries_no_update ON streaming_ledger_entries;
CREATE TRIGGER streaming_ledger_entries_no_update
    BEFORE UPDATE OR DELETE ON streaming_ledger_entries
    FOR EACH ROW EXECUTE FUNCTION streaming_ledger_immutable_guard();

COMMENT ON TABLE streaming_ledger_entries IS 'Append-only credit ledger. Balance = SUM(amount_paise) per workspace. See F-014 D2.';

-- ---------- Balance view ----------

CREATE OR REPLACE VIEW streaming_credit_balances AS
SELECT
    workspace_id,
    COALESCE(SUM(amount_paise), 0) AS balance_paise,
    COALESCE(SUM(minutes_delta), 0) AS balance_minutes,
    MAX(created_at) AS last_entry_at
FROM streaming_ledger_entries
GROUP BY workspace_id;

COMMENT ON VIEW streaming_credit_balances IS 'Derived running balance per workspace. RLS inherits from streaming_ledger_entries.';
