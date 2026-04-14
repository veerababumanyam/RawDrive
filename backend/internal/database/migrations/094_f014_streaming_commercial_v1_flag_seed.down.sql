-- Remove the seeded feature flag row. Safe: any admin overrides were made via
-- UPDATE, not re-insert, so this removes exactly the seed we added.

DELETE FROM platform_settings
 WHERE category = 'featureflag'
   AND key = 'streaming.commercial_v1';
