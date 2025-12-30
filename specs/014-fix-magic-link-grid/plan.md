# Implementation Plan: Fix Magic Link Photo Grid

**Branch**: `014-fix-magic-link-grid` | **Date**: 2025-12-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-fix-magic-link-grid/spec.md`

---

## Summary

Fix 6 bugs affecting the Magic Link public gallery view: black screen in lightbox, favorites/picks not persisting (backend SQL bug), missing share button handler, non-functional download, invisible client pick badges, and delete button visibility. Primary fix is backend SQL at line 2035 which hardcodes `favorites_count` to 0.

---

## Technical Context

**Language/Version**: Python 3.11+ (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 18.3, SQLAlchemy 2.0+, asyncpg 0.29+
**Storage**: PostgreSQL 16 (existing tables: `visitor_favorites`, `visitor_selections`)
**Testing**: Vitest (Frontend), pytest (Backend)
**Target Platform**: Web (desktop + mobile browsers)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: < 250ms for asset list API, < 500ms lightbox image load
**Constraints**: Must support existing Magic Link tokens, no breaking API changes
**Scale/Scope**: Bug fix affecting all Magic Link galleries

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Gate | Status | Notes |
|------|--------|-------|
| Max 3 projects | PASS | Changes to 2 projects (frontend, backend) |
| No new patterns | PASS | Using existing error handling patterns |
| Breaking changes justified | PASS | No breaking changes - bug fixes only |
| Security reviewed | PASS | No new attack surfaces |

---

## Project Structure

### Documentation (this feature)

```text
specs/014-fix-magic-link-grid/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Bug investigation findings
├── data-model.md        # Entity documentation
├── quickstart.md        # Development setup guide
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Implementation tasks (to be generated)
```

### Source Code (repository root)

```text
backend/
├── src/app/
│   ├── services/
│   │   └── gallery_service.py        # FIX: Line 2035 favorites_count bug
│   └── api/v1/
│       └── public_galleries.py       # Reference: API endpoints
└── tests/
    └── integration/
        └── test_public_gallery.py    # ADD: Tests for favorites/picks

frontend/
├── src/
│   ├── pages/public/
│   │   └── PublicGalleryPage.tsx     # FIX: Lightbox + share prop
│   ├── components/features/gallery/
│   │   ├── PhotoCard.tsx             # FIX: Add Client Pick badge
│   │   ├── HoverOverlay.tsx          # Reference: Action buttons
│   │   ├── PhotoGrid.tsx             # Reference: Grid layout
│   │   └── GalleryCanvas.tsx         # Reference: Props flow
│   └── services/
│       └── galleryService.ts         # Reference: API calls
└── tests/
    └── components/
        └── PublicGalleryPage.test.tsx # ADD: Tests for fixes
```

**Structure Decision**: Web application with existing frontend/backend split. Bug fixes target specific files; no new files needed except tests.

---

## Implementation Phases

### Phase 1: Backend Fix (P1 - Critical)

**Goal**: Fix SQL query to return correct `favorites_count` for visitor.

**File**: `backend/src/app/services/gallery_service.py`

**Current Bug (Line ~2035)**:
```python
0 AS favorites_count,
```

**Fix**: Replace with subquery that checks visitor_favorites table:
```python
COALESCE(
    (SELECT 1 FROM visitor_favorites vf
     WHERE vf.asset_id = ga.asset_id
     AND vf.visitor_id = :visitor_id),
    0
) AS favorites_count,
```

**Verification**:
- API returns `favorites_count: 1` for favorited photos
- API returns `is_selected: true` for picked photos
- Selections persist across page refresh

---

### Phase 2: Lightbox Fix (P1 - Critical)

**Goal**: Add error handling and loading states to lightbox image.

**File**: `frontend/src/pages/public/PublicGalleryPage.tsx` (lines 769-983)

**Changes**:
1. Add `onError` handler to lightbox image
2. Add loading indicator while `useSignedUrl` fetches URL
3. Add retry button on error
4. Handle `urlError` from hook

**Pattern**: Follow existing error handling in PhotoCard component.

---

### Phase 3: Share Button Fix (P2)

**Goal**: Wire `onAssetShare` prop to GalleryCanvas.

**File**: `frontend/src/pages/public/PublicGalleryPage.tsx` (line ~1314)

**Change**:
```typescript
<GalleryCanvas
  // ... existing props
  onAssetShare={handleAssetShare}  // ADD THIS
/>
```

**Verification**: Share button appears and opens share menu.

---

### Phase 4: Client Pick Badge (P2)

**Goal**: Add visible "Client Pick" badge to picked photo thumbnails.

**File**: `frontend/src/components/features/gallery/PhotoCard.tsx`

**Location**: Near status badges (lines ~288-334)

**Add**:
```tsx
{/* Client Pick Badge */}
{asset.is_selected && (
  <div
    className="px-2 py-1 rounded-full bg-success/90 backdrop-blur-sm flex items-center gap-1"
    aria-label="Client Pick"
    title="Client Pick"
  >
    <Bookmark size={12} className="text-white fill-white" />
    <span className="text-[10px] font-semibold text-white uppercase tracking-wide">Pick</span>
  </div>
)}
```

---

### Phase 5: Download Verification (P2)

**Goal**: Debug and fix download flow if broken.

**Investigation**:
1. Verify `handleAssetDownload` is called on button click
2. Check signed URL generation for download
3. Verify blob download mechanism

**Files**:
- `frontend/src/pages/public/PublicGalleryPage.tsx` (handleAssetDownload)
- `frontend/src/services/galleryService.ts` (download API call)

---

### Phase 6: Delete Button Verification (P3)

**Goal**: Confirm delete button doesn't appear in public view.

**Investigation**:
- Check if `onAssetDelete` is passed anywhere
- Verify conditional rendering works
- May be non-issue (user misreporting)

---

## Complexity Tracking

> No Constitution violations. Bug fix feature with minimal complexity.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Backend SQL change affects performance | Low | Medium | Add index on visitor_favorites(visitor_id, asset_id) if needed |
| Lightbox error handling breaks existing flow | Low | High | Test thoroughly with various URL states |
| Share button requires Web Share API support | Medium | Low | Already has fallback to copy-link-only |

---

## Dependencies

- Existing `visitor_favorites` and `visitor_selections` tables (schema exists)
- `useSignedUrl` hook (already in codebase)
- `handleAssetShare` function (already implemented, just not wired)

---

## Testing Strategy

1. **Unit Tests**: Backend SQL query returns correct values
2. **Integration Tests**: Full favorite/pick/refresh cycle
3. **E2E Tests**: Complete Magic Link visitor flow
4. **Manual Testing**: All 6 bug scenarios from quickstart.md

---

## Estimated Effort

| Phase | Complexity | Files Changed |
|-------|------------|---------------|
| Phase 1: Backend SQL Fix | Low | 1 |
| Phase 2: Lightbox Error Handling | Medium | 1 |
| Phase 3: Share Button Wiring | Low | 1 |
| Phase 4: Client Pick Badge | Low | 1 |
| Phase 5: Download Verification | Low | 0-2 |
| Phase 6: Delete Button Verification | Low | 0-1 |

**Total**: 6 phases, 4-7 files, primarily bug fixes with no new architecture.
