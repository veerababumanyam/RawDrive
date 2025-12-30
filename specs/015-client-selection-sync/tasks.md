# Tasks: Client Selection Sync to Photographer Gallery

**Input**: Design documents from `/specs/015-client-selection-sync/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Backend migration test + Frontend component tests. Manual testing guide in quickstart.md.

**Organization**: Tasks grouped by implementation phase. MVP focuses on displaying activity counts.

## Format: `[ID] [P?] [Phase] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Phase]**: Which implementation phase (P1-P9)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- Backend: Python/FastAPI in `backend/src/app/`
- Frontend: React/TypeScript in `frontend/src/`
- Migrations: `backend/migrations/versions/`

---

## Phase 1: Setup

**Purpose**: Branch verification and development environment

- [ ] T001 Verify on feature branch `015-client-selection-sync`
- [ ] T002 Start development infrastructure with `npm run docker:dev:up`
- [ ] T003 [P] Start backend server with `cd backend && npm run dev:backend`
- [ ] T004 [P] Start frontend server with `cd frontend && npm run dev`

---

## Phase 2: Database Infrastructure (Backend)

**Purpose**: Create materialized view for picks aggregation

**⚠️ CRITICAL**: This phase MUST complete before backend API can return aggregated data

- [ ] T005 [P2] Create migration file `backend/migrations/versions/0058_client_activity_views.py`
- [ ] T006 [P2] Add `gallery_picks_summary` materialized view to migration
- [ ] T007 [P2] Add unique index `idx_gps_gallery_asset` on (gallery_id, asset_id)
- [ ] T008 [P2] Add index `idx_gps_workspace_count` on (workspace_id, unique_pick_count DESC)
- [ ] T009 [P2] Add refresh function `refresh_gallery_picks_summary()`
- [ ] T010 [P2] Run migration with `cd backend && npm run db:migrate`
- [ ] T011 [P2] Verify materialized view has data (query test)

**Checkpoint**: Materialized view exists and can be queried.

---

## Phase 3: Backend Service Layer (Backend)

**Purpose**: Create service for client activity queries

- [ ] T012 [P3] Create `backend/src/app/services/client_activity_service.py`
- [ ] T013 [P3] Add `get_gallery_activity_summary()` method
- [ ] T014 [P3] Add `get_asset_activity_counts()` method (bulk for gallery)
- [ ] T015 [P3] Add Redis caching (60 second TTL) for summary queries

**Checkpoint**: Service can fetch aggregated activity data.

---

## Phase 4: Backend API Extension (Backend)

**Purpose**: Extend assets list response with activity counts

- [ ] T016 [P4] Read `backend/src/app/services/gallery_service.py` lines 1957-2100 to understand existing query
- [ ] T017 [P4] Modify `get_gallery_assets()` to JOIN with materialized views
- [ ] T018 [P4] Add `client_favorites_count` and `client_picks_count` to response
- [ ] T019 [P4] Add `sort_by` parameter support (values: 'favorites', 'picks')
- [ ] T020 [P4] Update response Pydantic model in `backend/src/app/api/v1/galleries.py`
- [ ] T021 [P4] Test API endpoint returns correct counts (manual curl test)

**Checkpoint**: API returns activity counts and supports sorting.

---

## Phase 5: Frontend Type Extensions (Frontend)

**Purpose**: Update TypeScript types for activity data

- [ ] T022 [P5] Read `frontend/src/types/types.ts` to find `GalleryAssetItem` interface
- [ ] T023 [P5] Add `client_favorites_count: number` to `GalleryAssetItem`
- [ ] T024 [P5] Add `client_picks_count: number` to `GalleryAssetItem`
- [ ] T025 [P5] Add `SortOption` type with new values

**Checkpoint**: TypeScript types support new fields.

---

## Phase 6: Client Activity Badge Component (Frontend)

**Purpose**: Create reusable badge component for activity counts

- [ ] T026 [P6] Create `frontend/src/components/features/gallery/ClientActivityBadge.tsx`
- [ ] T027 [P6] Add props interface: `favoritesCount`, `picksCount`, `onClick?`, `size?`
- [ ] T028 [P6] Render heart icon + count (only if > 0)
- [ ] T029 [P6] Render checkmark icon + count (only if > 0)
- [ ] T030 [P6] Style with `bg-black/60 backdrop-blur-sm rounded-full px-2 py-0.5`
- [ ] T031 [P6] Add hover state for clickable (future: popover trigger)

**Checkpoint**: Badge component renders correctly in isolation.

---

## Phase 7: PhotoCard Integration (Frontend)

**Purpose**: Display activity badges on photo thumbnails

- [ ] T032 [P7] Read `frontend/src/components/features/gallery/PhotoCard.tsx` to understand structure
- [ ] T033 [P7] Import `ClientActivityBadge` component
- [ ] T034 [P7] Find existing badges section (Cover, Private badges)
- [ ] T035 [P7] Add `ClientActivityBadge` to top-right corner
- [ ] T036 [P7] Position below existing badges with `flex flex-col gap-1`
- [ ] T037 [P7] Only render if `asset.client_favorites_count > 0 || asset.client_picks_count > 0`

**Checkpoint**: Photo thumbnails show activity badges.

---

## Phase 8: Gallery Stats Enhancement (Frontend)

**Purpose**: Show aggregated activity in gallery stats bar

- [ ] T038 [P8] Read `frontend/src/components/features/gallery/GalleryStats.tsx`
- [ ] T039 [P8] Add `clientPicksCount` prop to interface
- [ ] T040 [P8] Import `CheckCircle2` icon from lucide-react
- [ ] T041 [P8] Add picks stat badge after favorites: `[✓ X Picks]`
- [ ] T042 [P8] Style with `text-success` color class

**Checkpoint**: Gallery stats show client picks count.

---

## Phase 9: Sort Options (Frontend)

**Purpose**: Add sorting by popularity

- [ ] T043 [P9] Read `frontend/src/components/features/gallery/GalleryToolbar.tsx`
- [ ] T044 [P9] Find sort dropdown component
- [ ] T045 [P9] Add option: `{ value: 'favorites', label: 'Most Favorited' }`
- [ ] T046 [P9] Add option: `{ value: 'picks', label: 'Most Picked' }`
- [ ] T047 [P9] Update `frontend/src/services/galleryService.ts` to pass `sort_by` param

**Checkpoint**: Sort dropdown has new options.

---

## Phase 10: GalleryDetailPage Integration (Frontend)

**Purpose**: Wire everything together in the main page

- [ ] T048 [P10] Read `frontend/src/pages/workspace/GalleryDetailPage.tsx`
- [ ] T049 [P10] Compute `clientPicksCount` from loaded assets
- [ ] T050 [P10] Pass `clientPicksCount` to `GalleryStats` component
- [ ] T051 [P10] Handle sort parameter state changes
- [ ] T052 [P10] Pass sort param to API call in `useGalleryAssets` hook

**Checkpoint**: Page displays all activity data correctly.

---

## Phase 11: Testing & Polish

**Purpose**: Final validation and cleanup

- [ ] T053 [P] Remove any console.log debug statements
- [ ] T054 [P] Run `npm run lint` in both frontend and backend directories
- [ ] T055 [P] Run `npm run build` to verify no TypeScript errors
- [ ] T056 Run full manual test flow per quickstart.md
- [ ] T057 Create commit with conventional format: `feat(gallery): add client activity sync to photographer view`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Database (Phase 2)**: Depends on Setup
- **Backend Service (Phase 3)**: Depends on Phase 2
- **Backend API (Phase 4)**: Depends on Phase 3
- **Frontend Types (Phase 5)**: Depends on Phase 4 (need to know API response shape)
- **Badge Component (Phase 6)**: Can start after Phase 5
- **PhotoCard (Phase 7)**: Depends on Phase 6
- **GalleryStats (Phase 8)**: Depends on Phase 5
- **Sort Options (Phase 9)**: Depends on Phase 4 (API support)
- **Page Integration (Phase 10)**: Depends on Phases 7, 8, 9
- **Testing (Phase 11)**: Depends on all phases

### Parallel Opportunities

- T003 and T004 can run in parallel (different services)
- Phase 6, 7, 8, 9 frontend tasks can be worked in parallel after Phase 5
- T053 and T054 can run in parallel

---

## Implementation Strategy

### MVP First (Phases 1-7)

1. Complete Phase 1: Setup (5 min)
2. Complete Phase 2: Database migration (30 min)
3. Complete Phase 4: Backend API extension (1 hour)
4. Complete Phase 5: Frontend types (15 min)
5. Complete Phase 6: Badge component (30 min)
6. Complete Phase 7: PhotoCard integration (30 min)
7. **STOP and VALIDATE**: Test activity badges appear on photos

### Full Feature (Phases 8-11)

8. Add Phase 8: Gallery stats (30 min)
9. Add Phase 9: Sort options (30 min)
10. Add Phase 10: Page integration (30 min)
11. Complete Phase 11: Testing and commit (1 hour)

---

## Notes

- **No breaking changes**: All additions are backward-compatible
- **Materialized view refresh**: Currently manual; consider cron job for production
- **Redis caching**: Optional but recommended for high-traffic galleries
- **Total estimated effort**: 6-8 hours
- **MVP (badges only)**: 3-4 hours
