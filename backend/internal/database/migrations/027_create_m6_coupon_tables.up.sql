-- M6: Coupon Engine — coupons, coupon_redemptions

CREATE TABLE coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    owner_type VARCHAR(20) NOT NULL
        CHECK (owner_type IN ('admin', 'dealer', 'photographer')),
    dealer_id UUID REFERENCES dealers(id),
    coupon_type VARCHAR(30) NOT NULL
        CHECK (coupon_type IN ('percentage', 'fixed_amount', 'trial_extension', 'onboarding_bonus', 'feature_addon', 'first_payment_waiver')),
    discount_value BIGINT NOT NULL,
    scope_state_id INTEGER REFERENCES states(id),
    scope_plan_id UUID,
    scope_product VARCHAR(50),
    scope_campaign VARCHAR(100),
    max_redemptions INTEGER,
    per_user_limit INTEGER NOT NULL DEFAULT 1,
    redemption_count INTEGER NOT NULL DEFAULT 0,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_stackable BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_coupons_code_upper ON coupons(UPPER(code));
CREATE INDEX idx_coupons_dealer_id ON coupons(dealer_id) WHERE dealer_id IS NOT NULL;
CREATE INDEX idx_coupons_scope_state ON coupons(scope_state_id);
CREATE INDEX idx_coupons_valid_active ON coupons(valid_from, valid_until) WHERE is_active = true;

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY coupons_access ON coupons
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR owner_type = 'admin'
        OR (dealer_id IS NOT NULL AND dealer_id IN (SELECT id FROM dealers WHERE user_id::text = current_setting('app.user_id', true)))
    );

CREATE TABLE coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES coupons(id),
    user_id UUID NOT NULL REFERENCES users(id),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    state_id INTEGER REFERENCES states(id),
    invoice_id UUID,
    discount_applied DECIMAL(10,2) NOT NULL,
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coupon_redemptions_coupon_user ON coupon_redemptions(coupon_id, user_id);
CREATE INDEX idx_coupon_redemptions_workspace ON coupon_redemptions(workspace_id);
CREATE INDEX idx_coupon_redemptions_state ON coupon_redemptions(state_id);

ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY coupon_redemptions_access ON coupon_redemptions
    USING (
        current_setting('app.bypass_rls', true) = 'on'
        OR user_id::text = current_setting('app.user_id', true)
    );
