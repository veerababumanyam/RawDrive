-- M6: Dealer Channel — dealers, dealer_attributions, margin_ratios

CREATE TABLE IF NOT EXISTS dealers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state_id INTEGER NOT NULL REFERENCES states(id),
    business_name VARCHAR(255) NOT NULL,
    territory_type VARCHAR(20) NOT NULL DEFAULT 'primary'
        CHECK (territory_type IN ('primary', 'secondary', 'ambassador')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'suspended', 'terminated')),
    commission_rate_pct DECIMAL(5,2),
    bank_account JSONB,
    pan_number VARCHAR(10) NOT NULL,
    gstin VARCHAR(15),
    referral_code VARCHAR(50) UNIQUE,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dealers_user_id ON dealers(user_id);
CREATE INDEX IF NOT EXISTS idx_dealers_state_id ON dealers(state_id);
CREATE INDEX IF NOT EXISTS idx_dealers_status ON dealers(status);
CREATE INDEX IF NOT EXISTS idx_dealers_referral_code ON dealers(referral_code) WHERE referral_code IS NOT NULL;

ALTER TABLE dealers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dealers_owner ON dealers;
CREATE POLICY dealers_owner ON dealers
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR user_id::text = current_setting('app.user_id', true)
    );

-- Dealer Attributions — tracks which dealer brought which workspace
CREATE TABLE IF NOT EXISTS dealer_attributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dealer_id UUID NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    state_id INTEGER NOT NULL REFERENCES states(id),
    attribution_source VARCHAR(30) NOT NULL
        CHECK (attribution_source IN ('admin_assignment', 'coupon', 'referral_link', 'default_state_dealer', 'unattributed')),
    coupon_id UUID,
    referral_code VARCHAR(50),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_until TIMESTAMPTZ,
    is_current BOOLEAN NOT NULL DEFAULT true,
    attributed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dealer_attributions_dealer_id ON dealer_attributions(dealer_id);
CREATE INDEX IF NOT EXISTS idx_dealer_attributions_workspace_current ON dealer_attributions(workspace_id) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_dealer_attributions_state_id ON dealer_attributions(state_id);

ALTER TABLE dealer_attributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dealer_attributions_access ON dealer_attributions;
CREATE POLICY dealer_attributions_access ON dealer_attributions
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR dealer_id IN (SELECT id FROM dealers WHERE user_id::text = current_setting('app.user_id', true))
    );

-- Margin Ratios — statewise commission configuration
CREATE TABLE IF NOT EXISTS margin_ratios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    state_id INTEGER REFERENCES states(id),
    plan_id UUID,
    product_type VARCHAR(50),
    channel VARCHAR(30),
    dealer_pct DECIMAL(5,2) NOT NULL,
    platform_pct DECIMAL(5,2) NOT NULL,
    calculation_basis VARCHAR(30) NOT NULL DEFAULT 'net_of_gst'
        CHECK (calculation_basis IN ('net_of_gst', 'gross')),
    fixed_incentive_inr DECIMAL(10,2) NOT NULL DEFAULT 0,
    effective_from DATE NOT NULL,
    effective_until DATE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT margin_ratios_pct_sum CHECK (dealer_pct + platform_pct = 100)
);

CREATE INDEX IF NOT EXISTS idx_margin_ratios_state_plan ON margin_ratios(state_id, plan_id, product_type, effective_from);
CREATE INDEX IF NOT EXISTS idx_margin_ratios_effective ON margin_ratios(effective_from, effective_until);

ALTER TABLE margin_ratios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS margin_ratios_read ON margin_ratios;
CREATE POLICY margin_ratios_read ON margin_ratios FOR SELECT
    USING (current_setting('app.bypass_rls', true) = 'on' OR true);
