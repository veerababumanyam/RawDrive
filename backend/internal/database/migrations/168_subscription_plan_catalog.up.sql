BEGIN;

CREATE TABLE IF NOT EXISTS subscription_plans (
    tier TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'INR',
    monthly_price_paise BIGINT NOT NULL CHECK (monthly_price_paise >= 0),
    annual_price_paise BIGINT NOT NULL CHECK (annual_price_paise >= 0),
    quota_bytes BIGINT NOT NULL CHECK (quota_bytes >= 0),
    gallery_limit INTEGER NOT NULL DEFAULT 0 CHECK (gallery_limit >= -1),
    client_limit INTEGER NOT NULL DEFAULT 0 CHECK (client_limit >= -1),
    features TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    popular BOOLEAN NOT NULL DEFAULT FALSE,
    paid BOOLEAN NOT NULL DEFAULT TRUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    self_serve BOOLEAN NOT NULL DEFAULT TRUE,
    trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
    rank INTEGER NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active_rank
    ON subscription_plans (active, rank);

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
ON CONFLICT (tier) DO NOTHING;

COMMIT;
