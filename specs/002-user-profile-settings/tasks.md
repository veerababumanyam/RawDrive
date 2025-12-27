# Tasks: User Profile Settings

**Input**: Design documents from `/specs/002-user-profile-settings/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/user-settings-api.yaml, quickstart.md

**Tests**: Not explicitly requested in specification. Test tasks excluded per template guidelines.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/src/app/` (FastAPI Python)
- **Frontend**: `frontend/src/` (React TypeScript)
- **Migrations**: `backend/migrations/versions/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and migration

- [x] T001 Add pyotp>=2.9 and geoip2>=4.7 dependencies to backend/pyproject.toml
- [x] T002 [P] Download GeoLite2-City.mmdb and place in backend/data/geoip/
- [x] T003 Create database migration 0037_user_profile_settings.py in backend/migrations/versions/
- [x] T004 Run migration to extend users table and create new tables (user_totp_settings, data_export_requests, account_deletion_requests)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 [P] Create Pydantic schemas for user profile in backend/src/app/api/schemas.py (UserProfileResponse, UpdateProfileRequest)
- [x] T006 [P] Create Pydantic schemas for security endpoints in backend/src/app/api/schemas.py (ChangePasswordRequest, TwoFactorSetupResponse, SessionItem, etc.)
- [x] T007 [P] Create Pydantic schemas for notification/privacy/deletion in backend/src/app/api/schemas.py
- [x] T008 [P] Create TypeScript types for user settings in frontend/src/types/userSettings.ts
- [x] T009 [P] Create userSettingsService.ts API client in frontend/src/services/userSettingsService.ts
- [x] T010 [P] Create useUserSettings.ts React hooks in frontend/src/hooks/useUserSettings.ts
- [x] T011 Create settings layout component with sidebar navigation in frontend/src/components/layout/SettingsLayout.tsx
- [x] T012 Add settings routes to frontend/src/router/routes.tsx (profile, security, notifications, privacy, account)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - View and Edit Personal Profile (Priority: P1)

**Goal**: Users can view and update their profile information including avatar, display name, job title, phone, timezone, bio, and email

**Independent Test**: Navigate to Profile from user dropdown, view current information, edit fields, upload avatar, save changes

### Backend Implementation for User Story 1

- [ ] T013 [P] [US1] Extend GET /users/me endpoint to return new profile fields in backend/src/app/api/v1/users.py
- [ ] T014 [P] [US1] Extend PATCH /users/me endpoint to handle new profile fields in backend/src/app/api/v1/users.py
- [ ] T015 [US1] Create avatar upload service with R2 storage integration in backend/src/app/services/avatar_service.py
- [ ] T016 [US1] Implement POST /users/me/avatar endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T017 [US1] Implement DELETE /users/me/avatar endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T018 [US1] Implement email change request with verification in backend/src/app/services/auth_service.py
- [ ] T019 [US1] Implement POST /users/me/email endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T020 [US1] Add profile update audit logging in backend/src/app/api/v1/users.py

### Frontend Implementation for User Story 1

- [ ] T021 [P] [US1] Create AvatarUploader component with crop functionality in frontend/src/components/settings/AvatarUploader.tsx
- [ ] T022 [US1] Create ProfileSettingsPage with profile form in frontend/src/pages/workspace/settings/ProfileSettingsPage.tsx
- [ ] T023 [US1] Add timezone picker component using existing UI components in frontend/src/components/settings/TimezonePicker.tsx
- [ ] T024 [US1] Implement email change confirmation modal in frontend/src/components/settings/EmailChangeModal.tsx
- [ ] T025 [US1] Add form validation with zod schema for profile fields in frontend/src/pages/workspace/settings/ProfileSettingsPage.tsx

**Checkpoint**: User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Manage Account Security Settings (Priority: P2)

**Goal**: Users can change password, enable/disable 2FA, manage backup codes, and view/terminate active sessions

**Independent Test**: Navigate to Security tab, change password, enable 2FA with authenticator app, view and terminate sessions

### Backend Implementation for User Story 2

- [ ] T026 [P] [US2] Create TOTP service with pyotp integration in backend/src/app/services/totp_service.py
- [ ] T027 [P] [US2] Create geolocation service for session location in backend/src/app/services/geolocation_service.py
- [ ] T028 [US2] Implement password change with session invalidation in backend/src/app/services/auth_service.py
- [ ] T029 [US2] Implement POST /users/me/password endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T030 [US2] Implement POST /users/me/2fa/setup endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T031 [US2] Implement POST /users/me/2fa/verify endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T032 [US2] Implement GET /users/me/2fa endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T033 [US2] Implement DELETE /users/me/2fa endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T034 [US2] Implement POST /users/me/2fa/backup-codes endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T035 [US2] Extend GET /users/me/sessions to include location data in backend/src/app/api/v1/users.py
- [ ] T036 [US2] Add security audit logging for password/2FA changes in backend/src/app/api/v1/user_settings.py

### Frontend Implementation for User Story 2

- [ ] T037 [P] [US2] Create PasswordChangeForm component in frontend/src/components/settings/PasswordChangeForm.tsx
- [ ] T038 [P] [US2] Create TwoFactorSetup wizard component in frontend/src/components/settings/TwoFactorSetup.tsx
- [ ] T039 [P] [US2] Create BackupCodesDisplay component in frontend/src/components/settings/BackupCodesDisplay.tsx
- [ ] T040 [P] [US2] Create SessionList component with terminate action in frontend/src/components/settings/SessionList.tsx
- [ ] T041 [US2] Create SecuritySettingsPage with all security components in frontend/src/pages/workspace/settings/SecuritySettingsPage.tsx
- [ ] T042 [US2] Add QR code generation for 2FA setup using qrcode library in frontend/src/components/settings/TwoFactorSetup.tsx
- [ ] T043 [US2] Implement session termination confirmation modal in frontend/src/components/settings/SessionList.tsx

**Checkpoint**: User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Configure Notification Preferences (Priority: P3)

**Goal**: Users can toggle email and in-app notifications by category

**Independent Test**: Navigate to Notifications tab, toggle notification categories, verify preferences persist after logout/login

### Backend Implementation for User Story 3

- [ ] T044 [P] [US3] Create notification preference service in backend/src/app/services/notification_service.py
- [ ] T045 [US3] Implement GET /users/me/notifications endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T046 [US3] Implement PATCH /users/me/notifications endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T047 [US3] Add Redis caching for notification preferences (5 min TTL) in backend/src/app/services/notification_service.py

### Frontend Implementation for User Story 3

- [ ] T048 [P] [US3] Create NotificationToggleGroup component in frontend/src/components/settings/NotificationToggleGroup.tsx
- [ ] T049 [US3] Create NotificationSettingsPage with category toggles in frontend/src/pages/workspace/settings/NotificationSettingsPage.tsx
- [ ] T050 [US3] Implement optimistic updates for toggle changes in frontend/src/pages/workspace/settings/NotificationSettingsPage.tsx

**Checkpoint**: User Stories 1, 2, AND 3 should all work independently

---

## Phase 6: User Story 4 - Manage Privacy and Data Settings (Priority: P3)

**Goal**: Users can toggle analytics/public profile and request GDPR data export

**Independent Test**: Navigate to Privacy tab, toggle settings, request data export, check export status

### Backend Implementation for User Story 4

- [ ] T051 [P] [US4] Create data export service with BullMQ job in backend/src/app/services/data_export_service.py
- [ ] T052 [P] [US4] Create data export worker for async processing in backend/src/app/workers/data_export_worker.py
- [ ] T053 [US4] Implement GET /users/me/privacy endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T054 [US4] Implement PATCH /users/me/privacy endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T055 [US4] Implement POST /users/me/export endpoint with rate limiting in backend/src/app/api/v1/user_settings.py
- [ ] T056 [US4] Implement GET /users/me/export endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T057 [US4] Add export data collection logic (profile, galleries, activity) in backend/src/app/services/data_export_service.py

### Frontend Implementation for User Story 4

- [ ] T058 [P] [US4] Create PrivacyToggle component in frontend/src/components/settings/PrivacyToggle.tsx
- [ ] T059 [P] [US4] Create DataExportStatus component in frontend/src/components/settings/DataExportStatus.tsx
- [ ] T060 [US4] Create PrivacySettingsPage in frontend/src/pages/workspace/settings/PrivacySettingsPage.tsx
- [ ] T061 [US4] Add polling for export status in frontend/src/hooks/useUserSettings.ts

**Checkpoint**: User Stories 1, 2, 3, AND 4 should all work independently

---

## Phase 7: User Story 5 - Delete Account (Priority: P3)

**Goal**: Users can request account deletion with 14-day grace period and cancel if needed

**Independent Test**: Navigate to Danger Zone, initiate deletion, verify grace period, cancel by logging in

### Backend Implementation for User Story 5

- [ ] T062 [P] [US5] Create account deletion service in backend/src/app/services/account_deletion_service.py
- [ ] T063 [P] [US5] Create account deletion worker for scheduled processing in backend/src/app/workers/account_deletion_worker.py
- [ ] T064 [US5] Implement POST /users/me/delete endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T065 [US5] Implement DELETE /users/me/delete (cancel) endpoint in backend/src/app/api/v1/user_settings.py
- [ ] T066 [US5] Add login hook to cancel pending deletion in backend/src/app/services/auth_service.py
- [ ] T067 [US5] Implement data cleanup and anonymization logic in backend/src/app/services/account_deletion_service.py
- [ ] T068 [US5] Add deletion confirmation and final notification emails in backend/src/app/services/account_deletion_service.py

### Frontend Implementation for User Story 5

- [ ] T069 [P] [US5] Create DeleteAccountModal with confirmation flow in frontend/src/components/settings/DeleteAccountModal.tsx
- [ ] T070 [US5] Create DangerZonePage in frontend/src/pages/workspace/settings/DangerZonePage.tsx
- [ ] T071 [US5] Add deletion status banner when deletion is pending in frontend/src/components/settings/DeletionPendingBanner.tsx

**Checkpoint**: All user stories should now be independently functional

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T072 [P] Register user_settings router in backend/src/app/api/v1/__init__.py
- [ ] T073 [P] Add settings menu item to user dropdown in frontend/src/components/layout/UserDropdown.tsx
- [ ] T074 Code review for security vulnerabilities (OWASP checklist)
- [ ] T075 [P] Add loading skeletons to all settings pages
- [ ] T076 [P] Add error boundary to settings layout
- [ ] T077 Accessibility audit for all settings pages (WCAG 2.1 AA)
- [ ] T078 Run quickstart.md validation scenarios
- [ ] T079 Performance optimization: ensure profile update < 500ms, session list < 2s

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3s)
- **Polish (Phase 8)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 4 (P3)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 5 (P3)**: Can start after Foundational (Phase 2) - No dependencies on other stories

### Entity to Story Mapping

| Entity | User Stories |
|--------|--------------|
| users (extended columns) | Foundational (all stories need it) |
| user_totp_settings | US2 only |
| data_export_requests | US4 only |
| account_deletion_requests | US5 only |
| sessions (location column) | US2 only |

### Within Each User Story

- Models/migrations → before services
- Services → before endpoints
- Backend endpoints → before frontend pages
- Core implementation → before integration
- Story complete → before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel
- Backend services marked [P] within same story can run in parallel
- Frontend components marked [P] within same story can run in parallel

---

## Parallel Example: User Story 2 (Security)

```bash
# Launch backend services in parallel:
Task: "Create TOTP service in backend/src/app/services/totp_service.py"
Task: "Create geolocation service in backend/src/app/services/geolocation_service.py"

# Launch frontend components in parallel:
Task: "Create PasswordChangeForm in frontend/src/components/settings/PasswordChangeForm.tsx"
Task: "Create TwoFactorSetup wizard in frontend/src/components/settings/TwoFactorSetup.tsx"
Task: "Create BackupCodesDisplay in frontend/src/components/settings/BackupCodesDisplay.tsx"
Task: "Create SessionList component in frontend/src/components/settings/SessionList.tsx"
```

---

## Parallel Example: All P3 Stories

```bash
# After Foundational phase, all P3 stories can run in parallel:
# Developer A: User Story 3 (Notifications)
# Developer B: User Story 4 (Privacy & Export)
# Developer C: User Story 5 (Account Deletion)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Profile)
4. **STOP and VALIDATE**: Test profile editing independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Stories 3, 4, 5 (can be parallel) → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Profile) - P1
   - Developer B: User Story 2 (Security) - P2
3. After P1/P2 complete:
   - Developer A: User Story 3 (Notifications)
   - Developer B: User Story 4 (Privacy)
   - Developer C: User Story 5 (Deletion)
4. Stories complete and integrate independently

---

## Task Summary

| Phase | Story | Task Count | Parallel Tasks |
|-------|-------|------------|----------------|
| Phase 1: Setup | - | 4 | 1 |
| Phase 2: Foundational | - | 8 | 6 |
| Phase 3: User Story 1 | US1 | 13 | 4 |
| Phase 4: User Story 2 | US2 | 18 | 6 |
| Phase 5: User Story 3 | US3 | 7 | 2 |
| Phase 6: User Story 4 | US4 | 11 | 4 |
| Phase 7: User Story 5 | US5 | 10 | 3 |
| Phase 8: Polish | - | 8 | 4 |
| **Total** | | **79** | **30** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All endpoints require authentication - reuse existing middleware
- Security tasks include audit logging per SOC 2 requirements
- Avatar storage reuses existing R2 infrastructure
