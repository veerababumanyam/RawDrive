-- 119_subscription_billing_interval.up.sql
-- Adds billing_interval to subscriptions and subscription_upgrade_orders so
-- annual plans can be tracked separately from monthly. Both tables default to
-- 'monthly' so existing rows remain valid without a backfill.

BEGIN;

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(10) NOT NULL DEFAULT 'monthly'
        CHECK (billing_interval IN ('monthly', 'annual'));

ALTER TABLE subscription_upgrade_orders
    ADD COLUMN IF NOT EXISTS billing_interval VARCHAR(10) NOT NULL DEFAULT 'monthly'
        CHECK (billing_interval IN ('monthly', 'annual'));

COMMENT ON COLUMN subscriptions.billing_interval IS
    'Billing cadence for this subscription row — monthly (30-day expiry) or annual (365-day expiry).';

COMMENT ON COLUMN subscription_upgrade_orders.billing_interval IS
    'Billing cadence chosen at order creation — determines price tier and subscription expiry.';

COMMIT;
