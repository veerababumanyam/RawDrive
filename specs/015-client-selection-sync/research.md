# Research: Client Selection Sync to Photographer Gallery

**Feature Branch**: `015-client-selection-sync`
**Date**: 2025-12-30
**Status**: Complete

---

## Executive Summary

Research into the existing RawDrive architecture reveals a robust foundation for client activity tracking that is currently underutilized in the photographer's view. The system already stores all necessary data - it just needs to surface it to photographers through enhanced UI and API responses.

---

## Existing Data Infrastructure

### 1. Core Tables

#### visitors (Migration 0023)
```sql
CREATE TABLE visitors (
    visitor_id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(50),
    UNIQUE(workspace_id, email)
);
```
**Index**: `idx_visitors_workspace`, `idx_visitors_email`

#### gallery_visitors (Migration 0023)
```sql
CREATE TABLE gallery_visitors (
    access_id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    gallery_id UUID NOT NULL,
    visitor_id UUID NOT NULL,
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    source VARCHAR(50) DEFAULT 'magic_link',
    metadata JSONB DEFAULT '{}'
);
```
**Purpose**: Audit log of gallery access events

#### client_interactions (Migration 0002)
```sql
CREATE TABLE client_interactions (
    interaction_id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    gallery_id UUID NOT NULL,
    asset_id UUID,
    type VARCHAR(50) CHECK (type IN ('view', 'favorite', 'select', 'comment', 'download')),
    actor JSONB NOT NULL,  -- { "visitor_id": "uuid" }
    payload JSONB,
    list_id UUID,  -- Added in 0055 for favorite lists
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
**Indexes**:
- `idx_client_interactions_gallery`
- `idx_client_interactions_asset`
- `idx_client_interactions_gallery_time`

**Key Finding**: This table is THE source of truth for all client activity. Every favorite and pick is logged here with visitor attribution.

#### gallery_assets (Migration 0002, 0011)
```sql
-- Key columns for selections
is_favorited BOOLEAN DEFAULT FALSE,  -- Denormalized: ANY visitor favorited
is_selected BOOLEAN DEFAULT FALSE,   -- Denormalized: ANY visitor picked
```
**Current State**: Binary flags only - no counts, no visitor attribution

### 2. Existing Materialized View

#### gallery_favorites_summary (Migration 0055)
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
**Key Finding**: This view already aggregates favorites count! But it's not exposed to the frontend. Also missing: picks aggregation.

### 3. Favorite Lists Infrastructure (Migration 0055)

| Table | Purpose |
|-------|---------|
| `favorite_lists` | Named collections per visitor per gallery |
| `favorite_shares` | Shareable links for lists |
| `favorite_downloads` | ZIP download job tracking |

**Key Finding**: This was added for Feature 012 (Client Favorites). It enables named lists and sharing but doesn't expose aggregation to photographers.

---

## Current Frontend Architecture

### Gallery Detail Page Structure

```
GalleryDetailPage.tsx
├── GalleryHeader (cover, title, client name)
├── GalleryStats (items count, favorites count, AI tagged %)
├── GalleryActionBar (view as client, share, settings, upload)
├── GalleryToolbar (view mode, filters, search)
└── GalleryCanvas/PhotoGrid
    └── PhotoCard (with HoverOverlay)
```

### Current Stats Display (GalleryStats.tsx)

```typescript
<div className="flex items-center gap-1.5">
  <Camera size={14} className="text-text-tertiary" />
  <span className="text-sm font-medium">{itemsCount}</span>
</div>
<div className="flex items-center gap-1.5">
  <Heart size={14} className="text-pink-500" />
  <span className="text-sm font-medium">{favoritesCount}</span>
</div>
```

**Key Finding**: `favoritesCount` is already computed from assets BUT it's the `is_favorited` boolean count, not aggregated visitor count.

### PhotoCard Current Implementation

```typescript
interface GalleryAssetItem {
  is_favorited: boolean;     // Boolean only
  is_selected: boolean;      // Boolean only
  favorites_count: number;   // Exists but = 0 or 1 (from is_favorited)
  // Missing: client_favorites_count, client_picks_count
}
```

**Key Finding**: The type already has `favorites_count` but it's not populated with aggregated data from the backend.

---

## API Endpoints Analysis

### Current Assets List Endpoint

```
GET /v1/workspaces/{workspace_id}/galleries/{gallery_id}/assets
```

**Current Response Fields per Asset**:
- `is_favorited`: boolean
- `is_selected`: boolean
- `favorites_count`: number (but always 0 or 1)

**SQL Query Location**: `gallery_service.py:get_gallery_assets()`

### Current Favorites Summary

The materialized view exists but NO API endpoint exposes it to the frontend.

### WebSocket Events

```typescript
// Existing events (from useSocket hook)
socket.on('asset:created', ...)
socket.on('asset:processed', ...)
socket.on('gallery:updated', ...)
// Missing: gallery:client_activity
```

---

## Gap Analysis

| Requirement | Current State | Gap |
|-------------|---------------|-----|
| Aggregated favorites count per asset | Data in `gallery_favorites_summary` | Not exposed via API |
| Aggregated picks count per asset | Data in `client_interactions` | No aggregation exists |
| Visitor names for selections | Data in `visitors` table | Not joined in any query |
| Real-time activity updates | WebSocket infra exists | No client activity events |
| Sort by popularity | N/A | No backend sorting support |
| Activity timeline | `client_interactions` has data | No dedicated endpoint |

---

## Recommended Implementation Approach

### Option A: Extend Existing Assets Endpoint (Recommended)

**Pros**:
- Minimal API changes
- Single request for all data
- Leverages existing caching

**Cons**:
- Slightly larger response size
- Requires materialized view join

**Implementation**:
```sql
-- Extend gallery_service.get_gallery_assets() query
SELECT
  ga.*,
  COALESCE(gfs.unique_favorite_count, 0) as client_favorites_count,
  COALESCE(gps.unique_pick_count, 0) as client_picks_count
FROM gallery_assets ga
LEFT JOIN gallery_favorites_summary gfs ON ga.asset_id = gfs.asset_id
LEFT JOIN gallery_picks_summary gps ON ga.asset_id = gps.asset_id
WHERE ga.gallery_id = :gallery_id
```

### Option B: Separate Activity Endpoint

**Pros**:
- Clean separation of concerns
- Can be cached independently
- Easier to add features later

**Cons**:
- Additional API call
- Client must merge data

**Implementation**:
```
GET /v1/workspaces/{workspace_id}/galleries/{gallery_id}/client-activity/summary
```

### Recommendation: Hybrid Approach

1. **Phase 1**: Add `client_favorites_count` and `client_picks_count` to existing assets response
2. **Phase 2**: Create separate `/client-activity/summary` endpoint for detailed breakdown
3. **Phase 3**: Add WebSocket events for real-time updates

---

## Performance Considerations

### Current Query Performance

The existing `get_gallery_assets()` query in `gallery_service.py` (lines 1957-2066) is already complex with multiple JOINs. Adding more JOINs could impact performance.

**Mitigation**:
1. Use existing materialized view (`gallery_favorites_summary`)
2. Create new materialized view for picks
3. Refresh views on write (trigger) or every 5 minutes
4. Cache summary in Redis for 60 seconds

### Estimated Query Costs

| Query | Current | With Aggregation |
|-------|---------|------------------|
| List 50 assets | ~15ms | ~25ms (with MV join) |
| List 200 assets | ~45ms | ~70ms (with MV join) |

**Note**: Acceptable for UX. Can optimize with Redis caching if needed.

---

## Database Indexes to Add

```sql
-- For picks aggregation (similar to favorites)
CREATE INDEX idx_ci_gallery_asset_type ON client_interactions(gallery_id, asset_id, type);

-- For timeline queries
CREATE INDEX idx_ci_gallery_created ON client_interactions(gallery_id, created_at DESC);
```

---

## Frontend Components to Modify

| Component | Change | Effort |
|-----------|--------|--------|
| `PhotoCard.tsx` | Add `ClientActivityBadge` | Low |
| `GalleryStats.tsx` | Add picks/visitors badges | Low |
| `GalleryToolbar.tsx` | Add sort options | Low |
| `GalleryDetailPage.tsx` | Handle new sort params | Low |
| `galleryService.ts` | Add sort params to API call | Low |

---

## WebSocket Integration Points

### Event Emission (Backend)

In `gallery_service.py` when `toggle_favorite()` or `toggle_selection()` is called:

```python
await event_bus.emit('gallery:client_activity', {
    'gallery_id': gallery_id,
    'asset_id': asset_id,
    'type': 'favorite',  # or 'pick'
    'action': 'added',
    'visitor_name': visitor.first_name or visitor.email,
    'new_count': new_count
})
```

### Event Handling (Frontend)

In `GalleryDetailPage.tsx`:

```typescript
useEffect(() => {
  socket?.on('gallery:client_activity', (data) => {
    if (data.gallery_id === galleryId) {
      // Optimistic update or trigger refetch
      updateAssetActivityCount(data.asset_id, data.type, data.new_count);
    }
  });
}, [socket, galleryId]);
```

---

## Existing Code References

### Backend

| File | Lines | Relevance |
|------|-------|-----------|
| `gallery_service.py` | 1957-2066 | Main assets query |
| `gallery_service.py` | 100-150 | `toggle_favorite()` |
| `gallery_service.py` | 150-200 | `toggle_selection()` |
| `favorites_repository.py` | All | Favorites business logic |
| Migration `0055` | All | Materialized view definition |

### Frontend

| File | Lines | Relevance |
|------|-------|-----------|
| `GalleryDetailPage.tsx` | All | Main orchestrator |
| `GalleryStats.tsx` | All | Stats display |
| `PhotoCard.tsx` | All | Individual photo card |
| `HoverOverlay.tsx` | All | Action buttons |
| `galleryService.ts` | All | API client |

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Materialized view staleness | Medium | Medium | Refresh on write or every 1 min |
| API response size increase | Low | Low | ~100 bytes per asset, negligible |
| Real-time sync conflicts | Low | Low | Optimistic UI with reconciliation |
| Privacy concerns (visitor names) | Medium | Medium | Only show to gallery owner |

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Where is favorites data aggregated? | `gallery_favorites_summary` materialized view |
| Where is picks data? | `client_interactions` table, type='select' |
| Is there a visitor name? | `visitors.first_name`, `visitors.email` |
| How are WebSocket events emitted? | Via `event_bus` in services |

---

## Next Steps

1. Create `plan.md` with implementation phases
2. Create `tasks.md` with detailed task breakdown
3. Create materialized view for picks aggregation
4. Extend assets API response
5. Update frontend components
6. Add WebSocket events (Phase 2)

---

## References

- Migration 0002: Initial galleries schema
- Migration 0011: Add favorites/selections flags
- Migration 0023: Visitors schema
- Migration 0055: Client favorites infrastructure
- Feature 012: Client Favorites
- Feature 014: Fix Magic Link Grid
