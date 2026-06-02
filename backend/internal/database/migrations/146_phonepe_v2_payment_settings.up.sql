-- 146_phonepe_v2_payment_settings.up.sql
-- Adds PhonePe Standard Checkout v2/OAuth settings. Values stay empty until
-- configured by ops/admin; the application fails closed rather than using
-- placeholder credentials.

BEGIN;

INSERT INTO platform_settings (category, key, value, is_secret, description) VALUES
  ('payments', 'phonepe_client_id', '', false, 'PhonePe Standard Checkout v2 client ID'),
  ('payments', 'phonepe_client_secret', '', true, 'PhonePe Standard Checkout v2 client secret'),
  ('payments', 'phonepe_client_version', '1', false, 'PhonePe Standard Checkout v2 client version'),
  ('payments', 'phonepe_webhook_username', '', false, 'PhonePe dashboard webhook username for v2 callback authentication'),
  ('payments', 'phonepe_webhook_password', '', true, 'PhonePe dashboard webhook password for v2 callback authentication'),
  ('payments', 'public_base_url', '', false, 'Public app base URL used for payment redirect URLs')
ON CONFLICT (category, key) DO NOTHING;

COMMIT;
