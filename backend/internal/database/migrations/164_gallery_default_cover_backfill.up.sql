-- Migration 161: backfill default gallery covers from first uploaded asset.
--
-- Existing galleries created before the default-cover invariant may have
-- gallery_assets rows but a NULL/stale galleries.cover_asset_id, which leaves
-- owner and public cards without a persistent cover choice. Persist a
-- historical photographer choice from design settings first; otherwise pick the
-- first active asset by gallery ordering. Valid photographer-selected covers
-- are preserved.

BEGIN;

WITH saved_cover_candidates AS (
  SELECT
    g.id AS gallery_id,
    saved.cover_asset_id::uuid AS asset_id,
    0 AS priority,
    0 AS sort_order,
    g.updated_at AS added_at
  FROM galleries g
  JOIN LATERAL (
    SELECT cover_asset_id
    FROM (VALUES
      (NULLIF(g.settings #>> '{design_config,cover,assetId}', '')),
      (NULLIF(g.settings #>> '{cover_style,asset_id}', ''))
    ) AS saved_ids(cover_asset_id)
    WHERE cover_asset_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    LIMIT 1
  ) saved ON true
  JOIN assets a ON a.id = saved.cover_asset_id::uuid
  WHERE NOT EXISTS (
      SELECT 1
      FROM assets current_cover
      WHERE current_cover.id = g.cover_asset_id
        AND current_cover.workspace_id = g.workspace_id
        AND current_cover.deleted_at IS NULL
    )
    AND g.deleted_at IS NULL
    AND a.deleted_at IS NULL
    AND a.workspace_id = g.workspace_id
),
first_asset_candidates AS (
  SELECT
    g.id AS gallery_id,
    ga.asset_id,
    1 AS priority,
    ga.sort_order,
    ga.added_at
  FROM galleries g
  JOIN gallery_assets ga ON ga.gallery_id = g.id
  JOIN assets a ON a.id = ga.asset_id
  WHERE NOT EXISTS (
      SELECT 1
      FROM assets current_cover
      WHERE current_cover.id = g.cover_asset_id
        AND current_cover.workspace_id = g.workspace_id
        AND current_cover.deleted_at IS NULL
    )
    AND g.deleted_at IS NULL
    AND a.deleted_at IS NULL
    AND a.workspace_id = g.workspace_id
),
ranked_assets AS (
  SELECT
    gallery_id,
    asset_id,
    ROW_NUMBER() OVER (
      PARTITION BY gallery_id
      ORDER BY priority ASC, sort_order ASC, added_at ASC, asset_id ASC
    ) AS rn
  FROM (
    SELECT gallery_id, asset_id, priority, sort_order, added_at
    FROM saved_cover_candidates
    UNION ALL
    SELECT gallery_id, asset_id, priority, sort_order, added_at
    FROM first_asset_candidates
  ) candidates
)
UPDATE galleries g
SET cover_asset_id = ranked_assets.asset_id,
    updated_at = now()
FROM ranked_assets
WHERE ranked_assets.gallery_id = g.id
  AND ranked_assets.rn = 1
  AND NOT EXISTS (
    SELECT 1
    FROM assets current_cover
    WHERE current_cover.id = g.cover_asset_id
      AND current_cover.workspace_id = g.workspace_id
      AND current_cover.deleted_at IS NULL
  );

COMMIT;
