# Quickstart: Client Selection Sync to Photographer Gallery

**Feature Branch**: `015-client-selection-sync`
**Date**: 2025-12-30

---

## Prerequisites

- Docker installed and running
- Node.js 18+ installed
- Python 3.11+ installed
- Git configured
- Existing test gallery with client activity (favorites/picks)

---

## Development Setup

### 1. Clone and Checkout

```bash
cd /Users/v13478/Desktop/RawDrive
git checkout 015-client-selection-sync
```

### 2. Start Infrastructure

```bash
npm run docker:dev:up
```

This starts PostgreSQL (with pgvector) and Redis.

### 3. Start Backend

```bash
cd backend
npm install
npm run db:migrate
npm run dev:backend
```

Backend runs on http://localhost:3001

### 4. Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:3000

---

## Key Files to Modify

### Backend (Migration + API)

| File | Purpose |
|------|---------|
| `backend/migrations/versions/0058_client_activity_views.py` | NEW: Materialized view for picks |
| `backend/src/app/services/gallery_service.py` | MODIFY: Extend assets query |
| `backend/src/app/services/client_activity_service.py` | NEW: Activity aggregation |
| `backend/src/app/api/v1/galleries.py` | MODIFY: Add sort parameter |

### Frontend (Components + Types)

| File | Purpose |
|------|---------|
| `frontend/src/types/types.ts` | MODIFY: Add activity fields to types |
| `frontend/src/components/features/gallery/ClientActivityBadge.tsx` | NEW: Activity count badges |
| `frontend/src/components/features/gallery/PhotoCard.tsx` | MODIFY: Add activity badges |
| `frontend/src/components/features/gallery/GalleryStats.tsx` | MODIFY: Add picks stat |
| `frontend/src/components/features/gallery/GalleryToolbar.tsx` | MODIFY: Add sort options |
| `frontend/src/pages/workspace/GalleryDetailPage.tsx` | MODIFY: Wire everything |

---

## Testing the Feature

### 1. Create Test Data

If you don't have a gallery with client activity, create one:

1. Log in as photographer
2. Create a new gallery with photos
3. Publish gallery and generate Magic Link
4. Open Magic Link in incognito browser
5. Register as visitor and favorite/pick several photos
6. Repeat with different visitors (different email addresses)

### 2. Verify Database Data

```sql
-- Check client_interactions table has data
SELECT type, COUNT(*)
FROM client_interactions
WHERE gallery_id = 'YOUR_GALLERY_ID'
GROUP BY type;

-- Should see rows for 'favorite' and 'select' types
```

### 3. Verify Materialized View

```sql
-- After running migration 0058
SELECT * FROM gallery_picks_summary
WHERE gallery_id = 'YOUR_GALLERY_ID';

-- Should see rows with unique_pick_count > 0
```

### 4. Test API Response

```bash
# Get assets with activity counts
curl -X GET "http://localhost:3001/v1/workspaces/{workspace_id}/galleries/{gallery_id}/assets" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"

# Check response includes client_favorites_count and client_picks_count per asset
```

### 5. Test Sorting

```bash
# Sort by most favorited
curl -X GET "http://localhost:3001/v1/workspaces/{workspace_id}/galleries/{gallery_id}/assets?sort_by=favorites" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Sort by most picked
curl -X GET "http://localhost:3001/v1/workspaces/{workspace_id}/galleries/{gallery_id}/assets?sort_by=picks" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Manual Test Scenarios

### Scenario 1: Activity Badges Display

1. Open photographer dashboard
2. Navigate to a gallery with client activity
3. **Verify**: Photo thumbnails show heart + count badge
4. **Verify**: Photo thumbnails show checkmark + count badge
5. **Verify**: Badges only appear on photos with counts > 0

### Scenario 2: Gallery Stats Show Picks

1. Navigate to gallery detail page
2. Look at stats bar (below gallery header)
3. **Verify**: Shows "X Photos" count
4. **Verify**: Shows "X Favorites" count with heart icon
5. **Verify**: Shows "X Picks" count with checkmark icon

### Scenario 3: Sort by Popularity

1. Open gallery detail page
2. Click sort dropdown in toolbar
3. Select "Most Favorited"
4. **Verify**: Photos reorder with most favorited first
5. Select "Most Picked"
6. **Verify**: Photos reorder with most picked first

### Scenario 4: Real-Time Update (Future)

1. Open photographer view in browser A
2. Open client view (Magic Link) in browser B
3. Client favorites a photo in browser B
4. **Verify**: Photographer view updates count (after refresh for MVP)

---

## Debug Commands

### Check Backend Logs

```bash
cd backend
npm run dev:backend 2>&1 | grep -E "(activity|favorites|picks)"
```

### Check Materialized View Status

```sql
-- Check if view needs refresh
SELECT relname, last_refresh
FROM pg_stat_user_tables
WHERE relname LIKE '%summary';

-- Manual refresh
REFRESH MATERIALIZED VIEW CONCURRENTLY gallery_picks_summary;
REFRESH MATERIALIZED VIEW CONCURRENTLY gallery_favorites_summary;
```

### Verify Redis Cache

```bash
redis-cli KEYS "gallery:*:activity*"
redis-cli GET "gallery:YOUR_GALLERY_ID:activity_summary"
```

---

## Verification Checklist

After implementing, verify:

- [ ] Migration 0058 runs without errors
- [ ] `gallery_picks_summary` materialized view has data
- [ ] API returns `client_favorites_count` per asset
- [ ] API returns `client_picks_count` per asset
- [ ] API supports `sort_by=favorites` parameter
- [ ] API supports `sort_by=picks` parameter
- [ ] Frontend shows activity badges on PhotoCard
- [ ] GalleryStats shows client picks count
- [ ] Sort dropdown has "Most Favorited" option
- [ ] Sort dropdown has "Most Picked" option
- [ ] Sorting actually reorders photos correctly

---

## Commit Guidelines

Use conventional commits:

```bash
# Database migration
git commit -m "feat(db): add gallery_picks_summary materialized view"

# Backend API changes
git commit -m "feat(api): extend gallery assets with client activity counts"

# Frontend components
git commit -m "feat(ui): add client activity badges to photo thumbnails"

# Full feature
git commit -m "feat(gallery): add client activity sync to photographer view"
```

---

## Troubleshooting

### Materialized View Empty

```sql
-- Check source data exists
SELECT COUNT(*) FROM client_interactions WHERE type IN ('favorite', 'select');

-- If empty, need to create test data via Magic Link
```

### API Returns 0 for All Counts

1. Check materialized view has data
2. Check JOIN is correct in query
3. Check workspace_id filter matches

### Badges Not Showing

1. Check browser console for errors
2. Check asset object has `client_favorites_count` field
3. Check conditional rendering logic

### Sort Not Working

1. Check API parameter is being passed
2. Check backend logs for query errors
3. Verify ORDER BY clause in SQL
