# Tasks: Smart Local Tagging Layer

**Input**: Design documents from `/specs/005-smart-tagging-cache/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/api.yaml, quickstart.md

**Tests**: Integration and unit tests are included for core functionality.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this belongs to (US1-US6)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema extensions and core models - REQUIRED before any user story

- [X] T001 Create migration 0041_smart_tagging_extensions.py - extend `asset_tags` with `source`, `confidence`, `ai_metadata` columns in `backend/migrations/versions/`
- [X] T002 Create migration 0042_asset_analysis.py - new `asset_analysis` table per data-model.md in `backend/migrations/versions/`
- [X] T003 Create migration 0043_content_detection_jobs.py - job queue table following `face_detection_jobs` pattern in `backend/migrations/versions/`
- [X] T004 Create migration 0044_face_groups_person_link.py - add `person_id` FK to `face_groups` in `backend/migrations/versions/`
- [X] T005 Create migration 0045_gallery_tagging_stats.py - materialized view with refresh function in `backend/migrations/versions/`
- [X] T006 Run migrations and verify schema: `DATABASE_URL="..." alembic upgrade head`

**Checkpoint**: Database schema ready - repository classes can now be implemented

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core repositories and service interfaces that ALL user stories depend on

- [X] T007 Create `AssetAnalysisRepository` class in `backend/src/app/repositories/asset_analysis_repository.py` with CRUD for `asset_analysis` table
- [X] T008 [P] Create `ContentJobRepository` class in `backend/src/app/repositories/content_job_repository.py` with `FOR UPDATE SKIP LOCKED` polling pattern (mirror `face_detection_jobs`)
- [X] T009 [P] Extend `TagService` in `backend/src/app/services/tag_service.py` - add `add_ai_tags()`, `remove_ai_tags()`, `get_asset_tags_by_source()` methods
- [X] T010 Create `ContentDetectionService` skeleton in `backend/src/app/services/content_detection_service.py` with `detect_content()`, `queue_detection()` stubs
- [X] T011 Create `TaggingHealthService` in `backend/src/app/services/tagging_health_service.py` with `get_gallery_health()`, `get_workspace_health()` using materialized view
- [X] T012 Add Pydantic schemas for AI tags to `backend/src/app/api/schemas.py`: `AITagCreate`, `AITagResponse`, `AssetAnalysisResponse`, `TaggingHealthResponse`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Instant AI-Powered Search (Priority: P1)

**Goal**: Gallery search by content (objects, scenes) using cached AI tags

**Independent Test**: Search "sunset" in gallery returns photos previously analyzed with sunset tag

### Tests for User Story 1

- [X] T013 [P] [US1] Unit test for `ContentDetectionService.detect_content()` in `backend/tests/unit/test_content_detection_service.py`
- [X] T014 [P] [US1] Unit test for `TagService.add_ai_tags()` in `backend/tests/unit/test_tag_service.py`
- [X] T015 [P] [US1] Integration test for upload→detection→search flow in `backend/tests/integration/test_smart_tagging_flow.py`

### Implementation for User Story 1

- [X] T016 [US1] Implement `ContentDetectionService.detect_content()` - call Cloud Vision API via `provider_manager.py`, parse labels, return tag list with confidence
- [X] T017 [US1] Implement `ContentDetectionService.queue_detection()` - insert into `content_detection_jobs` table with priority
- [X] T018 [US1] Create `ContentDetectionWorker` in `backend/src/app/services/content_detection_worker.py` following exact pattern from `face_detection_worker.py`:
  - Polling loop with `FOR UPDATE SKIP LOCKED`
  - Batch size 10, concurrent jobs 5
  - Exponential backoff retry (60s, 120s, 240s)
  - Stale job recovery after 10 minutes
- [X] T019 [US1] Create worker entrypoint `backend/src/app/workers/content_worker_main.py` with FastAPI health endpoints (`/health`, `/ready`)
- [X] T020 [US1] Implement `TagService.add_ai_tags()` - create tag if not exists, add to `asset_tags` with source/confidence/metadata
- [X] T021 [US1] Extend `SearchService` in `backend/src/app/services/search_service.py` - add `tag_source` filter param to `search_assets()`, `search_assets_by_tag()`
- [X] T022 [US1] Create API endpoint `GET /workspaces/{workspace_id}/assets/{asset_id}/analysis` in `backend/src/app/api/v1/smart_tagging.py`
- [X] T023 [US1] Extend `GET /workspaces/{workspace_id}/tags/assets/{asset_id}` to accept `?source=all|manual|ai` query param
- [X] T024 [US1] Add worker container to `infrastructure/docker/docker-compose.yml` following `face-worker` pattern

**Checkpoint**: Content detection worker running, AI tags stored, search by tag works

---

## Phase 4: User Story 2 - Face Naming & Person Search (Priority: P1)

**Goal**: Name face groups and search photos by person name

**Independent Test**: Name a face group "John", search "John" returns all photos with that person

### Tests for User Story 2

- [X] T025 [P] [US2] Unit test for `FaceClusterService.assign_person()` in `backend/tests/unit/test_face_cluster_service.py`
- [X] T026 [P] [US2] Integration test for face naming→search in `backend/tests/integration/test_face_naming_search.py`

### Implementation for User Story 2

- [X] T027 [US2] Extend `FaceClusterService` in `backend/src/app/services/face_cluster_service.py` - add `assign_person()` method to set `face_groups.person_id`
- [X] T028 [US2] Create API endpoint `PUT /workspaces/{workspace_id}/face-groups/{face_group_id}/name` in `backend/src/app/api/v1/face_groups.py` - accepts `{ person_name: string }`, creates person if needed, links to face_group
- [X] T029 [US2] Extend `SearchService.search_assets_by_person()` to also search by `face_groups.person_id` → `people.name`
- [X] T030 [US2] Extend `GET /workspaces/{workspace_id}/face-groups` response to include `person_name` field
- [X] T031 [US2] Create `FaceGroupNaming.tsx` React component in `frontend/src/components/features/gallery/FaceGroupNaming.tsx` with inline edit for group name (implemented as PersonCard inline editing in PeoplePanel.tsx)
- [X] T032 [US2] Create "People" sidebar section in `frontend/src/components/layout/Sidebar.tsx` - shows face groups with thumbnails, links to filtered gallery view (implemented as navigation item in WorkspaceSidebar.tsx and PeoplePage.tsx)
- [X] T033 [US2] Create `PeoplePage.tsx` in `frontend/src/pages/workspace/PeoplePage.tsx` - grid of face groups with names, click to view all photos
- [X] T034 [US2] Add face tagging overlay to `PhotoView` component - when viewing a photo, show detected faces with option to name/tag each face directly (implemented in Lightbox.tsx)
- [X] T035 [US2] Create `FaceTaggingOverlay.tsx` in `frontend/src/components/features/gallery/FaceTaggingOverlay.tsx` - draws boxes on detected faces, click to name
- [X] T036 [US2] Add route `/workspaces/:workspaceId/people` in `frontend/src/router/routes.tsx`
- [X] T037 [US2] Create `useFaceGroups.ts` hook in `frontend/src/hooks/usePeople.ts` - fetches workspace face groups with pagination

**Checkpoint**: Face groups can be named from photo view or People section, searchable by person name

---

## Phase 5: User Story 3 - Incremental Gallery Addition (Priority: P2)

**Goal**: New photos inherit cached tags without re-calling AI APIs

**Independent Test**: Add photo to gallery where similar photos exist, verify tags copied instantly

### Tests for User Story 3

- [X] T038 [P] [US3] Unit test for deduplication check in `ContentDetectionService` in `backend/tests/unit/test_content_detection_service.py`

### Implementation for User Story 3

- [X] T039 [US3] Modify upload commit handler in `backend/src/app/api/v1/uploads.py` - after commit, create `asset_analysis` record and queue content detection job
- [X] T040 [US3] Add deduplication check in `ContentDetectionService.queue_detection()` - if asset already has `asset_analysis.status = 'completed'`, skip re-queuing
- [X] T041 [US3] Add SHA256-based tag inheritance: if identical file exists in workspace, copy AI tags instead of calling provider
- [X] T042 [US3] Create `AssetAnalysisResponse` in API response for `POST /uploads/{upload_id}/commit` - include `analysis_queued: true|false`

**Checkpoint**: New uploads automatically queue for analysis, duplicates skip AI calls

---

## Phase 6: User Story 4 - Manual Tag Complement (Priority: P2)

**Goal**: Users can add manual tags that coexist with AI tags

**Independent Test**: Add manual tag "favorites", verify it appears alongside AI tags with distinct styling

### Tests for User Story 4

- [X] T043 [P] [US4] Unit test for `remove_ai_tags_preserves_manual()` in `backend/tests/unit/test_tag_service.py`

### Implementation for User Story 4

- [X] T044 [US4] Implement `TagService.remove_ai_tags()` - delete only tags where `source != 'manual'`
- [X] T045 [US4] Extend `AssetTagResponse` schema to include `source`, `confidence` fields
- [X] T046 [US4] Create `AssetTagPanel.tsx` in `frontend/src/components/features/gallery/AssetTagPanel.tsx` - shows AI tags (with confidence badge) and manual tags (different style), allows adding/removing manual tags
- [X] T047 [US4] Create `useAssetTags.ts` hook in `frontend/src/hooks/useAssetTags.ts` - fetches tags with source info, invalidates on mutation
- [X] T048 [US4] Update `frontend/src/services/api.ts` - add `getAssetTags(assetId, source?)`, `addManualTag()`, `removeTag()` methods

**Checkpoint**: UI shows AI vs manual tags with distinct styling, manual tag CRUD works

---

## Phase 7: User Story 5 - Re-Analysis (Priority: P3)

**Goal**: Users can trigger fresh AI analysis when providers improve

**Independent Test**: Click "Re-analyze" on photo, old AI tags replaced with fresh results

### Tests for User Story 5

- [X] T049 [P] [US5] Unit test for bulk re-analysis in `backend/tests/unit/test_content_detection_service.py`

### Implementation for User Story 5

- [X] T050 [US5] Create API endpoint `POST /workspaces/{workspace_id}/assets/{asset_id}/reanalyze` - remove existing AI tags, reset `asset_analysis.status` to pending, queue high-priority job
- [X] T051 [US5] Create API endpoint `POST /workspaces/{workspace_id}/assets/reanalyze/bulk` - accepts `{ asset_ids: UUID[] }`, max 100, queues all with priority 10
- [X] T052 [US5] Implement `ContentDetectionService.reanalyze_asset()` - calls `remove_ai_tags()`, resets analysis record, queues job
- [X] T053 [US5] Add "Re-analyze" button to `AssetTagPanel.tsx` with confirmation dialog

**Checkpoint**: Single and bulk re-analysis works, old AI tags replaced

---

## Phase 8: User Story 6 - Tagging Health Dashboard (Priority: P3)

**Goal**: Gallery owners see tagging completion status at a glance

**Independent Test**: View gallery with 80% tagged photos, see "80% complete" health badge

### Tests for User Story 6

- [X] T054 [P] [US6] Unit test for `TaggingHealthService.get_gallery_health()` in `backend/tests/unit/test_tagging_health_service.py`

### Implementation for User Story 6

- [X] T055 [US6] Implement `TaggingHealthService.get_gallery_health()` - query `gallery_tagging_stats` materialized view, cache in Redis for 60s
- [X] T056 [US6] Implement `TaggingHealthService.get_workspace_health()` - aggregate across all galleries
- [X] T057 [US6] Create API endpoint `GET /workspaces/{workspace_id}/galleries/{gallery_id}/tagging-health` returning `{ total, tagged, pending, failed, completion_pct }`
- [X] T058 [US6] Create API endpoint `GET /workspaces/{workspace_id}/tagging-health` for workspace-wide overview
- [X] T059 [US6] Create `TaggingHealthBadge.tsx` in `frontend/src/components/features/gallery/TaggingHealthBadge.tsx` - shows completion percentage, progress bar, warning icon for failures
- [X] T060 [US6] Create `useGalleryTaggingHealth.ts` hook in `frontend/src/hooks/useGalleryTaggingHealth.ts` - refetch every 60s
- [X] T061 [US6] Add health badge to gallery list view and gallery detail header
- [X] T062 [US6] Add refresh button to manually trigger `refresh_gallery_tagging_stats()` function

**Checkpoint**: Health dashboard shows completion status across galleries

---

## Phase 9: Frontend Search Enhancement

**Purpose**: Unified search with AI tag and person filters

- [X] T063 [P] Create `useAssetSearch.ts` hook in `frontend/src/hooks/useAssetSearch.ts` with debounced query, tag_source filter
- [X] T064 Extend `GallerySearchBar.tsx` in `frontend/src/components/features/gallery/GallerySearchBar.tsx` - add filter chips for tags/people
- [X] T065 [P] Create `GET /workspaces/{workspace_id}/galleries/{gallery_id}/filter` endpoint - accepts `{ tags?: string[], people?: string[], tag_source?: string }`, returns filtered asset IDs
- [X] T066 Add tag autocomplete to search bar using existing `GET /tags` endpoint
- [X] T067 Add person autocomplete using face_groups with person_id

**Checkpoint**: Gallery search filters by AI tags, manual tags, and people

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Reliability, monitoring, documentation

- [X] T068 [P] Add circuit breaker wrapper for AI provider calls in `ContentDetectionService`
- [X] T069 [P] Add Prometheus metrics: `content_detection_jobs_total{status}`, `ai_tags_created_total{provider}`, `content_detection_duration_seconds`
- [X] T070 [P] Add OpenTelemetry tracing spans for content detection pipeline
- [X] T071 Add scheduled job to refresh `gallery_tagging_stats` materialized view every 5 minutes
- [X] T072 Run `quickstart.md` validation - verify all steps work
- [X] T073 Update `CLAUDE.md` with new services and API endpoints
- [X] T074 Code review and cleanup

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup/Migrations)
    ↓
Phase 2 (Foundational/Repositories)
    ↓
    ├── Phase 3 (US1: Instant Search) ──────→ REQUIRED
    │       ↓
    ├── Phase 4 (US2: Face Naming) ─────────→ REQUIRED
    │
    ├── Phase 5 (US3: Incremental) ─────────→ REQUIRED (After US1)
    │
    ├── Phase 6 (US4: Manual Tags) ─────────→ REQUIRED (After US1)
    │
    ├── Phase 7 (US5: Re-Analysis) ─────────→ REQUIRED (After US1, US4)
    │
    └── Phase 8 (US6: Health Dashboard) ────→ REQUIRED (After US1)
            ↓
    Phase 9 (Frontend Search) ──────────────→ REQUIRED (After US1, US2)
            ↓
    Phase 10 (Polish) ──────────────────────→ REQUIRED (Final)
```

### User Story Dependencies

| Story | Depends On | Can Start After |
|-------|------------|-----------------|
| US1 (Instant Search) | Phase 2 | Phase 2 complete |
| US2 (Face Naming) | Phase 2, existing face_groups | Phase 2 complete |
| US3 (Incremental) | US1 (content detection service) | US1 T018 complete |
| US4 (Manual Tags) | US1 (tag source extension) | US1 T020 complete |
| US5 (Re-Analysis) | US1, US4 | US1 complete, US4 T038 complete |
| US6 (Health Dashboard) | Phase 2 (asset_analysis table) | Phase 2 complete |

### Parallel Opportunities

**Phase 1 (Setup)**: Run migrations sequentially (order matters)

**Phase 2 (Foundational)**:
```bash
# These can run in parallel:
Task: T007 AssetAnalysisRepository
Task: T008 ContentJobRepository
Task: T009 Extend TagService
```

**Phase 3-8 (User Stories)**: After Phase 2, stories can be worked in parallel by different developers:
- Developer A: US1 (Instant Search) + US3 (Incremental)
- Developer B: US2 (Face Naming) + US6 (Health Dashboard)
- Developer C: US4 (Manual Tags) + US5 (Re-Analysis)

**Within Each Story**: Tests marked [P] can run in parallel

---

## Implementation Strategy

### Full Implementation (All Phases Required)

1. Complete Phase 1: Setup (migrations)
2. Complete Phase 2: Foundational (repositories, service skeletons)
3. Complete Phase 3: US1 - Content detection and AI tag search
4. Complete Phase 4: US2 - Face naming and person search with People UI
5. Complete Phase 5: US3 - Incremental gallery addition with deduplication
6. Complete Phase 6: US4 - Manual tag complement
7. Complete Phase 7: US5 - Re-analysis capability
8. Complete Phase 8: US6 - Tagging health dashboard
9. Complete Phase 9: Frontend search enhancement
10. Complete Phase 10: Polish, monitoring, documentation

### Estimated Effort

| Phase | Tasks | Estimated Time |
|-------|-------|----------------|
| Phase 1 | 6 | 2 hours |
| Phase 2 | 6 | 4 hours |
| Phase 3 (US1) | 12 | 8 hours |
| Phase 4 (US2) | 13 | 6 hours |
| Phase 5 (US3) | 5 | 2 hours |
| Phase 6 (US4) | 6 | 3 hours |
| Phase 7 (US5) | 5 | 2 hours |
| Phase 8 (US6) | 9 | 4 hours |
| Phase 9 | 5 | 3 hours |
| Phase 10 | 7 | 4 hours |
| **Total** | **74** | **~38 hours** |

---

## Notes

- [P] tasks can run in parallel (different files, no dependencies)
- [US#] label maps task to specific user story for traceability
- Follow existing patterns from `face_detection_worker.py` exactly
- All queries MUST include `workspace_id` filter (multi-tenant isolation)
- Use `source` column in `asset_tags` to distinguish AI vs manual tags
- Content worker should be a separate Docker container (like face-worker)
- Cache health metrics in Redis with 60s TTL
