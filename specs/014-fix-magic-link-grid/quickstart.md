# Quickstart: Fix Magic Link Photo Grid

**Feature Branch**: `014-fix-magic-link-grid`
**Date**: 2025-12-30

---

## Prerequisites

- Docker installed and running
- Node.js 18+ installed
- Python 3.11+ installed
- Git configured

---

## Development Setup

### 1. Clone and Checkout

```bash
cd /Users/v13478/Desktop/RawDrive
git checkout 014-fix-magic-link-grid
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

### Backend (P1 - Critical)

| File | Line | Issue |
|------|------|-------|
| `backend/src/app/services/gallery_service.py` | 2035 | `favorites_count` hardcoded to 0 |

### Frontend (P1-P2)

| File | Lines | Issue |
|------|-------|-------|
| `frontend/src/pages/public/PublicGalleryPage.tsx` | 769-983 | Lightbox lacks error handling |
| `frontend/src/pages/public/PublicGalleryPage.tsx` | ~1314 | Missing `onAssetShare` prop |
| `frontend/src/components/features/gallery/PhotoCard.tsx` | ~288-334 | Add "Client Pick" badge |

---

## Testing the Feature

### 1. Create a Test Gallery with Magic Link

1. Log in as photographer (use test users from `docs/TEST_USERS.md`)
2. Create a new gallery or use existing one
3. Add photos to the gallery
4. Generate a Magic Link with:
   - Download policy: "Original Allowed"
   - Visitor registration: "Required"

### 2. Access as Visitor

1. Open Magic Link in incognito browser
2. Register as visitor
3. Test each bug scenario:

#### Test Lightbox (Bug 1)
- Click any photo thumbnail
- Expected: Photo displays in full screen
- Current: Black/blank screen

#### Test Favorites/Picks (Bug 2)
- Mark 3 photos as favorites (heart icon)
- Mark 2 photos as picks (bookmark icon)
- Refresh the page
- Expected: All 5 selections persist
- Current: All selections lost

#### Test Client Pick Badge (Bug 3)
- Mark a photo as pick
- Expected: Visible "Client Pick" badge on thumbnail
- Current: Only shows on hover

#### Test Download (Bug 4)
- Click download button on a photo
- Expected: Photo downloads to device
- Current: Nothing happens

#### Test Share (Bug 5)
- Click share button on a photo
- Expected: Share menu appears
- Current: Nothing happens (button may not appear)

#### Test Delete Button (Bug 6)
- Hover over any photo
- Expected: No delete button visible
- Current: Delete button may be visible

---

## Debug Commands

### Check Backend Logs
```bash
cd backend
npm run dev:backend 2>&1 | grep -E "(favorites|selection|public)"
```

### Check Frontend Console
Open browser DevTools (F12) and watch for:
- Network requests to `/v1/public/galleries/*/assets/filtered`
- Check `favorites_count` in response (should be 1 for favorited items)

### Database Queries

```sql
-- Check visitor favorites
SELECT vf.*, ga.title
FROM visitor_favorites vf
JOIN gallery_assets ga ON vf.asset_id = ga.asset_id
WHERE vf.visitor_id = 'YOUR_VISITOR_ID';

-- Check visitor selections (picks)
SELECT vs.*, ga.title
FROM visitor_selections vs
JOIN gallery_assets ga ON vs.asset_id = ga.asset_id
WHERE vs.visitor_id = 'YOUR_VISITOR_ID';
```

---

## API Testing (curl)

### Get Public Gallery Assets
```bash
TOKEN="your-magic-link-token"
curl -X GET "http://localhost:3001/v1/public/galleries/$TOKEN/assets/filtered" \
  -H "Content-Type: application/json" \
  -H "X-Visitor-Id: your-visitor-id"
```

### Toggle Favorite
```bash
ASSET_ID="asset-uuid"
curl -X POST "http://localhost:3001/v1/public/galleries/$TOKEN/assets/$ASSET_ID/favorite" \
  -H "Content-Type: application/json" \
  -H "X-Visitor-Id: your-visitor-id"
```

### Toggle Selection (Pick)
```bash
ASSET_ID="asset-uuid"
curl -X POST "http://localhost:3001/v1/public/galleries/$TOKEN/assets/$ASSET_ID/selection" \
  -H "Content-Type: application/json" \
  -H "X-Visitor-Id: your-visitor-id"
```

---

## Fix Verification Checklist

After implementing fixes, verify:

- [ ] Backend returns correct `favorites_count` (1 for favorited, 0 for not)
- [ ] Backend returns correct `is_selected` (true for picked photos)
- [ ] Lightbox displays photos without black screen
- [ ] Lightbox shows loading indicator while fetching URL
- [ ] Lightbox shows error state on failure
- [ ] Share button appears and opens share menu
- [ ] Download button triggers file download
- [ ] "Client Pick" badge visible on picked photo thumbnails
- [ ] Delete button does NOT appear in public view
- [ ] Favorites/picks persist after page refresh
- [ ] Favorites/picks persist after tab navigation

---

## Running Tests

### Backend Tests
```bash
cd backend
npm test -- --grep "public gallery"
```

### Frontend Tests
```bash
cd frontend
npm test -- --grep "PublicGalleryPage"
```

---

## Commit Guidelines

Use conventional commits:
```bash
git commit -m "fix(backend): return correct favorites_count for visitor"
git commit -m "fix(frontend): add error handling to lightbox image loading"
git commit -m "fix(frontend): wire onAssetShare prop to GalleryCanvas"
git commit -m "feat(frontend): add Client Pick badge to PhotoCard"
```
