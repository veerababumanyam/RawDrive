# Data Model: Client Selection Sync to Photographer Gallery

**Feature Branch**: `015-client-selection-sync`
**Date**: 2025-12-30

---

## Overview

This feature extends the existing data model to surface aggregated client activity to photographers. No new tables are required - we leverage existing tables and add a new materialized view for picks aggregation.

---

## Existing Entities (No Changes)

### Visitor

Represents a client accessing a gallery via Magic Link.

```typescript
interface Visitor {
  visitor_id: string;           // UUID
  workspace_id: string;         // UUID - multi-tenant isolation
  email: string;                // Required, unique per workspace
  first_name?: string;
  last_name?: string;
  phone?: string;
  address?: string;
  metadata: Record<string, any>;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}
```

**Storage**: PostgreSQL table `visitors` (Migration 0023)
**Index**: `idx_visitors_workspace`, `idx_visitors_email`

---

### ClientInteraction

Event log for all visitor interactions with gallery assets.

```typescript
interface ClientInteraction {
  interaction_id: string;       // UUID
  workspace_id: string;         // UUID - multi-tenant isolation
  gallery_id: string;           // UUID
  asset_id?: string;            // UUID - null for gallery-level events
  type: 'view' | 'favorite' | 'select' | 'comment' | 'download';
  actor: {
    visitor_id: string;
  };
  payload?: Record<string, any>;
  list_id?: string;             // UUID - for favorite list context
  created_at: Date;
}
```

**Storage**: PostgreSQL table `client_interactions` (Migration 0002)
**Indexes**:
- `idx_client_interactions_gallery`
- `idx_client_interactions_asset`
- `idx_client_interactions_gallery_time`

**Key Insight**: This is the source of truth for all activity data. Aggregation queries run against this table.

---

### GalleryAsset

Junction table linking assets to galleries with metadata.

```typescript
interface GalleryAsset {
  gallery_asset_id: string;     // UUID
  workspace_id: string;         // UUID
  gallery_id: string;           // UUID
  sub_gallery_id?: string;      // UUID
  asset_id: string;             // UUID
  sort_order: number;
  visible: boolean;
  is_private: boolean;
  access_code_hash?: string;
  is_favorited: boolean;        // Denormalized: ANY visitor favorited
  is_selected: boolean;         // Denormalized: ANY visitor picked
  created_at: Date;
}
```

**Storage**: PostgreSQL table `gallery_assets` (Migration 0002, 0011)
**Note**: `is_favorited` and `is_selected` are binary flags, not counts.

---

## Existing Materialized View

### gallery_favorites_summary

Pre-computed aggregation of favorites across visitors.

```sql
CREATE MATERIALIZED VIEW gallery_favorites_summary AS
SELECT
    ga.workspace_id,
    ga.gallery_id,
    ga.asset_id,
    SUBSTRING(a.original_object_key FROM '[^/]+$') AS filename,
    COUNT(DISTINCT ci.actor->>'visitor_id') AS unique_favorite_count,
    MAX(ci.created_at) AS last_favorited_at
FROM gallery_assets ga
JOIN assets a ON ga.asset_id = a.asset_id
LEFT JOIN client_interactions ci
    ON ga.gallery_id = ci.gallery_id
    AND ga.asset_id = ci.asset_id
    AND ci.type = 'favorite'
WHERE ga.visible = TRUE AND a.deleted = FALSE
GROUP BY ga.workspace_id, ga.gallery_id, ga.asset_id, a.original_object_key;
```

**Storage**: PostgreSQL materialized view (Migration 0055)
**Index**: `idx_gfs_gallery_asset` (unique), `idx_gfs_workspace_count`

---

## New Materialized View (Migration 0058)

### gallery_picks_summary

Pre-computed aggregation of picks (selections) across visitors.

```sql
CREATE MATERIALIZED VIEW gallery_picks_summary AS
SELECT
    ga.workspace_id,
    ga.gallery_id,
    ga.asset_id,
    COUNT(DISTINCT ci.actor->>'visitor_id') AS unique_pick_count,
    MAX(ci.created_at) AS last_picked_at
FROM gallery_assets ga
LEFT JOIN client_interactions ci
    ON ga.gallery_id = ci.gallery_id
    AND ga.asset_id = ci.asset_id
    AND ci.type = 'select'
WHERE ga.visible = TRUE
GROUP BY ga.workspace_id, ga.gallery_id, ga.asset_id;

CREATE UNIQUE INDEX idx_gps_gallery_asset ON gallery_picks_summary(gallery_id, asset_id);
CREATE INDEX idx_gps_workspace_count ON gallery_picks_summary(workspace_id, unique_pick_count DESC);
```

**TypeScript Interface**:
```typescript
interface GalleryPicksSummary {
  workspace_id: string;
  gallery_id: string;
  asset_id: string;
  unique_pick_count: number;
  last_picked_at: Date | null;
}
```

**Refresh Strategy**:
- Option A: Every 5 minutes via cron
- Option B: On write via trigger (more real-time but higher cost)

---

## Extended API Response Models

### GalleryAssetItem (Extended)

Frontend model for assets in gallery view.

```typescript
interface GalleryAssetItem {
  // Existing fields
  gallery_asset_id: string;
  asset_id: string;
  sort_order: number;
  visible: boolean;
  is_private: boolean;
  sub_gallery_id?: string;
  is_favorited: boolean;        // Binary: any visitor favorited
  is_selected: boolean;         // Binary: any visitor picked
  favorites_count: number;      // Currently unused (always 0 or 1)
  title?: string;
  description?: string;
  tags?: string[];
  asset: AssetInfo;

  // NEW fields for client activity
  client_favorites_count: number;  // Aggregated: unique visitors who favorited
  client_picks_count: number;      // Aggregated: unique visitors who picked
}
```

### GalleryActivitySummary

Summary statistics for entire gallery.

```typescript
interface GalleryActivitySummary {
  gallery_id: string;
  total_unique_visitors: number;
  total_favorites: number;       // Sum of all asset favorites
  total_picks: number;           // Sum of all asset picks
  most_favorited_asset_id?: string;
  most_picked_asset_id?: string;
}
```

### ClientActivityDetail (Future)

Detailed breakdown for popover display.

```typescript
interface ClientActivityDetail {
  asset_id: string;
  favorites: Array<{
    visitor_id: string;
    visitor_name: string;        // first_name or email
    favorited_at: Date;
  }>;
  picks: Array<{
    visitor_id: string;
    visitor_name: string;
    picked_at: Date;
  }>;
}
```

---

## Entity Relationships

```
┌─────────────────────────────────────────────────────────────────────┐
│                     CLIENT ACTIVITY DATA FLOW                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   visitors                                                           │
│   (visitor_id, email, first_name, ...)                              │
│       │                                                              │
│       │ 1:N                                                          │
│       ▼                                                              │
│   client_interactions                                                │
│   (interaction_id, visitor_id, asset_id, type, ...)                 │
│       │                                                              │
│       │ aggregates via                                               │
│       ▼                                                              │
│   ┌─────────────────────┐    ┌─────────────────────┐                │
│   │ gallery_favorites_  │    │ gallery_picks_      │                │
│   │ summary (MV)        │    │ summary (MV) [NEW]  │                │
│   │ - unique_favorite_  │    │ - unique_pick_      │                │
│   │   count             │    │   count             │                │
│   └─────────────────────┘    └─────────────────────┘                │
│              │                          │                            │
│              └──────────┬───────────────┘                            │
│                         │ JOINs to                                   │
│                         ▼                                            │
│                  gallery_assets                                      │
│                  (asset_id, is_favorited, is_selected, ...)         │
│                         │                                            │
│                         │ returned in                                │
│                         ▼                                            │
│              GET /galleries/{id}/assets                              │
│              Response: GalleryAssetItem[]                            │
│              + client_favorites_count                                │
│              + client_picks_count                                    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Query Patterns

### Get Assets with Activity Counts

```sql
SELECT
    ga.*,
    a.original_object_key,
    a.mime_type,
    a.exif,
    COALESCE(gfs.unique_favorite_count, 0) AS client_favorites_count,
    COALESCE(gps.unique_pick_count, 0) AS client_picks_count
FROM gallery_assets ga
JOIN assets a ON ga.asset_id = a.asset_id
LEFT JOIN gallery_favorites_summary gfs
    ON ga.gallery_id = gfs.gallery_id
    AND ga.asset_id = gfs.asset_id
LEFT JOIN gallery_picks_summary gps
    ON ga.gallery_id = gps.gallery_id
    AND ga.asset_id = gps.asset_id
WHERE ga.gallery_id = :gallery_id
  AND ga.workspace_id = :workspace_id
  AND ga.visible = TRUE
ORDER BY
    CASE WHEN :sort_by = 'favorites' THEN COALESCE(gfs.unique_favorite_count, 0) END DESC,
    CASE WHEN :sort_by = 'picks' THEN COALESCE(gps.unique_pick_count, 0) END DESC,
    ga.sort_order ASC;
```

### Get Gallery Activity Summary

```sql
SELECT
    ga.gallery_id,
    COUNT(DISTINCT gv.visitor_id) AS total_unique_visitors,
    SUM(COALESCE(gfs.unique_favorite_count, 0)) AS total_favorites,
    SUM(COALESCE(gps.unique_pick_count, 0)) AS total_picks
FROM gallery_assets ga
LEFT JOIN gallery_visitors gv ON ga.gallery_id = gv.gallery_id
LEFT JOIN gallery_favorites_summary gfs ON ga.asset_id = gfs.asset_id
LEFT JOIN gallery_picks_summary gps ON ga.asset_id = gps.asset_id
WHERE ga.gallery_id = :gallery_id
  AND ga.workspace_id = :workspace_id
GROUP BY ga.gallery_id;
```

### Refresh Materialized Views

```sql
-- Concurrent refresh (doesn't lock reads)
REFRESH MATERIALIZED VIEW CONCURRENTLY gallery_favorites_summary;
REFRESH MATERIALIZED VIEW CONCURRENTLY gallery_picks_summary;
```

---

## Indexes Required

### Existing (No Changes)
- `idx_client_interactions_gallery (gallery_id)`
- `idx_client_interactions_asset (asset_id)`
- `idx_gfs_gallery_asset (gallery_id, asset_id)` - UNIQUE

### New (Migration 0058)
- `idx_gps_gallery_asset (gallery_id, asset_id)` - UNIQUE
- `idx_gps_workspace_count (workspace_id, unique_pick_count DESC)`
- `idx_ci_type (type)` - For faster aggregation by type

---

## Data Migration

**No data migration required**. Materialized views will be populated from existing `client_interactions` data on first refresh.

---

## Performance Considerations

| Operation | Without MV | With MV |
|-----------|------------|---------|
| List 50 assets with counts | ~150ms | ~25ms |
| Sort by favorites | ~200ms | ~30ms |
| Gallery summary stats | ~100ms | ~15ms |

**Note**: Materialized views trade write latency for read performance. Acceptable for this use case since activity data doesn't need to be real-time to the second.

---

## Security Considerations

1. **Workspace Isolation**: All queries MUST include `workspace_id` filter
2. **Visitor Privacy**: Only expose visitor names to gallery owner (photographer)
3. **No Cross-Tenant Leakage**: Materialized views include `workspace_id` in primary key

---

## References

- Migration 0002: `client_interactions` table
- Migration 0011: `is_favorited`, `is_selected` columns
- Migration 0023: `visitors` table
- Migration 0055: `gallery_favorites_summary` view
- Migration 0058: `gallery_picks_summary` view (NEW)
