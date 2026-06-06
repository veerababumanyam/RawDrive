-- Local/dev smoke seed for the Cover & Design photo picker.
--
-- Usage:
--   psql "$DATABASE_URL" -f backend/seeds/seed_cover_design_smoke_gallery.sql
--
-- This script is intentionally data-only and idempotent. It links the first
-- four ready image assets in a workspace into a deterministic smoke gallery and
-- stores a multi-slot design_config, so the dashboard cover picker and public
-- cover template can be checked against real media rows. To use the canonical
-- fixtures, upload tests/photos/ into any local workspace first, then run this
-- seed.

WITH ranked_assets AS (
  SELECT
    a.id AS asset_id,
    a.workspace_id,
    w.owner_id,
    row_number() OVER (
      PARTITION BY a.workspace_id
      ORDER BY a.created_at ASC, a.id ASC
    ) - 1 AS sort_order,
    count(*) OVER (PARTITION BY a.workspace_id) AS ready_image_count
  FROM assets a
  JOIN workspaces w ON w.id = a.workspace_id
  WHERE a.deleted_at IS NULL
    AND a.status = 'ready'
    AND a.content_type LIKE 'image/%'
),
candidate_workspace AS (
  SELECT workspace_id, owner_id
  FROM ranked_assets
  WHERE ready_image_count >= 4
  GROUP BY workspace_id, owner_id
  ORDER BY workspace_id
  LIMIT 1
),
selected_assets AS (
  SELECT
    r.asset_id,
    r.workspace_id,
    r.owner_id,
    r.sort_order
  FROM ranked_assets r
  JOIN candidate_workspace cw ON cw.workspace_id = r.workspace_id
  WHERE r.sort_order < 4
),
slot_payload AS (
  SELECT
    workspace_id,
    owner_id,
    (array_agg(asset_id ORDER BY sort_order))[1] AS cover_asset_id,
    jsonb_agg(asset_id::text ORDER BY sort_order) AS asset_slots
  FROM selected_assets
  GROUP BY workspace_id, owner_id
),
design_payload AS (
  SELECT
    workspace_id,
    owner_id,
    cover_asset_id,
    jsonb_build_object(
      'version', 8,
      'cover', jsonb_build_object(
        'assetId', cover_asset_id::text,
        'assetSlots', asset_slots,
        'styleId', 'modern-grid',
        'mediaMode', 'photo-grid',
        'title', 'Cover Design Smoke',
        'subtitle', 'Photo slots stay wired to this gallery',
        'focalPoint', jsonb_build_object('x', 50, 'y', 50),
        'slotFocalPoints', jsonb_build_array(
          jsonb_build_object('x', 50, 'y', 50),
          jsonb_build_object('x', 50, 'y', 50),
          jsonb_build_object('x', 50, 'y', 50),
          jsonb_build_object('x', 50, 'y', 50)
        )
      )
    ) AS design_config
  FROM slot_payload
),
upsert_gallery AS (
  INSERT INTO galleries (
    id,
    workspace_id,
    title,
    slug,
    description,
    cover_asset_id,
    gallery_type,
    settings,
    watermark_config,
    is_published,
    max_selections,
    status,
    created_by,
    created_at,
    updated_at,
    published_at,
    cover_template,
    cover_config,
    download_enabled,
    download_quality,
    sort_preference,
    whatsapp_template,
    access_mode
  )
  SELECT
    gen_random_uuid(),
    workspace_id,
    'Cover Design Smoke Gallery',
    'cover-design-smoke',
    'Local/dev smoke gallery for cover template slot selection.',
    cover_asset_id,
    'delivery',
    jsonb_build_object('design_config', design_config),
    '{}'::jsonb,
    true,
    0,
    'active',
    owner_id,
    now(),
    now(),
    now(),
    'modern-grid',
    design_config->'cover',
    true,
    'webp',
    'manual',
    '',
    'public'
  FROM design_payload
  ON CONFLICT (workspace_id, slug) DO UPDATE SET
    description = EXCLUDED.description,
    cover_asset_id = EXCLUDED.cover_asset_id,
    settings = EXCLUDED.settings,
    is_published = EXCLUDED.is_published,
    status = EXCLUDED.status,
    deleted_at = NULL,
    updated_at = now(),
    published_at = COALESCE(galleries.published_at, now()),
    cover_template = EXCLUDED.cover_template,
    cover_config = EXCLUDED.cover_config,
    download_enabled = EXCLUDED.download_enabled,
    download_quality = EXCLUDED.download_quality,
    sort_preference = EXCLUDED.sort_preference,
    access_mode = EXCLUDED.access_mode
  RETURNING id, workspace_id
)
INSERT INTO gallery_assets (id, gallery_id, asset_id, sort_order, is_hero, added_at)
SELECT
  gen_random_uuid(),
  g.id,
  sa.asset_id,
  sa.sort_order,
  sa.sort_order = 0,
  now()
FROM upsert_gallery g
JOIN selected_assets sa ON sa.workspace_id = g.workspace_id
ON CONFLICT (gallery_id, asset_id) DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  is_hero = EXCLUDED.is_hero;
