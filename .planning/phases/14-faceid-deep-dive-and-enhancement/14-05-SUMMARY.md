---
phase: 14-faceid-deep-dive-and-enhancement
plan: "05"
subsystem: face-management-ux
tags: [face-id, ux, confidence-filter, context-menu, undo-merge, cross-gallery-search]
dependency_graph:
  requires: ["14-03", "14-04"]
  provides: ["face-confidence-filtering", "face-context-menu", "undo-merge", "cross-gallery-face-search"]
  affects: ["PeoplePage", "faceApiService", "usePeopleMerge", "face_groups API"]
tech_stack:
  added: []
  patterns: ["toast-action-undo", "cross-gallery-join-query", "context-menu-reuse"]
key_files:
  created:
    - frontend/src/components/features/face/FaceConfidenceFilter.tsx
    - frontend/src/components/features/face/FaceContextMenu.tsx
    - frontend/src/components/features/face/UndoMergeToast.tsx
    - frontend/src/hooks/useFaceSearch.ts
    - backend/src/app/services/face_search_service.py
    - frontend/src/tests/face/faceUxFeatures.test.ts
  modified:
    - frontend/src/hooks/usePeopleMerge.ts
    - frontend/src/services/faceApiService.ts
    - frontend/src/pages/workspace/PeoplePage.tsx
    - backend/src/app/api/v1/face_groups.py
decisions:
  - "Reused existing ContextMenu UI component instead of creating face-specific one"
  - "Used Toast action system for undo merge instead of custom toast component"
  - "Undo merge captures face IDs pre-merge and uses splitFaceGroup for reversal"
  - "Cross-gallery search joins faces->gallery_assets->assets->galleries with workspace_id isolation"
metrics:
  duration: "~10 minutes"
  completed: "2026-03-19"
  tasks_completed: 3
  tasks_total: 3
  tests_added: 10
  files_created: 6
  files_modified: 4
---

# Phase 14 Plan 05: Competitive UX Features Summary

Confidence filter with slider/presets, right-click context menu via existing ContextMenu component, undo merge via toast action + splitFaceGroup, and cross-gallery person photo search with backend join query.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Confidence filter, context menu, undo merge | f8aa3054, b5b37b13 | FaceConfidenceFilter.tsx, FaceContextMenu.tsx, UndoMergeToast.tsx, usePeopleMerge.ts, PeoplePage.tsx |
| 2 | Cross-gallery face search | da3b63be | face_search_service.py, face_groups.py, useFaceSearch.ts, faceApiService.ts |
| 3 | Verify complete face management UX | Auto-approved | Build + lint pass |

## What Was Built

### FaceConfidenceFilter
- Range slider (0-100%) with preset buttons: All (0%), Low (25%), Med (50%), High (75%)
- Shows "X of Y groups" count
- Integrated into PeoplePage above the face grid

### FaceContextMenu
- Reuses existing `ContextMenu` UI component (positioned portal with click-outside/Escape)
- Actions: View all photos, Rename, Merge with..., Delete (destructive variant)
- Triggered by onContextMenu on PersonCard

### UndoMergeToast
- Uses existing Toast system's `action` prop (label + onClick) -- no custom component needed
- `createUndoMergeToast()` function generates toast data with 10-second duration
- usePeopleMerge captures pre-merge face IDs, undo calls splitFaceGroup to reverse

### Cross-Gallery Face Search
- Backend: `FaceSearchService.search_photos_by_person()` joins faces, gallery_assets, assets, galleries
- Endpoint: GET `/workspaces/{id}/face-groups/{group_id}/search-photos?page=1&per_page=50`
- Multi-tenant: workspace_id filter on both faces and gallery_assets tables
- Frontend: `useFaceSearch` hook, `searchPhotosByPerson()` API method
- PeoplePage: Modal overlay showing photo thumbnails with gallery name overlays

## Deviations from Plan

None -- plan executed as written.

## Decisions Made

1. **Reused ContextMenu UI component** -- Existing `ContextMenu.tsx` already had positioning, portal rendering, click-outside, and Escape handling. No need for a face-specific context menu.

2. **Toast action for undo** -- The existing Toast system supports `action: { label, onClick }` which is exactly what undo merge needs. Created `createUndoMergeToast()` as a factory function rather than a standalone component.

3. **Split-based undo** -- Pre-merge, the hook fetches all face IDs from each source group. On undo, it calls `splitFaceGroup` to move those faces back out of the target group into new groups.

4. **Search endpoint on face_groups router** -- Added to `face_groups.py` (not `faces.py`) because the search is scoped to a face group (person), matching the existing routing pattern.

## Verification

- 10 vitest tests pass (confidence filter, context menu, undo merge, face search)
- TypeScript compiles with no errors
- Auto-approved checkpoint (auto_advance=true)
