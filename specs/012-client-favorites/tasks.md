# Implementation Tasks: Client Favorites System

**Feature**: 012-client-favorites
**Date**: December 29, 2025
**Total Tasks**: 68
**Estimated Complexity**: Medium-High

---

## Task Legend

| Marker | Meaning |
|--------|---------|
| `[P]` | Parallelizable - can run concurrently with other [P] tasks in same phase |
| `[US1]` | Belongs to User Story 1: Client Marks Photos as Favorites |
| `[US2]` | Belongs to User Story 2: View All Favorites in One Place |
| `[US3]` | Belongs to User Story 3: Create Multiple Favorite Lists |
| `[US4]` | Belongs to User Story 4: Download Favorites as ZIP |
| `[US5]` | Belongs to User Story 5: Photographer Views Client Favorites |
| `[US6]` | Belongs to User Story 6: Share Favorites with Others |
| `[CORE]` | Core infrastructure required by multiple stories |

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│                     Implementation Order                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Phase 1: Setup                                                  │
│     └── Migration 0053, Dependencies                             │
│              │                                                   │
│              ▼                                                   │
│  Phase 2: Foundational [CORE]                                    │
│     └── Repository, Base Service, Client Token Utils             │
│              │                                                   │
│      ┌───────┴───────┐                                          │
│      ▼               ▼                                          │
│  Phase 3: US1+US2   Phase 5: US5 ←─── Can run in parallel       │
│  (P1 - Core)        (P2 - Analytics)                            │
│      │                   │                                       │
│      ▼                   │                                       │
│  Phase 4: US3            │                                       │
│  (P2 - Lists)            │                                       │
│      │                   │                                       │
│      ├───────────────────┘                                       │
│      ▼                                                           │
│  Phase 6: US4                                                    │
│  (P2 - Downloads) ←─── Requires US3 (lists)                      │
│      │                                                           │
│      ▼                                                           │
│  Phase 7: US6                                                    │
│  (P3 - Sharing) ←─── Requires US3 (lists)                        │
│      │                                                           │
│      ▼                                                           │
│  Phase 8: Polish                                                 │
│     └── Integration Tests, E2E, Documentation                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Parallel Execution Opportunities

| Parallel Set | Tasks | Notes |
|--------------|-------|-------|
| **Set A** | US1+US2 backend, US5 backend | Independent API domains |
| **Set B** | US1+US2 frontend, US5 frontend | After respective backends |
| **Set C** | US4 worker, US6 backend | After US3 complete |
| **Set D** | Unit tests per story | After each story's implementation |

---

## Phase 1: Setup & Infrastructure

### 1.1 Database Migration

- [x] [T001] [P] [CORE] Create migration file `backend/migrations/versions/0055_client_favorites.py`
- [x] [T002] [CORE] Add `favorite_lists` table with columns: list_id, workspace_id, gallery_id, client_token, name, is_default, sort_order, created_at, updated_at
- [x] [T003] [CORE] Add `favorite_shares` table with columns: share_id, list_id, share_token, expires_at, access_count, created_at, last_accessed_at
- [x] [T004] [CORE] Add `favorite_downloads` table with columns: download_id, list_id, status, progress, file_size_bytes, download_url, error_message, expires_at, created_at, completed_at
- [x] [T005] [CORE] Add `list_id` column to `client_interactions` table with FK to favorite_lists
- [x] [T006] [CORE] Create indexes: idx_fl_gallery_client, idx_fl_workspace, idx_fs_token, idx_fs_list, idx_fd_list_status, idx_ci_list
- [x] [T007] [CORE] Create materialized view `gallery_favorites_summary` for photographer analytics
- [ ] [T008] [CORE] Run migration and verify tables in dev environment

### 1.2 Dependencies

- [x] [T009] [P] [CORE] Add `zipstream-ng` to backend requirements for streaming ZIP generation
- [x] [T010] [P] [CORE] Verify Redis configuration for download job queue (existing Redis setup sufficient)

---

## Phase 2: Foundational Components [CORE]

### 2.1 Backend Repository Layer

- [x] [T011] [P] [CORE] Create `backend/src/app/repositories/favorites_repository.py` with base CRUD for favorite_lists
- [x] [T012] [CORE] Add `get_or_create_default_list(gallery_id, client_token)` method to favorites_repository
- [x] [T013] [CORE] Add `get_lists_by_client(gallery_id, client_token)` method to favorites_repository
- [x] [T014] [CORE] Add `get_list_photo_count(list_id)` method using client_interactions join

### 2.2 Client Token Utilities

- [x] [T015] [P] [CORE] Create `backend/src/app/utils/client_token.py` with X-Client-Token header extraction
- [x] [T016] [CORE] Add `validate_client_token(token: str) -> bool` function (format validation)
- [x] [T017] [CORE] Create `get_client_token` FastAPI dependency for header injection

### 2.3 Base Service

- [x] [T018] [CORE] Create `backend/src/app/services/favorites_service.py` with FavoritesService class
- [x] [T019] [CORE] Implement `_ensure_gallery_accessible(gallery_id)` helper for published gallery check
- [x] [T020] [CORE] Implement `_ensure_asset_in_gallery(gallery_id, asset_id)` helper for asset validation

### 2.4 Frontend Service Foundation

- [x] [T021] [P] [CORE] Create `frontend/src/services/favoritesService.ts` with API client setup
- [x] [T022] [CORE] Implement `getClientToken()` utility using localStorage with auto-generation
- [x] [T023] [CORE] Add `X-Client-Token` header injection to all favorites API calls

---

## Phase 3: User Story 1 + 2 (P1 - Core Favorites)

### US1: Client Marks Photos as Favorites

**Story**: As a client viewing a public gallery, I want to mark photos as favorites so I can remember which ones I like best.

#### 3.1 Backend - Toggle Favorite API

- [x] [T024] [US1] Create `backend/src/app/api/v1/client_favorites.py` router with prefix `/public/galleries/{gallery_id}/favorites`
- [x] [T025] [US1] Implement `POST /favorites` endpoint for toggle_favorite operation
- [x] [T026] [US1] Add request schema `ToggleFavoriteRequest` with asset_id, favorited (bool), optional list_id
- [x] [T027] [US1] Add response schema `ToggleFavoriteResponse` with asset_id, is_favorited, favorites_count, list_id
- [x] [T028] [US1] Implement `toggle_favorite()` in FavoritesService - create default list if first favorite
- [x] [T029] [US1] Update `client_interactions` table on favorite toggle (type='favorite', list_id FK)
- [x] [T030] [US1] Update `gallery_assets.is_favorited` boolean and increment/decrement favorites_count
- [x] [T031] [US1] Register router in `backend/src/app/main.py`

#### 3.2 Frontend - Favorite Button Component

- [x] [T032] [P] [US1] Create `frontend/src/components/features/gallery/FavoriteButton.tsx` component (via HoverOverlay heart button)
- [x] [T033] [US1] Add heart icon with filled/outline states using Lucide React
- [x] [T034] [US1] Implement optimistic update pattern for instant UI feedback
- [x] [T035] [US1] Add loading spinner during API call
- [x] [T036] [US1] Add error handling with toast notification on failure
- [x] [T037] [US1] Integrate FavoriteButton into existing `PhotoCard.tsx` component (already integrated)

#### 3.3 Frontend - Favorites Hook

- [x] [T038] [US1] Create `frontend/src/hooks/useFavorites.ts` with React Query integration
- [x] [T039] [US1] Implement `toggleFavorite` mutation with cache invalidation
- [x] [T040] [US1] Add `isFavorited(assetId)` helper using cached favorites set

### US2: View All Favorites in One Place

**Story**: As a client, I want to see all my favorited photos in one view so I can review my selections easily.

#### 3.4 Backend - List Favorites API

- [x] [T041] [US2] Implement `GET /favorites` endpoint with pagination (page, limit params)
- [x] [T042] [US2] Add optional `list_id` query param to filter by specific list
- [x] [T043] [US2] Return `FavoritesListResponse` with data array, meta pagination object
- [x] [T044] [US2] Include thumbnail_url, filename, width, height, favorited_at in each item
- [x] [T045] [US2] Implement `list_favorites()` in FavoritesService with gallery_assets join

#### 3.5 Frontend - Favorites Panel

- [x] [T046] [P] [US2] Create `frontend/src/components/features/gallery/FavoritesPanel.tsx` slide-out panel
- [x] [T047] [US2] Add favorites count badge in gallery header/toolbar (FavoritesButton.tsx)
- [x] [T048] [US2] Implement thumbnail grid view within panel
- [x] [T049] [US2] Add "View in gallery" click-through to photo location
- [x] [T050] [US2] Add empty state when no favorites exist
- [ ] [T051] [US2] Implement scroll-based pagination in panel

#### 3.6 Unit Tests - US1+US2

- [ ] [T052] [P] [US1] Write unit tests for toggle_favorite service method
- [ ] [T053] [P] [US2] Write unit tests for list_favorites service method
- [ ] [T054] [P] [US1] Write frontend tests for FavoriteButton component
- [ ] [T055] [P] [US2] Write frontend tests for FavoritesPanel component

---

## Phase 4: User Story 3 (P2 - Multiple Lists)

**Story**: As a client, I want to organize my favorites into different lists (e.g., "For Mom", "For Print") so I can categorize my selections.

### 4.1 Backend - List Management Service

- [ ] [T056] [US3] Create `backend/src/app/services/favorites_list_service.py` with FavoritesListService class
- [ ] [T057] [US3] Implement `create_list(gallery_id, client_token, name)` with duplicate name check
- [ ] [T058] [US3] Implement `update_list(list_id, client_token, name?, sort_order?)` with default list protection
- [ ] [T059] [US3] Implement `delete_list(list_id, client_token)` - prevent default list deletion, orphan photos to default
- [ ] [T060] [US3] Implement `move_photo_between_lists(asset_id, from_list_id, to_list_id, client_token)`

### 4.2 Backend - List Management APIs

- [ ] [T061] [US3] Implement `GET /favorites/lists` - return all lists with photo counts
- [ ] [T062] [US3] Implement `POST /favorites/lists` - create new named list
- [ ] [T063] [US3] Implement `PATCH /favorites/lists/{list_id}` - rename or reorder list
- [ ] [T064] [US3] Implement `DELETE /favorites/lists/{list_id}` - delete non-default list
- [ ] [T065] [US3] Implement `POST /favorites/lists/{list_id}/photos` - add photo to specific list
- [ ] [T066] [US3] Implement `DELETE /favorites/lists/{list_id}/photos/{asset_id}` - remove photo from list
- [ ] [T067] [US3] Implement `POST /favorites/lists/{list_id}/move` - move photo between lists

### 4.3 Frontend - List Management UI

- [ ] [T068] [P] [US3] Create `frontend/src/components/features/gallery/FavoriteListSelector.tsx` dropdown
- [ ] [T069] [US3] Add list tabs/pills in FavoritesPanel header
- [ ] [T070] [P] [US3] Create `frontend/src/components/features/gallery/CreateListModal.tsx` dialog
- [ ] [T071] [US3] Add rename/delete actions to list context menu
- [ ] [T072] [US3] Implement drag-and-drop photo reordering between lists (optional enhancement)
- [ ] [T073] [US3] Update toggle_favorite to accept optional list_id parameter

### 4.4 Frontend - Lists Hook

- [ ] [T074] [US3] Create `frontend/src/hooks/useFavoriteLists.ts` with CRUD operations
- [ ] [T075] [US3] Add `createList`, `updateList`, `deleteList` mutations
- [ ] [T076] [US3] Add `movePhotoToList` mutation with optimistic updates

### 4.5 Unit Tests - US3

- [ ] [T077] [P] [US3] Write unit tests for FavoritesListService methods
- [ ] [T078] [P] [US3] Write unit tests for list API endpoints
- [ ] [T079] [P] [US3] Write frontend tests for CreateListModal component

---

## Phase 5: User Story 5 (P2 - Photographer Analytics)

**Story**: As a photographer, I want to see which photos my clients have favorited so I can prioritize editing those photos.

### 5.1 Backend - Analytics Service

- [ ] [T080] [US5] Create `backend/src/app/services/favorites_analytics_service.py`
- [ ] [T081] [US5] Implement `get_favorites_analytics(workspace_id, gallery_id, sort_by, order, page, limit)`
- [ ] [T082] [US5] Implement `get_favorites_summary(workspace_id, gallery_id)` using materialized view
- [ ] [T083] [US5] Implement `refresh_analytics(workspace_id, gallery_id)` to refresh materialized view
- [ ] [T084] [US5] Implement `export_favorites_csv(workspace_id, gallery_id, min_favorites)` for CSV download

### 5.2 Backend - Analytics APIs

- [ ] [T085] [US5] Create `backend/src/app/api/v1/favorites_analytics.py` router with auth middleware
- [ ] [T086] [US5] Implement `GET /workspaces/{workspace_id}/galleries/{gallery_id}/favorites/analytics`
- [ ] [T087] [US5] Implement `GET /workspaces/{workspace_id}/galleries/{gallery_id}/favorites/analytics/summary`
- [ ] [T088] [US5] Implement `POST /workspaces/{workspace_id}/galleries/{gallery_id}/favorites/analytics/refresh`
- [ ] [T089] [US5] Implement `GET /workspaces/{workspace_id}/galleries/{gallery_id}/favorites/export` (CSV)
- [ ] [T090] [US5] Register analytics router in main.py

### 5.3 Backend - Favorites Settings

- [ ] [T091] [US5] Implement `GET /workspaces/{workspace_id}/galleries/{gallery_id}/favorites/settings`
- [ ] [T092] [US5] Implement `PATCH /workspaces/{workspace_id}/galleries/{gallery_id}/favorites/settings`
- [ ] [T093] [US5] Add FavoritesSettings schema with: favorites_enabled, sharing_enabled, download_enabled, max_lists_per_client, download_resolution, download_limit_per_client

### 5.4 Frontend - Photographer Dashboard

- [ ] [T094] [P] [US5] Create `frontend/src/components/features/gallery/FavoritesAnalyticsDashboard.tsx`
- [ ] [T095] [US5] Add summary cards: total favorites, unique clients, most favorited photo
- [ ] [T096] [US5] Add favorites-by-day chart using existing chart library
- [ ] [T097] [US5] Add sortable table of photos with favorite counts
- [ ] [T098] [US5] Add "Export CSV" button with download handler
- [ ] [T099] [US5] Add refresh button with loading state
- [ ] [T100] [US5] Integrate dashboard into gallery management page

### 5.5 Frontend - Settings Panel

- [ ] [T101] [P] [US5] Create `frontend/src/components/features/gallery/FavoritesSettingsPanel.tsx`
- [ ] [T102] [US5] Add toggle switches for favorites_enabled, sharing_enabled, download_enabled
- [ ] [T103] [US5] Add number inputs for max_lists_per_client, download_limit_per_client
- [ ] [T104] [US5] Add dropdown for download_resolution (web_only, original_allowed)

### 5.6 Unit Tests - US5

- [ ] [T105] [P] [US5] Write unit tests for FavoritesAnalyticsService methods
- [ ] [T106] [P] [US5] Write unit tests for analytics API endpoints
- [ ] [T107] [P] [US5] Write frontend tests for FavoritesAnalyticsDashboard component

---

## Phase 6: User Story 4 (P2 - ZIP Downloads)

**Story**: As a client, I want to download my favorited photos as a ZIP file so I can share them offline or back them up.

### 6.1 Backend - Download Service

- [ ] [T108] [US4] Create `backend/src/app/services/favorites_download_service.py`
- [ ] [T109] [US4] Implement `request_download(list_id, client_token, resolution)` - create job record
- [ ] [T110] [US4] Implement `get_download_status(download_id, client_token)` - return progress/URL
- [ ] [T111] [US4] Add download request validation (check download_enabled, download_limit)

### 6.2 Backend - Download Worker

- [ ] [T112] [US4] Create `backend/src/app/workers/favorites_download_worker.py`
- [ ] [T113] [US4] Implement ZIP streaming using python-zipstream-ng
- [ ] [T114] [US4] Add progress tracking with database updates (0-100%)
- [ ] [T115] [US4] Upload completed ZIP to R2 with 24h expiration
- [ ] [T116] [US4] Generate presigned download URL on completion
- [ ] [T117] [US4] Handle failures with error_message update

### 6.3 Backend - Download APIs

- [ ] [T118] [US4] Implement `POST /favorites/lists/{list_id}/download` - request ZIP generation
- [ ] [T119] [US4] Implement `GET /favorites/downloads/{download_id}` - poll status
- [ ] [T120] [US4] Add rate limiting for download requests (prevent abuse)

### 6.4 Frontend - Download UI

- [ ] [T121] [P] [US4] Create `frontend/src/components/features/gallery/DownloadFavoritesButton.tsx`
- [ ] [T122] [US4] Add resolution selector (web/original) before download
- [ ] [T123] [US4] Implement polling for download progress with progress bar
- [ ] [T124] [US4] Show download link when completed
- [ ] [T125] [US4] Handle download errors with retry option

### 6.5 Frontend - Download Hook

- [ ] [T126] [US4] Create `frontend/src/hooks/useDownloadFavorites.ts`
- [ ] [T127] [US4] Implement `requestDownload` mutation
- [ ] [T128] [US4] Implement polling logic with useQuery refetchInterval

### 6.6 Unit Tests - US4

- [ ] [T129] [P] [US4] Write unit tests for FavoritesDownloadService methods
- [ ] [T130] [P] [US4] Write unit tests for download worker
- [ ] [T131] [P] [US4] Write frontend tests for DownloadFavoritesButton component

---

## Phase 7: User Story 6 (P3 - Sharing)

**Story**: As a client, I want to share my favorites list with family/friends so they can see my photo selections.

### 7.1 Backend - Share Service

- [ ] [T132] [US6] Create `backend/src/app/services/favorites_share_service.py`
- [ ] [T133] [US6] Implement `create_share_link(list_id, client_token, expires_in_days?)` - generate token
- [ ] [T134] [US6] Implement `get_share_links(list_id, client_token)` - list active shares
- [ ] [T135] [US6] Implement `revoke_share_link(share_id, client_token)` - delete share
- [ ] [T136] [US6] Generate 43-character URL-safe share token using secrets.token_urlsafe(32)

### 7.2 Backend - Share APIs (Client)

- [ ] [T137] [US6] Implement `POST /favorites/lists/{list_id}/share` - create share link
- [ ] [T138] [US6] Implement `GET /favorites/lists/{list_id}/share` - get existing shares
- [ ] [T139] [US6] Implement `DELETE /favorites/lists/{list_id}/share/{share_id}` - revoke share

### 7.3 Backend - Public Share APIs

- [ ] [T140] [US6] Create `backend/src/app/api/v1/shared_favorites.py` router
- [ ] [T141] [US6] Implement `GET /shared/favorites/{share_token}` - view shared list (read-only)
- [ ] [T142] [US6] Implement `GET /shared/favorites/{share_token}/photo/{asset_id}` - photo detail
- [ ] [T143] [US6] Increment access_count and update last_accessed_at on view
- [ ] [T144] [US6] Return 410 Gone for expired share links

### 7.4 Frontend - Share UI

- [ ] [T145] [P] [US6] Create `frontend/src/components/features/gallery/ShareFavoritesModal.tsx`
- [ ] [T146] [US6] Add copy-to-clipboard button for share URL
- [ ] [T147] [US6] Add optional expiration date picker
- [ ] [T148] [US6] Show existing shares with access counts
- [ ] [T149] [US6] Add revoke button for each share

### 7.5 Frontend - Shared View Page

- [ ] [T150] [P] [US6] Create `frontend/src/pages/SharedFavoritesPage.tsx` public route
- [ ] [T151] [US6] Display gallery title, list name, owner display name
- [ ] [T152] [US6] Implement read-only photo grid with lightbox
- [ ] [T153] [US6] Handle expired/invalid share tokens with appropriate error page
- [ ] [T154] [US6] Add route `/shared/{share_token}` to React Router

### 7.6 Unit Tests - US6

- [ ] [T155] [P] [US6] Write unit tests for FavoritesShareService methods
- [ ] [T156] [P] [US6] Write unit tests for share API endpoints
- [ ] [T157] [P] [US6] Write frontend tests for ShareFavoritesModal component

---

## Phase 8: Polish & Integration

### 8.1 Integration Tests

- [ ] [T158] Write integration test: Complete favorites workflow (toggle → list → view)
- [ ] [T159] Write integration test: Multi-list management workflow
- [ ] [T160] Write integration test: Download workflow with progress polling
- [ ] [T161] Write integration test: Share link creation and viewing
- [ ] [T162] Write integration test: Photographer analytics dashboard data

### 8.2 E2E Tests (Playwright)

- [ ] [T163] [P] Write E2E test: Client favorites entire flow in public gallery
- [ ] [T164] [P] Write E2E test: Photographer views analytics and exports CSV
- [ ] [T165] [P] Write E2E test: Share link generation and viewing

### 8.3 Performance & Caching

- [ ] [T166] Add Redis caching for favorites counts in gallery assets response
- [ ] [T167] Add cache invalidation on favorite toggle
- [ ] [T168] Optimize materialized view refresh for large galleries
- [ ] [T169] Add database indexes for common query patterns if missing

### 8.4 Documentation

- [ ] [T170] Update API documentation with new endpoints
- [ ] [T171] Add favorites feature to user documentation
- [ ] [T172] Document photographer analytics dashboard usage

### 8.5 Cleanup

- [ ] [T173] Remove any debug logging statements
- [ ] [T174] Verify all error messages are user-friendly
- [ ] [T175] Ensure consistent error handling across all endpoints
- [ ] [T176] Final accessibility audit on new UI components

---

## MVP Scope (Minimum Viable Product)

For initial release, complete these phases:

| Phase | Tasks | Priority |
|-------|-------|----------|
| Phase 1: Setup | T001-T010 | Required |
| Phase 2: Foundation | T011-T023 | Required |
| Phase 3: US1+US2 | T024-T055 | Required (P1) |
| Phase 4: US3 | T056-T079 | Recommended |

**MVP Task Count**: 55 tasks

### MVP Acceptance Criteria

1. Clients can favorite/unfavorite photos with heart button
2. Clients can view all favorites in dedicated panel
3. Favorites persist via client token (localStorage)
4. Default list created automatically on first favorite
5. Basic unit test coverage for core functionality

### Post-MVP Features

- Phase 5 (US5): Photographer analytics dashboard
- Phase 6 (US4): ZIP download functionality
- Phase 7 (US6): Share links
- Phase 8: Polish and comprehensive testing

---

## Task Summary by User Story

| User Story | Priority | Task Range | Count |
|------------|----------|------------|-------|
| CORE (Foundation) | - | T001-T023 | 23 |
| US1: Mark Favorites | P1 | T024-T040, T052, T054 | 19 |
| US2: View Favorites | P1 | T041-T051, T053, T055 | 13 |
| US3: Multiple Lists | P2 | T056-T079 | 24 |
| US5: Photographer Analytics | P2 | T080-T107 | 28 |
| US4: ZIP Downloads | P2 | T108-T131 | 24 |
| US6: Sharing | P3 | T132-T157 | 26 |
| Polish | - | T158-T176 | 19 |

**Note**: Some tasks support multiple user stories. Total unique tasks: 176.

---

## Parallel Execution Examples

### Example 1: Backend Development Sprint

```
Day 1-2 (Parallel):
├── Developer A: T001-T010 (Setup)
└── Developer B: T011-T023 (Foundation)

Day 3-4 (Parallel after foundation):
├── Developer A: T024-T031 (US1 Backend)
└── Developer B: T080-T090 (US5 Backend Analytics)

Day 5-6 (Parallel):
├── Developer A: T041-T045 (US2 Backend)
└── Developer B: T091-T093 (US5 Backend Settings)
```

### Example 2: Full Stack Sprint

```
Week 1:
├── Backend: T001-T045 (Setup + Foundation + US1/US2 Backend)
└── Frontend: T032-T040, T046-T051 (US1/US2 Frontend) - start Day 3

Week 2 (Parallel):
├── Track A: T056-T079 (US3 - Lists)
└── Track B: T080-T107 (US5 - Analytics)

Week 3:
├── Track A: T108-T131 (US4 - Downloads)
└── Track B: T132-T157 (US6 - Sharing)

Week 4:
└── All: T158-T176 (Integration, E2E, Polish)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Large ZIP files causing timeouts | Use streaming ZIP generation, background worker |
| Client token collision | Use crypto.randomUUID() for guaranteed uniqueness |
| Materialized view stale data | Document refresh requirements, add manual refresh API |
| Cross-device favorites sync | Document limitation, future: optional email association |
| Gallery deletion orphans favorites | CASCADE delete via FK constraints |
