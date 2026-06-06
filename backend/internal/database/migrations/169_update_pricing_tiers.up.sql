BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_pending_plan_tier;
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_plan_tier;

UPDATE workspaces
SET plan_tier = CASE plan_tier
    WHEN 'standard' THEN 'free'
    WHEN 'starter' THEN 'creator'
    WHEN 'professional' THEN 'pro_photographer'
    WHEN 'pro' THEN 'pro_photographer'
    WHEN 'business' THEN 'elite_studio'
    WHEN 'enterprise' THEN 'elite_studio'
    ELSE plan_tier
END
WHERE plan_tier IN ('standard', 'starter', 'professional', 'pro', 'business', 'enterprise');

UPDATE users
SET pending_plan_tier = CASE pending_plan_tier
    WHEN 'standard' THEN 'free'
    WHEN 'starter' THEN 'creator'
    WHEN 'professional' THEN 'pro_photographer'
    WHEN 'pro' THEN 'pro_photographer'
    WHEN 'business' THEN 'elite_studio'
    WHEN 'enterprise' THEN 'elite_studio'
    ELSE pending_plan_tier
END
WHERE pending_plan_tier IN ('standard', 'starter', 'professional', 'pro', 'business', 'enterprise');

ALTER TABLE workspaces ALTER COLUMN plan_tier SET DEFAULT 'free';

ALTER TABLE workspaces ADD CONSTRAINT chk_plan_tier
    CHECK (plan_tier IN ('free', 'creator', 'pro_photographer', 'studio', 'elite_studio'));

ALTER TABLE users
    ADD CONSTRAINT chk_users_pending_plan_tier
    CHECK (pending_plan_tier IS NULL
           OR pending_plan_tier IN ('free', 'creator', 'pro_photographer', 'studio', 'elite_studio'));

DELETE FROM subscription_plans
WHERE tier IN ('starter', 'professional', 'business', 'enterprise');

INSERT INTO subscription_plans (
    tier, name, description, currency, monthly_price_paise,
    annual_price_paise, quota_bytes, gallery_limit, client_limit,
    features, popular, paid, active, self_serve, trial_days, rank
) VALUES
    (
        'free', 'Starter', 'Free forever for beginners trying galleries before a paid event.',
        'INR', 0, 0, 5368709120, 1, 0,
        ARRAY[
            '5GB Storage',
            '1 Event',
            'AI Face Search (Limited)',
            'Watermarked Galleries',
            'No Photo Selling'
        ],
        FALSE, FALSE, TRUE, TRUE, 0, 0
    ),
    (
        'pay_per_event', 'Pay Per Event', 'No subscription. One clean price per delivery cycle.',
        'INR', 19900, 0, 0, 1, 0,
        ARRAY[
            '7-day Upload Window',
            '30-day Client Access',
            '90-day Storage Retention',
            'Wedding Bundle Available',
            'Extend or Archive Anytime'
        ],
        FALSE, TRUE, TRUE, FALSE, 0, 1
    ),
    (
        'creator', 'Creator', 'Side and weekend photographers getting started.',
        'INR', 49900, 499000, 107374182400, 10, -1,
        ARRAY[
            '100GB Storage',
            '10 Events / Month',
            'AI Face Search',
            'Reels & Shorts Gallery',
            'Basic Branding',
            'Photo Selling (10% Commission)'
        ],
        FALSE, TRUE, TRUE, TRUE, 0, 2
    ),
    (
        'pro_photographer', 'Pro Photographer', 'The main money plan for working pros.',
        'INR', 99900, 999000, 322122547200, -1, -1,
        ARRAY[
            '300GB Storage',
            'Unlimited Events',
            'Fast AI Face Search',
            'Client Album Selection',
            'WhatsApp Delivery',
            'Branding & Watermark Control',
            'Photo Selling (5% Commission)'
        ],
        TRUE, TRUE, TRUE, TRUE, 0, 3
    ),
    (
        'studio', 'Studio', 'Studios with a team and a brand to protect.',
        'INR', 199900, 1999000, 1099511627776, -1, -1,
        ARRAY[
            '1TB Storage',
            'Unlimited Everything',
            'Priority AI Face Search',
            'Team Access (Editors)',
            'Custom Domain',
            'Advanced Analytics',
            'Photo Selling (0% Commission)'
        ],
        FALSE, TRUE, TRUE, TRUE, 0, 4
    ),
    (
        'elite_studio', 'Elite Studio', 'High-end and multi-branch studios with custom limits.',
        'INR', 399900, 3999000, 6597069766656, -1, -1,
        ARRAY[
            '3TB+ Storage',
            'Multi-branch Support',
            'API Access',
            'White-label App',
            'Dedicated Support',
            '0% Selling Commission'
        ],
        FALSE, TRUE, TRUE, FALSE, 0, 5
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

UPDATE workspace_storage ws
SET quota_bytes = CASE w.plan_tier
    WHEN 'free' THEN 5368709120
    WHEN 'creator' THEN 107374182400
    WHEN 'pro_photographer' THEN 322122547200
    WHEN 'studio' THEN 1099511627776
    WHEN 'elite_studio' THEN 6597069766656
    ELSE ws.quota_bytes
END
FROM workspaces w
WHERE ws.workspace_id = w.id
  AND ws.quota_bytes IN (
      0,
      1073741824,
      32212254720,
      322122547200,
      3298534883328,
      6597069766656
  );

COMMIT;
