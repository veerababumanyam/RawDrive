-- 147_phonepe_v2_distinct_base_settings.up.sql
-- Keep Standard Checkout v2 endpoints separate from legacy PhonePe
-- salt/X-VERIFY settings used by upload/streaming recharge flows.

BEGIN;

INSERT INTO platform_settings (category, key, value, is_secret, description) VALUES
  ('payments', 'phonepe_v2_base_url', '', false, 'PhonePe Standard Checkout v2 pay/status base URL; production uses https://api.phonepe.com/apis/pg'),
  ('payments', 'phonepe_v2_auth_base_url', '', false, 'PhonePe Standard Checkout v2 OAuth base URL; production uses https://api.phonepe.com/apis/identity-manager')
ON CONFLICT (category, key) DO NOTHING;

COMMIT;
