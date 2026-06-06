-- 178_subscription_order_provider_payment_id.up.sql
-- PhonePe subscription settlement stores the gateway transaction id on
-- subscription_upgrade_orders, matching billing_orders.provider_payment_id.

BEGIN;

ALTER TABLE subscription_upgrade_orders
    ADD COLUMN IF NOT EXISTS provider_payment_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sub_upgrade_provider_payment
    ON subscription_upgrade_orders(provider, provider_payment_id)
    WHERE provider_payment_id IS NOT NULL AND provider_payment_id <> '';

COMMIT;
