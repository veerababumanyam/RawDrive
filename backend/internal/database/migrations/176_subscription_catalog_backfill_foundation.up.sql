-- 176_subscription_catalog_backfill_foundation.up.sql
-- Adds the approved plan-version anchor and subscription snapshot metadata
-- required before dynamic pricing can become the entitlement source of truth.

BEGIN;

CREATE TABLE IF NOT EXISTS subscription_plan_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier TEXT NOT NULL REFERENCES subscription_plans(tier) ON DELETE RESTRICT,
    version INTEGER NOT NULL CHECK (version > 0),
    status TEXT NOT NULL DEFAULT 'approved'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'scheduled', 'published', 'archived')),
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
    rank INTEGER NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT subscription_plan_versions_tier_version_unique UNIQUE (tier, version),
    CONSTRAINT subscription_plan_versions_effective_window
        CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_versions_tier_effective
    ON subscription_plan_versions (tier, status, effective_from DESC, version DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_plan_versions_public_rank
    ON subscription_plan_versions (status, active, rank)
    WHERE status IN ('approved', 'published') AND archived_at IS NULL;

INSERT INTO subscription_plan_versions (
    tier, version, status, name, description, currency,
    monthly_price_paise, annual_price_paise, quota_bytes,
    gallery_limit, client_limit, features, popular, paid, active,
    self_serve, trial_days, rank, effective_from, approved_at
)
SELECT
    p.tier,
    1,
    'approved',
    p.name,
    p.description,
    p.currency,
    p.monthly_price_paise,
    p.annual_price_paise,
    p.quota_bytes,
    p.gallery_limit,
    p.client_limit,
    p.features,
    p.popular,
    p.paid,
    p.active,
    p.self_serve,
    p.trial_days,
    p.rank,
    NOW(),
    NOW()
FROM subscription_plans p
ON CONFLICT (tier, version) DO NOTHING;

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES subscription_plan_versions(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS catalog_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS catalog_backfilled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS catalog_backfill_source TEXT;

ALTER TABLE subscriptions
    DROP CONSTRAINT IF EXISTS subscriptions_catalog_backfill_source_check;

ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_catalog_backfill_source_check
    CHECK (
        catalog_backfill_source IS NULL
        OR catalog_backfill_source IN (
            'exact_tier_effective_match',
            'alias_tier_effective_match',
            'earliest_version_fallback',
            'alias_earliest_version_fallback',
            'legacy_backfill_version'
        )
    );

CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_version
    ON subscriptions(plan_version_id)
    WHERE plan_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_catalog_backfill_pending
    ON subscriptions(id)
    WHERE plan_version_id IS NULL
       OR catalog_snapshot IS NULL
       OR catalog_backfilled_at IS NULL;

COMMENT ON TABLE subscription_plan_versions IS
    'Immutable-ish approved subscription plan versions used by billing snapshots and entitlement backfills.';

COMMENT ON COLUMN subscriptions.plan_version_id IS
    'Approved subscription_plan_versions row selected by the catalog backfill or future checkout settlement.';

COMMENT ON COLUMN subscriptions.catalog_snapshot IS
    'Immutable JSON snapshot of plan/version and historical subscription billing facts used for audit-safe billing history.';

COMMENT ON COLUMN subscriptions.catalog_backfill_source IS
    'How the subscription was linked to an approved plan version during catalog backfill.';

COMMIT;
