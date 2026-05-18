-- 108_subscription_upgrade_orders.up.sql
-- Tracks Razorpay payment orders for workspace plan-tier upgrades.
-- The billing subsystem is not fully implemented yet; this table gives
-- the webhook handler a durable record to match against payment events
-- and update workspaces.plan_tier on payment.captured.

BEGIN;

CREATE TABLE IF NOT EXISTS subscription_upgrade_orders (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID         NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    from_tier            VARCHAR(20)  NOT NULL DEFAULT 'free',
    to_tier              VARCHAR(20)  NOT NULL,
    amount_paise         BIGINT       NOT NULL,
    razorpay_order_id    VARCHAR(100),
    razorpay_payment_id  VARCHAR(100),
    status               VARCHAR(20)  NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    initiated_by         UUID         REFERENCES users(id),
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_upgrade_workspace
    ON subscription_upgrade_orders(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_sub_upgrade_razorpay
    ON subscription_upgrade_orders(razorpay_order_id)
    WHERE razorpay_order_id IS NOT NULL;

COMMIT;
