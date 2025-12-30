# Implementation Plan: Client Selection Sync to Photographer Gallery

**Branch**: `015-client-selection-sync` | **Date**: 2025-12-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/015-client-selection-sync/spec.md`

---

## Summary

Implement a client activity dashboard that surfaces aggregated favorites and picks data to photographers in their gallery view. Photographers will see real-time indicators showing which photos are most popular with clients, enabling data-driven decisions for delivery workflows.

---

## Technical Context

**Language/Version**: Python 3.11+ (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 18.3, SQLAlchemy 2.0+, asyncpg 0.29+
**Storage**: PostgreSQL 16 (existing tables + new materialized view)
**Testing**: Vitest (Frontend), pytest (Backend)
**Target Platform**: Web (desktop + mobile browsers)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: < 100ms aggregation query, < 250ms assets list with activity data
**Constraints**: Must not break existing public gallery functionality
**Scale/Scope**: Enhancement affecting all galleries with client access

---

## Constitution Check

*GATE: Must pass before implementation.*

| Gate | Status | Notes |
|------|--------|-------|
| Max 3 projects | PASS | Changes to 2 projects (frontend, backend) |
| No new patterns | PASS | Extends existing materialized view pattern |
| Breaking changes justified | PASS | No breaking changes - additive only |
| Security reviewed | PASS | Workspace isolation maintained |

---

## Project Structure

### Documentation (this feature)

```text
specs/015-client-selection-sync/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Technical research findings
├── data-model.md        # Entity documentation
├── quickstart.md        # Development setup guide
└── tasks.md             # Implementation tasks
```

### Source Code Changes

```text
backend/
├── migrations/versions/
│   └── 0058_client_activity_views.py       # NEW: Materialized view for picks
├── src/app/
│   ├── api/v1/
│   │   └── galleries.py                    # MODIFY: Add activity endpoint
│   ├── services/
│   │   ├── gallery_service.py              # MODIFY: Extend assets query
│   │   └── client_activity_service.py      # NEW: Activity aggregation
│   └── repositories/
│       └── client_activity_repository.py   # NEW: Activity queries

frontend/
├── src/
│   ├── components/features/gallery/
│   │   ├── ClientActivityBadge.tsx         # NEW: Activity count badges
│   │   ├── ClientActivityPopover.tsx       # NEW: Client details popover
│   │   ├── PhotoCard.tsx                   # MODIFY: Add activity badges
│   │   ├── GalleryStats.tsx                # MODIFY: Add picks/visitors stats
│   │   └── GalleryToolbar.tsx              # MODIFY: Add sort options
│   ├── pages/workspace/
│   │   └── GalleryDetailPage.tsx           # MODIFY: Handle activity data
│   ├── services/
│   │   └── galleryService.ts               # MODIFY: Add sort params
│   └── types/
│       └── types.ts                        # MODIFY: Extend asset types
```

---

## Implementation Phases

### Phase 1: Database Infrastructure (Backend)

**Goal**: Create materialized view for picks aggregation and add database indexes.

**Migration File**: `0058_client_activity_views.py`

```python
# Create picks summary materialized view (like favorites_summary)
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

**Verification**: Run migration, verify view data.

---

### Phase 2: Backend API Enhancement (Backend)

**Goal**: Extend assets list response with aggregated activity counts.

**File**: `backend/src/app/services/gallery_service.py`

**Changes to `get_gallery_assets()` query (~line 2000)**:

1. JOIN with `gallery_favorites_summary` and `gallery_picks_summary`
2. Return `client_favorites_count` and `client_picks_count` per asset
3. Add sort parameters: `sort_by=favorites|picks`

```python
# Extended SELECT clause
COALESCE(gfs.unique_favorite_count, 0) as client_favorites_count,
COALESCE(gps.unique_pick_count, 0) as client_picks_count,
```

**New Endpoint** (optional, for detailed breakdown):
```
GET /v1/workspaces/{workspace_id}/galleries/{gallery_id}/client-activity/summary
```

---

### Phase 3: Frontend Type Extensions (Frontend)

**Goal**: Update TypeScript types to include activity data.

**File**: `frontend/src/types/types.ts`

```typescript
export interface GalleryAssetItem {
  // ... existing fields
  client_favorites_count: number;  // NEW
  client_picks_count: number;      // NEW
}

export interface GalleryActivitySummary {
  total_unique_visitors: number;
  total_favorites: number;
  total_picks: number;
}
```

---

### Phase 4: Activity Badges Component (Frontend)

**Goal**: Create reusable badge component for activity counts.

**File**: `frontend/src/components/features/gallery/ClientActivityBadge.tsx`

```typescript
interface ClientActivityBadgeProps {
  favoritesCount: number;
  picksCount: number;
  onClick?: () => void;
  size?: 'sm' | 'md';
}

export const ClientActivityBadge: React.FC<ClientActivityBadgeProps> = ({
  favoritesCount,
  picksCount,
  onClick,
  size = 'sm'
}) => {
  // Render heart + count, checkmark + count
  // Only show if count > 0
};
```

---

### Phase 5: PhotoCard Integration (Frontend)

**Goal**: Display activity badges on photo thumbnails.

**File**: `frontend/src/components/features/gallery/PhotoCard.tsx`

**Changes**:
1. Import `ClientActivityBadge`
2. Add badges to top-right corner (below existing badges)
3. Position: absolute, stacked vertically with cover/private badges

```tsx
{/* Client Activity Badges */}
{(asset.client_favorites_count > 0 || asset.client_picks_count > 0) && (
  <div className="absolute top-2 right-2 flex flex-col gap-1">
    <ClientActivityBadge
      favoritesCount={asset.client_favorites_count}
      picksCount={asset.client_picks_count}
    />
  </div>
)}
```

---

### Phase 6: Gallery Stats Enhancement (Frontend)

**Goal**: Show aggregated activity in gallery stats bar.

**File**: `frontend/src/components/features/gallery/GalleryStats.tsx`

**Changes**:
1. Add `clientPicksCount` prop
2. Add `uniqueVisitorsCount` prop (future)
3. Render new stat badges

```tsx
{/* Client Picks Badge */}
<div className="flex items-center gap-1.5">
  <CheckCircle2 size={14} className="text-success" />
  <span className="text-sm font-medium">{clientPicksCount}</span>
  <span className="text-xs text-text-tertiary">Picks</span>
</div>
```

---

### Phase 7: Sort Options (Frontend)

**Goal**: Add sorting by popularity.

**File**: `frontend/src/components/features/gallery/GalleryToolbar.tsx`

**Changes**:
1. Add to sort dropdown: "Most Favorited", "Most Picked"
2. Pass sort parameter to API

```typescript
const sortOptions = [
  { value: 'position', label: 'Custom Order' },
  { value: 'created_desc', label: 'Newest First' },
  { value: 'created_asc', label: 'Oldest First' },
  { value: 'favorites', label: 'Most Favorited' },  // NEW
  { value: 'picks', label: 'Most Picked' },         // NEW
];
```

---

### Phase 8: GalleryDetailPage Integration (Frontend)

**Goal**: Wire everything together in the main page.

**File**: `frontend/src/pages/workspace/GalleryDetailPage.tsx`

**Changes**:
1. Compute `clientPicksCount` from assets
2. Pass to `GalleryStats`
3. Handle sort parameter changes
4. Update API calls with sort param

---

### Phase 9: Testing & Polish

**Goal**: Ensure quality and performance.

**Tasks**:
1. Run lint in frontend and backend
2. Run build to verify no TypeScript errors
3. Manual testing with test gallery
4. Performance verification (< 250ms response)

---

## Complexity Tracking

| Component | Complexity | Justification |
|-----------|------------|---------------|
| Materialized View | Low | Pattern exists (gallery_favorites_summary) |
| API Extension | Low | Adding fields to existing response |
| Frontend Badge | Low | Simple presentational component |
| Sort Options | Low | Dropdown extension |

**Total Complexity**: Low - Leverages existing patterns throughout.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Query performance | Low | Medium | Use materialized views, add indexes |
| Materialized view staleness | Medium | Low | Refresh every 5 min or on write |
| Frontend merge conflicts | Low | Low | Small, focused changes |

---

## Dependencies

| Dependency | Type | Status |
|------------|------|--------|
| gallery_favorites_summary view | Existing | Available (Migration 0055) |
| client_interactions table | Existing | Available (Migration 0002) |
| PhotoCard component | Existing | Available |
| GalleryStats component | Existing | Available |

---

## Out of Scope (Future Phases)

1. **Real-time WebSocket updates** - Can be added in Phase 2
2. **Client details popover** - Requires additional API
3. **Activity timeline tab** - Separate feature
4. **Notification system** - Separate feature
5. **Email digests** - Separate feature

---

## Estimated Effort

| Phase | Effort | Files Changed |
|-------|--------|---------------|
| Phase 1: Database | 1 hour | 1 migration |
| Phase 2: Backend API | 2 hours | 2-3 files |
| Phase 3: Frontend Types | 30 min | 1 file |
| Phase 4: Badge Component | 1 hour | 1 new file |
| Phase 5: PhotoCard | 30 min | 1 file |
| Phase 6: GalleryStats | 30 min | 1 file |
| Phase 7: Sort Options | 1 hour | 2 files |
| Phase 8: Page Integration | 1 hour | 1 file |
| Phase 9: Testing | 1 hour | N/A |

**Total**: ~8-10 hours

---

## Success Criteria

- [ ] Photographers see favorites count per photo
- [ ] Photographers see picks count per photo
- [ ] Gallery stats show total client picks
- [ ] Can sort by "Most Favorited" and "Most Picked"
- [ ] Performance: < 250ms asset list response
- [ ] No regressions in public gallery functionality
