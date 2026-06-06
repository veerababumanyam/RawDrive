BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_pending_plan_tier;
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_plan_tier;

UPDATE workspaces
SET plan_tier = CASE plan_tier
    WHEN 'creator' THEN 'starter'
    WHEN 'pro_photographer' THEN 'professional'
    WHEN 'studio' THEN 'business'
    WHEN 'elite_studio' THEN 'enterprise'
    ELSE plan_tier
END
WHERE plan_tier IN ('creator', 'pro_photographer', 'studio', 'elite_studio');

UPDATE users
SET pending_plan_tier = CASE pending_plan_tier
    WHEN 'creator' THEN 'starter'
    WHEN 'pro_photographer' THEN 'professional'
    WHEN 'studio' THEN 'business'
    WHEN 'elite_studio' THEN 'enterprise'
    ELSE pending_plan_tier
END
WHERE pending_plan_tier IN ('creator', 'pro_photographer', 'studio', 'elite_studio');

ALTER TABLE workspaces ALTER COLUMN plan_tier SET DEFAULT 'free';

ALTER TABLE workspaces ADD CONSTRAINT chk_plan_tier
    CHECK (plan_tier IN ('free', 'starter', 'professional', 'business', 'enterprise'));

ALTER TABLE users
    ADD CONSTRAINT chk_users_pending_plan_tier
    CHECK (pending_plan_tier IS NULL
           OR pending_plan_tier IN ('free', 'starter', 'professional', 'business', 'enterprise'));

DELETE FROM subscription_plans
WHERE tier IN ('pay_per_event', 'creator', 'pro_photographer', 'studio', 'elite_studio');

INSERT INTO subscription_plans (
    tier, name, description, currency, monthly_price_paise,
    annual_price_paise, quota_bytes, gallery_limit, client_limit,
    features, popular, paid, active, self_serve, trial_days, rank
) VALUES
    (
        'free', 'Free', 'Explore RawDrive with managed storage and gallery delivery.',
        'INR', 0, 0, 1073741824, 3, 5,
        ARRAY[
            '1GB Storage',
            '3 Galleries',
            '5 Client Profiles',
            'Basic Gallery Delivery',
            'Email Support'
        ],
        FALSE, FALSE, TRUE, TRUE, 30, 0
    ),
    (
        'starter', 'Starter', 'For solo photographers starting client delivery.',
        'INR', 9900, 99000, 32212254720, 10, 20,
        ARRAY[
            '30GB Storage',
            '10 Galleries',
            '20 Client Profiles',
            'Client Proofing',
            'Basic CRM',
            'Priority Email Support'
        ],
        FALSE, TRUE, TRUE, TRUE, 0, 1
    ),
    (
        'professional', 'Professional', 'For growing studios that need AI, CRM, and streaming.',
        'INR', 29900, 299000, 322122547200, 50, 100,
        ARRAY[
            '300GB Storage',
            '50 Galleries',
            '100 Client Profiles',
            'AI Culling',
            'Client Proofing',
            'Full CRM & Bookings',
            'Live Streaming (5 sessions/mo)',
            'Marketplace Listing',
            'Phone Support'
        ],
        TRUE, TRUE, TRUE, TRUE, 0, 2
    ),
    (
        'business', 'Business', 'For larger wedding teams running high-volume delivery.',
        'INR', 299900, 2999000, 3298534883328, 200, 500,
        ARRAY[
            '3TB Storage',
            '200 Galleries',
            '500 Client Profiles',
            'AI Culling (Unlimited)',
            'Advanced Client Proofing',
            'Full CRM & Bookings',
            'Live Streaming (20 sessions/mo)',
            'Premium Marketplace Listing',
            'Dedicated Account Manager',
            'API Access'
        ],
        FALSE, TRUE, TRUE, TRUE, 0, 3
    ),
    (
        'enterprise', 'Enterprise', 'For full-scale studios that need white-label control and BYOS.',
        'INR', 599900, 5999000, 6597069766656, -1, -1,
        ARRAY[
            '6TB Storage',
            'Unlimited Galleries',
            'Unlimited Clients',
            'Bring Your Own Storage (BYOS)',
            'White-label Options',
            'Custom Integrations',
            'SLA Guarantee',
            'Dedicated Account Manager',
            '24/7 Dedicated Support'
        ],
        FALSE, TRUE, TRUE, TRUE, 0, 4
    )
ON CONFLICT (tier) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    currency = EXCLUDED.currency,
    monthly_price_paise = EXCLUDED.monthly_price_paise,
    annual_price_paise = EXCLUDED.annual_price_paise,
    quota_bytes = EXCLUDED.quota_bytes,
    gallery_limit = EXCLUDED.gallery_limit,
    client_limit = EXCLUDED.client_limit,
    features = EXCLUDED.features,
    popular = EXCLUDED.popular,
    paid = EXCLUDED.paid,
    active = EXCLUDED.active,
    self_serve = EXCLUDED.self_serve,
    trial_days = EXCLUDED.trial_days,
    rank = EXCLUDED.rank,
    updated_at = NOW();

COMMIT;
