BEGIN;

DELETE FROM platform_settings
WHERE category = 'storage'
  AND key IN (
    'b2_bucket_name',
    'b2_region',
    'b2_endpoint',
    'b2_key_id',
    'b2_application_key',
    'sse_mode',
    'sse_customer_key_hex'
  );

COMMIT;
