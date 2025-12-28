# Research: Fix Library Photo Operations

**Feature**: 011-fix-library-photo-operations
**Date**: 2025-12-28

## Executive Summary

After analyzing the RawDrive codebase, I've identified the root causes of both bugs:

1. **Bug #1 (Unintentional Moves)**: Selection state (`selectedIds`) is NOT cleared when the person filter changes, causing stale selections to be moved when the move modal is used.

2. **Bug #2 (Broken Move Operations)**: The move operations lack proper error handling and success feedback, making it appear as if they're not working when they might be failing silently or succeeding without UI refresh.

---

## Research Findings

### R1: Person Filter State Flow

**Decision**: Backend filter is read-only - bug is in frontend state management.

**Rationale**:
- `library_service.py:79-89` shows the face_group_id filter only adds a WHERE clause:
  ```python
  if face_group_id is not None:
      where_conditions.append(f"""
          EXISTS (
              SELECT 1 FROM faces f
              WHERE f.photo_id = a.asset_id
                AND f.face_group_id = ${param_idx}
          )
      """)
  ```
- This is a pure SELECT query with no UPDATE/INSERT/DELETE operations.
- The frontend correctly passes the filter via URL param `?person=<faceGroupId>`.

**Alternatives Considered**:
- Backend bug causing writes during read - RULED OUT by code analysis
- Database trigger causing side effects - RULED OUT (no such triggers exist)

### R2: Selection State Bleeding

**Decision**: The `selectedIds` state is NOT cleared when filters change.

**Rationale**:
- In `LibraryPage.tsx:53`, `selectedIds` is a React state: `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());`
- The `fetchAssets` callback at line 118-150 does NOT clear selections.
- When user filters by person:
  1. URL changes to `/workspace/libraries?person=<id>`
  2. `fetchAssets()` runs (line 150 dependency: `personFilter`)
  3. New assets load BUT `selectedIds` retains old values
  4. If user then clicks "Move to Folder", the stale IDs are moved

**Evidence**:
```typescript
// Line 150 - fetchAssets dependency array includes personFilter
}, [user?.workspace_id, page, filterType, searchQuery, currentFolder?.folder_id, personFilter, addToast]);

// Line 53 - selectedIds is never cleared on filter change
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
```

**Alternatives Considered**:
- Clear on every filter change - Chosen approach
- Only clear when switching from one person to another - Too narrow, doesn't fix root→person

### R3: Move to Folder API Analysis

**Decision**: API is correctly implemented, but frontend lacks error handling.

**Rationale**:
- Backend endpoint at `library.py:472-495`:
  ```python
  @router.post("/assets/move")
  async def move_assets_to_folder(...) -> MoveAssetsResponse:
      result = await service.move_assets_to_folder(
          workspace_id=workspace_id,
          asset_ids=request.asset_ids,
          folder_id=request.folder_id,
      )
      return MoveAssetsResponse(**result)
  ```
- Service at `library_service.py:753-785` correctly updates `folder_id`:
  ```python
  await conn.execute(
      "UPDATE assets SET folder_id = $1 WHERE asset_id = ANY($2::uuid[])",
      folder_id,
      asset_ids,
  )
  ```
- Frontend handler at `LibraryPage.tsx:319-326`:
  ```typescript
  const handleMoveToFolder = async (folderId: string | null) => {
      if (!user?.workspace_id) return;
      await libraryService.moveAssetsToFolder(user.workspace_id, Array.from(selectedIds), folderId);
      setSelectedIds(new Set());
      setShowMoveToFolder(false);
      fetchAssets();
      fetchFolders();
  };
  ```
  **ISSUE**: No try/catch, no error handling, no success feedback.

**Alternatives Considered**:
- Backend API bug - RULED OUT by code analysis
- Database constraint violation - Possible if folder_id is invalid, but not primary cause

### R4: Add to Gallery API Analysis

**Decision**: API is correctly implemented, but frontend inline callback lacks error handling.

**Rationale**:
- `galleryService.addAssetsToGallery` at line 581-591 makes correct POST call
- Frontend callback at `LibraryPage.tsx:616-622`:
  ```typescript
  onMove={async (galleryId) => {
      if (user?.workspace_id) {
          await galleryService.addAssetsToGallery(user.workspace_id, galleryId, Array.from(selectedIds));
          setSelectedIds(new Set());
          fetchAssets();
      }
  }}
  ```
  **ISSUES**:
  1. No try/catch - errors silently fail
  2. No success toast - user doesn't know it worked
  3. `setIsMoveModalOpen(false)` is missing - modal might not close

**Alternatives Considered**:
- Gallery API bug - RULED OUT
- Permission issue - Possible but not primary cause

### R5: Modal State Management

**Decision**: Modal triggers are correctly controlled by state, but selection state is the issue.

**Rationale**:
- `MoveToLibraryFolderModal` controlled by `showMoveToFolder` state
- `MoveToGalleryModal` controlled by `isMoveModalOpen` state
- Both are only opened by explicit button clicks in the action bar
- No evidence of accidental modal triggers

**Key Insight**: The problem isn't modal triggers - it's that when the modal IS opened (intentionally), it operates on stale `selectedIds` that contain assets from a previous view.

---

## Root Cause Summary

### Bug #1: Unintentional Photo Moves

**Root Cause**: Selection state persists across filter changes.

**Scenario**:
1. User views library root, selects 5 photos
2. User clicks on a person in People panel
3. Library filters to show only that person's photos
4. `selectedIds` still contains the 5 photos from step 1 (which may not be visible now)
5. User opens "Move to Folder" modal (maybe trying to organize filtered photos)
6. System moves the 5 ORIGINAL photos, not the filtered view

**Fix**: Clear `selectedIds` whenever `personFilter` changes.

### Bug #2: Broken Move Operations

**Root Cause**: Missing error handling and success feedback creates perception that moves don't work.

**Scenario A - Silent Failure**:
1. User selects photos, clicks Move
2. API returns 404 (folder deleted by another user)
3. No error shown - user thinks nothing happened

**Scenario B - Silent Success**:
1. User selects photos, clicks Move
2. API succeeds
3. No success toast - user thinks nothing happened
4. User doesn't realize they need to check the target folder

**Fix**: Add try/catch with toast notifications for both success and error cases.

---

## Implementation Recommendations

### Priority 1: Fix Selection Bleeding (Bug #1)

```typescript
// Add to LibraryPage.tsx after line 95 (after clearPersonFilter callback)
useEffect(() => {
  // Clear selection when person filter changes to prevent stale selections
  setSelectedIds(new Set());
}, [personFilter]);
```

### Priority 2: Add Error Handling to Move Operations (Bug #2)

```typescript
// Update handleMoveToFolder
const handleMoveToFolder = async (folderId: string | null) => {
  if (!user?.workspace_id || selectedIds.size === 0) return;

  try {
    const result = await libraryService.moveAssetsToFolder(
      user.workspace_id,
      Array.from(selectedIds),
      folderId
    );

    addToast({
      message: `Successfully moved ${result.count} assets`,
      variant: 'success'
    });
    setSelectedIds(new Set());
    setShowMoveToFolder(false);
    await fetchAssets();
    await fetchFolders();
  } catch (error) {
    console.error('Move failed:', error);
    addToast({
      message: error instanceof Error ? error.message : 'Failed to move assets',
      variant: 'error'
    });
  }
};
```

### Priority 3: Add Error Handling to Gallery Operations (Bug #2)

```typescript
// Update MoveToGalleryModal onMove callback
onMove={async (galleryId) => {
  if (!user?.workspace_id || selectedIds.size === 0) return;

  try {
    const result = await galleryService.addAssetsToGallery(
      user.workspace_id,
      galleryId,
      Array.from(selectedIds)
    );

    addToast({
      message: `Added ${result.count} assets to gallery`,
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

## Testing Recommendations

1. **Unit Test**: Selection clearing on filter change
2. **Unit Test**: Error handling displays toast
3. **Integration Test**: Move API with valid folder_id
4. **Integration Test**: Move API with null folder_id (to root)
5. **Integration Test**: Add to gallery API
6. **E2E Test**: Full flow - filter by person, verify no moves
7. **E2E Test**: Full flow - move assets to folder, verify success
