BEGIN;

UPDATE subscription_plans
   SET self_serve = TRUE,
       updated_at = NOW()
 WHERE tier = 'elite_studio'
   AND self_serve IS DISTINCT FROM TRUE;

WITH plan_row AS (
    SELECT tier,
           name,
           description,
           currency,
           monthly_price_paise,
           annual_price_paise,
           quota_bytes,
           gallery_limit,
           client_limit,
           features,
           popular,
           paid,
           active,
           TRUE::BOOLEAN AS self_serve,
           trial_days,
           rank
      FROM subscription_plans
     WHERE tier = 'elite_studio'
),
latest_plan_version AS (
    SELECT DISTINCT ON (spv.tier) spv.*
      FROM subscription_plan_versions spv
     WHERE spv.tier = 'elite_studio'
       AND spv.status IN ('approved', 'published')
       AND spv.archived_at IS NULL
     ORDER BY spv.tier, spv.effective_from DESC, spv.version DESC
),
changed_plan AS (
    SELECT p.*
      FROM plan_row p
      LEFT JOIN latest_plan_version lv ON lv.tier = p.tier
     WHERE lv.tier IS NULL
        OR lv.self_serve IS DISTINCT FROM TRUE
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

COMMIT;
