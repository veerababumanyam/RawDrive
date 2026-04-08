-- M6: Payout Settlement — payouts

CREATE TABLE IF NOT EXISTS payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE RESTRICT,
    state_id INTEGER REFERENCES states(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    gross_attributed_revenue BIGINT NOT NULL DEFAULT 0,
    commission_earned BIGINT NOT NULL DEFAULT 0,
    tds_withheld BIGINT NOT NULL DEFAULT 0,
    adjustments BIGINT NOT NULL DEFAULT 0,
    net_payable BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending', 'approved', 'processing', 'paid', 'failed', 'reversed')),
    approved_by UUID REFERENCES users(id),
    paid_at TIMESTAMPTZ,
    payment_reference VARCHAR(255),
    margin_ratio_snapshot JSONB NOT NULL DEFAULT '{}',
    line_items JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payouts_dealer_period ON payouts(dealer_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_payouts_dealer_id ON payouts(dealer_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_state ON payouts(state_id);

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payouts_access ON payouts;
CREATE POLICY payouts_access ON payouts
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR dealer_id IN (SELECT id FROM dealers WHERE user_id::text = current_setting('app.user_id', true))
    );
