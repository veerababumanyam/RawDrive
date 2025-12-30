# Research: Fix Magic Link Photo Grid

**Feature Branch**: `014-fix-magic-link-grid`
**Date**: 2025-12-30
**Status**: Complete

---

## Executive Summary

This research documents the root causes of 6 bugs affecting the Magic Link public gallery view. Investigation revealed both frontend prop-passing issues and a critical backend SQL bug that causes favorites/picks to not persist.

---

## Bug Analysis

### Bug 1: Lightbox Shows Black/Blank Screen (P1 - CRITICAL)

**Symptoms**: When clicking a photo thumbnail, the lightbox opens but displays a black screen instead of the photo.

**Investigation**:
- Location: [PublicGalleryPage.tsx:769-983](frontend/src/pages/public/PublicGalleryPage.tsx#L769-L983)
- The lightbox uses `useSignedUrl` hook to fetch preview URLs
- Current implementation lacks error handling for failed image loads

**Root Cause**: Multiple potential issues:
1. The lightbox doesn't handle `urlError` states from `useSignedUrl`
2. No fallback when signed URL generation fails
3. No loading indicator during URL fetch

**Evidence**:
```typescript
// Current lightbox image rendering (simplified)
<img src={previewUrl} alt={currentAsset?.filename} />
// No onError handler, no loading state for URL fetch
```

**Fix Required**: Add error handling, loading states, and retry logic to lightbox image rendering.

---

### Bug 2: Favorites & Picks Disappearing (P1 - CRITICAL)

**Symptoms**: Client marks photos as favorites or picks, but selections disappear on page refresh or tab navigation.

**Investigation**:
- Frontend: [PublicGalleryPage.tsx:190-211](frontend/src/pages/public/PublicGalleryPage.tsx#L190-L211)
- Backend: [gallery_service.py:1957-2066](backend/src/app/services/gallery_service.py#L1957-L2066)

**Root Cause - BACKEND BUG**:
At line 2035 in `gallery_service.py`, the SQL query **hardcodes** `favorites_count` to 0:

```python
# BUG: Line 2035
0 AS favorites_count,
```

This means even when a visitor has favorited photos, the API always returns `favorites_count: 0`, causing the frontend to incorrectly show all photos as unfavorited.

**Impact**:
- `localFavorites` Map in frontend is populated based on `favorites_count` from API
- Since API always returns 0, no photos appear favorited after refresh

**Frontend Flow**:
```typescript
// PublicGalleryPage.tsx:199-205
const initialFavorites = new Map<string, number>();
data.items.forEach((asset: PublicGalleryAsset) => {
  if (asset.favorites_count > 0) {  // Always 0 from API!
    initialFavorites.set(asset.asset_id, asset.favorites_count);
  }
});
```

**Fix Required**:
1. Backend: Replace `0 AS favorites_count` with actual visitor favorite status query
2. Ensure `is_selected` (picks) is also correctly returned for the visitor

---

### Bug 3: Client Pick Badge Not Visible (P2)

**Symptoms**: When a photo is marked as a "pick", the visual indicator is not prominently visible like favorites.

**Investigation**:
- Location: [HoverOverlay.tsx:113-131](frontend/src/components/features/gallery/HoverOverlay.tsx#L113-L131)
- The pick button (Bookmark icon) uses `is_selected` state
- Styling is similar to favorites but uses `bg-success` color

**Root Cause**:
1. The pick indicator only shows on hover or when active
2. No persistent "Client Pick" label badge on the thumbnail (unlike how some galleries show "Cover" badge)

**Evidence**:
```typescript
// Current implementation - button hidden unless hovered or selected
className={`
  ${asset.is_selected ? 'active always-visible bg-success text-white' : 'bg-black/40'}
  ${!asset.is_selected && !isHovered ? 'opacity-0' : 'opacity-100'}
`}
```

**Fix Required**: Add a visible "Client Pick" badge to thumbnails (similar to "Cover" badge) that persists without hover.

---

### Bug 4: Download Button Not Working (P2)

**Symptoms**: Clicking download button does nothing.

**Investigation**:
- Location: [PublicGalleryPage.tsx:488-539](frontend/src/pages/public/PublicGalleryPage.tsx#L488-L539)
- Download handler exists: `handleAssetDownload`
- Handler is passed to GalleryCanvas when `allowDownload` is true

**Root Cause**: Download functionality IS implemented. Need to verify:
1. `gallery.download_policy` is correctly set (not 'view_only')
2. Download URL generation is working
3. Browser download is being triggered correctly

**Evidence**:
```typescript
// PublicGalleryPage.tsx:1314
onAssetDownload={allowDownload ? handleAssetDownload : undefined}
```

**Fix Required**:
1. Debug actual download flow to identify specific failure point
2. Ensure signed download URL generation works
3. Verify download is triggered via proper mechanism (blob download or direct link)

---

### Bug 5: Share Button Not Working (P2)

**Symptoms**: Clicking share button does nothing or button doesn't appear.

**Investigation**:
- Location: [PublicGalleryPage.tsx:1288-1339](frontend/src/pages/public/PublicGalleryPage.tsx#L1288-L1339)
- Share handler exists: `handleAssetShare` (lines 541-577)
- **NOT PASSED** to GalleryCanvas component!

**Root Cause - FRONTEND BUG**:
The `onAssetShare` prop is NOT included in the GalleryCanvas props at line 1288-1339.

**Evidence**:
```typescript
// GalleryCanvas props in PublicGalleryPage.tsx - NO onAssetShare!
<GalleryCanvas
  // ... other props
  onAssetDownload={allowDownload ? handleAssetDownload : undefined}
  onAssetLock={undefined}  // Not applicable for public view
  // onAssetShare is MISSING!
/>
```

**Fix Required**: Add `onAssetShare={handleAssetShare}` to GalleryCanvas props.

---

### Bug 6: Delete Button Showing (P3)

**Symptoms**: Delete button appears in Magic Link view where clients should not be able to delete.

**Investigation**:
- Location: [HoverOverlay.tsx:216-228](frontend/src/components/features/gallery/HoverOverlay.tsx#L216-L228)
- Delete button only renders if `onDelete` prop is passed

**Root Cause Analysis**:
The HoverOverlay uses conditional rendering: `{onDelete && (...)}`. Since `onAssetDelete` is NOT passed from PublicGalleryPage to GalleryCanvas, the button should NOT render.

**Evidence**:
```typescript
// HoverOverlay.tsx:216-228
{onDelete && (
  <button className="photo-card-action-btn btn-delete" ...>
    <Trash2 size={20} />
  </button>
)}
```

**Verification Needed**:
- Check if there's a default callback being passed somewhere
- Verify the button actually appears (may be user misreporting)
- Check if Edit button is being mistaken for Delete button

**Fix Required**: Verify delete button is truly appearing; if so, trace where `onDelete` is being passed.

---

## Component Hierarchy Analysis

```
PublicGalleryPage
├── GalleryCanvas (receives action callbacks)
│   └── PhotoGrid (passes callbacks to children)
│       └── PhotoCard (renders photo with HoverOverlay)
│           └── HoverOverlay (renders action buttons)
└── Lightbox (modal for full image view)
```

### Props Flow for Actions:

| Action | PublicGalleryPage | GalleryCanvas | PhotoGrid | PhotoCard | HoverOverlay |
|--------|-------------------|---------------|-----------|-----------|--------------|
| Favorite | handleToggleFavorite | onAssetFavorite | onFavorite | onFavorite | onFavorite |
| Pick | handleToggleSelection | onCustomerSelectionToggle | onCustomerSelectionToggle | onCustomerSelectionToggle | onCustomerSelectionToggle |
| Download | handleAssetDownload | onAssetDownload | onDownload | onDownload | onDownload |
| Share | handleAssetShare | **MISSING** | onShare | onShare | onShare |
| Delete | NOT defined | NOT passed | onDelete | onDelete | onDelete |

---

## Database Schema Relevant Tables

### visitor_favorites
```sql
visitor_favorites (
  id UUID PRIMARY KEY,
  visitor_id UUID REFERENCES visitors(id),
  asset_id UUID REFERENCES assets(id),
  gallery_id UUID REFERENCES galleries(id),
  created_at TIMESTAMP
)
```

### visitor_selections (picks)
```sql
visitor_selections (
  id UUID PRIMARY KEY,
  visitor_id UUID REFERENCES visitors(id),
  asset_id UUID REFERENCES assets(id),
  gallery_id UUID REFERENCES galleries(id),
  created_at TIMESTAMP
)
```

---

## API Endpoints Involved

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/v1/public/galleries/{token}/assets/filtered` | GET | Fetch assets with favorites/picks status | **BUGGY** |
| `/v1/public/galleries/{token}/assets/{id}/favorite` | POST | Toggle favorite | Working |
| `/v1/public/galleries/{token}/assets/{id}/selection` | POST | Toggle pick | Working |
| `/v1/public/galleries/{token}/assets/{id}/download` | GET | Get download URL | Needs verification |
| `/v1/public/galleries/{token}/assets/{id}/preview` | GET | Get preview URL for lightbox | Needs verification |

---

## Recommended Fixes (Priority Order)

### P1 - Critical (Blocks Core Functionality)

1. **Fix Backend SQL Bug** (Bug 2)
   - File: `backend/src/app/services/gallery_service.py:2035`
   - Change: Replace `0 AS favorites_count` with actual subquery
   - Also verify `is_selected` returns correctly for visitor

2. **Fix Lightbox Black Screen** (Bug 1)
   - File: `frontend/src/pages/public/PublicGalleryPage.tsx`
   - Add: Error handling, loading states, retry logic to lightbox

### P2 - Important (Degrades User Experience)

3. **Wire Up Share Handler** (Bug 5)
   - File: `frontend/src/pages/public/PublicGalleryPage.tsx:~1314`
   - Add: `onAssetShare={handleAssetShare}` to GalleryCanvas

4. **Debug Download Flow** (Bug 4)
   - Verify download URL generation and blob download mechanism

5. **Add Client Pick Badge** (Bug 3)
   - File: `frontend/src/components/features/gallery/PhotoCard.tsx`
   - Add: Visible "Client Pick" badge similar to "Cover" badge

### P3 - Minor (Polish)

6. **Verify Delete Button** (Bug 6)
   - Confirm if delete button actually appears
   - If yes, trace prop source

---

## Testing Recommendations

1. **Manual Test Flow**:
   - Create Magic Link with download enabled
   - Access as visitor, mark favorites and picks
   - Refresh page, verify persistence
   - Test lightbox view
   - Test download and share

2. **Automated Tests Needed**:
   - Backend: Test `get_public_gallery_assets_with_filters` returns correct favorites_count
   - Frontend: Test GalleryCanvas receives all action callbacks
   - E2E: Test complete favorite/pick flow with persistence

---

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Where is favorites_count set to 0? | Line 2035 in gallery_service.py - hardcoded in SQL |
| Why doesn't share button work? | onAssetShare not passed to GalleryCanvas |
| Is delete button actually showing? | Needs verification - conditional render should hide it |

---

## Research Artifacts Referenced

- [spec.md](./spec.md) - Feature specification
- [PublicGalleryPage.tsx](../../../frontend/src/pages/public/PublicGalleryPage.tsx)
- [GalleryCanvas.tsx](../../../frontend/src/components/features/gallery/GalleryCanvas.tsx)
- [PhotoCard.tsx](../../../frontend/src/components/features/gallery/PhotoCard.tsx)
- [HoverOverlay.tsx](../../../frontend/src/components/features/gallery/HoverOverlay.tsx)
- [gallery_service.py](../../../backend/src/app/services/gallery_service.py)
