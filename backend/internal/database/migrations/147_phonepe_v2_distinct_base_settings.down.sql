-- 147_phonepe_v2_distinct_base_settings.down.sql

BEGIN;

DELETE FROM platform_settings
 WHERE category = 'payments'
   AND key IN (
    'phonepe_v2_base_url',
    'phonepe_v2_auth_base_url'
   );

COMMIT;
