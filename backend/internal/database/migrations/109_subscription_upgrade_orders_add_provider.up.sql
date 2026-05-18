-- 2026-05-18: subscription upgrades now support PhonePe in addition to
-- Razorpay. The handler picks the provider per-order based on what the
-- user selects in the plans page; existing rows (created before this
-- migration) all came from Razorpay, hence the DEFAULT.
--
-- provider              — which gateway settled this order
-- provider_order_id     — gateway-side order id (Razorpay's order_xxx, PhonePe's merchantOrderId echoed back as orderId)
-- provider_payment_id   — gateway-side payment id (Razorpay pay_xxx, PhonePe transactionId)
--
-- razorpay_order_id / razorpay_payment_id are left in place untouched so
-- the existing Razorpay handler keeps working without code changes; the
-- new columns are populated in parallel for new rows. A follow-up
-- migration can drop the razorpay_* columns once the Razorpay handler is
-- migrated to the generic provider_* fields.

ALTER TABLE subscription_upgrade_orders
  ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'razorpay',
  ADD COLUMN IF NOT EXISTS provider_order_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(100);

ALTER TABLE subscription_upgrade_orders
  DROP CONSTRAINT IF EXISTS subscription_upgrade_orders_provider_check;

ALTER TABLE subscription_upgrade_orders
  ADD CONSTRAINT subscription_upgrade_orders_provider_check
    CHECK (provider IN ('razorpay', 'phonepe'));

-- Lookup index for PhonePe verify path which queries by merchantOrderId
-- (mapped onto provider_order_id). The existing razorpay index covers
-- the Razorpay verify path on its own column.
CREATE INDEX IF NOT EXISTS idx_sub_upgrade_provider_order
  ON subscription_upgrade_orders (provider, provider_order_id)
  WHERE provider_order_id IS NOT NULL;

-- Backfill provider_order_id / provider_payment_id from the
-- razorpay-specific columns so existing rows can be queried via the
-- generic path. Idempotent: only sets when null.
UPDATE subscription_upgrade_orders
   SET provider_order_id = razorpay_order_id
 WHERE provider_order_id IS NULL AND razorpay_order_id IS NOT NULL;

UPDATE subscription_upgrade_orders
   SET provider_payment_id = razorpay_payment_id
 WHERE provider_payment_id IS NULL AND razorpay_payment_id IS NOT NULL;
