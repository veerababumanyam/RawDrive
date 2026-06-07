BEGIN;

WITH removable AS (
    SELECT bpv.id, bpv.product_code, bpv.version
      FROM billing_product_versions bpv
     WHERE bpv.metadata->>'m186_event_upload_quota_activation' = 'true'
       AND bpv.product_code IN ('event_upload_standard', 'event_upload_wedding')
       AND NOT EXISTS (
           SELECT 1
             FROM billing_orders bo
            WHERE (bo.catalog_snapshot->'product'->>'version_id') = bpv.id::text
       )
       AND NOT EXISTS (
           SELECT 1
             FROM gallery_event_entitlements gee
            WHERE gee.billing_product_version_id = bpv.id
       )
),
deleted AS (
    DELETE FROM billing_product_versions bpv
     USING removable
     WHERE bpv.id = removable.id
    RETURNING removable.product_code
),
restore_previous AS (
    UPDATE billing_product_versions previous
       SET effective_to = NULL,
           updated_at = NOW()
      FROM deleted
     WHERE previous.product_code = deleted.product_code
       AND previous.effective_to IS NOT NULL
       AND previous.archived_at IS NULL
       AND NOT EXISTS (
           SELECT 1
             FROM billing_product_versions newer
            WHERE newer.product_code = previous.product_code
              AND newer.version > previous.version
              AND newer.archived_at IS NULL
       )
    RETURNING previous.product_code
)
SELECT COUNT(*) FROM deleted
UNION ALL
SELECT COUNT(*) FROM restore_previous;

COMMIT;
