-- 119_subscription_billing_interval.down.sql

BEGIN;

ALTER TABLE subscription_upgrade_orders DROP COLUMN IF EXISTS billing_interval;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS billing_interval;

COMMIT;
