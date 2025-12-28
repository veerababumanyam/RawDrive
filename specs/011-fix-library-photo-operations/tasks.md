# Tasks: Fix Library Photo Operations

**Input**: Design documents from `/specs/011-fix-library-photo-operations/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Test tasks are included per the plan.md requirement ("Test coverage | REQUIRED").

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/`, `frontend/src/`
- This is a bug fix feature - changes are focused on existing files

---

## Phase 1: Setup (Verification)

**Purpose**: Verify environment and confirm bug reproduction

- [x] T001 Verify development environment is running (`npm run docker:dev:up && npm run dev:all`)
- [x] T002 Reproduce Bug #1: Filter by person in library, observe selection state persists in React DevTools
- [x] T003 Reproduce Bug #2: Attempt move operation, verify no toast feedback and observe Network tab

---

## Phase 2: Foundational (Backend Verification)

**Purpose**: Confirm backend APIs are working correctly (no code changes expected)

**⚠️ CRITICAL**: Verify backend is NOT the problem before modifying frontend

- [x] T004 [P] Test move API via curl: `POST /api/v1/workspaces/{id}/library/assets/move` with valid asset_ids and folder_id
- [x] T005 [P] Test add to gallery API via curl: `POST /api/v1/workspaces/{id}/galleries/{id}/assets` with valid asset_ids
- [x] T006 Verify backend logs show successful operations (or capture error responses)

**Checkpoint**: Backend APIs verified working - proceed to frontend fixes

---

## Phase 3: User Story 1 - View Photos by Person Without Moving Them (Priority: P1) 🎯 MVP

**Goal**: Fix unintentional photo moves when filtering library by person (face group)

**Independent Test**: Filter library by clicking a person, verify photos remain in original folders (folder_id unchanged in database)

### Tests for User Story 1

- [x] T007 [P] [US1] Create unit test for selection clearing on filter change in `frontend/src/__tests__/pages/LibraryPage.selection.test.tsx`

### Implementation for User Story 1

- [x] T008 [US1] Add useEffect to clear selectedIds when personFilter changes in `frontend/src/pages/workspace/LibraryPage.tsx` (after line 95)
- [x] T009 [US1] Also clear selection when currentFolder changes in `frontend/src/pages/workspace/LibraryPage.tsx` (same useEffect or new one)
- [x] T010 [US1] Verify filter toggle doesn't trigger move operations by adding console.log guards in `frontend/src/pages/workspace/LibraryPage.tsx`

**Checkpoint**: User Story 1 complete - person filtering is now read-only

---

## Phase 4: User Story 2 - Move Assets from Root to Folder (Priority: P2)

**Goal**: Fix move to folder functionality with proper error handling and feedback

**Independent Test**: Select assets at library root, click "Move to Folder", select folder, verify assets move and success toast appears

### Tests for User Story 2

- [x] T011 [P] [US2] Create unit test for handleMoveToFolder success/error paths in `frontend/src/__tests__/pages/LibraryPage.move.test.tsx`

### Implementation for User Story 2

- [x] T012 [US2] Wrap handleMoveToFolder in try/catch block in `frontend/src/pages/workspace/LibraryPage.tsx` (lines 319-326)
- [x] T013 [US2] Add success toast notification after successful move in `frontend/src/pages/workspace/LibraryPage.tsx`
- [x] T014 [US2] Add error toast notification on move failure in `frontend/src/pages/workspace/LibraryPage.tsx`
- [x] T015 [US2] Add validation guard for empty selectedIds before move in `frontend/src/pages/workspace/LibraryPage.tsx`
- [x] T016 [US2] Use await for sequential fetchAssets/fetchFolders calls in `frontend/src/pages/workspace/LibraryPage.tsx`

**Checkpoint**: User Story 2 complete - move to folder works with feedback

---

## Phase 5: User Story 3 - Move Assets from Library to Gallery (Priority: P2)

**Goal**: Fix add to gallery functionality with proper error handling and feedback

**Independent Test**: Select library assets, click "Add to Gallery", select gallery, verify assets added and success toast appears

### Tests for User Story 3

- [x] T017 [P] [US3] Create unit test for addAssetsToGallery callback success/error paths in `frontend/src/__tests__/pages/LibraryPage.gallery.test.tsx`

### Implementation for User Story 3

- [x] T018 [US3] Wrap MoveToGalleryModal onMove callback in try/catch in `frontend/src/pages/workspace/LibraryPage.tsx` (lines 616-622)
- [x] T019 [US3] Add success toast notification after successful gallery add in `frontend/src/pages/workspace/LibraryPage.tsx`
- [x] T020 [US3] Add error toast notification on gallery add failure in `frontend/src/pages/workspace/LibraryPage.tsx`
- [x] T021 [US3] Add validation guard for empty selectedIds in `frontend/src/pages/workspace/LibraryPage.tsx`
- [x] T022 [US3] Ensure setIsMoveModalOpen(false) is called on success in `frontend/src/pages/workspace/LibraryPage.tsx`

**Checkpoint**: User Story 3 complete - add to gallery works with feedback

---

## Phase 6: User Story 4 - Move Assets Between Folders (Priority: P3)

**Goal**: Ensure folder-to-folder and folder-to-root moves work correctly

**Independent Test**: Navigate to a folder, select assets, move to different folder or root, verify assets move correctly

### Implementation for User Story 4

- [x] T023 [US4] Verify MoveToLibraryFolderModal correctly passes null for "Library Root" option in `frontend/src/components/features/library/MoveToLibraryFolderModal.tsx`
- [x] T024 [US4] Test folder-to-folder move manually and verify folder_id updates in database
- [x] T025 [US4] Test folder-to-root move (folder_id → null) manually and verify

**Checkpoint**: User Story 4 complete - all move directions work

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T026 [P] Add TypeScript types for move operation results if missing in `frontend/src/services/libraryService.ts`
- [x] T027 [P] Ensure toast messages follow i18n patterns (use t() if applicable) in `frontend/src/pages/workspace/LibraryPage.tsx`
- [x] T028 Remove any debug console.log statements added during development
- [x] T029 Run frontend linter: `cd frontend && npm run lint` (Note: ESLint config missing - pre-existing issue)
- [x] T030 Run existing frontend tests: `cd frontend && npm test` (Note: TypeScript errors pre-existing)
- [x] T031 Manual QA: Run through all 4 user story test scenarios documented in spec.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Setup - verifies backend works
- **User Story 1 (Phase 3)**: Depends on Foundational - P1 priority, MVP
- **User Story 2 (Phase 4)**: Depends on Foundational - can run parallel with US1
- **User Story 3 (Phase 5)**: Depends on Foundational - can run parallel with US1/US2
- **User Story 4 (Phase 6)**: Depends on US2 (shared move logic) - run after US2
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

| Story | Priority | Depends On | Can Parallel With |
|-------|----------|------------|-------------------|
| US1   | P1       | Phase 2    | US2, US3          |
| US2   | P2       | Phase 2    | US1, US3          |
| US3   | P2       | Phase 2    | US1, US2          |
| US4   | P3       | US2        | -                 |

### Within Each User Story

- Tests MUST be written first (T007, T011, T017)
- Implementation follows tests
- Manual verification at each checkpoint

### Parallel Opportunities

Within Phase 2 (Foundational):
```
T004 (move API test) || T005 (gallery API test) || T006 (logs check)
```

User Stories 1-3 can run in parallel after Phase 2:
```
Phase 2 complete → US1 (T007-T010) || US2 (T011-T016) || US3 (T017-T022)
```

Within Phase 7 (Polish):
```
T026 (types) || T027 (i18n)
```

---

## Parallel Example: All User Story Tests

```bash
# Launch all user story tests together (after Phase 2):
Task: "[US1] Create unit test for selection clearing in frontend/src/__tests__/pages/LibraryPage.selection.test.tsx"
Task: "[US2] Create unit test for handleMoveToFolder in frontend/src/__tests__/pages/LibraryPage.move.test.tsx"
Task: "[US3] Create unit test for addAssetsToGallery in frontend/src/__tests__/pages/LibraryPage.gallery.test.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T006)
3. Complete Phase 3: User Story 1 (T007-T010)
4. **STOP and VALIDATE**: Person filter no longer causes unintentional moves
5. Deploy fix for critical bug

### Incremental Delivery

1. Setup + Foundational → Bug confirmed, backend verified
2. Add User Story 1 → Test → Deploy (Critical bug fixed!)
3. Add User Story 2 → Test → Deploy (Move to folder works)
4. Add User Story 3 → Test → Deploy (Add to gallery works)
5. Add User Story 4 → Test → Deploy (All move directions work)
6. Polish → Final QA → Complete

### Single Developer Strategy (Recommended)

1. Phase 1-2: ~30 minutes
2. User Story 1: ~1 hour (MVP COMPLETE)
3. User Story 2: ~1 hour
4. User Story 3: ~45 minutes
5. User Story 4: ~30 minutes
6. Polish: ~30 minutes

**Total estimated time**: ~4-5 hours

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- This is a bug fix - no new entities or major refactoring
- Primary file changed: `frontend/src/pages/workspace/LibraryPage.tsx`
- Backend should NOT require changes (verified in Phase 2)
- Commit after each user story completes for easy rollback
- Stop at any checkpoint to deploy partial fix
