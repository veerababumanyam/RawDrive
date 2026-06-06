-- Migration 174: signup_payment_orders — pre-workspace payment orders for the
-- paid-duplicate-phone signup funnel (slice 4 of the phone-reuse epic).
--
-- WHY: the existing subscription order path (subscription_upgrade_orders) is
-- keyed by workspace_id and settles by UPDATING an existing workspace. A
-- paid_pending account has NO workspace yet (that is the whole point — it gets
-- no free workspace/quota until it pays). This table holds a payment order keyed
-- by USER, so settlement can CREATE the workspace with the paid tier only after
-- the provider verifies the payment.
--
-- workspace_id is NULL until settlement links the created workspace back to the
-- order (audit trail + idempotency: a re-delivered webhook finds status='paid'
-- and the existing workspace_id instead of provisioning twice).
--
-- Numbered 174: follows 171/172/173 in this epic; verified next free above
-- origin/main's 170.

BEGIN;

CREATE TABLE IF NOT EXISTS signup_payment_orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier_slug         VARCHAR(50) NOT NULL,
    billing_interval  VARCHAR(20) NOT NULL DEFAULT 'monthly'
                          CHECK (billing_interval IN ('monthly', 'annual')),
    amount_paise      BIGINT NOT NULL CHECK (amount_paise > 0),
    currency          VARCHAR(8) NOT NULL DEFAULT 'INR',
    provider          VARCHAR(20) NOT NULL CHECK (provider IN ('razorpay', 'phonepe')),
    provider_order_id TEXT,
    status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'paid', 'failed')),
    workspace_id      UUID REFERENCES workspaces(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at           TIMESTAMPTZ,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE signup_payment_orders IS
    'Pre-workspace payment orders for paid-duplicate-phone signups (phone-reuse epic). Settled by creating a workspace with the paid tier + an active subscription, then flipping users.phone_reuse_state -> paid_active.';

CREATE INDEX IF NOT EXISTS idx_signup_payment_orders_user
    ON signup_payment_orders (user_id, status);

-- Provider lookup at verification/webhook time. Partial on NOT NULL since the
-- provider order id is set right after row creation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_signup_payment_orders_provider_order
    ON signup_payment_orders (provider, provider_order_id)
    WHERE provider_order_id IS NOT NULL;

COMMIT;
