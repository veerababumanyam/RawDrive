# Quickstart: Fix Library Photo Operations

**Feature**: 011-fix-library-photo-operations
**Date**: 2025-12-28

## Quick Summary

This is a bug fix for two issues:
1. Photos move unintentionally when filtering by person
2. Move to folder and add to gallery operations appear broken

**Root Cause**: Selection state persists across filter changes + missing error handling.

---

## Setup

1. Ensure you're on the feature branch:
   ```bash
   git checkout 011-fix-library-photo-operations
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start development servers:
   ```bash
   npm run docker:dev:up  # Start PostgreSQL and Redis
   npm run dev:all        # Start frontend and backend
   ```

---

## Debugging Steps

### Bug #1: Unintentional Moves

#### Reproduce the Bug

1. Go to Library page (`/workspace/libraries`)
2. Select 2-3 photos at root level
3. Open browser DevTools console
4. Type: `console.log('Selected before filter:', selectedIds)` (won't work directly, but use React DevTools)
5. Click on a person in the People panel
6. Notice: The selection persists even though you're now viewing different photos
7. If you now click "Move to Folder", the ORIGINAL photos move, not the filtered ones

#### Debug with React DevTools

1. Install React DevTools browser extension
2. Open Components tab
3. Find `LibraryPage` component
4. Inspect `selectedIds` state
5. Change filters and observe `selectedIds` doesn't clear

#### Fix Verification

After implementing the fix:
1. Repeat steps 1-5 above
2. Verify `selectedIds` is empty after filter changes
3. User must re-select photos in the new filtered view

### Bug #2: Broken Move Operations

#### Reproduce the Bug

1. Go to Library page
2. Select 1-2 photos
3. Click "Move to Folder"
4. Select a folder and click "Move"
5. Notice: No feedback - appears nothing happened

#### Debug API Calls

1. Open Network tab in DevTools
2. Filter by "move" or "assets"
3. Click "Move to Folder" and submit
4. Look for `POST /api/v1/workspaces/{id}/library/assets/move`
5. Check:
   - Request payload (correct asset_ids and folder_id?)
   - Response status (200, 400, 403, 404?)
   - Response body (moved: true/false, count: N?)

#### Debug Console Errors

After implementing fix:
1. Open Console tab
2. Repeat move operation
3. Look for logged errors or success messages

---

## File Locations

### Primary Fix Files

| File | Purpose | Lines to Modify |
|------|---------|-----------------|
| `frontend/src/pages/workspace/LibraryPage.tsx` | Main library page | ~95 (add useEffect), ~319-326 (add try/catch), ~616-622 (add try/catch) |

### Reference Files (No Changes Needed)

| File | Purpose |
|------|---------|
| `frontend/src/services/libraryService.ts` | API calls - already correct |
| `frontend/src/services/galleryService.ts` | API calls - already correct |
| `backend/src/app/api/v1/library.py` | API endpoint - already correct |
| `backend/src/app/services/library_service.py` | Service logic - already correct |

---

## Code Changes Summary

### Change 1: Clear Selection on Filter Change

**File**: `frontend/src/pages/workspace/LibraryPage.tsx`
**Location**: After line 95 (after `clearPersonFilter` callback)

```typescript
// Clear selection when person filter changes
useEffect(() => {
  setSelectedIds(new Set());
}, [personFilter]);
```

### Change 2: Add Error Handling to Move

**File**: `frontend/src/pages/workspace/LibraryPage.tsx`
**Location**: Replace lines 319-326

```typescript
const handleMoveToFolder = async (folderId: string | null) => {
  if (!user?.workspace_id || selectedIds.size === 0) return;

  try {
    const result = await libraryService.moveAssetsToFolder(
      user.workspace_id,
      Array.from(selectedIds),
      folderId
    );

    addToast({
      message: `Successfully moved ${result.count} asset${result.count !== 1 ? 's' : ''}`,
      variant: 'success'
    });
    setSelectedIds(new Set());
    setShowMoveToFolder(false);
    await fetchAssets();
    await fetchFolders();
  } catch (error) {
    console.error('Move to folder failed:', error);
    addToast({
      message: error instanceof Error ? error.message : 'Failed to move assets',
      variant: 'error'
    });
  }
};
```

### Change 3: Add Error Handling to Gallery Add

**File**: `frontend/src/pages/workspace/LibraryPage.tsx`
**Location**: Replace lines 616-622 (inside MoveToGalleryModal props)

```typescript
onMove={async (galleryId) => {
  if (!user?.workspace_id || selectedIds.size === 0) return;

  try {
    const result = await galleryService.addAssetsToGallery(
      user.workspace_id,
      galleryId,
      Array.from(selectedIds)
    );

    addToast({
      message: `Added ${result.count} asset${result.count !== 1 ? 's' : ''} to gallery`,
      variant: 'success'
    });
    setSelectedIds(new Set());
    setIsMoveModalOpen(false);
    await fetchAssets();
  } catch (error) {
    console.error('Add to gallery failed:', error);
    addToast({
      message: error instanceof Error ? error.message : 'Failed to add assets to gallery',
      variant: 'error'
    });
  }
}}
```

---

## Testing Checklist

### Manual Testing

- [ ] Filter by person clears selection
- [ ] Changing folders clears selection
- [ ] Move to folder shows success toast
- [ ] Move to folder shows error toast on failure
- [ ] Add to gallery shows success toast
- [ ] Add to gallery shows error toast on failure
- [ ] Moved assets appear in target folder
- [ ] Added assets appear in target gallery

### Automated Testing (After Implementation)

Run frontend tests:
```bash
cd frontend && npm test
```

Run specific test file:
```bash
cd frontend && npm test -- src/__tests__/pages/LibraryPage.test.tsx
```

---

## Common Issues

### "Move doesn't work"

1. Check Network tab for API response
2. If 404: Target folder may not exist
3. If 403: User may lack `assets:write` permission
4. If no request: Selection may be empty

### "Add to gallery doesn't work"

1. Check Network tab for API response
2. If 404: Target gallery may not exist
3. If 403: User may lack `galleries:write` permission
4. If success but not visible: Gallery cache may need refresh

### "Selection persists after fix"

1. Verify the useEffect is correctly placed
2. Check that dependency array includes `personFilter`
3. Use React DevTools to verify effect triggers

---

## Related Documentation

- [Specification](./spec.md)
- [Implementation Plan](./plan.md)
- [Research & Root Cause](./research.md)
- [Data Model](./data-model.md)
