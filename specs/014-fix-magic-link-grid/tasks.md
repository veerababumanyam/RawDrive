# Tasks: Fix Magic Link Photo Grid

**Input**: Design documents from `/specs/014-fix-magic-link-grid/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Tests NOT explicitly requested in spec. Test tasks omitted. Manual testing guide in quickstart.md.

**Organization**: Tasks grouped by user story for independent implementation. This is a bug-fix feature - no new models/schema required.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US6)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- Backend: Python/FastAPI in `backend/src/app/`
- Frontend: React/TypeScript in `frontend/src/`

---

## Phase 1: Setup

**Purpose**: Branch verification and development environment

- [x] T001 Verify on feature branch `014-fix-magic-link-grid`
- [x] T002 Start development infrastructure with `npm run docker:dev:up`
- [x] T003 [P] Start backend server with `cd backend && npm run dev:backend`
- [x] T004 [P] Start frontend server with `cd frontend && npm run dev`

---

## Phase 2: Foundational (Backend SQL Fix - CRITICAL)

**Purpose**: Fix the root cause backend bug that affects multiple user stories (US1, US2)

**⚠️ CRITICAL**: This SQL fix MUST be complete before US1 and US2 can work properly

- [x] T005 Read `backend/src/app/services/gallery_service.py` lines 1957-2100 to understand query context
- [x] T006 Fix SQL query in `backend/src/app/services/gallery_service.py` line 2035: Replace `0 AS favorites_count` with `ga.favorites_count`
- [x] T007 Verify `is_selected` field also returns correct value from `gallery_assets` table (ga.is_selected) - CONFIRMED WORKING
- [x] T008 Test API endpoint `GET /v1/public/galleries/{token}/assets/filtered` returns correct `favorites_count` and `is_selected` values - CODE FIX APPLIED, MANUAL TEST REQUIRED

**Checkpoint**: Backend returns correct favorites/picks status. Frontend state persistence can now work.

---

## Phase 3: User Story 1 - View Photos in Lightbox (Priority: P1) 🎯 MVP

**Goal**: Fix black/blank screen when clicking photo thumbnails in Magic Link gallery

**Independent Test**: Access Magic Link, click any photo thumbnail, verify full image displays in lightbox

### Implementation for User Story 1

- [x] T009 [US1] Read lightbox implementation in `frontend/src/pages/public/PublicGalleryPage.tsx` lines 769-983
- [x] T010 [US1] Add loading state indicator while `useSignedUrl` fetches preview URL in lightbox section
- [x] T011 [US1] Add `onError` handler to lightbox image element to catch failed image loads
- [x] T012 [US1] Add error state UI with retry button when image fails to load in lightbox
- [x] T013 [US1] Handle `urlError` from `useSignedUrl` hook and display user-friendly message
- [x] T014 [US1] Add fallback to `asset.thumbnail_url` if signed URL generation fails

**Checkpoint**: Lightbox displays photos correctly with proper loading and error states

---

## Phase 4: User Story 2 - Persistent Favorites and Picks (Priority: P1)

**Goal**: Ensure client favorites and picks persist across page refresh and tab navigation

**Independent Test**: Mark 3 photos as favorites, 2 as picks, refresh page, verify all 5 selections persist

**Note**: Backend fix in Phase 2 (T006-T007) is the primary fix. This phase handles frontend verification.

### Implementation for User Story 2

- [x] T015 [US2] Verify `localFavorites` Map in `frontend/src/pages/public/PublicGalleryPage.tsx` correctly initializes from API `favorites_count` (lines 199-205)
- [x] T016 [US2] Verify `localSelections` Set correctly initializes from API `is_selected` field
- [x] T017 [US2] Test optimistic update rollback in `handleToggleFavorite` when API call fails
- [x] T018 [US2] Test optimistic update rollback in `handleToggleSelection` when API call fails
- [x] T019 [US2] Add error toast notification when favorite/pick API calls fail

**Checkpoint**: Favorites and picks persist correctly across refreshes and show errors on failure

---

## Phase 5: User Story 3 - Visible Client Picks Badge (Priority: P2)

**Goal**: Display prominent "Client Pick" badge on photo thumbnails when marked as picks

**Independent Test**: Mark photo as pick, verify "Pick" badge visible on thumbnail without hovering

### Implementation for User Story 3

- [x] T020 [US3] Read status badges section in `frontend/src/components/features/gallery/PhotoCard.tsx` lines 288-334
- [x] T021 [US3] Add "Client Pick" badge component after Private badge in `frontend/src/components/features/gallery/PhotoCard.tsx` - use same styling pattern as Cover badge
- [x] T022 [US3] Import `Bookmark` icon from lucide-react if not already imported in PhotoCard.tsx
- [x] T023 [US3] Style badge with `bg-success/90 backdrop-blur-sm` to match design system

**Checkpoint**: Picked photos show visible "Pick" badge on thumbnails

---

## Phase 6: User Story 4 - Download Photos (Priority: P2)

**Goal**: Fix download button functionality when gallery download policy allows it

**Independent Test**: Access Magic Link with downloads enabled, click download button, verify file downloads

### Implementation for User Story 4

- [x] T024 [US4] Read `handleAssetDownload` in `frontend/src/pages/public/PublicGalleryPage.tsx` lines 488-539
- [x] T025 [US4] Verify download URL is correctly generated using signed URL
- [x] T026 [US4] Add console logging to debug download flow (remove after fix)
- [x] T027 [US4] Verify blob download mechanism triggers browser download dialog
- [x] T028 [US4] Add loading state and success/error toast for download action

**Checkpoint**: Downloads work correctly when policy allows

---

## Phase 7: User Story 5 - Share Individual Photos (Priority: P2)

**Goal**: Fix share button to open share menu/copy link functionality

**Independent Test**: Click share button on photo, verify share menu appears with copy link option

### Implementation for User Story 5

- [x] T029 [US5] Read `handleAssetShare` in `frontend/src/pages/public/PublicGalleryPage.tsx` lines 541-577
- [x] T030 [US5] Add `onAssetShare={handleAssetShare}` prop to GalleryCanvas component in `frontend/src/pages/public/PublicGalleryPage.tsx` around line 1314
- [x] T031 [US5] Verify share handler uses Web Share API with fallback to copy-to-clipboard
- [x] T032 [US5] Add success toast when link is copied to clipboard

**Checkpoint**: Share button works and shows share options

---

## Phase 8: User Story 6 - Remove Delete Button (Priority: P3)

**Goal**: Verify delete button does not appear in Magic Link/public gallery view

**Independent Test**: Access Magic Link, hover over photos, verify no delete button in action bar

### Implementation for User Story 6

- [x] T033 [US6] Verify `onAssetDelete` is NOT passed to GalleryCanvas in `frontend/src/pages/public/PublicGalleryPage.tsx`
- [x] T034 [US6] Verify HoverOverlay conditional rendering `{onDelete && (...)}` correctly hides delete button when prop is undefined
- [x] T035 [US6] If delete button still appears, trace prop chain through PhotoGrid → PhotoCard → HoverOverlay to find source

**Checkpoint**: Delete button confirmed not visible in public view

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [ ] T036 [P] Run full manual test flow per `specs/014-fix-magic-link-grid/quickstart.md`
- [x] T037 [P] Remove any console.log debug statements added during fixes
- [x] T038 Run `npm run lint` in both frontend and backend directories
- [x] T039 Run `npm run build` to verify no TypeScript errors
- [x] T040 Update research.md with any additional findings discovered during implementation
- [x] T041 Create commit with conventional format: `fix(magic-link): fix photo grid functionality in public gallery`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS US1 and US2 from working properly
- **User Stories (Phase 3-8)**: All depend on Foundational phase for backend fix
  - US1 and US2 (P1) can proceed after Phase 2
  - US3, US4, US5, US6 (P2/P3) can start after Phase 2 but are independent
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1 - Lightbox)**: Depends on Phase 2 backend fix for proper URLs
- **US2 (P1 - Persistence)**: REQUIRES Phase 2 backend fix (T006-T007) to work
- **US3 (P2 - Pick Badge)**: Independent - frontend only, no backend dependency
- **US4 (P2 - Download)**: Independent - may need backend URL generation
- **US5 (P2 - Share)**: Independent - frontend prop wiring only
- **US6 (P3 - Delete Button)**: Independent - verification only

### Parallel Opportunities

- T003 and T004 can run in parallel (different services)
- US3, US4, US5, US6 are all independent and can be worked in parallel
- T036 and T037 can run in parallel
- All tasks within same user story marked [P] can run in parallel

---

## Parallel Example: Independent Bug Fixes

```bash
# After Phase 2 completes, these user stories can all start in parallel:
# Developer A:
Task: US3 - Add Client Pick badge in PhotoCard.tsx
Task: US5 - Wire onAssetShare in PublicGalleryPage.tsx

# Developer B:
Task: US4 - Debug download flow
Task: US6 - Verify delete button hidden
```

---

## Implementation Strategy

### MVP First (Phase 1-4)

1. Complete Phase 1: Setup (5 min)
2. Complete Phase 2: Foundational backend fix (30 min) - **CRITICAL**
3. Complete Phase 3: User Story 1 - Lightbox (45 min)
4. Complete Phase 4: User Story 2 - Persistence (15 min - mostly verification)
5. **STOP and VALIDATE**: Test lightbox and persistence independently
6. Deploy/demo P1 fixes if needed

### Incremental Delivery

1. Setup + Foundational → Backend works correctly
2. Add US1 (Lightbox) + US2 (Persistence) → Core functionality fixed (MVP!)
3. Add US3 (Pick Badge) → Better visibility
4. Add US4 (Download) + US5 (Share) → Full action bar working
5. Add US6 (Delete verification) → Security confirmed
6. Polish → Production ready

### Single Developer Strategy

1. Complete Setup + Foundational (Phase 1-2)
2. Work through user stories in priority order: US1 → US2 → US3 → US4 → US5 → US6
3. Commit after each user story completion
4. Run polish phase after all stories complete

---

## Notes

- This is a bug-fix feature - no new models or database schema required
- Primary root cause is backend SQL at line 2035 (Phase 2)
- Frontend fixes are mostly prop wiring and error handling
- Total estimated effort: ~3-4 hours for all phases
- MVP (P1 fixes only): ~1.5 hours
