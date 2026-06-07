BEGIN;

CREATE TABLE IF NOT EXISTS gallery_event_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    billing_order_id UUID NOT NULL REFERENCES billing_orders(id) ON DELETE CASCADE,
    billing_product_version_id UUID NOT NULL REFERENCES billing_product_versions(id) ON DELETE RESTRICT,
    product_code TEXT NOT NULL REFERENCES billing_products(code) ON DELETE RESTRICT,
    quota_bytes BIGINT NOT NULL CHECK (quota_bytes > 0),
    upload_credits BIGINT NOT NULL DEFAULT 0 CHECK (upload_credits >= 0),
    upload_window_ends_at TIMESTAMPTZ NOT NULL,
    active_ends_at TIMESTAMPTZ NOT NULL,
    cleanup_due_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'view_only', 'converted', 'cleaned', 'cancelled')),
    converted_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cleanup_completed_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT gallery_event_entitlements_windows
        CHECK (upload_window_ends_at <= active_ends_at AND active_ends_at <= cleanup_due_at),
    CONSTRAINT gallery_event_entitlements_order_unique UNIQUE (billing_order_id)
);

CREATE INDEX IF NOT EXISTS idx_gallery_event_entitlements_gallery_active
    ON gallery_event_entitlements(gallery_id, status, cleanup_due_at)
    WHERE cleanup_completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_gallery_event_entitlements_workspace_cleanup
    ON gallery_event_entitlements(workspace_id, cleanup_due_at)
    WHERE cleanup_completed_at IS NULL;

UPDATE billing_lifecycle_policies
   SET description = 'Pay-per-event galleries have a strict 30-day total window and are deleted unless the workspace converts to a paid subscription.',
       gallery_expiry_action = 'delete',
       gallery_delete_grace_days = 0,
       account_delete_grace_days = 0,
       max_delete_grace_days = 0,
       conversion_prompt_enabled = TRUE,
       metadata = COALESCE(metadata, '{}'::jsonb)
                  || '{"upgrade_prompt":true,"extension_prompt":true,"legal_proof_required":true,"strict_cleanup_days":30}'::jsonb,
       updated_at = NOW()
 WHERE code = 'pay_per_event_default';

UPDATE subscription_plans
   SET description = 'No subscription. Event products must declare storage quota, upload window, and a strict 30-day cleanup policy through the approved catalog.',
       features = ARRAY[
           'Storage quota configured per event product',
           'Upload window configured per event product',
           'View-only after active phase',
           'No new uploads after expiry',
           'Clean sweep after 30 days unless upgraded',
           'Extension packs available'
       ],
       updated_at = NOW()
 WHERE tier = 'pay_per_event';

WITH latest_event_versions AS (
    SELECT DISTINCT ON (bpv.product_code)
           bpv.*, bp.product_type
      FROM billing_product_versions bpv
      JOIN billing_products bp ON bp.code = bpv.product_code
     WHERE bp.product_type = 'event_upload'
       AND bpv.status IN ('approved', 'published')
       AND bpv.archived_at IS NULL
     ORDER BY bpv.product_code, bpv.effective_from DESC, bpv.version DESC
),
normalized AS (
    SELECT
        lev.*,
        CASE
            WHEN COALESCE(lev.metadata->>'quota_bytes', '') ~ '^[0-9]+$'
             AND COALESCE(lev.metadata->>'active_days', '') ~ '^[0-9]+$'
             AND COALESCE(lev.metadata->>'upload_window_days', '') ~ '^[0-9]+$'
            THEN (lev.metadata->>'quota_bytes')::numeric > 0
             AND (lev.metadata->>'active_days')::integer BETWEEN 1 AND 30
             AND (lev.metadata->>'upload_window_days')::integer BETWEEN 1 AND (lev.metadata->>'active_days')::integer
            ELSE FALSE
        END AS has_valid_event_terms,
        CASE
            WHEN COALESCE(lev.metadata->>'retention_days', '') IS DISTINCT FROM '30' THEN TRUE
            WHEN COALESCE(lev.metadata->>'quota_bytes', '') !~ '^[0-9]+$' THEN TRUE
            WHEN COALESCE(lev.metadata->>'active_days', '') !~ '^[0-9]+$' THEN TRUE
            WHEN COALESCE(lev.metadata->>'upload_window_days', '') !~ '^[0-9]+$' THEN TRUE
            ELSE (lev.metadata->>'active_days')::integer > 30
              OR (lev.metadata->>'upload_window_days')::integer > (lev.metadata->>'active_days')::integer
        END AS needs_replacement
      FROM latest_event_versions lev
),
next_versions AS (
    SELECT n.product_code, COALESCE(MAX(bpv.version), 0) + 1 AS version
      FROM normalized n
      JOIN billing_product_versions bpv ON bpv.product_code = n.product_code
     WHERE n.needs_replacement
     GROUP BY n.product_code
)
INSERT INTO billing_product_versions (
    product_code, version, status, name, description, currency, price_paise,
    billing_interval, metadata, active, rank, effective_from, approved_at
)
SELECT
    n.product_code,
    nv.version,
    'approved',
    n.name,
    n.description,
    n.currency,
    n.price_paise,
    n.billing_interval,
    jsonb_set(COALESCE(n.metadata, '{}'::jsonb), '{retention_days}', '30'::jsonb, true)
        || '{"m184_pay_per_event_cleanup":true}'::jsonb,
    CASE WHEN n.has_valid_event_terms THEN n.active ELSE FALSE END,
    n.rank,
    NOW(),
    NOW()
FROM normalized n
JOIN next_versions nv ON nv.product_code = n.product_code
WHERE n.needs_replacement
ON CONFLICT (product_code, version) DO NOTHING;

COMMIT;
