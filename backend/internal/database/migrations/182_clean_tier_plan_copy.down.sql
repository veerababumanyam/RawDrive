BEGIN;

WITH plan_updates AS (
    SELECT *
    FROM (VALUES
        (
            'free',
            'Starter',
            'Hook beginners with a free starter gallery, then grow them into paid plans.',
            0::BIGINT,
            0::BIGINT,
            5368709120::BIGINT,
            1::INTEGER,
            0::INTEGER,
            ARRAY[
                '5GB Storage',
                '1 Event',
                'AI Face Search (Limited)',
                'Watermarked Galleries',
                'No Photo Selling'
            ]::TEXT[],
            FALSE,
            FALSE,
            TRUE,
            TRUE,
            0::INTEGER,
            0::INTEGER
        ),
        (
            'creator',
            'Creator',
            'Side photographers moving into paid client delivery.',
            49900::BIGINT,
            499000::BIGINT,
            107374182400::BIGINT,
            10::INTEGER,
            -1::INTEGER,
            ARRAY[
                '100GB Storage',
                '10 Events / Month',
                'AI Face Search',
                'Reel & Shorts Gallery',
                'Basic Branding',
                'Photo Selling (10% Commission)'
            ]::TEXT[],
            FALSE,
            TRUE,
            TRUE,
            TRUE,
            0::INTEGER,
            2::INTEGER
        ),
        (
            'pro_photographer',
            'Pro Photographer',
            'Main money plan for working photographers.',
            99900::BIGINT,
            999000::BIGINT,
            322122547200::BIGINT,
            -1::INTEGER,
            -1::INTEGER,
            ARRAY[
                '300GB Storage',
                'Unlimited Events',
                'Fast AI Face Search',
                'Client Album Selection',
                'WhatsApp Delivery',
                'Photo Selling (5% Commission)',
                'Branding & Watermark Control'
            ]::TEXT[],
            FALSE,
            TRUE,
            TRUE,
            TRUE,
            0::INTEGER,
            3::INTEGER
        ),
        (
            'studio',
            'Studio',
            'Best-value hero plan for studios with a team and a brand to protect.',
            199900::BIGINT,
            1999000::BIGINT,
            1099511627776::BIGINT,
            -1::INTEGER,
            -1::INTEGER,
            ARRAY[
                '1TB Storage',
                'Unlimited Everything',
                'Priority AI Face Search',
                'Team Access (Editors)',
                'Custom Domain',
                'Advanced Analytics',
                'Photo Selling (0% Commission)'
            ]::TEXT[],
            TRUE,
            TRUE,
            TRUE,
            TRUE,
            0::INTEGER,
            4::INTEGER
        ),
        (
            'elite_studio',
            'Elite Studio',
            'Premium positioning for high-end studios and multi-branch teams.',
            399900::BIGINT,
            3999000::BIGINT,
            3298534883328::BIGINT,
            -1::INTEGER,
            -1::INTEGER,
            ARRAY[
                '3TB+ Storage',
                'Multi-branch Studio Support',
                'API Access',
                'White-label App',
                'Dedicated Support'
            ]::TEXT[],
            FALSE,
            TRUE,
            TRUE,
            FALSE,
            0::INTEGER,
            5::INTEGER
        )
    ) AS v(
        tier, name, description, monthly_price_paise, annual_price_paise,
        quota_bytes, gallery_limit, client_limit, features, popular, paid,
        active, self_serve, trial_days, rank
    )
),
updated_plans AS (
    UPDATE subscription_plans p
       SET name = u.name,
           description = u.description,
           currency = 'INR',
           monthly_price_paise = u.monthly_price_paise,
           annual_price_paise = u.annual_price_paise,
           quota_bytes = u.quota_bytes,
           gallery_limit = u.gallery_limit,
           client_limit = u.client_limit,
           features = u.features,
           popular = u.popular,
           paid = u.paid,
           active = u.active,
           self_serve = u.self_serve,
           trial_days = u.trial_days,
           rank = u.rank,
           updated_at = NOW()
      FROM plan_updates u
     WHERE p.tier = u.tier
 RETURNING p.*
),
latest_plan_versions AS (
    SELECT DISTINCT ON (spv.tier) spv.*
      FROM subscription_plan_versions spv
     WHERE spv.status IN ('approved', 'published')
       AND spv.archived_at IS NULL
     ORDER BY spv.tier, spv.effective_from DESC, spv.version DESC
),
changed_plans AS (
    SELECT u.*
      FROM updated_plans u
      LEFT JOIN latest_plan_versions lv ON lv.tier = u.tier
     WHERE lv.tier IS NULL
        OR lv.name IS DISTINCT FROM u.name
        OR lv.description IS DISTINCT FROM u.description
        OR lv.currency IS DISTINCT FROM u.currency
        OR lv.monthly_price_paise IS DISTINCT FROM u.monthly_price_paise
        OR lv.annual_price_paise IS DISTINCT FROM u.annual_price_paise
        OR lv.quota_bytes IS DISTINCT FROM u.quota_bytes
        OR lv.gallery_limit IS DISTINCT FROM u.gallery_limit
        OR lv.client_limit IS DISTINCT FROM u.client_limit
        OR lv.features IS DISTINCT FROM u.features
        OR lv.popular IS DISTINCT FROM u.popular
        OR lv.paid IS DISTINCT FROM u.paid
        OR lv.active IS DISTINCT FROM u.active
        OR lv.self_serve IS DISTINCT FROM u.self_serve
        OR lv.trial_days IS DISTINCT FROM u.trial_days
        OR lv.rank IS DISTINCT FROM u.rank
),
next_versions AS (
    SELECT u.tier, COALESCE(MAX(spv.version), 0) + 1 AS version
      FROM changed_plans u
      LEFT JOIN subscription_plan_versions spv ON spv.tier = u.tier
     GROUP BY u.tier
)
INSERT INTO subscription_plan_versions (
    tier, version, status, name, description, currency,
    monthly_price_paise, annual_price_paise, quota_bytes,
    gallery_limit, client_limit, features, popular, paid, active,
    self_serve, trial_days, rank, effective_from, approved_at
)
SELECT
    u.tier,
    nv.version,
    'approved',
    u.name,
    u.description,
    u.currency,
    u.monthly_price_paise,
    u.annual_price_paise,
    u.quota_bytes,
    u.gallery_limit,
    u.client_limit,
    u.features,
    u.popular,
    u.paid,
    u.active,
    u.self_serve,
    u.trial_days,
    u.rank,
    NOW(),
    NOW()
FROM changed_plans u
JOIN next_versions nv ON nv.tier = u.tier
ON CONFLICT (tier, version) DO NOTHING;

COMMIT;
