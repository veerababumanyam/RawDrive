-- 146_phonepe_v2_payment_settings.down.sql

BEGIN;

DELETE FROM platform_settings
 WHERE category = 'payments'
   AND key IN (
    'phonepe_client_id',
    'phonepe_client_secret',
    'phonepe_client_version',
    'phonepe_webhook_username',
    'phonepe_webhook_password',
    'public_base_url'
   );

COMMIT;
