-- 140_subscription_upgrade_order_provider_columns.up.sql
-- The subscription upgrade handler supports Razorpay and PhonePe and writes
-- provider/provider_order_id for every upgrade order. Migration 108 created
-- the table before those columns existed, so order creation reached Razorpay
-- and then failed locally with "could not persist upgrade order".

BEGIN;

ALTER TABLE subscription_upgrade_orders
    ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'razorpay',
    ADD COLUMN IF NOT EXISTS provider_order_id VARCHAR(120);

UPDATE subscription_upgrade_orders
   SET provider_order_id = COALESCE(provider_order_id, razorpay_order_id, id::text)
 WHERE provider_order_id IS NULL;

ALTER TABLE subscription_upgrade_orders
    ALTER COLUMN provider_order_id SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conname = 'subscription_upgrade_orders_provider_check'
           AND conrelid = 'subscription_upgrade_orders'::regclass
    ) THEN
        ALTER TABLE subscription_upgrade_orders
            ADD CONSTRAINT subscription_upgrade_orders_provider_check
            CHECK (provider IN ('razorpay', 'phonepe'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_upgrade_provider_order
    ON subscription_upgrade_orders(provider, provider_order_id);

COMMIT;
