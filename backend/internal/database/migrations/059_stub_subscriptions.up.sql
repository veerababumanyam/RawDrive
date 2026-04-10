-- M16 follow-up: stub the subscriptions table the admin revenue
-- subsystem has always assumed exists. No migration before this one
-- created it, so every /api/v1/admin/revenue call has been failing at
-- runtime with "relation \"subscriptions\" does not exist".
--
-- The RawDrive billing / subscription feature isn't implemented yet
-- (M14 only shipped invoice-based commerce). This migration creates an
-- EMPTY table with the exact columns admin_revenue_repo reads so the
-- revenue dashboard returns honest zeros instead of 500s. When a real
-- subscription feature lands, the schema can be extended in place
-- without breaking the existing admin query.
--
-- Migration: 059_stub_subscriptions

BEGIN;

CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    state_id INTEGER REFERENCES states(id),
    tier_slug VARCHAR(50),
    amount_paisa BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'trialing', 'churned', 'cancelled', 'past_due')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_created ON subscriptions(status, created_at DESC);

COMMENT ON TABLE subscriptions IS
  'Subscription records — populated once the billing subsystem lands. Until then the admin revenue dashboard reads from this as an empty set (returns zeros).';

COMMIT;
