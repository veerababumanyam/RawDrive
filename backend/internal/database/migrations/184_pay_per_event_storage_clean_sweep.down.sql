BEGIN;

DROP INDEX IF EXISTS idx_gallery_event_entitlements_workspace_cleanup;
DROP INDEX IF EXISTS idx_gallery_event_entitlements_gallery_active;
DROP TABLE IF EXISTS gallery_event_entitlements;

UPDATE billing_lifecycle_policies
   SET description = 'Pay-per-event galleries must be deleted within one week after expiry unless the user extends or upgrades to a subscription.',
       gallery_expiry_action = 'delete',
       gallery_delete_grace_days = 7,
       account_delete_grace_days = 7,
       max_delete_grace_days = 7,
       conversion_prompt_enabled = TRUE,
       metadata = (COALESCE(metadata, '{}'::jsonb) - 'strict_cleanup_days')
                  || '{"upgrade_prompt":true,"extension_prompt":true,"legal_proof_required":true}'::jsonb,
       updated_at = NOW()
 WHERE code = 'pay_per_event_default';

UPDATE subscription_plans
   SET description = 'No subscription. Rs.199 events include a 30-day active phase; Rs.499 wedding uploads include 60 active days.',
       features = ARRAY[
           'Rs.199 Event Upload',
           '30-day Active Phase',
           'View-only After Active Phase',
           'No New Uploads After Expiry',
           'Auto-archive After 90 Days',
           'Rs.499 Wedding Upload (60-day Active Phase)',
           'Extension Packs Available'
       ],
       updated_at = NOW()
 WHERE tier = 'pay_per_event';

DELETE FROM billing_product_versions
 WHERE metadata->>'m184_pay_per_event_cleanup' = 'true'
   AND NOT EXISTS (
       SELECT 1
         FROM billing_orders bo
        WHERE (bo.catalog_snapshot->'product'->>'version_id') = billing_product_versions.id::text
   );

COMMIT;
