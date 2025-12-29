# Tasks: Public Gallery Branding & Album Title

**Input**: Design documents from `/specs/013-public-gallery-branding/`
**Prerequisites**: plan.md (complete), spec.md (complete), research.md (complete), data-model.md (complete), contracts/ (complete)

**Tests**: Not explicitly requested in specification - implementation tasks only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- Backend: Python 3.11 + FastAPI
- Frontend: React 18 + TypeScript

---

## Phase 1: Setup (Database Migration)

**Purpose**: Add album_title column to enable custom album titles on magic links

- [x] T001 Create migration file `backend/migrations/versions/0056_add_album_title_to_magic_links.py` adding `album_title VARCHAR(200)` column
- [x] T002 Run migration: `DATABASE_URL="postgresql://rawdrive:rawdrive@localhost:5432/rawdrive" PYTHONPATH=src alembic upgrade head`
- [x] T003 Verify column exists in database via psql query

---

## Phase 2: Foundational (Backend Schema & Types)

**Purpose**: Update backend schemas and frontend types that all user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 [P] Add `album_title` field to `CreateMagicLinkRequest` schema in `backend/src/app/api/schemas.py` (required, max 200 chars)
- [x] T005 [P] Add `album_title` field to `MagicLinkResponse` schema in `backend/src/app/api/schemas.py` (optional)
- [x] T006 [P] Add `album_title` field to `ValidateMagicLinkResponse` schema in `backend/src/app/api/schemas.py` (optional)
- [x] T007 [P] Add `album_title` field to `MagicLink` interface in `frontend/src/types/gallery.ts`
- [x] T008 [P] Add `album_title` field to `CreateMagicLinkRequest` interface in `frontend/src/types/gallery.ts` (required: string)

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Custom Album Title (Priority: P1)

**Goal**: Enable photographers to set a custom client-facing album title when creating share links, displayed prominently on the public gallery page

**Independent Test**: Create a magic link with album title "Test Wedding Album", open the public link, verify "Test Wedding Album" appears in the hero section (not the internal gallery name)

### Backend Implementation for US1

- [x] T009 [US1] Update `create_link` method in `backend/src/app/services/magic_link_service.py` to accept and store `album_title` parameter
- [x] T010 [US1] Update `validate_token` method in `backend/src/app/services/magic_link_service.py` to return `album_title` from database
- [x] T011 [US1] Update `create_magic_link` endpoint in `backend/src/app/api/v1/magic_links.py` to pass `album_title` from request to service

### Frontend Implementation for US1

- [x] T012 [US1] Add `album_title` state to form in `frontend/src/components/features/gallery/ShareDialog.tsx`
- [x] T013 [US1] Add required "Album Title" input field (AppInput) above "Link Label" in ShareDialog create view
- [x] T014 [US1] Add validation to disable "Create Shareable Link" button until album_title is non-empty
- [x] T015 [US1] Update `getPublicGallery` in `frontend/src/services/galleryService.ts` to return `album_title` from validation response
- [x] T016 [US1] Add `album_title` field to `GalleryDetailData` interface and `ValidatedMagicLink` type in `frontend/src/types/gallery.ts`
- [x] T017 [US1] Update hero section title display in PublicGalleryPage to show `album_title || gallery.title` (line 1089)

**Checkpoint**: Album title feature complete - photographer can create links with custom titles, clients see custom title

---

## Phase 4: User Story 2 - Company Branding in Header (Priority: P1)

**Goal**: Display company name next to logo in header to reinforce studio branding

**Independent Test**: Configure company profile with name "Elegant Moments Photography", open any public gallery link, verify company name appears next to logo in header

### Frontend Implementation for US2

- [x] T018 [US2] Update header section in `frontend/src/pages/public/PublicGalleryPage.tsx` (lines 987-999) to show logo AND company name together
- [x] T019 [US2] Add CSS styling for company name display (hidden on mobile, visible on sm+ screens)
- [x] T020 [US2] Handle edge case: no company profile configured (show nothing, not placeholder)

**Checkpoint**: Company branding complete - header shows logo + company name for all public galleries

---

## Phase 5: User Story 3 - Cover Photo in Hero Section (Priority: P2)

**Goal**: Auto-fill hero section with cover photo (explicit or auto-selected first photo)

**Independent Test**:
1. Gallery with cover photo set - verify cover photo fills hero
2. Gallery without cover photo but with photos - verify first photo fills hero
3. Empty gallery - verify gradient fallback (no broken image)

### Frontend Implementation for US3

- [x] T021 [US3] Update cover URL logic in `frontend/src/pages/public/PublicGalleryPage.tsx` (lines 677-681) to implement fallback:
  - Priority 1: Explicit `cover_asset_id`
  - Priority 2: First asset from `assets` array
  - Priority 3: `null` (gradient fallback)
- [x] T022 [US3] Error handling already present via onError callback (line 1074 - hides broken image)

**Checkpoint**: Cover photo feature complete - hero section always shows a photo when available

---

## Phase 6: User Story 4 - Simplified Hero Display (Priority: P3)

**Goal**: Remove date and photo count badges from hero section for cleaner design

**Independent Test**: Open any public gallery, verify hero section shows ONLY the album title (no date badge, no photo count badge)

### Frontend Implementation for US4

- [x] T023 [US4] Remove date badge from hero section in `frontend/src/pages/public/PublicGalleryPage.tsx` (removed entire badges div)
- [x] T024 [US4] Remove photo count badge from hero section in `frontend/src/pages/public/PublicGalleryPage.tsx` (removed entire badges div)
- [x] T025 [US4] Album title already supports long text via responsive sizing (text-4xl md:text-5xl) - truncation not needed with new simplified design

**Checkpoint**: Simplified hero complete - clean design with only album title visible

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and edge case handling

- [x] T026 Verify backward compatibility: existing magic links (NULL album_title) display gallery.title - implemented via `album_title || gallery.title` fallback
- [x] T027 Special characters and emojis supported - no special handling needed (standard text rendering)
- [x] T028 Company name hidden on mobile (`hidden sm:inline`), visible on larger screens with truncation
- [x] T029 TypeScript compilation passes: `cd frontend && npx tsc --noEmit`
- [x] T030 Python syntax check passes for all modified backend files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T003) - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 and US2 can proceed in parallel (both P1)
  - US3 can start after Foundational (P2)
  - US4 can start after Foundational (P3)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - No dependencies on US1/US2
- **User Story 4 (P3)**: Can start after Foundational (Phase 2) - No dependencies on other stories

### Within Each User Story

- Backend changes before frontend (US1: T009-T011 before T012-T017)
- Schema/service before API endpoint
- Form state before UI rendering

### Parallel Opportunities

- **Phase 2**: All Foundational tasks (T004-T008) can run in parallel
- **Phase 3-6**: After Foundational completes, all user stories can start in parallel
- **Within US1**: Backend tasks (T009-T011) can run in parallel with frontend type work

---

## Parallel Example: Phase 2 Foundational

```bash
# Launch all schema updates in parallel (different files):
Task T004: "Add album_title to CreateMagicLinkRequest schema in backend/src/app/api/schemas.py"
Task T005: "Add album_title to MagicLinkResponse schema in backend/src/app/api/schemas.py"
Task T006: "Add album_title to ValidateMagicLinkResponse schema in backend/src/app/api/schemas.py"
Task T007: "Add album_title to MagicLink interface in frontend/src/types/gallery.ts"
Task T008: "Add album_title to CreateMagicLinkRequest interface in frontend/src/types/gallery.ts"

# Note: T004-T006 are in same file but different classes, can be done together
# T007-T008 are in same file but different interfaces, can be done together
```

## Parallel Example: After Foundational

```bash
# With multiple developers, work on user stories in parallel:
Developer A: User Story 1 (T009-T017) - Album title end-to-end
Developer B: User Story 2 (T018-T020) - Company branding
Developer C: User Story 3 (T021-T022) - Cover photo fallback
Developer D: User Story 4 (T023-T025) - Remove badges
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (migration)
2. Complete Phase 2: Foundational (schemas)
3. Complete Phase 3: User Story 1 (album title)
4. Complete Phase 4: User Story 2 (company branding)
5. **STOP and VALIDATE**: Test both stories independently
6. Deploy/demo if ready (core value delivered!)

### Incremental Delivery

1. Complete Setup + Foundational (T001-T008) - Foundation ready
2. Add User Story 1 (T009-T017) - Album title working - Deploy MVP!
3. Add User Story 2 (T018-T020) - Company branding - Deploy
4. Add User Story 3 (T021-T022) - Cover photo - Deploy
5. Add User Story 4 (T023-T025) - Clean design - Deploy
6. Polish (T026-T030) - Edge cases validated

### Single Developer Strategy

1. Complete all phases sequentially in priority order
2. Each checkpoint allows validation before continuing
3. Can stop at any P1 completion for working MVP

---

## Task Summary

| Phase | Tasks | Purpose |
|-------|-------|---------|
| Setup | T001-T003 | Database migration |
| Foundational | T004-T008 | Schema/type updates |
| US1 (P1) | T009-T017 | Album title feature |
| US2 (P1) | T018-T020 | Company branding |
| US3 (P2) | T021-T022 | Cover photo fallback |
| US4 (P3) | T023-T025 | Remove badges |
| Polish | T026-T030 | Validation |

**Total Tasks**: 30
**MVP Tasks**: 20 (Phases 1-4)
**Parallelizable Tasks**: 13 (marked with [P] or within independent stories)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Existing magic links with NULL album_title must fall back to gallery.title
