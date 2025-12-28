# Tasks: Fix Gallery PIN and Password Persistence

**Input**: Design documents from `/specs/007-fix-gallery-pin-password/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are NOT explicitly requested in the feature specification. Test tasks are omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `backend/src/app/`, `frontend/src/`
- Based on plan.md structure for RawDrive

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema changes and shared type definitions

- [X] T001 Create database migration file `backend/migrations/versions/0047_gallery_credentials_encrypted.py` per data-model.md (note: 0047 instead of 0046 due to existing migration)
- [X] T002 Run migration: `DATABASE_URL=... PYTHONPATH=src alembic upgrade head`
- [X] T003 [P] Add `GalleryCredentialsResponse` type to `frontend/src/types/gallery.ts`
- [X] T004 [P] Add `GalleryCredentialsResponse` schema to `backend/src/app/api/schemas.py`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core backend encryption/decryption functions that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Add `encrypt_gallery_credential(workspace_id, plaintext)` method to `backend/src/app/services/encryption_service.py` (implemented there instead of gallery_service for proper separation)
- [X] T006 Add `decrypt_gallery_credential(workspace_id, ciphertext, iv)` method to `backend/src/app/services/encryption_service.py`
- [X] T007 Modify `update_gallery()` in `backend/src/app/api/v1/galleries.py` to store encrypted password alongside hash when password is set
- [X] T008 Modify `update_gallery()` in `backend/src/app/api/v1/galleries.py` to store encrypted PIN alongside hash when PIN is set
- [X] T009 Modify `update_gallery()` to clear encrypted columns when credentials are removed (remove_password/remove_pin)
- [X] T010 Add `get_gallery_credentials(workspace_id, gallery_id)` method to `backend/src/app/services/gallery_service.py` that decrypts and returns credentials

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - View Existing Password/PIN Status (Priority: P1) MVP

**Goal**: Gallery owners can immediately see whether password/PIN is configured when opening gallery settings

**Independent Test**: Navigate to gallery settings for a gallery with pre-set credentials and verify masked placeholder is displayed

### Implementation for User Story 1

- [X] T011 [US1] Add `GET /v1/workspaces/{workspace_id}/galleries/{gallery_id}/credentials` endpoint to `backend/src/app/api/v1/galleries.py`
- [X] T012 [US1] Add route registration for credentials endpoint in `backend/src/app/api/v1/__init__.py`
- [X] T013 [US1] Add `getGalleryCredentials(workspaceId, galleryId)` API method to `frontend/src/services/galleryService.ts`
- [X] T014 [P] [US1] Update `frontend/src/components/features/gallery/AccessSettings.tsx` to:
  - Add state: `hasPassword`, `passwordRecoverable`, `isLoadingCredentials`
  - Fetch credential status on mount via API
  - Display masked placeholder ("********") when `hasPassword=true`
  - Display empty placeholder when `hasPassword=false`
- [X] T015 [P] [US1] Update `frontend/src/components/features/gallery/PinSettings.tsx` to:
  - Add state: `hasPin`, `pinRecoverable`, `isLoadingCredentials`
  - Fetch credential status on mount via API
  - Display masked placeholder ("****") when `hasPin=true`
  - Display empty placeholder when `hasPin=false`
- [X] T016 [US1] Add loading skeleton to `AccessSettings.tsx` while credentials are being fetched
- [X] T017 [US1] Add loading skeleton to `PinSettings.tsx` while credentials are being fetched

**Checkpoint**: User Story 1 complete - users can now see if credentials are set

---

## Phase 4: User Story 2 - Reveal Existing Credentials (Priority: P2)

**Goal**: Gallery owners can reveal actual password/PIN values by clicking the eye toggle

**Independent Test**: Set credentials, refresh page, click eye toggle, verify stored values are revealed

**Depends on**: User Story 1 (credential status display)

### Implementation for User Story 2

- [X] T018 [US2] Update `AccessSettings.tsx` to:
  - Add state: `revealedPassword` (null initially)
  - On eye toggle click: call `getGalleryCredentials` API to fetch decrypted password
  - Display decrypted password when revealed, masked placeholder when hidden
  - Handle legacy case: show "Original password unavailable" when `passwordRecoverable=false`
- [X] T019 [US2] Update `PinSettings.tsx` to:
  - Add state: `revealedPin` (null initially)
  - On eye toggle click: call `getGalleryCredentials` API to fetch decrypted PIN
  - Display decrypted PIN when revealed, masked placeholder when hidden
  - Handle legacy case: show "Original PIN unavailable" when `pinRecoverable=false`
- [X] T020 [US2] Add loading indicator to eye toggle button while fetching credentials in `AccessSettings.tsx`
- [X] T021 [US2] Add loading indicator to eye toggle button while fetching credentials in `PinSettings.tsx`
- [X] T022 [US2] Add audit logging for credential access: log `gallery.credentials.viewed` event in `backend/src/app/api/v1/galleries.py`

**Checkpoint**: User Story 2 complete - users can now reveal stored credentials

---

## Phase 5: User Story 3 - Update Existing Credentials (Priority: P3)

**Goal**: Gallery owners can change credentials and have them persist across page reloads

**Independent Test**: Set new password, refresh page, reveal password to verify new value is stored

**Depends on**: User Story 2 (reveal functionality to verify updates)

### Implementation for User Story 3

- [X] T023 [US3] Update `AccessSettings.tsx` to:
  - Clear `revealedPassword` when user starts typing new password
  - After successful save, show "Password updated" success toast
  - On next reveal, show newly saved password
- [X] T024 [US3] Update `PinSettings.tsx` to:
  - Clear `revealedPin` when user starts typing new PIN
  - After successful save, show "PIN updated" success toast
  - On next reveal, show newly saved PIN
- [X] T025 [US3] Add visual feedback (success toast) when credentials are saved in `AccessSettings.tsx`
- [X] T026 [US3] Add visual feedback (success toast) when credentials are saved in `PinSettings.tsx`
- [X] T027 [US3] Handle error case: show error toast if credential update fails
- [X] T028 [US3] Add audit logging for credential changes: log `gallery.password.updated` and `gallery.pin.updated` events in `backend/src/app/api/v1/galleries.py`

**Checkpoint**: User Story 3 complete - credential updates persist correctly

---

## Phase 6: User Story 4 - Remove Credentials (Priority: P4)

**Goal**: Gallery owners can disable password/PIN protection and have it persist

**Independent Test**: Toggle off password protection, refresh page, verify protection remains disabled

**Note**: This functionality largely exists but needs integration with new credential display

### Implementation for User Story 4

- [X] T029 [US4] Update `AccessSettings.tsx` to reset credential display state when toggle is turned off
- [X] T030 [US4] Update `PinSettings.tsx` to reset credential display state when toggle is turned off
- [X] T031 [US4] Verify `remove_password: true` correctly clears both `password_hash` AND encrypted columns
- [X] T032 [US4] Verify `remove_pin: true` correctly clears both `pin_hash` AND encrypted columns
- [X] T033 [US4] Add audit logging for credential removal: log `gallery.password.removed` and `gallery.pin.removed` events

**Checkpoint**: User Story 4 complete - credential removal works correctly

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Edge cases, validation, and refinement across all user stories

- [X] T034 [P] Handle special characters in passwords (verify encryption/decryption preserves unicode)
- [X] T035 [P] Handle leading zeros in PINs (verify stored as string, not number)
- [X] T036 [P] Add error handling for concurrent edits (last write wins, show appropriate message)
- [X] T037 [P] Add error handling for network failures when fetching/saving credentials
- [X] T038 [P] Verify PIN validation enforces 4-6 numeric digits in `PinSettings.tsx`
- [X] T039 Run manual validation per quickstart.md checklist
- [X] T040 Code cleanup: remove any console.log statements, add inline comments for complex logic

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (migration) - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational phase completion
- **User Story 2 (Phase 4)**: Depends on User Story 1 (display functionality)
- **User Story 3 (Phase 5)**: Can run parallel to US2 but benefits from US2 for verification
- **User Story 4 (Phase 6)**: Can run parallel to US2/US3
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1: Setup
    │
    ▼
Phase 2: Foundational (BLOCKS ALL)
    │
    ▼
Phase 3: User Story 1 (P1 - MVP) ──────────────────────┐
    │                                                   │
    ▼                                                   │
Phase 4: User Story 2 (P2) ←── depends on US1 display  │
    │                                                   │
    ├────────────────┬─────────────────────────────────┘
    ▼                ▼
Phase 5: US3    Phase 6: US4 (can run in parallel)
    │                │
    └────────┬───────┘
             ▼
       Phase 7: Polish
```

### Within Each User Story

- Backend tasks before frontend tasks (API must exist before UI calls it)
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: T003 and T004 can run in parallel (different files)
- **Phase 3**: T014 and T015 can run in parallel (different components)
- **Phase 5 & 6**: Can run in parallel after US2 is complete
- **Phase 7**: All polish tasks can run in parallel

---

## Parallel Example: User Story 1

```bash
# After T011-T013 complete (backend + API service):
# Launch frontend component updates in parallel:
Task T014: "Update AccessSettings.tsx to display credential status"
Task T015: "Update PinSettings.tsx to display credential status"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (migration)
2. Complete Phase 2: Foundational (encryption methods)
3. Complete Phase 3: User Story 1 (display status)
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Users can now see if credentials are set

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → **MVP complete!**
3. Add User Story 2 → Test independently → Users can reveal credentials
4. Add User Story 3 → Test independently → Users can update credentials
5. Add User Story 4 → Test independently → Users can remove credentials
6. Polish → Production ready

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The existing `update_gallery()` method handles password/PIN updates - modifications add encryption alongside existing hashing
