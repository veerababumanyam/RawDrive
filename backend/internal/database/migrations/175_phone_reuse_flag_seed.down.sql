-- Down for migration 175: remove the seeded phone-reuse enforcement flag row.
-- Idempotent.

DELETE FROM platform_settings
 WHERE category = 'featureflag'
   AND key = 'phone_reuse.enforcement';
