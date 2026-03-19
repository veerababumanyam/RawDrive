# Phase 14: FaceID Frontend Analysis

**Analyzed:** 2026-03-19
**Scope:** All face-related frontend code (15+ components, 4 hooks, 5 services)

## UI Architecture

```
PeoplePage (workspace-level)
├── SuggestionChip (AI merge pairs)
├── PersonCard (grid view, 6-8 cols responsive)
├── PersonListItem (list view)
├── FaceGroupMergeModal
│   └── Primary face selector (5-col grid)
└── SelectionActionBar (merge, rename, delete)

GalleryDetailPage
└── PeoplePanel (gallery-scoped)
    ├── PersonCard (3-col grid)
    ├── FaceGroupDetailPanel
    │   └── Face selector (3-col, infinite scroll)
    └── FaceGroupMergeModal

Public Gallery
└── ClientPeopleFilter (read-only, 3-col)
    └── PersonCard (no selection)

Photo Lightbox
└── FaceOverlay
    ├── FaceBox (with shadow ring highlight)
    └── PersonSelector (dropdown)
```

## Fully Implemented Features

- ✓ AI merge suggestions (75% threshold)
- ✓ Primary face selection for thumbnails
- ✓ Person naming/renaming
- ✓ Bulk merge (2+ groups)
- ✓ Soft deletion
- ✓ Biometric consent hooks
- ✓ Gallery-scoped filtering
- ✓ Public gallery people filter
- ✓ Face grouping/clustering
- ✓ Detection status tracking

## API Integration

- 20+ endpoints in faceApiService
- Multi-workspace isolation via workspace_id parameter
- Thumbnail URL generation (representative_thumbnail_url)
- Pagination support for large face sets
- Error handling via FaceApiError class with HTTP status codes

## Issues Found

### Critical Issues

1. **API Response Format Inconsistency** — getFaceGroups returns `data/meta` format, but code expects direct arrays in some places
2. **State Sync After Mutations** — No real-time updates after merge/delete, relies on full refetch; stale merge suggestions appear after merge
3. **No Error Boundaries** — Failed face operations in detail panel have no error handling

### UX Issues

4. **Mobile Responsiveness** — Fixed panel widths (max-w-md) and column grids don't scale well on small screens
5. **Keyboard Navigation Incomplete** — Escape only clears selection, doesn't close modals
6. **No Context Menu** — Rename requires inline edit or action bar selection; no right-click for quick actions
7. **Design System Inconsistency** — PersonCard uses 6-8 col grid in PeoplePage vs 3 col in PeoplePanel with no unified responsive breakpoints

### Accessibility Gaps

8. Missing `aria-label` on checkboxes
9. No `role="alert"` for status updates
10. Keyboard trap in merge modal

### Performance Issues

11. No pagination in PeoplePanel (limits to 100 groups)
12. No infinite scroll in detail panel beyond "Load More"

## Missing Features vs Competitors

- No face confidence score filtering
- No face similarity visualization (beyond merge %)
- No bulk operations (tag all, delete all by threshold)
- No face clustering visualization/heatmap
- No undo for merge operations
- No duplicate detection/removal
- No face quality assessment
- No export of face data/grouped photos
