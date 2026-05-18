DROP INDEX IF EXISTS idx_sub_upgrade_provider_order;

ALTER TABLE subscription_upgrade_orders
  DROP CONSTRAINT IF EXISTS subscription_upgrade_orders_provider_check;

ALTER TABLE subscription_upgrade_orders
  DROP COLUMN IF EXISTS provider,
  DROP COLUMN IF EXISTS provider_order_id,
  DROP COLUMN IF EXISTS provider_payment_id;
