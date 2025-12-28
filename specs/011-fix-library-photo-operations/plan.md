# Implementation Plan: Fix Library Photo Operations

**Branch**: `011-fix-library-photo-operations` | **Date**: 2025-12-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-fix-library-photo-operations/spec.md`

## Summary

This plan addresses two critical bugs in the RawDrive library:

1. **Unintentional Photo Moves (Bug #1)**: When users filter their library by person (face group), photos are being moved unintentionally. Investigation reveals the backend API is read-only for face filtering, so the issue is in frontend state management - likely selection state persistence or modal triggering during filtered views.

2. **Broken Move Operations (Bug #2)**: Moving assets from root to folders and adding assets from library to galleries is not working. The frontend service calls are correctly implemented, so the issue may be in API response handling, error silencing, or state refresh after operations.

**Technical Approach**: Debug and fix frontend state management and API call handling in `LibraryPage.tsx`, `MoveToLibraryFolderModal.tsx`, and `MoveToGalleryModal.tsx`.

## Technical Context

**Language/Version**: TypeScript 5.2+ (Frontend React 18.3), Python 3.11+ (Backend FastAPI)
**Primary Dependencies**: React 18.3, React Router DOM, TailwindCSS, FastAPI 0.115+, asyncpg 0.29+
**Storage**: PostgreSQL 16 (existing `assets.folder_id` column)
**Testing**: Vitest (frontend), pytest (backend)
**Target Platform**: Web application (SPA)
**Project Type**: Web application (frontend + backend monorepo)
**Performance Goals**: Move operations complete within 5 seconds for batches up to 50 assets
**Constraints**: Operations must be atomic, proper error feedback within 2 seconds
**Scale/Scope**: Bug fix scope - focused on 4-5 files in frontend, 1-2 files in backend for verification

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| No hardcoded secrets | PASS | No new secrets introduced |
| Workspace isolation | PASS | All API calls include workspace_id |
| Input validation | PASS | Using existing validated schemas |
| Audit logging | N/A | Bug fix - no new auditable actions |
| Accessibility | PASS | Modal components already WCAG compliant |
| Design system | PASS | Using existing AppButton, AppInput components |
| Test coverage | REQUIRED | Must add tests for move operations |

## Project Structure

### Documentation (this feature)

```text
specs/011-fix-library-photo-operations/
├── plan.md              # This file
├── research.md          # Phase 0 output - root cause analysis
├── data-model.md        # Phase 1 output - state flow diagrams
├── quickstart.md        # Phase 1 output - debugging guide
├── contracts/           # Phase 1 output - API verification
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── pages/workspace/
│   │   └── LibraryPage.tsx                    # Primary fix location
│   ├── components/features/library/
│   │   └── MoveToLibraryFolderModal.tsx       # Fix location
│   ├── components/workspace/library/
│   │   └── MoveToGalleryModal.tsx             # Fix location
│   └── services/
│       ├── libraryService.ts                  # API calls verification
│       └── galleryService.ts                  # API calls verification
└── tests/
    └── unit/
        └── library/                           # New test files

backend/
├── src/app/
│   ├── api/v1/
│   │   └── library.py                         # API verification
│   └── services/
│       └── library_service.py                 # Service verification
└── tests/
    └── integration/
        └── test_library_operations.py         # API tests
```

**Structure Decision**: Web application structure with frontend React SPA and FastAPI backend. Changes focused on frontend state management with backend API verification.

## Complexity Tracking

No complexity violations - this is a focused bug fix with no new patterns or architectural changes.

---

## Phase 0: Research & Root Cause Analysis

### Research Tasks

| ID | Task | Status | Finding |
|----|------|--------|---------|
| R1 | Trace person filter state flow | COMPLETE | Filter uses URL param `?person=`, `fetchAssets` correctly passes `face_group_id` to API, backend is read-only |
| R2 | Identify selection state bleeding | PENDING | Check if `selectedIds` persists across filter changes |
| R3 | Debug moveAssetsToFolder API response | PENDING | Verify API returns correct response, check error handling |
| R4 | Debug addAssetsToGallery API call | PENDING | Verify API is being called with correct parameters |
| R5 | Inspect modal state management | PENDING | Check if modals can be triggered unintentionally |

### Preliminary Findings

**Bug #1 - Unintentional Moves**:
- Backend `library_service.py:79-89` only adds WHERE clause for face_group_id - READ ONLY
- `LibraryPage.tsx:135-136` correctly passes filter parameters
- **Hypothesis**: Selection state (`selectedIds`) persists when filter changes, and a modal operation on stale selection causes moves

**Bug #2 - Broken Move Operations**:
- `libraryService.moveAssetsToFolder()` at line 225-238 makes correct POST call
- `MoveToLibraryFolderModal.tsx` passes `selectedFolder` which defaults to `null` (root)
- **Hypothesis**: Either API returns error that's silently swallowed, or state refresh doesn't trigger re-render

---

## Phase 1: Design & Contracts

### State Flow Analysis

#### Current Flow (Buggy)

```
User clicks person → URL param changes → fetchAssets() → API returns filtered assets
                                                       ↓
                                        selectedIds NOT cleared ← BUG #1 SOURCE
                                                       ↓
User opens Move modal → submits → moves STALE selectedIds
```

#### Fixed Flow (Proposed)

```
User clicks person → URL param changes → CLEAR selectedIds → fetchAssets() → API returns filtered assets
                                                                            ↓
                                              selectedIds = new Set() ← FIX
```

### API Contract Verification

#### Move Assets to Folder

```yaml
# /api/v1/workspaces/{workspace_id}/library/assets/move
POST:
  Request:
    asset_ids: string[]    # UUIDs of assets to move
    folder_id: string|null # Target folder (null = root)
  Response:
    moved: boolean
    count: number
  Errors:
    403: Access denied
    404: Folder not found
```

#### Add Assets to Gallery

```yaml
# /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/assets
POST:
  Request:
    asset_ids: string[]    # UUIDs of assets to add
  Response:
    success: boolean
    count: number
  Errors:
    403: Access denied
    404: Gallery not found
```

### Fix Strategy

#### Fix 1: Clear Selection on Filter Change

```typescript
// LibraryPage.tsx - Add effect to clear selection when filter changes
useEffect(() => {
  setSelectedIds(new Set()); // Clear selection when person filter changes
}, [personFilter]);
```

#### Fix 2: Add Error Handling to Move Operations

```typescript
// LibraryPage.tsx handleMoveToFolder
const handleMoveToFolder = async (folderId: string | null) => {
  if (!user?.workspace_id) return;
  try {
    const result = await libraryService.moveAssetsToFolder(
      user.workspace_id,
      Array.from(selectedIds),
      folderId
    );
    if (result.moved) {
      addToast({ message: `Moved ${result.count} assets`, variant: 'success' });
    }
    setSelectedIds(new Set());
    setShowMoveToFolder(false);
    await fetchAssets();
    await fetchFolders();
  } catch (error) {
    console.error('Failed to move assets:', error);
    addToast({ message: 'Failed to move assets', variant: 'error' });
  }
};
```

#### Fix 3: Add Error Handling to Gallery Operations

```typescript
// LibraryPage.tsx MoveToGalleryModal onMove
onMove={async (galleryId) => {
  if (!user?.workspace_id) return;
  try {
    const result = await galleryService.addAssetsToGallery(
      user.workspace_id,
      galleryId,
      Array.from(selectedIds)
    );
    addToast({ message: `Added ${result.count} assets to gallery`, variant: 'success' });
    setSelectedIds(new Set());
    setIsMoveModalOpen(false);
    await fetchAssets();
  } catch (error) {
    console.error('Failed to add assets to gallery:', error);
    addToast({ message: 'Failed to add assets to gallery', variant: 'error' });
  }
}}
```

### Testing Strategy

1. **Unit Tests**: Test selection state clearing on filter changes
2. **Integration Tests**: Test move operations via API
3. **E2E Tests** (optional): Test full user flows with Playwright

---

## Phase 2: Task Breakdown

*To be generated by `/speckit.tasks` command*

### Estimated Tasks (Preview)

1. Debug and verify root cause for Bug #1 (selection state bleeding)
2. Implement selection clearing on filter change
3. Add error handling to handleMoveToFolder
4. Add error handling to addAssetsToGallery callback
5. Add success/error toast notifications
6. Write unit tests for selection state management
7. Write integration tests for move operations
8. Manual QA verification

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Fix breaks existing selection behavior | Medium | Preserve selection within same folder view, only clear on filter |
| API errors still silently swallowed | High | Add comprehensive try/catch with toast notifications |
| State refresh race conditions | Low | Use await for sequential fetchAssets/fetchFolders |

---

## Success Criteria Verification

| Criterion | How to Verify |
|-----------|---------------|
| SC-001: Filter by person = read-only | Manual test: filter, verify folder_id unchanged in DB |
| SC-002: Move root→folder works | Manual test: select assets at root, move to folder, verify |
| SC-003: Add to gallery works | Manual test: select library assets, add to gallery, verify in gallery |
| SC-004: <5s for 50 assets | Performance test with timer |
| SC-005: Feedback within 2s | Manual test with success/error toasts |
| SC-006: Zero unintentional moves | Regression test over 30 days |
