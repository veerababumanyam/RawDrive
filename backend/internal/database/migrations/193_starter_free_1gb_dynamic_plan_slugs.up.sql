BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_pending_plan_tier;
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS chk_plan_tier;

ALTER TABLE workspaces ALTER COLUMN plan_tier SET DEFAULT 'free';

ALTER TABLE workspaces
    ADD CONSTRAINT chk_plan_tier
    CHECK (plan_tier ~ '^[a-z][a-z0-9_]{0,19}$');

ALTER TABLE users
    ADD CONSTRAINT chk_users_pending_plan_tier
    CHECK (pending_plan_tier IS NULL
           OR pending_plan_tier ~ '^[a-z][a-z0-9_]{0,19}$');

WITH starter_update AS (
    SELECT
        'free'::TEXT AS tier,
        'Starter'::TEXT AS name,
        'Hook beginners with a free starter gallery. Goal: get users to upgrade later.'::TEXT AS description,
        'INR'::TEXT AS currency,
        0::BIGINT AS monthly_price_paise,
        0::BIGINT AS annual_price_paise,
        1073741824::BIGINT AS quota_bytes,
        1::INTEGER AS gallery_limit,
        0::INTEGER AS client_limit,
        ARRAY[
            '1GB storage',
            '1 event',
            'AI face search (limited)',
            'Watermarked galleries',
            'No selling'
        ]::TEXT[] AS features,
        FALSE::BOOLEAN AS popular,
        FALSE::BOOLEAN AS paid,
        TRUE::BOOLEAN AS active,
        TRUE::BOOLEAN AS self_serve,
        0::INTEGER AS trial_days,
        0::INTEGER AS rank
),
updated_plan AS (
    UPDATE subscription_plans p
       SET name = u.name,
           description = u.description,
           currency = u.currency,
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
      FROM starter_update u
     WHERE p.tier = u.tier
 RETURNING p.*
),
latest_plan_version AS (
    SELECT DISTINCT ON (spv.tier) spv.*
      FROM subscription_plan_versions spv
     WHERE spv.tier = 'free'
       AND spv.status IN ('approved', 'published')
       AND spv.archived_at IS NULL
     ORDER BY spv.tier, spv.effective_from DESC, spv.version DESC
),
changed_plan AS (
    SELECT u.*
      FROM updated_plan u
      LEFT JOIN latest_plan_version lv ON lv.tier = u.tier
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
next_version AS (
    SELECT c.tier, COALESCE(MAX(spv.version), 0) + 1 AS version
      FROM changed_plan c
      LEFT JOIN subscription_plan_versions spv ON spv.tier = c.tier
     GROUP BY c.tier
)
INSERT INTO subscription_plan_versions (
    tier, version, status, name, description, currency,
    monthly_price_paise, annual_price_paise, quota_bytes,
    gallery_limit, client_limit, features, popular, paid, active,
    self_serve, trial_days, rank, effective_from, approved_at
)
SELECT
    c.tier,
    nv.version,
    'approved',
    c.name,
    c.description,
    c.currency,
    c.monthly_price_paise,
    c.annual_price_paise,
    c.quota_bytes,
    c.gallery_limit,
    c.client_limit,
    c.features,
    c.popular,
    c.paid,
    c.active,
    c.self_serve,
    c.trial_days,
    c.rank,
    NOW(),
    NOW()
FROM changed_plan c
JOIN next_version nv ON nv.tier = c.tier
ON CONFLICT (tier, version) DO NOTHING;

UPDATE workspace_storage ws
   SET quota_bytes = 1073741824,
       updated_at = NOW()
  FROM workspaces w
 WHERE ws.workspace_id = w.id
   AND COALESCE(w.plan_tier, 'free') = 'free'
   AND ws.quota_bytes IS DISTINCT FROM 1073741824;

COMMIT;
