BEGIN;

WITH event_product_terms AS (
    SELECT *
      FROM (VALUES
          (
              'event_upload_standard'::text,
              'Event upload'::text,
              'Best for occasional shoots and beginners who do not want a subscription.'::text,
              10737418240::bigint,
              500::bigint,
              30::integer,
              30::integer,
              30::integer,
              10::integer
          ),
          (
              'event_upload_wedding'::text,
              'Wedding upload'::text,
              'Built for weddings, multi-day events, and larger client delivery sets.'::text,
              53687091200::bigint,
              2000::bigint,
              30::integer,
              30::integer,
              30::integer,
              20::integer
          )
      ) AS v(
          product_code,
          name,
          description,
          quota_bytes,
          upload_credits,
          upload_window_days,
          active_days,
          retention_days,
          rank
      )
),
existing_versions AS (
    SELECT
        ept.*,
        bpv.currency,
        bpv.price_paise,
        bpv.billing_interval,
        COALESCE(bpv.active, FALSE) AS current_active,
        COALESCE(bpv.metadata, '{}'::jsonb) AS metadata,
        COALESCE(MAX(bpv.version) OVER (PARTITION BY ept.product_code), 0) + 1 AS next_version,
        ROW_NUMBER() OVER (
            PARTITION BY ept.product_code
            ORDER BY bpv.effective_from DESC, bpv.version DESC
        ) AS rn
      FROM event_product_terms ept
      JOIN billing_products bp ON bp.code = ept.product_code
      LEFT JOIN billing_product_versions bpv ON bpv.product_code = ept.product_code
     WHERE bp.product_type = 'event_upload'
       AND bp.archived_at IS NULL
       AND (
           bpv.id IS NULL
           OR (
               bpv.status IN ('approved', 'published')
               AND bpv.archived_at IS NULL
           )
       )
),
latest_versions AS (
    SELECT
        product_code,
        name,
        description,
        quota_bytes,
        upload_credits,
        upload_window_days,
        active_days,
        retention_days,
        rank,
        COALESCE(currency, 'INR') AS currency,
        COALESCE(price_paise, 0) AS price_paise,
        COALESCE(billing_interval, 'one_time') AS billing_interval,
        current_active,
        metadata,
        GREATEST(next_version, 1) AS next_version,
        COALESCE(metadata->>'quota_bytes', '') = quota_bytes::text
            AND COALESCE(metadata->>'upload_credits', '') = upload_credits::text
            AND COALESCE(metadata->>'upload_window_days', '') = upload_window_days::text
            AND COALESCE(metadata->>'active_days', '') = active_days::text
            AND COALESCE(metadata->>'retention_days', '') = retention_days::text
            AND COALESCE(metadata->>'m186_event_upload_quota_activation', '') = 'true'
            AND current_active = TRUE
            AS already_activated
      FROM existing_versions
     WHERE rn = 1
),
inserted AS (
    INSERT INTO billing_product_versions (
        product_code, version, status, name, description, currency, price_paise,
        billing_interval, metadata, active, rank, effective_from, approved_at
    )
    SELECT
        lv.product_code,
        lv.next_version,
        'approved',
        lv.name,
        lv.description,
        lv.currency,
        lv.price_paise,
        lv.billing_interval,
        lv.metadata
            || jsonb_build_object(
                'quota_bytes', lv.quota_bytes,
                'upload_credits', lv.upload_credits,
                'upload_window_days', lv.upload_window_days,
                'active_days', lv.active_days,
                'retention_days', lv.retention_days,
                'm186_event_upload_quota_activation', true
            ),
        TRUE,
        lv.rank,
        NOW(),
        NOW()
      FROM latest_versions lv
     WHERE NOT lv.already_activated
    ON CONFLICT (product_code, version) DO NOTHING
    RETURNING product_code, version, effective_from
),
closed_previous AS (
    UPDATE billing_product_versions previous
       SET effective_to = inserted.effective_from,
           updated_at = NOW()
      FROM inserted
    WHERE previous.product_code = inserted.product_code
       AND previous.version < inserted.version
       AND previous.effective_to IS NULL
       AND previous.archived_at IS NULL
    RETURNING previous.product_code
),
updated_products AS (
    UPDATE billing_products bp
       SET active = TRUE,
           rank = ept.rank,
           archived_at = NULL,
           updated_at = NOW()
      FROM event_product_terms ept
     WHERE bp.code = ept.product_code
    RETURNING bp.code
)
SELECT COUNT(*) FROM inserted
UNION ALL
SELECT COUNT(*) FROM closed_previous
UNION ALL
SELECT COUNT(*) FROM updated_products;

COMMIT;
