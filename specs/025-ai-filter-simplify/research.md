# Research: 025-ai-filter-simplify

**Date**: 2026-01-05
**Feature**: One-Click AI Analysis & Filtering

## 1. Existing Infrastructure Analysis

### Backend Endpoints (Reusable)

| Endpoint | Method | Purpose | Reuse Strategy |
|----------|--------|---------|----------------|
| `/workspaces/{workspace_id}/smart-tagging/galleries/{id}/analyze` | POST | Start quality analysis | **New workspace-scoped wrapper** of existing quality-analysis logic for "Analyze Gallery" button |
| `/workspaces/{workspace_id}/smart-tagging/galleries/{id}/analyze/progress` | GET | Get progress | **New workspace-scoped** progress endpoint |
| `/workspaces/{workspace_id}/smart-tagging/galleries/{id}/analyze/summary` | GET | Get analysis summary | **New workspace-scoped** summary endpoint |
| `/workspaces/{workspace_id}/smart-tagging/galleries/{id}/ai-filter` | GET | Filter by quality/blur/content | **New combined** filter endpoint with workspace isolation |
| `/workspaces/{workspace_id}/smart-tagging/galleries/{id}/curate` | POST | Smart curation | **Reuse/extend** for Smart Collections (ensure workspace-scoped) |
| `/workspaces/{workspace_id}/smart-tagging/presets` | GET | List presets | **New** for Smart Collection presets |

### Database Tables (Existing)

| Table | Purpose | Modification Needed |
|-------|---------|---------------------|
| `photo_quality_analysis` | Quality scores, blur detection | **None** - has all needed columns |
| `curation_sessions` | Analysis workflow state | **None** - tracks progress |
| `curation_presets` | Smart Collection presets | **Add** 3 new presets |
| `similarity_groups` | Photo grouping | **None** - exists |
| `similarity_group_members` | Group membership | **None** - exists |
| `asset_analysis` | Vision/face status | **None** - exists |
| `asset_analysis.ai_metadata` | Content tags (JSONB) | **None** - has event_type, activity, mood, lighting |

### Frontend Components (Existing)

| Component | Location | Modification |
|-----------|----------|--------------|
| `AIToolsHub` | `frontend/src/components/features/ai/` | **Replace** with simplified UI |
| `AnalyzeTab` | `frontend/src/components/features/ai/tabs/` | **Remove** (merge into unified) |
| `CurateTab` | `frontend/src/components/features/ai/tabs/` | **Remove** (merge into filters) |
| `CreateTab` | `frontend/src/components/features/ai/tabs/` | **Extract** to separate AI Create panel |
| `FilterBar` | `frontend/src/components/features/gallery/` | **Extend** with AI filter controls |
| `useGalleryAssets` | `frontend/src/hooks/` | **Extend** with quality filter params |

---

## 2. Technical Decisions

### Decision 1: Filter Implementation Strategy

**Decision**: Hybrid client-side + server-side filtering

**Rationale**:
- Galleries < 5,000 photos: Client-side filtering for instant responsiveness
- Galleries ≥ 5,000 photos: Server-side filtering to avoid memory issues
- Quality/blur data already loaded during analysis - no extra API calls needed

**Alternatives Considered**:
- Pure server-side: Too slow for interactive filtering (200-500ms latency per filter change)
- Pure client-side: Memory issues with large galleries

### Decision 2: Filter State Persistence

**Decision**: Session storage + URL query params

**Rationale**:
- URL query params enable shareable filter states
- Session storage preserves filters on page navigation within session
- No database persistence needed (filters are ephemeral UI state)

**Alternatives Considered**:
- LocalStorage: Persists too long, stale filters on return visits
- Database: Over-engineering for UI state

### Decision 3: Smart Collection Implementation

**Decision**: Reuse existing `/curate` endpoint with preset parameters

**Rationale**:
- `SmartCurationService` already implements quality + diversity + expression logic
- `curation_presets` table already has preset configurations
- Only need to add 3 new presets: Highlights, Portraits, Event Coverage

**Alternatives Considered**:
- New dedicated endpoint: Duplicate logic, maintenance burden

### Decision 4: Similarity Grouping Display

**Decision**: Client-side grouping with server-provided similarity data

**Rationale**:
- Similarity groups already computed by backend during curation
- Client can collapse/expand groups without server round-trips
- "Stack Similar" toggle is purely a display mode change

**Alternatives Considered**:
- Server-side grouping: Too slow for interactive toggle

### Decision 5: Sub-Gallery Creation

**Decision**: Use existing gallery duplication with asset subset

**Rationale**:
- RawDrive already has "duplicate gallery" functionality
- Modify to accept `asset_ids[]` parameter for subset creation
- Maintains workspace isolation and permission model

**Alternatives Considered**:
- New "collection" entity: Schema changes, permission complexity

---

## 3. New Components Required

### Frontend Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `AIAnalyzePanel` | Unified analysis + filter panel | `frontend/src/components/features/ai/` |
| `AIFilterControls` | Filter toggles/sliders | `frontend/src/components/features/ai/` |
| `QualityFilterSection` | Quality tier checkboxes | `frontend/src/components/features/ai/` |
| `BlurFilterSection` | Blur toggle controls | `frontend/src/components/features/ai/` |
| `ContentFilterSection` | Event/Activity/Mood filters | `frontend/src/components/features/ai/` |
| `SmartCollectionSelector` | Preset dropdown + adjust | `frontend/src/components/features/ai/` |
| `SimilarityGroupStack` | Stacked photo indicator | `frontend/src/components/features/gallery/` |
| `AnalysisProgress` | Progress bar with stages | `frontend/src/components/features/ai/` |
| `AnalysisSummary` | Results summary card | `frontend/src/components/features/ai/` |
| `AICreatePanel` | Story/Caption/Hashtag panel | `frontend/src/components/features/ai/` |

### Frontend Hooks

| Hook | Purpose |
|------|---------|
| `useAIFilters` | Manage filter state, apply to gallery |
| `useAnalysisProgress` | Poll analysis progress, handle completion |
| `useSimilarityGroups` | Fetch/manage photo grouping |

### Backend Endpoints (New/Modified)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/galleries/{id}/assets` | GET | **Modify**: Add `quality_min`, `blur_hide`, `content_tags` params |
| `/galleries/{id}/ai-filter` | GET | **New**: Combined AI filter with all options |
| `/galleries/{id}/create-from-filter` | POST | **New**: Create sub-gallery from filter results |

### Backend Services (New/Modified)

| Service | Purpose |
|---------|---------|
| `AIFilterService` | Combine quality + blur + content filtering |
| `GalleryService.create_from_assets()` | Create sub-gallery with asset subset |

---

## 4. Database Changes

### New Presets (Insert Only)

```sql
-- Add to curation_presets table
INSERT INTO curation_presets (preset_id, name, description, target_count_ratio, quality_threshold, ...) VALUES
  (uuid, 'Highlights', 'Top 10-15% highest quality with diversity', 0.12, 80.0, ...),
  (uuid, 'Portraits', 'Photos with faces and good expressions', NULL, 70.0, ...),
  (uuid, 'Event Coverage', 'Balanced selection across scenes', 0.25, 60.0, ...);
```

### No Schema Changes Required

All needed columns exist:
- `photo_quality_analysis`: overall_score, sharpness_score, exposure_score, composition_score, blur_detected, blur_severity, blur_type
- `asset_analysis.ai_metadata`: event_type, activity, mood, lighting
- `similarity_groups` + `similarity_group_members`: Full grouping support

---

## 5. API Contract Changes

### Modified: GET `/workspaces/{workspace_id}/galleries/{gallery_id}/assets`

**New Query Parameters**:
```
quality_min: integer (0-100) - Minimum overall quality score
quality_tier: string (excellent|good|fair|all) - Quality tier filter
blur_hide: boolean - Hide photos with moderate/severe blur
blur_show_bokeh: boolean - Show intentional bokeh even if blur_hide=true
content_event_type: string[] - Filter by event type tags
content_activity: string[] - Filter by activity tags
content_mood: string[] - Filter by mood tags
content_lighting: string[] - Filter by lighting tags
similarity_mode: string (none|stack|hide) - Similarity organization mode
```

### New: GET `/workspaces/{workspace_id}/smart-tagging/galleries/{gallery_id}/ai-filter`

**Purpose**: Get filtered asset IDs with all AI filter options (for large galleries)

**Query Parameters**: Same as above

**Response**:
```json
{
  "asset_ids": ["uuid1", "uuid2", ...],
  "total_count": 150,
  "filter_stats": {
    "excellent_count": 45,
    "good_count": 67,
    "fair_count": 38,
    "blurry_hidden": 12,
    "similarity_groups": 8
  },
  "applied_filters": { ... }
}
```

### New: POST `/workspaces/{workspace_id}/galleries/{gallery_id}/create-from-filter`

**Purpose**: Create sub-gallery from current filter results

**Request Body**:
```json
{
  "name": "Wedding Highlights",
  "asset_ids": ["uuid1", "uuid2", ...],
  "copy_settings": true
}
```

**Response**:
```json
{
  "gallery_id": "new-uuid",
  "name": "Wedding Highlights",
  "asset_count": 45,
  "created_at": "2026-01-05T12:00:00Z"
}
```

---

## 6. Performance Considerations

### Client-Side Filtering (< 5,000 photos)

- Load all quality data on initial fetch (~500 bytes per photo = 2.5MB for 5000)
- Filter in-memory with JavaScript
- Instant (<16ms) filter toggle response

### Server-Side Filtering (≥ 5,000 photos)

- Debounce filter changes (300ms)
- Use database indexes on quality scores
- Pagination with 100 items per page

### Similarity Grouping

- Pre-computed by backend during curation
- Client receives group membership data
- Client-side collapse/expand (no API calls)

---

## 7. Migration Path

### Phase 1: Backend (No Breaking Changes)
1. Add new query params to existing endpoints
2. Add new `/ai-filter` endpoint
3. Add new `/create-from-filter` endpoint
4. Insert new presets

### Phase 2: Frontend (Replace UI)
1. Create new components alongside existing
2. Add feature flag for gradual rollout
3. Replace AIToolsHub usage in GalleryDetailPage
4. Remove old tab components after validation

### Phase 3: Cleanup
1. Remove feature flag
2. Delete deprecated components
3. Update documentation
