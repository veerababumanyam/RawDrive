-- 176_subscription_catalog_backfill_foundation.down.sql

BEGIN;

DROP INDEX IF EXISTS idx_subscriptions_catalog_backfill_pending;
DROP INDEX IF EXISTS idx_subscriptions_plan_version;

ALTER TABLE subscriptions
    DROP CONSTRAINT IF EXISTS subscriptions_catalog_backfill_source_check;

ALTER TABLE subscriptions
    DROP COLUMN IF EXISTS catalog_backfill_source,
    DROP COLUMN IF EXISTS catalog_backfilled_at,
    DROP COLUMN IF EXISTS catalog_snapshot,
    DROP COLUMN IF EXISTS plan_version_id;

DROP INDEX IF EXISTS idx_subscription_plan_versions_public_rank;
DROP INDEX IF EXISTS idx_subscription_plan_versions_tier_effective;
DROP TABLE IF EXISTS subscription_plan_versions;

COMMIT;
