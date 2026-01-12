# Tasks: Album Preview & Proofing

**Input**: Design documents from `/specs/026-album-proofing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested - test tasks are OPTIONAL and not included by default.

**Scope**: ALL user stories (US1-US5) are REQUIRED for production release. No MVP cut-off.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5) - ONLY in user story phases
- Include exact file paths in descriptions

## User Stories Reference (All Required)

| Story | Priority | Title | Status |
|-------|----------|-------|--------|
| US1 | P1 | Client Reviews Album Proof | Required |
| US2 | P2 | Client Leaves Positioned Comments | Required |
| US3 | P3 | Client Approves Album for Print | Required |
| US4 | P4 | Photographer Manages Versions | Required |
| US5 | P5 | Download Preview PDF | Required |

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, type definitions, and schema setup

- [ ] T001 Create TypeScript album types at frontend/src/types/album.ts with interfaces: Album, AlbumSpread, AlbumElement, AlbumVersion, AlbumComment, AlbumRender, AlbumStatus enum, CommentStatus enum
- [ ] T002 [P] Create Pydantic album schemas at backend/src/app/schemas/album.py with: AlbumCreate, AlbumUpdate, AlbumResponse, AlbumDetailResponse, AlbumSummary
- [ ] T003 [P] Create Pydantic album spread schemas at backend/src/app/schemas/album_spread.py with: AlbumSpreadResponse, AlbumElementResponse
- [ ] T004 [P] Create Pydantic album comment schemas at backend/src/app/schemas/album_comment.py with: AlbumCommentCreate, AlbumCommentUpdate, AlbumCommentResponse, CommentSummary
- [ ] T005 [P] Create Pydantic album version schemas at backend/src/app/schemas/album_version.py with: AlbumVersionCreate, AlbumVersionResponse, AlbumVersionSummary, VersionComparison
- [ ] T006 [P] Create Pydantic album render schemas at backend/src/app/schemas/album_render.py with: AlbumRenderCreate, AlbumRenderResponse, RenderType enum
- [ ] T007 Add album i18n translations at frontend/public/locales/en/album.json with keys for viewer, comments, approval, versions, download

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database models and core services - MUST complete before any user story

**CRITICAL**: No user story work can begin until this phase is complete

### Database Migrations

- [ ] T008 Create migration for albums table at backend/migrations/versions/0160_add_album_proofing_tables.py with fields per data-model.md: album_id, workspace_id, gallery_id, title, description, status, page_size, width_mm, height_mm, bleed_mm, safe_margin_mm, version_number, approved_at, approved_by_email, proof_sent_at
- [ ] T009 Add album_spreads table to migration at backend/migrations/versions/0160_add_album_proofing_tables.py with: spread_id, album_id, workspace_id, page_number, template_id, background_color, left_page_config JSONB, right_page_config JSONB
- [ ] T010 Add album_elements table to migration at backend/migrations/versions/0160_add_album_proofing_tables.py with: element_id, spread_id, workspace_id, type, asset_id, text_content, position_x, position_y, width, height, rotation, opacity, z_index, crop JSONB, styling JSONB
- [ ] T011 Add album_versions table to migration at backend/migrations/versions/0160_add_album_proofing_tables.py with: version_id, album_id, workspace_id, version_number, label, snapshot_data JSONB, created_by_user_id
- [ ] T012 Add album_comments table to migration at backend/migrations/versions/0160_add_album_proofing_tables.py with: comment_id, album_id, spread_id, workspace_id, author_user_id, author_name, author_email, body, position_x CHECK(0-100), position_y CHECK(0-100), status, parent_comment_id, resolved_at, is_internal, deleted
- [ ] T013 Add album_renders table to migration at backend/migrations/versions/0160_add_album_proofing_tables.py with: render_id, album_id, workspace_id, render_type, status, storage_path, file_size_bytes, page_count, watermarked, error_message, expires_at
- [ ] T014 Create migration to extend magic_links table at backend/migrations/versions/0161_add_album_id_to_magic_links.py adding album_id column FK and updating target_type CHECK to include 'album'

### SQLAlchemy Models

- [ ] T015 Create Album model at backend/src/app/models/album.py with status enum (draft, proof_sent, changes_requested, approved, exported), workspace_id FK, relationships to spreads/versions/comments/renders
- [ ] T016 [P] Create AlbumSpread model at backend/src/app/models/album_spread.py with album FK, unique constraint (album_id, page_number), JSONB configs
- [ ] T017 [P] Create AlbumElement model at backend/src/app/models/album_element.py with spread FK, type enum (photo, text, shape), JSONB fields
- [ ] T018 [P] Create AlbumVersion model at backend/src/app/models/album_version.py with album FK, JSONB snapshot_data
- [ ] T019 [P] Create AlbumComment model at backend/src/app/models/album_comment.py with album/spread FKs, self-ref parent_comment_id, position CHECK constraints
- [ ] T020 [P] Create AlbumRender model at backend/src/app/models/album_render.py with album FK, render_type enum, status enum (queued, running, ready, failed)
- [ ] T021 Update models __init__.py at backend/src/app/models/__init__.py to export Album, AlbumSpread, AlbumElement, AlbumVersion, AlbumComment, AlbumRender
- [ ] T022 Extend MagicLink model at backend/src/app/models/magic_link.py to add album_id relationship and update target_type enum to include 'album'

### Core Repositories

- [ ] T023 Create AlbumRepository at backend/src/app/repositories/album_repository.py with methods: get_by_id, list_by_workspace, create, update, delete - ALL queries filter by workspace_id
- [ ] T024 [P] Create AlbumSpreadRepository at backend/src/app/repositories/album_spread_repository.py with methods: get_by_album, get_by_id, create, update, delete, reorder
- [ ] T025 [P] Create AlbumElementRepository at backend/src/app/repositories/album_element_repository.py with methods: get_by_spread, create, update, delete, bulk_create

### Core Services

- [ ] T026 Create AlbumService at backend/src/app/services/album_service.py with methods: get_album, list_albums, create_album, update_album, delete_album, get_album_with_spreads - enforces workspace isolation
- [ ] T027 Extend MagicLinkService at backend/src/app/services/magic_link_service.py to support target_type='album', add create_album_share_link and validate_album_token methods

### Album CRUD API

- [ ] T028 Create album CRUD endpoints at backend/src/app/api/v1/albums.py with: GET /workspaces/{ws}/albums, POST /workspaces/{ws}/albums, GET /workspaces/{ws}/albums/{id}, PATCH /workspaces/{ws}/albums/{id}, DELETE /workspaces/{ws}/albums/{id}
- [ ] T029 Register albums router at backend/src/app/api/v1/__init__.py

### Frontend API Clients

- [ ] T030 Create albumService at frontend/src/services/albumService.ts with authenticated methods: listAlbums, createAlbum, getAlbum, updateAlbum, deleteAlbum, sendProof
- [ ] T031 [P] Create albumProofingService at frontend/src/services/albumProofingService.ts with public methods: getAlbumByToken, addComment, approveAlbum, downloadPreview

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Client Reviews Album Proof (Priority: P1)

**Goal**: Client can view album spreads via share link with navigation, zoom, and flipbook mode

**Independent Test**: Share album link → client opens → views all spreads → navigates via thumbnails → uses flipbook mode

### Backend Implementation for User Story 1

- [ ] T032 [US1] Create public album service at backend/src/app/services/album_public_service.py with method: get_album_by_token (validates share token, returns album with signed URLs for spread images)
- [ ] T033 [US1] Create public album endpoint at backend/src/app/api/v1/album_public.py with GET /public/albums/{token} that validates token via MagicLinkService and returns album proof data
- [ ] T034 [US1] Add send-proof endpoint at backend/src/app/api/v1/albums.py as POST /workspaces/{ws}/albums/{id}/send-proof that creates magic link, updates status to proof_sent, triggers notification
- [ ] T035 [US1] Register album_public router at backend/src/app/api/v1/__init__.py

### Frontend Implementation for User Story 1

- [ ] T036 [US1] Create useAlbumProof hook at frontend/src/hooks/useAlbumProof.ts using React Query to fetch album by share token with loading/error states
- [ ] T037 [US1] Create SpreadViewer component at frontend/src/components/features/album-proofing/SpreadViewer.tsx displaying spread with lazy-loaded images, zoom controls (200% max), pan gestures
- [ ] T038 [P] [US1] Create SpreadThumbnailStrip component at frontend/src/components/features/album-proofing/SpreadThumbnailStrip.tsx with horizontal scrollable thumbnails, active indicator, click navigation
- [ ] T039 [US1] Create FlipbookViewer component at frontend/src/components/features/album-proofing/FlipbookViewer.tsx with CSS page-turn animations, swipe gestures, keyboard navigation (arrow keys)
- [ ] T040 [US1] Create AlbumProofViewer container at frontend/src/components/features/album-proofing/AlbumProofViewer.tsx composing SpreadViewer, SpreadThumbnailStrip, FlipbookViewer with view mode toggle, fullscreen button
- [ ] T041 [US1] Add keyboard navigation to AlbumProofViewer at frontend/src/components/features/album-proofing/AlbumProofViewer.tsx: arrow keys for navigation, Escape to exit fullscreen, Page Up/Down for spread jump
- [ ] T042 [US1] Add touch gesture support to SpreadViewer at frontend/src/components/features/album-proofing/SpreadViewer.tsx: swipe left/right for navigation, pinch-to-zoom
- [ ] T043 [US1] Create AlbumProofPage at frontend/src/pages/public/AlbumProofPage.tsx extracting token from URL, using useAlbumProof hook, rendering AlbumProofViewer
- [ ] T044 [US1] Add public album route at frontend/src/App.tsx as /album/:token rendering AlbumProofPage (no auth required)

**Checkpoint**: User Story 1 complete - clients can view albums via share link with full navigation

---

## Phase 4: User Story 2 - Client Leaves Positioned Comments (Priority: P2)

**Goal**: Client can click anywhere on spread to place comment pin with text, photographer can resolve

**Independent Test**: Click on spread → pin appears at click location → enter comment → submit → pin saved → photographer sees and resolves

### Backend Implementation for User Story 2

- [ ] T045 [US2] Create AlbumCommentRepository at backend/src/app/repositories/album_comment_repository.py with methods: get_by_album, get_by_spread, create, update, soft_delete, get_thread
- [ ] T046 [US2] Create AlbumCommentService at backend/src/app/services/album_comment_service.py with methods: list_comments, create_comment (validates position 0-100), resolve_comment, delete_comment - updates album status to changes_requested on comment create
- [ ] T047 [US2] Add public comment endpoints at backend/src/app/api/v1/album_public.py: GET /public/albums/{token}/comments, POST /public/albums/{token}/comments with body, position_x, position_y, author_name, author_email
- [ ] T048 [US2] Create authenticated comment endpoints at backend/src/app/api/v1/album_comments.py: GET /workspaces/{ws}/albums/{id}/comments, PATCH /workspaces/{ws}/albums/{id}/comments/{cid}, DELETE /workspaces/{ws}/albums/{id}/comments/{cid}, POST /workspaces/{ws}/albums/{id}/comments/{cid}/resolve
- [ ] T049 [US2] Register album_comments router at backend/src/app/api/v1/__init__.py

### WebSocket Implementation for User Story 2

- [ ] T050 [US2] Create album WebSocket handler at services/gallery-service/src/api/v1/album_websocket.py for channel album:{album_id}:proofing
- [ ] T051 [US2] Create AlbumBroadcastService at services/gallery-service/src/services/album_broadcast_service.py with methods: broadcast_comment_added, broadcast_comment_resolved using Redis pub/sub
- [ ] T052 [US2] Register album WebSocket routes at services/gallery-service/src/main.py

### Frontend Implementation for User Story 2

- [ ] T053 [US2] Create useAlbumComments hook at frontend/src/hooks/useAlbumComments.ts with React Query for comment CRUD, optimistic updates
- [ ] T054 [US2] Create useAlbumWebSocket hook at frontend/src/hooks/useAlbumWebSocket.ts connecting to album:{album_id}:proofing channel, handling comment events
- [ ] T055 [US2] Create CommentPin component at frontend/src/components/features/album-proofing/CommentPin.tsx as positioned marker with percentage-based CSS, numbered badge, status styling
- [ ] T056 [P] [US2] Create CommentPinPopover component at frontend/src/components/features/album-proofing/CommentPinPopover.tsx with textarea, author name input, submit button, Cmd/Ctrl+Enter to submit
- [ ] T057 [P] [US2] Create CommentThread component at frontend/src/components/features/album-proofing/CommentThread.tsx showing parent + replies, resolve toggle, reply input
- [ ] T058 [US2] Update SpreadViewer at frontend/src/components/features/album-proofing/SpreadViewer.tsx to render CommentPin overlays, handle click-to-place (calculate percentage from click event)
- [ ] T059 [US2] Add comment filtering to AlbumProofViewer at frontend/src/components/features/album-proofing/AlbumProofViewer.tsx: all/unresolved filter, comment count badge

**Checkpoint**: User Story 2 complete - clients can add positioned comments with real-time sync

---

## Phase 5: User Story 3 - Client Approves Album for Print (Priority: P3)

**Goal**: Client clicks "Approve to Print", confirms in dialog, album status changes, photographer notified

**Independent Test**: Click approve button → see confirmation dialog → (warning if unresolved comments) → confirm → status changes to approved → badge displayed

### Backend Implementation for User Story 3

- [ ] T060 [US3] Create AlbumApprovalService at backend/src/app/services/album_approval_service.py with methods: approve_album (updates status, records approved_at, approved_by_email), check_unresolved_comments, validate_can_approve
- [ ] T061 [US3] Add public approve endpoint at backend/src/app/api/v1/album_public.py as POST /public/albums/{token}/approve with client_name, client_email, acknowledge_unresolved fields
- [ ] T062 [US3] Implement unresolved comment warning in approval flow at backend/src/app/services/album_approval_service.py returning warning with count if unresolved comments exist

### Frontend Implementation for User Story 3

- [ ] T063 [US3] Create ApprovalDialog component at frontend/src/components/features/album-proofing/ApprovalDialog.tsx with confirmation checkbox, unresolved comments warning, client name/email inputs, approve/cancel buttons
- [ ] T064 [P] [US3] Create ApprovalBadge component at frontend/src/components/features/album-proofing/ApprovalBadge.tsx showing "Approved by {name} on {date}" in green, or "Pending Approval" in amber
- [ ] T065 [US3] Integrate approval in AlbumProofViewer at frontend/src/components/features/album-proofing/AlbumProofViewer.tsx: ApprovalBadge in header, "Approve to Print" button (hidden when approved), ApprovalDialog trigger
- [ ] T066 [US3] Add approve mutation to useAlbumProof hook at frontend/src/hooks/useAlbumProof.ts calling POST /public/albums/{token}/approve

**Checkpoint**: User Story 3 complete - clients can approve albums with full workflow protection

---

## Phase 6: User Story 4 - Photographer Manages Versions (Priority: P4)

**Goal**: Photographer can create labeled version snapshots, compare versions side-by-side, rollback to previous version

**Independent Test**: Create version with label → make changes → compare versions → see differences → rollback → album restored

### Backend Implementation for User Story 4

- [ ] T067 [US4] Create AlbumVersionRepository at backend/src/app/repositories/album_version_repository.py with methods: get_by_album, get_by_id, create, get_latest
- [ ] T068 [US4] Create AlbumVersionService at backend/src/app/services/album_version_service.py with methods: create_version (serializes album state to JSONB), list_versions, rollback_to_version (restores from snapshot), compare_versions (generates diff)
- [ ] T069 [US4] Create version endpoints at backend/src/app/api/v1/album_versions.py: GET /workspaces/{ws}/albums/{id}/versions, POST /workspaces/{ws}/albums/{id}/versions, GET /workspaces/{ws}/albums/{id}/versions/{vid}, POST /workspaces/{ws}/albums/{id}/versions/{vid}/rollback, GET /workspaces/{ws}/albums/{id}/versions/compare
- [ ] T070 [US4] Register album_versions router at backend/src/app/api/v1/__init__.py
- [ ] T071 [US4] Add auto-version on send-proof at backend/src/app/services/album_service.py creating version snapshot when proof is sent

### Frontend Implementation for User Story 4

- [ ] T072 [US4] Create useAlbumVersions hook at frontend/src/hooks/useAlbumVersions.ts with queries for list/get versions, mutations for create/rollback
- [ ] T073 [US4] Create VersionHistory component at frontend/src/components/features/album-proofing/VersionHistory.tsx as sidebar listing versions with labels, dates, thumbnails, rollback button
- [ ] T074 [US4] Create VersionComparison component at frontend/src/components/features/album-proofing/VersionComparison.tsx with side-by-side spread view, version selectors, diff highlights
- [ ] T075 [US4] Create AlbumDetailPage for photographers at frontend/src/pages/workspace/AlbumDetailPage.tsx with VersionHistory sidebar, "Create Snapshot" button, version comparison view

**Checkpoint**: User Story 4 complete - photographers have full version control with snapshots and rollback

---

## Phase 7: User Story 5 - Download Preview PDF (Priority: P5)

**Goal**: Client clicks download, receives watermarked low-resolution PDF for offline review

**Independent Test**: Click download button → PDF generates (show progress) → download completes → PDF has watermarks and all spreads

### Backend Implementation for User Story 5

- [ ] T076 [US5] Create AlbumRenderRepository at backend/src/app/repositories/album_render_repository.py with methods: create, get_by_id, get_by_album, update_status, get_latest_by_type
- [ ] T077 [US5] Create AlbumRenderService at backend/src/app/services/album_render_service.py with methods: request_render (queues Celery task), get_render_status, get_download_url (generates signed URL)
- [ ] T078 [US5] Create album render Celery worker at backend/src/app/workers/album_render_worker.py with task: generate_album_pdf using reportlab, adds watermark, uploads to R2, updates status
- [ ] T079 [US5] Create render endpoints at backend/src/app/api/v1/album_renders.py: POST /workspaces/{ws}/albums/{id}/renders, GET /workspaces/{ws}/albums/{id}/renders/{rid}
- [ ] T080 [US5] Add public download endpoint at backend/src/app/api/v1/album_public.py as GET /public/albums/{token}/download returning signed URL or 202 if generating
- [ ] T081 [US5] Register album_renders router at backend/src/app/api/v1/__init__.py

### Frontend Implementation for User Story 5

- [ ] T082 [US5] Create PreviewDownloadButton component at frontend/src/components/features/album-proofing/PreviewDownloadButton.tsx with states: ready (download icon), generating (spinner), error (retry)
- [ ] T083 [US5] Integrate PreviewDownloadButton in AlbumProofViewer at frontend/src/components/features/album-proofing/AlbumProofViewer.tsx in header toolbar

**Checkpoint**: User Story 5 complete - clients can download watermarked preview PDFs

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting multiple user stories

### Notifications

- [ ] T084 Register album event types at services/notifications-service/src/api/v1/event_types.py: album.proof_sent, album.comment_added, album.approved
- [ ] T085 [P] Add notification triggers to AlbumService.send_proof at backend/src/app/services/album_service.py for album.proof_sent
- [ ] T086 [P] Add notification triggers to AlbumCommentService.create_comment at backend/src/app/services/album_comment_service.py for album.comment_added
- [ ] T087 [P] Add notification triggers to AlbumApprovalService.approve_album at backend/src/app/services/album_approval_service.py for album.approved

### Accessibility

- [ ] T088 Add ARIA labels to all album-proofing components: CommentPin, ApprovalDialog, SpreadViewer navigation
- [ ] T089 [P] Ensure keyboard navigation for CommentPin: Enter to expand, Escape to close, Tab order
- [ ] T090 [P] Add skip links to AlbumProofViewer for screen readers: skip to spreads, skip to comments

### Performance

- [ ] T091 Implement virtual scroll for SpreadThumbnailStrip at frontend/src/components/features/album-proofing/SpreadThumbnailStrip.tsx for 100+ spread albums
- [ ] T092 [P] Add image preloading to FlipbookViewer at frontend/src/components/features/album-proofing/FlipbookViewer.tsx: preload next/prev spreads
- [ ] T093 Add skeleton loaders for spread images at frontend/src/components/features/album-proofing/SpreadViewer.tsx with LQIP pattern

### Security

- [ ] T094 Add rate limiting to public album endpoints at backend/src/app/api/v1/album_public.py: 60 req/min viewing, 10 req/min comments
- [ ] T095 [P] Sanitize comment body input at backend/src/app/services/album_comment_service.py to prevent XSS

### Final Validation

- [ ] T096 Run quickstart.md validation: create album, send proof, add comment, approve, download PDF
- [ ] T097 Verify all database queries include workspace_id filter for multi-tenant isolation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phases 3-7)**: All depend on Phase 2 completion
  - Can proceed sequentially (P1 → P2 → P3 → P4 → P5) or in parallel
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: No dependencies - MVP standalone
- **US2 (P2)**: Extends US1 viewer - can develop in parallel, integrates at end
- **US3 (P3)**: Extends US1 viewer - can develop in parallel, integrates at end
- **US4 (P4)**: Completely independent - photographer-only feature
- **US5 (P5)**: Extends US1 viewer - can develop in parallel, integrates at end

### Parallel Opportunities

**Phase 1**: T002-T006 can all run in parallel (different files)

**Phase 2**:
- T016-T020 (models) can run in parallel
- T024-T025 (repositories) can run in parallel
- T030-T031 (frontend services) can run in parallel

**Phase 3 (US1)**: T038 can run parallel with T037

**Phase 4 (US2)**: T056-T057 can run in parallel

**Phase 5 (US3)**: T064 can run parallel with T063

**Phase 8**: T085-T087, T089-T090, T092-T093, T095 can run in parallel

---

## Implementation Strategy

### Production Release (All User Stories Required)

All 5 user stories must be completed for production release:

1. Complete Phase 1: Setup (7 tasks)
2. Complete Phase 2: Foundational (24 tasks)
3. Complete Phase 3: US1 - Client Reviews Album Proof (13 tasks)
4. Complete Phase 4: US2 - Client Leaves Positioned Comments (15 tasks)
5. Complete Phase 5: US3 - Client Approves Album for Print (7 tasks)
6. Complete Phase 6: US4 - Photographer Manages Versions (9 tasks)
7. Complete Phase 7: US5 - Download Preview PDF (8 tasks)
8. Complete Phase 8: Polish & Cross-Cutting (14 tasks)
9. **FINAL VALIDATION**: Run quickstart.md end-to-end test

### Execution Order

| Phase | Tasks | Cumulative | Capability Added |
|-------|-------|------------|------------------|
| Phase 1: Setup | 7 | 7 | Types and schemas |
| Phase 2: Foundational | 24 | 31 | Database, models, core services |
| Phase 3: US1 (P1) | 13 | 44 | View album via share link |
| Phase 4: US2 (P2) | 15 | 59 | Positioned comments |
| Phase 5: US3 (P3) | 7 | 66 | Approval workflow |
| Phase 6: US4 (P4) | 9 | 75 | Version management |
| Phase 7: US5 (P5) | 8 | 83 | PDF download |
| Phase 8: Polish | 14 | 97 | Production ready |

**Total Required**: 97 tasks

### Parallel Team Strategy

With 2-3 developers after Phase 2 (Foundational):

- **Developer A**: US1 (viewer) → US2 (comments) → US3 (approval)
- **Developer B**: US4 (versions) → US5 (PDF) → Polish (notifications)
- **Developer C**: WebSocket/Real-time → Accessibility → Performance

---

## Notes

- [P] = different files, no dependencies - can run in parallel
- [US#] = user story label - ONLY in user story phases (3-7)
- **ALL 97 TASKS ARE REQUIRED** for production release
- All database queries MUST include workspace_id filter (multi-tenant)
- Comment positions stored as percentages (0-100) for responsive layouts
- Version snapshots store full JSONB for simple rollback
- Commit after each task or logical group
- Validate at each checkpoint before proceeding to next phase
