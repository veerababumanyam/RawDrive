# Tasks: Per-User Gemini LLM Settings

**Input**: Design documents from `/specs/003-user-gemini-settings/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/user-gemini-settings.yaml

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/src/app/` (Python FastAPI)
- **Frontend**: `frontend/src/` (React TypeScript)
- **Migrations**: `backend/migrations/versions/`
- **Tests**: `backend/tests/`, `frontend/tests/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create feature branch `003-user-gemini-settings` from main
- [x] T002 [P] Add `httpx` dependency to `backend/pyproject.toml` for Gemini API calls (if not present)
- [x] T003 [P] Verify `cryptography` dependency exists in `backend/pyproject.toml` for encryption

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

### Database Schema

- [x] T004 Create migration `backend/migrations/versions/0038_gemini_settings.py` with gemini_models table, user_gemini_settings table, and ai_usage_logs table per data-model.md
- [x] T005 Run migration and verify tables created: `DATABASE_URL="..." PYTHONPATH=src alembic upgrade head`

### Encryption Extension

- [x] T006 Extend `backend/src/app/services/encryption_service.py` with `_derive_user_key(user_id, workspace_id)` method for user-scoped HKDF key derivation
- [x] T007 Add `encrypt_user_api_key(api_key, user_id, workspace_id)` method to EncryptionService
- [x] T008 Add `decrypt_user_api_key(encrypted, user_id, workspace_id)` method to EncryptionService

### Backend Schemas

- [x] T009 [P] Create Pydantic schemas in `backend/src/app/api/schemas.py` for:
  - `UserGeminiSettingsResponse`
  - `UpdateGeminiSettingsRequest`
  - `GeminiValidationError`
  - `KeyValidationResult`
  - `GeminiModelPublic`

### Frontend Types

- [x] T010 [P] Create TypeScript types in `frontend/src/types/geminiSettings.ts` for:
  - `UserGeminiSettings`
  - `GeminiModel`
  - `GeminiValidationError`
  - `KeyValidationResult`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Configure Gemini API Key (Priority: P1) MVP

**Goal**: Users can add/update their Gemini API key with validation and see connection status

**Independent Test**: Navigate to Settings > AI & Gemini, enter a valid API key, see "Connected" status

**Endpoints**: `GET /users/me/gemini-settings`, `PUT /users/me/gemini-settings`, `POST /users/me/gemini-settings/validate`

### Backend Implementation for US1

- [x] T011 [US1] Create `backend/src/app/services/gemini_settings_service.py` with:
  - `get_user_settings(user_id) -> UserGeminiSettings | None`
  - `create_or_update_settings(user_id, api_key, model_id) -> UserGeminiSettings`
  - `_store_api_key(settings, api_key, user_id, workspace_id)` (handles encryption + prefix/suffix)

- [x] T012 [US1] Add API key validation in `gemini_settings_service.py`:
  - `validate_api_key(api_key) -> tuple[bool, str | None, list[str] | None]`
  - Use httpx to call `https://generativelanguage.googleapis.com/v1/models?key={api_key}`
  - Return (is_valid, error_message, available_models)
  - 5 second timeout per research.md

- [x] T013 [US1] Create error mapping in `gemini_settings_service.py`:
  - 400 -> INVALID_KEY: "The API key format appears invalid"
  - 401 -> KEY_UNAUTHORIZED: "This API key is not authorized"
  - 403 -> KEY_FORBIDDEN: "This API key doesn't have permission"
  - 429 -> RATE_LIMITED: "You've reached your Gemini usage limit"
  - 5xx -> SERVICE_UNAVAILABLE: "Gemini is temporarily unavailable"
  - Network error -> NETWORK_ERROR: "Unable to connect to Gemini"

- [x] T014 [US1] Create `backend/src/app/api/v1/gemini_settings.py` router with:
  - `GET /users/me/gemini-settings` - return current settings with masked key
  - `PUT /users/me/gemini-settings` - validate and store new key
  - `POST /users/me/gemini-settings/validate` - validate key without saving

- [x] T015 [US1] Register gemini_settings router in `backend/src/app/api/v1/__init__.py`

### Frontend Implementation for US1

- [x] T016 [P] [US1] Create `frontend/src/services/geminiSettingsService.ts` with:
  - `getSettings() -> Promise<UserGeminiSettings>`
  - `updateSettings(data) -> Promise<UserGeminiSettings>`
  - `validateKey(apiKey) -> Promise<KeyValidationResult>`

- [x] T017 [P] [US1] Create `frontend/src/hooks/useGeminiSettings.ts` with:
  - `useGeminiSettings()` - React Query hook for GET settings
  - `useUpdateGeminiSettings()` - mutation for PUT settings
  - `useValidateGeminiKey()` - mutation for POST validate

- [x] T018 [US1] Create `frontend/src/components/settings/GeminiApiKeyForm.tsx`:
  - Input field for API key (password type with show/hide toggle)
  - "Validate & Save" button with loading state
  - Error display with user-friendly messages
  - Success state showing "Connected" with masked key
  - MUST NOT clear input on validation failure (FR-005)

- [x] T019 [US1] Create `frontend/src/pages/settings/AISettingsPage.tsx`:
  - Header: "AI & Gemini Settings"
  - Status card showing connection state (Connected/Not configured/Validation failed)
  - Masked key display when configured (e.g., "AIza...x7Bq")
  - Last validated timestamp
  - Embed GeminiApiKeyForm component
  - Link to Google AI Studio for key management

- [x] T020 [US1] Add route for AISettingsPage in `frontend/src/router/routes.tsx`:
  - Path: `/settings/ai`
  - Protected route requiring authentication

- [x] T021 [US1] Add "AI & Gemini" navigation item to `frontend/src/components/layout/SettingsLayout.tsx`

**Checkpoint**: User Story 1 complete - Users can configure API keys

---

## Phase 4: User Story 2 - Select Default Gemini Model (Priority: P1)

**Goal**: Users can select their preferred model from admin-managed dropdown

**Independent Test**: User selects model from dropdown, selection persists, AI features use selected model

**Endpoints**: `GET /gemini-models`, model selection via `PUT /users/me/gemini-settings`

### Backend Implementation for US2

- [x] T022 [US2] Add to `gemini_settings_service.py`:
  - `get_active_models() -> list[GeminiModel]`
  - `get_default_model() -> GeminiModel`
  - `update_model_selection(user_id, model_id) -> UserGeminiSettings`

- [x] T023 [US2] Add model endpoints to `backend/src/app/api/v1/gemini_settings.py`:
  - `GET /gemini-models` - return active models sorted by sort_order

- [x] T024 [US2] Add model selection logic to `PUT /users/me/gemini-settings`:
  - Accept `selected_model_id` in request body
  - Validate model_id exists and is active
  - Return effective_model (selected or default)

### Frontend Implementation for US2

- [x] T025 [P] [US2] Add to `frontend/src/services/geminiSettingsService.ts`:
  - `listModels() -> Promise<{models: GeminiModel[], default_model_id: string}>`

- [x] T026 [P] [US2] Add to `frontend/src/hooks/useGeminiSettings.ts`:
  - `useGeminiModels()` - React Query hook for model list

- [x] T027 [US2] Create `frontend/src/components/settings/GeminiModelSelector.tsx`:
  - Dropdown populated with active models from API
  - Show current selection or "(Using platform default)"
  - Save selection on change
  - Show which model is platform default

- [x] T028 [US2] Add GeminiModelSelector to AISettingsPage.tsx:
  - Model Selection section below API Key section
  - Only enabled when API key is configured
  - Show "effective model" indicator

**Checkpoint**: User Stories 1 & 2 complete - Core MVP functionality done

---

## Phase 5: User Story 3 - Revoke/Delete API Key (Priority: P2)

**Goal**: Users can revoke their API key to disconnect from Gemini

**Independent Test**: User clicks "Revoke Key", confirms, key is deleted, AI features become unavailable

**Endpoint**: `DELETE /users/me/gemini-settings`

### Backend Implementation for US3

- [x] T029 [US3] Add to `gemini_settings_service.py`:
  - `revoke_api_key(user_id) -> UserGeminiSettings`
  - Clear api_key_encrypted, prefix, suffix
  - Set status to 'not_configured'
  - Preserve selected_model_id

- [x] T030 [US3] Add revoke endpoint to `backend/src/app/api/v1/gemini_settings.py`:
  - `DELETE /users/me/gemini-settings` - revoke API key
  - Return updated settings with status='not_configured'

### Frontend Implementation for US3

- [x] T031 [P] [US3] Add to `frontend/src/services/geminiSettingsService.ts`:
  - `revokeKey() -> Promise<UserGeminiSettings>`

- [x] T032 [P] [US3] Add to `frontend/src/hooks/useGeminiSettings.ts`:
  - `useRevokeGeminiKey()` - mutation for DELETE

- [x] T033 [US3] Add revoke functionality to AISettingsPage.tsx:
  - "Revoke Key" button (destructive style)
  - Inline confirmation (per FR-007): "This will disconnect your Gemini account. AI features will be unavailable."
  - Update UI to "Not configured" state after revocation

**Checkpoint**: User Story 3 complete - Full user key lifecycle supported

---

## Phase 6: User Story 4 - Admin Manages Model Catalogue (Priority: P2)

**Goal**: Admins can CRUD models in the catalogue

**Independent Test**: Admin adds model, it appears in user dropdown; admin deactivates model, affected users migrated

**Endpoints**: `/admin/gemini-models` (CRUD), `/admin/gemini-models/reorder`

### Backend Implementation for US4

- [ ] T034 [US4] Create `backend/src/app/services/gemini_model_service.py` with:
  - `list_all_models(include_inactive=True) -> list[GeminiModel]`
  - `create_model(data: CreateModelData) -> GeminiModel`
  - `update_model(model_id, data: UpdateModelData) -> GeminiModel`
  - `delete_model(model_id) -> None` (with validation)
  - `reorder_models(model_ids: list[UUID]) -> None`
  - `set_default_model(model_id) -> GeminiModel`

- [ ] T035 [US4] Add user migration logic to `gemini_model_service.py`:
  - `_migrate_users_to_default(model_id)` - called when model deactivated
  - Update all users with selected_model_id = deactivated model
  - Set their selected_model_id to default model

- [ ] T036 [US4] Add admin schemas to `backend/src/app/api/schemas.py`:
  - `GeminiModelAdmin` (extends GeminiModelPublic with admin fields)
  - `CreateGeminiModelRequest`
  - `UpdateGeminiModelRequest`

- [ ] T037 [US4] Create `backend/src/app/api/v1/admin_gemini_models.py` router with:
  - `GET /admin/gemini-models` - list all models (including inactive)
  - `POST /admin/gemini-models` - create model
  - `PUT /admin/gemini-models/{model_id}` - update model
  - `DELETE /admin/gemini-models/{model_id}` - delete model
  - `PUT /admin/gemini-models/reorder` - reorder models

- [ ] T038 [US4] Add admin validation constraints:
  - Cannot delete default model (FR-022)
  - Cannot deactivate last active model (FR-021)
  - Cannot set is_active=False on default model

- [ ] T039 [US4] Register admin_gemini_models router in `backend/src/app/api/v1/__init__.py` with admin middleware

### Frontend Implementation for US4 (Admin Console)

- [ ] T040 [P] [US4] Create `frontend/src/services/adminGeminiService.ts` with admin model CRUD operations

- [ ] T041 [P] [US4] Create `frontend/src/hooks/useAdminGeminiModels.ts` with admin React Query hooks

- [ ] T042 [US4] Create `frontend/src/pages/admin/GeminiModelsPage.tsx`:
  - Table of all models (including inactive)
  - Add Model button with form modal
  - Edit/Delete actions per row
  - Drag-and-drop reordering
  - Default model indicator with "Set as Default" action
  - Active/Inactive toggle

**Checkpoint**: User Story 4 complete - Admin model management functional

---

## Phase 7: User Story 6 - Error Handling (Priority: P2)

**Goal**: Graceful, user-friendly error messages for all AI failure scenarios

**Independent Test**: Simulate key revocation at Google, user sees clear error message

### Backend Implementation for US6

- [ ] T043 [US6] Create `backend/src/app/services/gemini_client_service.py` with:
  - `get_client_for_user(user_id, workspace_id) -> GeminiClient`
  - Resolve user settings, decrypt API key
  - Resolve effective model (selected or default)
  - Raise `AIConfigurationError` if no key configured

- [ ] T044 [US6] Add runtime validation to `gemini_client_service.py`:
  - Catch Gemini API errors during AI calls
  - Map to user-friendly error codes (same as validation errors)
  - Update user status to 'validation_failed' if key becomes invalid

- [ ] T045 [US6] Create `backend/src/app/services/ai_usage_service.py` for logging:
  - `log_ai_call(user_id, workspace_id, model, feature_type, success, error_code)`
  - Insert into ai_usage_logs table

### Frontend Implementation for US6

- [ ] T046 [US6] Create error message components in `frontend/src/components/settings/GeminiErrorAlert.tsx`:
  - Map error codes to user-friendly messages with hints
  - Include "Go to Settings" button for configuration errors
  - Include "Try Again" button for transient errors

- [ ] T047 [US6] Add error handling to AI feature components:
  - Display GeminiErrorAlert when AI calls fail
  - Never show raw technical errors
  - Provide actionable guidance

**Checkpoint**: User Story 6 complete - Robust error handling in place

---

## Phase 8: User Story 5 - Admin Visibility (Priority: P3)

**Goal**: Admins can see user AI configuration status and usage metrics

**Independent Test**: Admin views dashboard, sees users with configured keys and model selections

**Endpoint**: `GET /admin/users/gemini-stats`

### Backend Implementation for US5

- [ ] T048 [US5] Add to `gemini_model_service.py`:
  - `get_admin_stats(workspace_id=None) -> GeminiAdminStats`
  - Count users with key configured
  - Count users by status (connected, validation_failed)
  - Aggregate model distribution

- [ ] T049 [US5] Add `user_count` calculation to admin model listing:
  - Count users who have selected each model
  - Include in GeminiModelAdmin response

- [ ] T050 [US5] Add admin stats schemas to `backend/src/app/api/schemas.py`:
  - `GeminiAdminStats`
  - `ModelDistribution`

- [ ] T051 [US5] Add stats endpoint to `backend/src/app/api/v1/admin_gemini_models.py`:
  - `GET /admin/users/gemini-stats` - return aggregate statistics
  - Optional `workspace_id` query param for filtering

### Frontend Implementation for US5

- [ ] T052 [P] [US5] Add stats fetching to `frontend/src/services/adminGeminiService.ts`

- [ ] T053 [US5] Add stats dashboard to GeminiModelsPage.tsx:
  - Total users / Users with key configured
  - Users by status (pie chart or bar)
  - Model distribution chart
  - Recent AI calls count and success rate

**Checkpoint**: User Story 5 complete - Admin visibility fully implemented

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements affecting multiple user stories

### Integration

- [ ] T054 Integrate `GeminiClientService` with existing AI features:
  - Update AI service calls to use `get_client_for_user()`
  - Add model indicator to AI feature UIs

- [ ] T055 [P] Add database migration for user account deletion cascade:
  - Verify ON DELETE CASCADE on user_gemini_settings.user_id (FR-030)

### Security Hardening

- [ ] T056 Audit all API endpoints for security:
  - Verify no API key exposure in responses
  - Verify no API key logging
  - Verify user isolation (user_id scoping)

- [ ] T057 [P] Add rate limiting to Gemini validation endpoint (prevent abuse)

### Testing

- [ ] T058 [P] Create unit tests in `backend/tests/unit/test_gemini_settings_service.py`:
  - test_create_settings_for_new_user
  - test_validate_api_key_success
  - test_validate_api_key_invalid
  - test_revoke_api_key
  - test_model_selection_with_default_fallback

- [ ] T059 [P] Create unit tests in `backend/tests/unit/test_encryption_user_key.py`:
  - test_encrypt_decrypt_roundtrip
  - test_user_isolation (different users get different derived keys)

- [ ] T060 [P] Create integration tests in `backend/tests/integration/test_gemini_settings_api.py`:
  - test_get_settings_unauthenticated -> 401
  - test_get_settings_new_user -> status='not_configured'
  - test_update_with_invalid_key -> 400
  - test_update_with_valid_key -> status='connected'
  - test_revoke_key -> status='not_configured'

- [ ] T061 [P] Create component tests in `frontend/tests/components/GeminiApiKeyForm.test.tsx`:
  - Renders form correctly
  - Shows loading state during validation
  - Shows error message on validation failure
  - Does not clear input on error

### Documentation

- [ ] T062 [P] Update `docs/api/` with new Gemini endpoints documentation
- [ ] T063 Run quickstart.md validation steps to verify implementation

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1: Setup
    │
    ▼
Phase 2: Foundational (BLOCKS ALL USER STORIES)
    │
    ├──────────────────────────────────────────┐
    ▼                                          ▼
Phase 3: US1 (P1)                    Phase 4: US2 (P1)
Configure API Key                    Select Model
    │                                          │
    └──────────────┬───────────────────────────┘
                   │
                   ▼
    ┌──────────────┼──────────────┐
    ▼              ▼              ▼
Phase 5: US3   Phase 6: US4   Phase 7: US6
Revoke Key     Admin CRUD     Error Handling
(P2)           (P2)           (P2)
    │              │              │
    └──────────────┼──────────────┘
                   │
                   ▼
             Phase 8: US5
             Admin Visibility (P3)
                   │
                   ▼
             Phase 9: Polish
```

### User Story Dependencies

- **US1 (Configure Key)**: Foundation only - can start immediately after Phase 2
- **US2 (Select Model)**: Foundation only - can run parallel with US1
- **US3 (Revoke Key)**: Depends on US1 (must have key to revoke)
- **US4 (Admin CRUD)**: Foundation only - can run parallel with US1/US2
- **US5 (Admin Visibility)**: Depends on US4 (needs model service)
- **US6 (Error Handling)**: Depends on US1 (needs settings service)

### Within Each User Story

1. Backend schemas/models first
2. Backend service methods
3. Backend API endpoints
4. Frontend services (parallel)
5. Frontend hooks (parallel)
6. Frontend components
7. Frontend pages

### Parallel Opportunities

**After Phase 2 completes, launch in parallel:**
- T011-T015 (US1 Backend) || T022-T024 (US2 Backend) || T034-T039 (US4 Backend)
- T016-T017 (US1 Frontend Services) || T025-T026 (US2 Frontend Services) || T040-T041 (US4 Frontend Services)

**Within US1:**
- T016 || T017 (both frontend services)

**Within US2:**
- T025 || T026 (both frontend services)

**Within Phase 9:**
- T055 || T056 || T057 (independent cleanup tasks)
- T058 || T059 || T060 || T061 (all test files)
- T062 || T063 (documentation)

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 - Configure API Key
4. Complete Phase 4: User Story 2 - Select Model
5. **STOP and VALIDATE**: Test full user flow end-to-end
6. Deploy/demo MVP - users can configure keys and select models

### Incremental Delivery

1. **MVP**: Setup + Foundation + US1 + US2 = Core AI configuration
2. **+US3**: Users can revoke keys = Full key lifecycle
3. **+US4**: Admin model management = Platform governance
4. **+US6**: Error handling = Production-ready
5. **+US5**: Admin visibility = Operational excellence
6. **Polish**: Tests, docs, security hardening = Release-ready

### Parallel Team Strategy

With 2+ developers after Phase 2:

| Developer A | Developer B |
|-------------|-------------|
| US1 Backend + Frontend | US2 Backend + Frontend |
| US3 (after US1) | US4 (parallel) |
| US6 (after US1) | US5 (after US4) |

---

## Notes

- [P] tasks = different files, no dependencies
- [US#] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **Security**: Never log API keys, always mask in responses, user-scoped encryption
