-- 178_subscription_order_provider_payment_id.down.sql

BEGIN;

DROP INDEX IF EXISTS idx_sub_upgrade_provider_payment;

ALTER TABLE subscription_upgrade_orders
    DROP COLUMN IF EXISTS provider_payment_id;

COMMIT;
