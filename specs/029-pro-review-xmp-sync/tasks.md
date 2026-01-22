# Tasks: Pro Review Mode & Desktop Sync

**Input**: Design documents from `/specs/029-pro-review-xmp-sync/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `services/gallery-service/src/`
- **Frontend**: `frontend/src/`
- **Desktop**: `desktop/src-tauri/` (Rust), `desktop/src/` (React)
- **Migrations**: `backend/migrations/versions/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and database migrations

- [ ] T001 Create database migration for asset rating/flag columns in backend/migrations/versions/0169_add_asset_rating_flag.py
- [ ] T002 Create database migration for sync_api_keys table in backend/migrations/versions/0170_add_sync_api_keys.py
- [ ] T003 Create database migration for sync_audit_log table in backend/migrations/versions/0171_add_sync_audit_log.py
- [ ] T004 Run migrations: `docker exec rawdrive-backend alembic upgrade head`
- [ ] T005 [P] Update Asset model with rating, flag, color_label columns in backend/src/app/models/asset.py
- [ ] T006 [P] Create SyncApiKey model in services/gallery-service/src/models/sync_api_key.py
- [ ] T007 [P] Create SyncAuditLog model in services/gallery-service/src/models/sync_audit_log.py
- [ ] T008 [P] Create audit action/source enums in services/gallery-service/src/schemas/sync_audit.py
- [ ] T009 Install frontend dependencies: `cd frontend && pnpm add react-hotkeys-hook @tanstack/virtual`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core backend infrastructure that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T010 Create Pydantic schemas for asset metadata (rating, flag, color_label) in services/gallery-service/src/schemas/asset_metadata.py
- [ ] T011 [P] Create SyncApiKey Pydantic schemas in services/gallery-service/src/schemas/sync_api_key.py
- [ ] T012 [P] Create SyncApiKey repository in services/gallery-service/src/repositories/sync_key_repository.py
- [ ] T013 Create SyncApiKey service (create, validate, revoke) in services/gallery-service/src/services/sync_key_service.py
- [ ] T014 Create sync API key authentication middleware in services/gallery-service/src/middleware/sync_auth.py
- [ ] T015 [P] Create audit logging service in services/gallery-service/src/services/audit_service.py
- [ ] T016 Register new models in services/gallery-service/src/models/__init__.py

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Professional Photo Culling (Priority: P1)

**Goal**: 3-pane Review Mode with keyboard shortcuts for rating/flagging images

**Independent Test**: Open any gallery with 10+ images, switch to Review Mode, use keyboard shortcuts (1-5 for ratings, P/U/X for flags) to rate and flag images. Verify ratings persist and UI updates immediately.

### Backend for User Story 1

- [ ] T017 [P] [US1] Create asset metadata update endpoint PATCH /galleries/{id}/assets/{id}/metadata in services/gallery-service/src/api/v1/assets.py
- [ ] T018 [P] [US1] Create batch metadata update endpoint PATCH /galleries/{id}/assets/metadata/batch in services/gallery-service/src/api/v1/assets.py
- [ ] T019 [P] [US1] Create asset filter endpoint GET /galleries/{id}/assets/filter in services/gallery-service/src/api/v1/assets.py
- [ ] T020 [US1] Add rating/flag/color_label to existing gallery asset responses in services/gallery-service/src/schemas/asset.py

### Frontend for User Story 1

- [ ] T021 [P] [US1] Create useKeyboardShortcuts hook (0-5, P/U/X, arrows) in frontend/src/hooks/useKeyboardShortcuts.ts
- [ ] T022 [P] [US1] Create useReviewMode hook (state, navigation, auto-advance) in frontend/src/hooks/useReviewMode.ts
- [ ] T023 [P] [US1] Create RatingStars component in frontend/src/components/features/gallery/review/RatingStars.tsx
- [ ] T024 [P] [US1] Create FlagIndicator component (pick/unflagged/reject) in frontend/src/components/features/gallery/review/FlagIndicator.tsx
- [ ] T025 [US1] Create ReviewFilmstrip component (virtualized thumbnail strip) in frontend/src/components/features/gallery/review/ReviewFilmstrip.tsx
- [ ] T026 [US1] Create ReviewCanvas component (main image display with overlays) in frontend/src/components/features/gallery/review/ReviewCanvas.tsx
- [ ] T027 [US1] Create ReviewMetadataPanel component (right sidebar) in frontend/src/components/features/gallery/review/ReviewMetadataPanel.tsx
- [ ] T028 [US1] Create KeyboardShortcutHelp component (? key overlay) in frontend/src/components/features/gallery/review/KeyboardShortcutHelp.tsx
- [ ] T029 [US1] Create ReviewWorkbench component (3-pane layout) in frontend/src/components/features/gallery/review/ReviewWorkbench.tsx
- [ ] T030 [US1] Add "Review Mode" button to gallery toolbar in frontend/src/components/features/gallery/GalleryToolbar.tsx
- [ ] T031 [US1] Create Review Mode route/page entry point in frontend/src/pages/gallery/ReviewModePage.tsx
- [ ] T032 [US1] Integrate keyboard handlers with API calls for persistence

**Checkpoint**: User Story 1 is fully functional - keyboard-driven culling workflow works

---

## Phase 4: User Story 2 - Export Ratings via XMP (Priority: P2)

**Goal**: Export ratings/flags as downloadable XMP sidecar files for Lightroom

**Independent Test**: Rate 5 images in a gallery, export XMP files, place alongside RAW files on disk, verify Lightroom reads ratings correctly.

### Backend for User Story 2

- [ ] T033 [P] [US2] Create XMP generation service (lxml-based) in services/gallery-service/src/services/xmp_service.py
- [ ] T034 [P] [US2] Create XMP Pydantic schemas in services/gallery-service/src/schemas/xmp_sync.py
- [ ] T035 [US2] Create XMP export preview endpoint POST /galleries/{id}/xmp/export/preview in services/gallery-service/src/api/v1/xmp_sync.py
- [ ] T036 [US2] Create XMP export endpoint POST /galleries/{id}/xmp/export (returns ZIP) in services/gallery-service/src/api/v1/xmp_sync.py
- [ ] T037 [US2] Add XMP golden master test fixtures in services/gallery-service/tests/fixtures/xmp/
- [ ] T038 [US2] Add audit logging for XMP export operations

### Frontend for User Story 2

- [ ] T039 [P] [US2] Create xmpSyncService API client in frontend/src/services/xmpSyncService.ts
- [ ] T040 [P] [US2] Create useXmpSync hook for export operations in frontend/src/hooks/useXmpSync.ts
- [ ] T041 [US2] Add "Export XMP" action to gallery Actions menu in frontend/src/components/features/gallery/GalleryActionsMenu.tsx
- [ ] T042 [US2] Create XMP export dialog with progress in frontend/src/components/features/gallery/XmpExportDialog.tsx

**Checkpoint**: User Story 2 is fully functional - XMP export works with Lightroom

---

## Phase 5: User Story 3 - Import Ratings via XMP (Priority: P3)

**Goal**: Import XMP sidecar files to update asset metadata in RawDrive

**Independent Test**: Create XMP files with known ratings in Lightroom, upload to RawDrive via Import XMP, verify gallery assets reflect imported ratings.

### Backend for User Story 3

- [ ] T043 [P] [US3] Add XMP parsing to xmp_service.py (read xmp:Rating, xmp:Label, photoshop:Urgency)
- [ ] T044 [US3] Create XMP import validation endpoint POST /galleries/{id}/xmp/import/validate in services/gallery-service/src/api/v1/xmp_sync.py
- [ ] T045 [US3] Create XMP import endpoint POST /galleries/{id}/xmp/import (multipart) in services/gallery-service/src/api/v1/xmp_sync.py
- [ ] T046 [US3] Implement filename matching logic for XMP-to-asset mapping
- [ ] T047 [US3] Add audit logging for XMP import operations

### Frontend for User Story 3

- [ ] T048 [P] [US3] Extend useXmpSync hook with import operations in frontend/src/hooks/useXmpSync.ts
- [ ] T049 [US3] Add "Import XMP" action to gallery Actions menu in frontend/src/components/features/gallery/GalleryActionsMenu.tsx
- [ ] T050 [US3] Create XMP import dialog (file upload, validation, results) in frontend/src/components/features/gallery/XmpImportDialog.tsx

**Checkpoint**: User Story 3 is fully functional - bidirectional XMP sync works

---

## Phase 6: User Story 4 - Compare View (Priority: P4)

**Goal**: Side-by-side comparison of two images in Review Mode

**Independent Test**: Select two images in Review Mode, enter Compare view, verify both display side-by-side, rating applies to focused image.

### Frontend for User Story 4

- [ ] T051 [P] [US4] Create CompareView component (2-up layout) in frontend/src/components/features/gallery/review/CompareView.tsx
- [ ] T052 [US4] Extend useReviewMode hook with compare state (active image tracking)
- [ ] T053 [US4] Add Compare toggle to ReviewWorkbench toolbar
- [ ] T054 [US4] Handle keyboard focus switching between compared images

**Checkpoint**: User Story 4 is fully functional - compare view works

---

## Phase 7: User Story 5 - Histogram Display (Priority: P5)

**Goal**: Display luminance histogram in Review Mode metadata panel

**Independent Test**: View images in Review Mode, verify histogram displays in metadata panel, verify "Not available" when no histogram data.

### Frontend for User Story 5

- [ ] T055 [P] [US5] Create HistogramDisplay component in frontend/src/components/features/gallery/review/HistogramDisplay.tsx
- [ ] T056 [US5] Integrate histogram into ReviewMetadataPanel
- [ ] T057 [US5] Add histogram data fetching to useReviewMode hook

**Checkpoint**: User Story 5 is fully functional - histogram displays correctly

---

## Phase 8: User Story 6 - Desktop App Setup (Priority: P6)

**Goal**: Native Windows/macOS desktop app with authentication and folder mapping

**Independent Test**: Download and install app, enter API credentials, verify successful connection, create folder-to-gallery mapping.

### Backend API for Desktop App

- [ ] T058 [P] [US6] Create sync API key endpoints in services/gallery-service/src/api/v1/sync_keys.py
- [ ] T059 [P] [US6] Create sync auth validation endpoint POST /sync/auth/validate in services/gallery-service/src/api/v1/desktop_sync.py
- [ ] T060 [US6] Create gallery list endpoint for authenticated sync keys

### Desktop App Setup

- [ ] T061 [US6] Initialize Tauri project in desktop/ directory: `cd desktop && pnpm create tauri-app . --template react-ts`
- [ ] T062 [P] [US6] Configure tauri.conf.json with app metadata and permissions
- [ ] T063 [P] [US6] Add Rust dependencies to desktop/src-tauri/Cargo.toml (notify, keyring, reqwest, serde)
- [ ] T064 [US6] Create Rust keyring wrapper for credential storage in desktop/src-tauri/src/storage/keyring.rs
- [ ] T065 [US6] Create Rust config storage module in desktop/src-tauri/src/storage/config.rs
- [ ] T066 [US6] Create Rust API client for RawDrive in desktop/src-tauri/src/services/api_client.rs
- [ ] T067 [US6] Create auth Tauri commands (login, validate, logout) in desktop/src-tauri/src/commands/auth.rs
- [ ] T068 [US6] Create config Tauri commands (folder mappings) in desktop/src-tauri/src/commands/config.rs
- [ ] T069 [P] [US6] Create Tauri API wrapper in desktop/src/services/tauriApi.ts
- [ ] T070 [US6] Create SetupWizard component (credentials entry) in desktop/src/components/SetupWizard.tsx
- [ ] T071 [US6] Create FolderMappingList component in desktop/src/components/FolderMappingList.tsx
- [ ] T072 [US6] Create Settings component in desktop/src/components/Settings.tsx
- [ ] T073 [US6] Create desktop App.tsx with routing

**Checkpoint**: User Story 6 is fully functional - desktop app installs and configures

---

## Phase 9: User Story 7 - Upload Sync (Priority: P7)

**Goal**: Automatic file upload from local folders to RawDrive galleries

**Independent Test**: Add new photo to synced folder, verify it appears in RawDrive gallery within 5 seconds.

### Backend API for File Sync

- [ ] T074 [P] [US7] Create file list endpoint GET /sync/galleries/{id}/files in services/gallery-service/src/api/v1/desktop_sync.py
- [ ] T075 [P] [US7] Create file check endpoint POST /sync/galleries/{id}/files/check
- [ ] T076 [P] [US7] Create file upload endpoint POST /sync/galleries/{id}/upload
- [ ] T077 [P] [US7] Create TUS upload init endpoint POST /sync/galleries/{id}/upload/tus
- [ ] T078 [US7] Create file metadata update endpoint PATCH /sync/galleries/{id}/files/{id}

### Desktop App File Watching

- [ ] T079 [US7] Create Rust file watcher service in desktop/src-tauri/src/services/file_watcher.rs
- [ ] T080 [US7] Create Rust sync queue service in desktop/src-tauri/src/services/sync_queue.rs
- [ ] T081 [US7] Create Rust XMP handler (detect XMP changes) in desktop/src-tauri/src/services/xmp_handler.rs
- [ ] T082 [US7] Create sync Tauri commands (start, stop, status) in desktop/src-tauri/src/commands/sync.rs
- [ ] T083 [US7] Create SyncStatus component (progress, queue) in desktop/src/components/SyncStatus.tsx
- [ ] T084 [US7] Implement upload queue with retry logic
- [ ] T085 [US7] Handle network disconnection and reconnection

**Checkpoint**: User Story 7 is fully functional - local-to-cloud upload sync works

---

## Phase 10: User Story 8 - Bidirectional Sync (Priority: P8)

**Goal**: XMP sidecar files created locally when ratings change in RawDrive

**Independent Test**: Rate image in RawDrive Review Mode, verify XMP file appears in local synced folder within 60 seconds.

### Backend API for Change Feed

- [ ] T086 [P] [US8] Create changes endpoint GET /sync/galleries/{id}/changes in services/gallery-service/src/api/v1/desktop_sync.py
- [ ] T087 [US8] Create heartbeat endpoint POST /sync/heartbeat
- [ ] T088 [US8] Create gallery sync status endpoint GET /sync/galleries/{id}/status

### Desktop App Download Sync

- [ ] T089 [US8] Extend file_watcher.rs with XMP write capability
- [ ] T090 [US8] Implement change polling/webhook handling in api_client.rs
- [ ] T091 [US8] Implement conflict detection (timestamp comparison)
- [ ] T092 [US8] Add conflict logging and notification

**Checkpoint**: User Story 8 is fully functional - bidirectional sync works

---

## Phase 11: User Story 9 - Background Service & Tray (Priority: P9)

**Goal**: Desktop app runs in background with system tray integration

**Independent Test**: Enable "Start with system", restart computer, verify app starts in tray and shows sync status.

### Desktop App Background Service

- [ ] T093 [US9] Create system tray module in desktop/src-tauri/src/tray/mod.rs
- [ ] T094 [US9] Implement tray icon states (idle, syncing, error)
- [ ] T095 [US9] Add tray menu (sync now, open settings, quit)
- [ ] T096 [US9] Implement "Start with system" using OS APIs
- [ ] T097 [US9] Add native OS notifications (sync complete, errors)
- [ ] T098 [US9] Create sync progress tooltip
- [ ] T099 [US9] Handle minimize to tray on close

**Checkpoint**: User Story 9 is fully functional - background service works

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Finalization, documentation, and optimizations

- [ ] T100 [P] Add Sync API Key management UI in frontend Settings page
- [ ] T101 [P] Create audit log viewer component for gallery settings
- [ ] T102 [P] Add sync audit log retention cleanup job
- [ ] T103 Implement desktop app auto-update check (GET /sync/app/version)
- [ ] T104 [P] Build Windows installer: `cd desktop && pnpm tauri build --target x86_64-pc-windows-msvc`
- [ ] T105 [P] Build macOS DMG: `cd desktop && pnpm tauri build --target aarch64-apple-darwin`
- [ ] T106 [P] Update frontend/package.json with new component exports
- [ ] T107 Run quickstart.md validation and update if needed
- [ ] T108 Performance testing: Review Mode with 10,000+ images
- [ ] T109 Security review: API key handling, XMP parsing, credential storage

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **US1-US5 (Phase 3-7)**: Depend on Foundational; can proceed sequentially P1→P5
- **US6-US9 (Phase 8-11)**: Depend on Foundational AND US2/US3 (XMP service); desktop-specific
- **Polish (Phase 12)**: Depends on all desired user stories

### User Story Dependencies

| Story | Dependencies | Can Start After |
|-------|-------------|-----------------|
| US1 (P1) | Foundational only | Phase 2 |
| US2 (P2) | US1 for metadata endpoints | Phase 3 |
| US3 (P3) | US2 for XMP service | Phase 4 |
| US4 (P4) | US1 for Review Mode base | Phase 3 |
| US5 (P5) | US1 for Review Mode base | Phase 3 |
| US6 (P6) | Foundational + API key infra | Phase 2 |
| US7 (P7) | US6 for desktop app setup | Phase 8 |
| US8 (P8) | US7 for upload sync, US2 for XMP | Phase 9 |
| US9 (P9) | US7 for core sync functionality | Phase 9 |

### Parallel Opportunities per Story

**US1**: T021, T022, T023, T024 can run in parallel (different files)
**US2**: T033, T034 can run in parallel
**US3**: T043, T048 can run in parallel
**US6**: T062, T063, T069 can run in parallel
**US7**: T074, T075, T076, T077 can run in parallel
**US8**: T086 independent
**US9**: All tasks sequential (tray integration)

---

## Parallel Example: User Story 1 Frontend

```bash
# Launch all Review Mode components in parallel:
Task: T021 - Create useKeyboardShortcuts hook
Task: T022 - Create useReviewMode hook
Task: T023 - Create RatingStars component
Task: T024 - Create FlagIndicator component

# After hooks complete, create composite components:
Task: T025 - Create ReviewFilmstrip (needs useReviewMode)
Task: T026 - Create ReviewCanvas (needs useReviewMode)
```

---

## Implementation Strategy

### MVP First (US1 + US2 Only)

1. Complete Phase 1: Setup (migrations, models)
2. Complete Phase 2: Foundational (schemas, services)
3. Complete Phase 3: US1 - Review Mode with keyboard shortcuts
4. **STOP and VALIDATE**: Test Review Mode independently
5. Complete Phase 4: US2 - XMP Export
6. **Deploy MVP**: Keyboard culling + XMP export

### Full Web Feature (US1-US5)

1. Phases 1-4 (MVP above)
2. Phase 5: US3 - XMP Import
3. Phase 6: US4 - Compare View
4. Phase 7: US5 - Histogram
5. **Deploy Web Feature**: Full Review Mode with XMP sync

### Full Product (US1-US9)

1. Phases 1-7 (Web Feature above)
2. Phase 8: US6 - Desktop App Setup
3. Phase 9: US7 - Upload Sync
4. Phase 10: US8 - Bidirectional Sync
5. Phase 11: US9 - Background Service
6. Phase 12: Polish
7. **Deploy Full Product**: Web + Desktop integration

---

## Task Summary

| Phase | User Story | Task Count | Parallel Tasks |
|-------|------------|------------|----------------|
| 1 | Setup | 9 | 4 |
| 2 | Foundational | 7 | 3 |
| 3 | US1 - Review Mode | 16 | 6 |
| 4 | US2 - XMP Export | 10 | 3 |
| 5 | US3 - XMP Import | 8 | 2 |
| 6 | US4 - Compare View | 4 | 1 |
| 7 | US5 - Histogram | 3 | 1 |
| 8 | US6 - Desktop Setup | 16 | 4 |
| 9 | US7 - Upload Sync | 12 | 4 |
| 10 | US8 - Bidir Sync | 7 | 1 |
| 11 | US9 - Background | 7 | 0 |
| 12 | Polish | 10 | 5 |
| **Total** | | **109** | **34** |

---

## Notes

- [P] tasks = different files, no dependencies within phase
- [USn] label maps task to user story for traceability
- Each user story is independently testable
- Desktop app (US6-US9) can be deferred if web-only MVP is preferred
- Commit after each task or logical group
- Stop at any checkpoint to validate story
