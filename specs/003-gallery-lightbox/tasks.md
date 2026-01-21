# Tasks: Gallery Lightbox & Media Viewing

**Input**: Design documents from `/specs/003-gallery-lightbox/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests included per Testing skill guidelines (Vitest unit, Playwright E2E)

**Organization**: Tasks grouped by user story with full integration across gallery-service and upload-service.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US10)
- All paths relative to repository root

## Path Conventions (from plan.md)

- **Components**: `apps/web/src/components/lightbox/`
- **Hooks**: `apps/web/src/components/lightbox/hooks/`
- **Portal Hooks**: `apps/web/src/hooks/portal/`
- **API Client**: `apps/web/src/api/`
- **Contexts**: `apps/web/src/contexts/`
- **Styles**: `apps/web/src/components/lightbox/styles/`
- **Types**: `packages/types/src/lightbox.ts`
- **Unit Tests**: `apps/web/tests/components/lightbox/`
- **E2E Tests**: `apps/web/tests/e2e/`

## Integration Points (from gallery-service)

| Feature | Endpoint | Auth |
|---------|----------|------|
| Portal Access | `GET /portal/:token` | None |
| Verify PIN/Password | `POST /portal/:token/verify` | None (rate limited) |
| Get Assets | `GET /portal/:token/assets` | Session Token |
| Get Single Asset | `GET /portal/:token/assets/:id` | Session Token |
| Download URL | `GET /portal/:token/assets/:id/download` | Session + Permission |
| Get Sections | `GET /portal/:token/sections` | Session Token |
| Get Permissions | `GET /portal/:token/session` | Session Token |
| Add Favorite | `POST /portal/:token/favorites` | Session + Permission |
| Remove Favorite | `DELETE /portal/:token/favorites/asset/:id` | Session + Permission |
| Get Comments | `GET /portal/:token/comments/asset/:id` | Session Token |
| Add Comment | `POST /portal/:token/comments` | Session + Permission |
| Submit Selection | `POST /portal/:token/selection` | Session + Permission |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and type definitions

- [x] T001 Create lightbox directory structure in `apps/web/src/components/lightbox/`
- [x] T002 [P] Create LightboxState and LightboxAction types in `packages/types/src/lightbox.ts`
- [x] T003 [P] Create LightboxAsset extended type (with thumbnailUrl, displayUrl, downloadUrl, signedUrlExpiry) in `packages/types/src/lightbox.ts`
- [x] T004 [P] Create SlideshowConfig and ZoomConfig types in `packages/types/src/lightbox.ts`
- [x] T005 [P] Create GestureConfig types in `packages/types/src/lightbox.ts`
- [x] T005A [P] Create PortalPermissions interface (canFavorite, canComment, canDownload, canSelect, downloadPolicy) in `packages/types/src/lightbox.ts`
- [x] T005B [P] Create PortalSession and PortalAccessInfo types in `packages/types/src/lightbox.ts`
- [x] T006 Export lightbox types from `packages/types/src/index.ts`
- [x] T007 [P] Create base CSS variables in `apps/web/src/components/lightbox/styles/lightbox.css`
- [x] T008 [P] Create liquid glass styles in `apps/web/src/components/lightbox/styles/lightbox-glass.css`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure for all lightbox features - MUST complete before user stories

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T009 Create lightbox state reducer in `apps/web/src/components/lightbox/LightboxContext.tsx`
- [x] T010 Create LightboxProvider context with useReducer in `apps/web/src/components/lightbox/LightboxContext.tsx`
- [x] T011 Create useLightbox custom hook for context access in `apps/web/src/components/lightbox/LightboxContext.tsx`
- [x] T012 [P] Create useLightboxPreload hook for image preloading in `apps/web/src/components/lightbox/hooks/useLightboxPreload.ts`
- [x] T013 Create public exports barrel file in `apps/web/src/components/lightbox/index.ts`

**Checkpoint**: Foundation ready - proceed to API integration layer

---

## Phase 2.5: API Integration Layer (Cross-cutting)

**Purpose**: Connect lightbox to gallery-service APIs with proper session management

**CRITICAL**: These tasks establish the data layer - all user story implementations depend on these

### Session Management

- [x] T013A [P] Create PortalSessionContext for session token storage in `apps/web/src/contexts/PortalSessionContext.tsx`
- [x] T013B [P] Create usePortalSession hook exposing token, permissions, isAuthenticated in `apps/web/src/hooks/portal/usePortalSession.ts`
- [x] T013C Create session token persistence (sessionStorage) with 24hr expiry check in `apps/web/src/hooks/portal/usePortalSession.ts`

### API Client Layer

- [x] T013D Create portal API client with axios/fetch wrapper in `apps/web/src/api/portal.api.ts`
- [x] T013E Add X-Correlation-Id header generation to API client in `apps/web/src/api/portal.api.ts`
- [x] T013F Add 403 response interceptor for signed URL refresh in `apps/web/src/api/portal.api.ts`
- [x] T013G Add 401 response interceptor for session expiry handling (PORTAL_SESSION_EXPIRED) in `apps/web/src/api/portal.api.ts`

### Data Fetching Hooks

- [x] T013H Create usePortalAssets hook with React Query (GET /portal/:token/assets) in `apps/web/src/hooks/portal/usePortalAssets.ts`
- [x] T013I Create usePortalAsset hook for single asset with signed URLs in `apps/web/src/hooks/portal/usePortalAsset.ts`
- [x] T013J Create usePortalSections hook (GET /portal/:token/sections) in `apps/web/src/hooks/portal/usePortalSections.ts`
- [x] T013K Create usePortalPermissions hook (GET /portal/:token/session) in `apps/web/src/hooks/portal/usePortalPermissions.ts`

### Offline Support Infrastructure

- [x] T013L [P] Create MutationQueue class for offline operations in `apps/web/src/utils/mutationQueue.ts`
- [x] T013M [P] Create useOnlineStatus hook for network detection in `apps/web/src/hooks/useOnlineStatus.ts`
- [x] T013N Create useSyncMutations hook that processes queue when online in `apps/web/src/hooks/portal/useSyncMutations.ts`

**Checkpoint**: API layer ready - all user stories can now fetch/mutate data

---

## Phase 3: User Story 1 - View Photo in Full Screen

**Goal**: Open photos in immersive full-screen lightbox with LQIP loading

**Integration**: Uses usePortalAsset hook for signed URL fetching, handles 403 with auto-refresh

### Unit Tests for User Story 1

- [x] T014 [P] [US1] Unit test for Lightbox open/close states in `apps/web/tests/components/lightbox/Lightbox.test.tsx`
- [x] T015 [P] [US1] Unit test for LightboxImage LQIP loading in `apps/web/tests/components/lightbox/LightboxImage.test.tsx`

### Implementation for User Story 1

- [x] T016 [P] [US1] Create Lightbox main container with AnimatePresence in `apps/web/src/components/lightbox/Lightbox.tsx`
- [x] T017 [P] [US1] Create LightboxBackdrop with blur effect in `apps/web/src/components/lightbox/Lightbox.tsx`
- [x] T018 [US1] Create LightboxImage with LQIP blur-up loading (uses usePortalAsset for signed URLs) in `apps/web/src/components/lightbox/LightboxImage.tsx`
- [x] T019 [US1] Add close button with glass styling in `apps/web/src/components/lightbox/Lightbox.tsx`
- [x] T020 [US1] Create useLightboxKeyboard hook with Escape handling in `apps/web/src/components/lightbox/hooks/useLightboxKeyboard.ts`
- [x] T021 [US1] Create LightboxGestures wrapper for swipe-to-dismiss in `apps/web/src/components/lightbox/LightboxGestures.tsx`
- [x] T022 [US1] Add ARIA labels and focus trap for accessibility in `apps/web/src/components/lightbox/Lightbox.tsx`
- [x] T023 [US1] Add reduced motion support (prefers-reduced-motion) in `apps/web/src/components/lightbox/styles/lightbox.css`

**Checkpoint**: Lightbox opens/closes with LQIP loading

---

## Phase 4: User Story 2 - Navigate Between Photos

**Goal**: Navigate gallery without closing lightbox via keyboard, swipe, and filmstrip

**Integration**: Uses usePortalAssets for paginated asset list, preloads adjacent images

### Unit Tests for User Story 2

- [x] T024 [P] [US2] Unit test for navigation actions (next/prev) in `apps/web/tests/components/lightbox/hooks/useLightboxNavigation.test.ts`
- [x] T025 [P] [US2] Unit test for filmstrip selection in `apps/web/tests/components/lightbox/LightboxFilmstrip.test.tsx`

### Implementation for User Story 2

- [x] T026 [US2] Add arrow key handlers to useLightboxKeyboard in `apps/web/src/components/lightbox/hooks/useLightboxKeyboard.ts`
- [x] T027 [US2] Create useLightboxNavigation hook with preload triggers (uses usePortalAssets) in `apps/web/src/components/lightbox/hooks/useLightboxNavigation.ts`
- [x] T028 [US2] Add horizontal swipe gestures for navigation in `apps/web/src/components/lightbox/LightboxGestures.tsx`
- [x] T029 [US2] Create LightboxNavigation floating pill component in `apps/web/src/components/lightbox/LightboxNavigation.tsx`
- [x] T030 [US2] Create LightboxFilmstrip thumbnail strip in `apps/web/src/components/lightbox/LightboxFilmstrip.tsx`
- [x] T031 [US2] Add position counter ("3 of 24") to navigation in `apps/web/src/components/lightbox/LightboxNavigation.tsx`
- [x] T032 [US2] Add end-of-gallery visual feedback in `apps/web/src/components/lightbox/LightboxNavigation.tsx`
- [x] T033 [US2] Add smooth image transition animations in `apps/web/src/components/lightbox/LightboxImage.tsx`

**Checkpoint**: Full navigation working

---

## Phase 5: User Story 3 - Favorite Photos

**Goal**: Mark photos as favorites with optimistic UI and offline support

**Integration**: Uses useFavorite hook with POST /portal/:token/favorites, respects canFavorite permission

### Unit Tests for User Story 3

- [x] T034 [P] [US3] Unit test for favorite toggle with optimistic UI in `apps/web/tests/hooks/portal/useFavorite.test.ts`

### Implementation for User Story 3

- [x] T035 [US3] Create useFavorite hook with React Query mutation (POST /portal/:token/favorites) in `apps/web/src/hooks/portal/useFavorite.ts`
- [x] T036 [US3] Add optimistic update and rollback on 403/401 in `apps/web/src/hooks/portal/useFavorite.ts`
- [x] T037 [US3] Create LightboxToolbar vertical action sidebar in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T038 [US3] Add FavoriteButton to toolbar with heart icon in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T039 [US3] Add favorite permission check via usePortalPermissions (hide if !canFavorite) in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T040 [US3] Add offline queue integration with MutationQueue (T013L) in `apps/web/src/hooks/portal/useFavorite.ts`
- [x] T041 [US3] Add keyboard shortcut 'F' for favorite in `apps/web/src/components/lightbox/hooks/useLightboxKeyboard.ts`

**Checkpoint**: Favorites working with optimistic UI and offline support

---

## Phase 6: User Story 4 - Run Slideshow Presentation

**Goal**: Automated slideshow with Ken Burns effect and configurable timing

**Integration**: Uses navigation hooks, persists settings to localStorage

### Unit Tests for User Story 4

- [x] T042 [P] [US4] Unit test for slideshow timer and Ken Burns in `apps/web/tests/components/lightbox/hooks/useLightboxSlideshow.test.ts`

### Implementation for User Story 4

- [x] T043 [US4] Create useLightboxSlideshow hook with timer in `apps/web/src/components/lightbox/hooks/useLightboxSlideshow.ts`
- [x] T044 [US4] Add Ken Burns animation variants to LightboxImage in `apps/web/src/components/lightbox/LightboxImage.tsx`
- [x] T045 [US4] Add play/pause button to LightboxNavigation pill in `apps/web/src/components/lightbox/LightboxNavigation.tsx`
- [x] T046 [US4] Create LightboxSlideshow settings popover in `apps/web/src/components/lightbox/LightboxSlideshow.tsx`
- [x] T047 [US4] Add interval options (3s, 5s, 8s, 10s, 15s, 30s) in `apps/web/src/components/lightbox/LightboxSlideshow.tsx`
- [x] T048 [US4] Add loop and shuffle toggles in `apps/web/src/components/lightbox/LightboxSlideshow.tsx`
- [x] T049 [US4] Add UI auto-hide after 3s inactivity in `apps/web/src/components/lightbox/Lightbox.tsx`
- [x] T050 [US4] Add spacebar shortcut for pause/resume in `apps/web/src/components/lightbox/hooks/useLightboxKeyboard.ts`
- [x] T051 [US4] Persist slideshow settings to localStorage in `apps/web/src/components/lightbox/hooks/useLightboxSlideshow.ts`

**Checkpoint**: Professional slideshow mode complete

---

## Phase 7: User Story 5 - Zoom and Inspect Details

**Goal**: Pinch/double-tap/scroll zoom with pan constraints

**Integration**: Works with signed URLs, defers zoom until full image loaded

### Unit Tests for User Story 5

- [x] T052 [P] [US5] Unit test for zoom levels and boundaries in `apps/web/tests/components/lightbox/hooks/useLightboxZoom.test.ts`

### Implementation for User Story 5

- [x] T053 [US5] Create useLightboxZoom hook with level constraints (1x-4x) in `apps/web/src/components/lightbox/hooks/useLightboxZoom.ts`
- [x] T054 [US5] Add pinch gesture handler in `apps/web/src/components/lightbox/LightboxGestures.tsx`
- [x] T055 [US5] Add scroll wheel zoom handler in `apps/web/src/components/lightbox/LightboxGestures.tsx`
- [x] T056 [US5] Add double-tap zoom toggle in `apps/web/src/components/lightbox/LightboxGestures.tsx`
- [x] T057 [US5] Add pan gesture with boundary constraints in `apps/web/src/components/lightbox/LightboxGestures.tsx`
- [x] T058 [US5] Add zoom limit feedback animation in `apps/web/src/components/lightbox/LightboxImage.tsx`
- [x] T059 [US5] Add zoom indicator UI overlay in `apps/web/src/components/lightbox/Lightbox.tsx`
- [x] T060 [US5] Add keyboard shortcuts +/- for zoom in `apps/web/src/components/lightbox/hooks/useLightboxKeyboard.ts`

**Checkpoint**: Zoom and pan fully functional

---

## Phase 8: User Story 6 - Compare Photos Side by Side

**Goal**: 2-up comparison with synchronized zoom/pan

**Integration**: Uses filmstrip for photo selection, syncs zoom state across slots

### Implementation for User Story 6

- [x] T061 [P] [US6] Create CompareState types in `packages/types/src/lightbox.ts`
- [x] T062 [US6] Create LightboxCompare split-screen layout in `apps/web/src/components/lightbox/LightboxCompare.tsx`
- [x] T063 [US6] Add synchronized zoom/pan across slots in `apps/web/src/components/lightbox/LightboxCompare.tsx`
- [x] T064 [US6] Add slot selection from filmstrip in `apps/web/src/components/lightbox/LightboxCompare.tsx`
- [x] T065 [US6] Add swap button to exchange positions in `apps/web/src/components/lightbox/LightboxCompare.tsx`
- [x] T066 [US6] Add compare mode toggle to toolbar in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T067 [US6] Add keyboard shortcut 'M' for compare mode in `apps/web/src/components/lightbox/hooks/useLightboxKeyboard.ts`

**Checkpoint**: Compare mode functional

---

## Phase 9: User Story 7 - View Photo Information

**Goal**: EXIF metadata panel with photo statistics

**Integration**: Metadata comes from usePortalAsset response (camera, lens, aperture, ISO, etc.)

### Implementation for User Story 7

- [x] T068 [US7] Create LightboxInfoPanel slide-in component in `apps/web/src/components/lightbox/LightboxInfoPanel.tsx`
- [x] T069 [US7] Display EXIF metadata (camera, lens, aperture, etc.) in `apps/web/src/components/lightbox/LightboxInfoPanel.tsx`
- [x] T070 [US7] Display photo statistics (views, favorites, downloads) in `apps/web/src/components/lightbox/LightboxInfoPanel.tsx`
- [x] T071 [US7] Add info button to toolbar in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T072 [US7] Add keyboard shortcut 'I' for info panel in `apps/web/src/components/lightbox/hooks/useLightboxKeyboard.ts`
- [x] T073 [US7] Add mobile bottom sheet variant for info panel in `apps/web/src/components/lightbox/LightboxInfoPanel.tsx`

**Checkpoint**: Info panel complete

---

## Phase 10: User Story 8 - Download Photos

**Goal**: Download photos per gallery policy with progress indicator

**Integration**: Uses GET /portal/:token/assets/:id/download, respects downloadPolicy (VIEW_ONLY, WEB_ONLY, WATERMARKED, ORIGINAL)

### Implementation for User Story 8

- [x] T074 [US8] Create useDownload hook (GET /portal/:token/assets/:id/download) with progress tracking in `apps/web/src/hooks/portal/useDownload.ts`
- [x] T075 [US8] Add DownloadButton to toolbar with loading state in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T076 [US8] Add download permission check via usePortalPermissions (hide if !canDownload, respect downloadPolicy) in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T077 [US8] Add download progress indicator in `apps/web/src/components/lightbox/LightboxToolbar.tsx`

**Checkpoint**: Downloads functional with policy enforcement

---

## Phase 11: User Story 9 - Add Comments to Photos

**Goal**: Comments panel with threaded replies

**Integration**: Uses GET/POST /portal/:token/comments/asset/:id, respects canComment permission

### Implementation for User Story 9

- [x] T078 [US9] Create useComments hook with React Query (GET/POST /portal/:token/comments/asset/:id) in `apps/web/src/hooks/portal/useComments.ts`
- [x] T079 [US9] Create LightboxCommentsPanel slide-in component in `apps/web/src/components/lightbox/LightboxCommentsPanel.tsx`
- [x] T080 [US9] Add comment input form with submit in `apps/web/src/components/lightbox/LightboxCommentsPanel.tsx`
- [x] T081 [US9] Display comment thread with timestamps in `apps/web/src/components/lightbox/LightboxCommentsPanel.tsx`
- [x] T082 [US9] Add comment button to toolbar in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T083 [US9] Add comment permission check via usePortalPermissions (hide if !canComment) in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T084 [US9] Add keyboard shortcut 'C' for comments in `apps/web/src/components/lightbox/hooks/useLightboxKeyboard.ts`

**Checkpoint**: Comments functional

---

## Phase 12: User Story 10 - Make Proofing Selections

**Goal**: Select/pick photos for proofing workflow

**Integration**: Uses POST /portal/:token/selection, respects canSelect permission, handles locked state

### Implementation for User Story 10

- [x] T085 [US10] Create useSelection hook with React Query (GET/POST /portal/:token/selection) in `apps/web/src/hooks/portal/useSelection.ts`
- [x] T086 [US10] Add SelectionButton (checkmark) to toolbar in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T087 [US10] Add selection count badge indicator in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T088 [US10] Add selection permission check via usePortalPermissions (hide if !canSelect) in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T089 [US10] Handle locked selections state (isLocked) with "Selections locked by photographer" message in `apps/web/src/components/lightbox/LightboxToolbar.tsx`
- [x] T090 [US10] Add keyboard shortcut 'P' for selection in `apps/web/src/components/lightbox/hooks/useLightboxKeyboard.ts`

**Checkpoint**: Selection workflow complete

---

## Phase 13: Polish & Cross-Cutting Concerns

**Purpose**: Accessibility, performance, error handling, and integration verification

### Accessibility & Performance

- [x] T091 [P] Add comprehensive ARIA live regions for state changes in `apps/web/src/components/lightbox/Lightbox.tsx`
- [x] T092 [P] Add high contrast mode support in `apps/web/src/components/lightbox/styles/lightbox.css`
- [x] T093 [P] Add service worker caching for offline images in `apps/web/src/components/lightbox/hooks/useLightboxPreload.ts`
- [x] T094 [P] Add signed URL auto-refresh on 403 error (uses T013F interceptor) in `apps/web/src/components/lightbox/LightboxImage.tsx`
- [x] T095 [P] Add error boundary for image load failures in `apps/web/src/components/lightbox/LightboxImage.tsx`
- [x] T096 [P] Add virtual list for filmstrip performance (5000+ images) in `apps/web/src/components/lightbox/LightboxFilmstrip.tsx`
- [x] T097 Add keyboard shortcut 'G' for filmstrip toggle in `apps/web/src/components/lightbox/hooks/useLightboxKeyboard.ts`

### Error Handling Scenarios

- [x] T095A [P] Handle PORTAL_SESSION_EXPIRED (401) with re-auth prompt in `apps/web/src/components/lightbox/LightboxErrorBoundary.tsx`
- [x] T095B [P] Handle rate limit exceeded (429) with retry-after countdown in `apps/web/src/components/lightbox/LightboxErrorBoundary.tsx`
- [x] T095C [P] Handle gallery expired/revoked (410/403) with friendly message in `apps/web/src/components/lightbox/LightboxErrorBoundary.tsx`
- [x] T095D [P] Handle network errors with offline fallback UI in `apps/web/src/components/lightbox/LightboxErrorBoundary.tsx`

### E2E Integration Tests (Cross-Service Verification)

- [x] T098 [P] Create E2E test for lightbox user journey in `apps/web/tests/e2e/lightbox.spec.ts`
- [x] T098A [P] E2E: Protected gallery PIN/password verification flow in `apps/web/tests/e2e/lightbox-auth.spec.ts`
- [x] T098B [P] E2E: Signed URL expiration and auto-refresh during viewing in `apps/web/tests/e2e/lightbox-urls.spec.ts`
- [x] T098C [P] E2E: Favorite sync with gallery-service (optimistic + server confirmation) in `apps/web/tests/e2e/lightbox-favorites.spec.ts`
- [x] T098D [P] E2E: Offline mode with mutation queue sync on reconnect in `apps/web/tests/e2e/lightbox-offline.spec.ts`
- [x] T098E [P] E2E: Permission-based UI rendering (toolbar buttons visibility) in `apps/web/tests/e2e/lightbox-permissions.spec.ts`
- [x] T098F [P] E2E: Selection submission and lock state handling in `apps/web/tests/e2e/lightbox-selections.spec.ts`

### Final Validation

- [x] T099 Run Lighthouse accessibility audit and fix violations
- [x] T100 Run performance profiling and optimize animations

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup           → No dependencies
Phase 2: Foundational    → Depends on Phase 1
Phase 2.5: API Layer     → Depends on Phase 2 (CRITICAL: All user stories depend on this)
Phase 3-12: User Stories → Depends on Phase 2.5
Phase 13: Polish         → Depends on all user stories complete
```

### Cross-Service Dependencies

| Lightbox Feature | Gallery Service Endpoint | Upload Service |
|-----------------|-------------------------|----------------|
| Open lightbox | GET /portal/:token/assets | Signed URLs from R2 |
| Favorites | POST/DELETE /portal/:token/favorites | - |
| Comments | GET/POST /portal/:token/comments/asset/:id | - |
| Downloads | GET /portal/:token/assets/:id/download | Decryption params |
| Selections | POST /portal/:token/selection | - |
| Permissions | GET /portal/:token/session | - |

### User Story Dependencies

| Story | Can Start After | Integration Notes |
|-------|-----------------|-------------------|
| US1 (View) | Phase 2.5 | Uses usePortalAsset for signed URLs |
| US2 (Navigate) | Phase 2.5 | Uses usePortalAssets for pagination |
| US3 (Favorite) | Phase 2.5 | Uses useFavorite + MutationQueue |
| US4 (Slideshow) | US2 | Uses navigation hooks |
| US5 (Zoom) | US1 | Uses gesture wrapper |
| US6 (Compare) | US2 | Uses filmstrip from US2 |
| US7 (Info) | US1 | Uses asset metadata |
| US8 (Download) | Phase 2.5 | Uses useDownload + permissions |
| US9 (Comments) | Phase 2.5 | Uses useComments + permissions |
| US10 (Selection) | Phase 2.5 | Uses useSelection + permissions |

### Within Each User Story

1. Tests → FAIL first (TDD)
2. Types/models
3. Hooks/services
4. UI components
5. Integration
6. Accessibility
7. Story checkpoint

---

## Parallel Opportunities

### Phase 1 (All tasks parallel)
```
T002 [P] Create LightboxState types
T003 [P] Create LightboxAsset types
T004 [P] Create SlideshowConfig types
T005 [P] Create GestureConfig types
T005A [P] Create PortalPermissions types
T005B [P] Create PortalSession types
T007 [P] Create base CSS
T008 [P] Create glass CSS
```

### Phase 2.5 (After T009-T013)
```
T013A [P] PortalSessionContext
T013B [P] usePortalSession hook
T013L [P] MutationQueue class
T013M [P] useOnlineStatus hook
```

### Phase 13 (After all user stories)
```
T091-T097 [P] Accessibility and performance tasks
T095A-D [P] Error handling tasks
T098A-F [P] E2E integration tests
```

### Cross-Story Parallel (Different developers)
```
Developer A: US1 → US2 → US5 (core viewing)
Developer B: US3 → US4 (engagement)
Developer C: US6 → US7 → US8 → US9 → US10 (advanced)
```

---

## Summary

| Category | Count |
|----------|-------|
| **Total Tasks** | 126 |
| **Setup Tasks** | 10 |
| **Foundational Tasks** | 5 |
| **API Integration Tasks** | 14 |
| **US1 Tasks** | 10 |
| **US2 Tasks** | 10 |
| **US3 Tasks** | 8 |
| **US4 Tasks** | 10 |
| **US5 Tasks** | 9 |
| **US6 Tasks** | 7 |
| **US7 Tasks** | 6 |
| **US8 Tasks** | 4 |
| **US9 Tasks** | 7 |
| **US10 Tasks** | 6 |
| **Polish Tasks** | 10 |
| **Error Handling Tasks** | 4 |
| **E2E Integration Tests** | 6 |
| **Parallel Opportunities** | 45 tasks marked [P] |

### All Features Required

All 10 user stories are required for production deployment:
- **US1**: View Photo in Full Screen
- **US2**: Navigate Between Photos
- **US3**: Favorite Photos
- **US4**: Run Slideshow Presentation
- **US5**: Zoom and Inspect Details
- **US6**: Compare Photos Side by Side
- **US7**: View Photo Information
- **US8**: Download Photos
- **US9**: Add Comments to Photos
- **US10**: Make Proofing Selections

### Quality Gates

1. Phase 2.5 Complete → API layer ready, all hooks working
2. Phase 3-4 Complete → Core viewing functional
3. Phase 5-7 Complete → Engagement features done
4. Phase 8-12 Complete → Advanced features done
5. Phase 13 Complete → Accessibility audit passed, E2E tests green

### Deployment Checklist

- [ ] All user stories pass acceptance tests
- [ ] Lighthouse accessibility score > 90
- [ ] 60fps on iOS Safari 16+, Chrome 100+, Firefox 115+, Edge 100+
- [ ] Offline mode works (cached images accessible)
- [ ] Dark/light theme tested
- [ ] Reduced motion tested
- [ ] Keyboard-only navigation verified
- [ ] Screen reader tested (VoiceOver/NVDA)
- [ ] All E2E integration tests passing (T098A-F)
- [ ] Session token lifecycle verified
- [ ] Signed URL refresh working
