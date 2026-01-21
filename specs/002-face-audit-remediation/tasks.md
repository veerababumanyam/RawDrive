# Tasks: Face Detection Audit Remediation

**Input**: Design documents from `/specs/002-face-audit-remediation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Branch**: `002-face-audit-remediation`
**Date**: 2026-01-21

**Tests**: Included per audit remediation requirements for compliance verification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/src/app/`
- **Frontend**: `frontend/src/`
- **Tests**: `backend/tests/`, `frontend/tests/`
- **Infrastructure**: `infrastructure/docker/`
- **Migrations**: `backend/migrations/versions/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migrations and base models shared across all user stories

- [x] T001 Create database migration for workspace_biometric_settings table in `backend/migrations/versions/0165_add_biometric_consent_tables.py`
- [x] T002 Create database migration for face_rate_limit_config table in `backend/migrations/versions/0165_add_biometric_consent_tables.py`
- [x] T003 Create database migration for face_embedding_retention_jobs table in `backend/migrations/versions/0165_add_biometric_consent_tables.py`
- [x] T004 Add face_embedding_retention_days fields to workspace_privacy_settings in `backend/migrations/versions/0165_add_biometric_consent_tables.py`
- [x] T005 Run migration and verify schema in development database

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 [P] Create WorkspaceBiometricSettings model in `backend/src/app/models/workspace_biometric_settings.py`
- [x] T007 [P] Create FaceRateLimitConfig model (extends workspace settings) in `backend/src/app/models/workspace_biometric_settings.py`
- [x] T008 [P] Create FaceEmbeddingRetentionJob model in `backend/src/app/models/face_embedding_retention_job.py`
- [x] T009 [P] Add new audit event types (BIOMETRIC_CONSENT_*, FACE_RETENTION_*, FACE_RATE_LIMIT_*) in `backend/src/app/services/audit_service.py`
- [x] T010 [P] Create Pydantic schemas for biometric settings in `backend/src/app/models/workspace_biometric_settings.py` (combined with models)
- [x] T011 [P] Create Pydantic schemas for rate limits in `backend/src/app/models/workspace_biometric_settings.py` (combined with models)
- [x] T012 [P] Create Pydantic schemas for retention policy in `backend/src/app/models/face_embedding_retention_job.py` (combined with models)
- [x] T013 Export new models from `backend/src/app/models/__init__.py`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Biometric Consent Management (Priority: P1)

**Goal**: Implement GDPR Article 9 compliant biometric consent tracking for face detection processing

**Independent Test**: Enable/disable face detection consent in workspace settings and verify detection operations are blocked when consent is not granted.

**Finding**: COM-001

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T014 [P] [US1] Unit test for BiometricConsentService in `backend/tests/unit/test_biometric_consent_service.py`
- [x] T015 [P] [US1] Integration test for biometric consent API endpoints in `backend/tests/integration/test_biometric_consent_api.py`
- [x] T016 [P] [US1] Contract test for biometric-consent-api.yaml compliance in `backend/tests/contract/test_biometric_consent_contract.py`

### Implementation for User Story 1

- [x] T017 [P] [US1] Create BiometricConsentRepository in `backend/src/app/repositories/biometric_settings_repository.py`
- [x] T018 [US1] Create BiometricConsentService with consent check, grant, withdraw logic in `backend/src/app/services/biometric_consent_service.py`
- [x] T019 [US1] Implement consent caching (5 min TTL) in BiometricConsentService using Redis in `backend/src/app/services/biometric_consent_service.py`
- [x] T020 [US1] Create biometric consent API endpoints (GET/POST/DELETE /biometric-consent) in `backend/src/app/api/v1/biometric_consent.py`
- [x] T021 [US1] Create biometric settings API endpoints (GET/PATCH /biometric-settings) in `backend/src/app/api/v1/biometric_consent.py`
- [x] T022 [US1] Create consent history endpoint (GET /biometric-consent/history) in `backend/src/app/api/v1/biometric_consent.py`
- [x] T023 [US1] Register biometric consent router in `backend/src/app/api/v1/__init__.py`
- [x] T024 [US1] Add consent check to face_detection_service.py entry points (block if no consent) - FastAPI dependencies created in `backend/src/app/services/biometric_consent_service.py`
- [x] T025 [US1] Implement cascade deletion job trigger on consent withdrawal in `backend/src/app/services/biometric_consent_service.py`
- [x] T026 [US1] Add audit logging for BIOMETRIC_CONSENT_GRANTED and BIOMETRIC_CONSENT_WITHDRAWN events in `backend/src/app/services/biometric_consent_service.py`
- [x] T027 [P] [US1] Create BiometricSettingsPanel component in `frontend/src/components/workspace/settings/BiometricSettingsPanel.tsx`
- [x] T028 [P] [US1] Create biometricConsentService API client in `frontend/src/services/biometricConsentService.ts`
- [x] T029 [US1] Add BiometricSettingsPanel tab to workspace settings hub in `frontend/src/pages/workspace/settings/WorkspaceSettingsHub.tsx`
- [x] T030 [P] [US1] Write frontend test for BiometricSettingsPanel in `frontend/src/components/workspace/settings/__tests__/BiometricSettingsPanel.test.tsx`

**Checkpoint**: User Story 1 should be fully functional - detection blocked without consent, audit trail captured

---

## Phase 4: User Story 2 - Rate Limiting for Face Operations (Priority: P2)

**Goal**: Implement dedicated rate limits for face operations to protect system resources and control AI provider costs

**Independent Test**: Send requests at various rates to face endpoints and verify throttling occurs at specified limits.

**Finding**: SEC-001

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T031 [P] [US2] Unit test for FaceRateLimitService in `backend/tests/unit/test_face_rate_limit_service.py`
- [x] T032 [P] [US2] Integration test for rate limiting in `backend/tests/integration/test_face_rate_limiting.py`

### Implementation for User Story 2

- [x] T033 [US2] Add FACE_SEARCH, FACE_DETECT, FACE_BULK rate limit types to RateLimitType enum in `backend/src/app/services/rate_limit_service.py`
- [x] T034 [US2] Configure rate limit thresholds (20/min search, 1000/day detect, 30/min bulk) in `backend/src/app/services/rate_limit_service.py`
- [x] T035 [US2] Create FaceRateLimitConfigRepository with sliding window in `backend/src/app/repositories/face_rate_limit_repository.py`
- [x] T036 [US2] Implement rate limit check decorator for face endpoints in `backend/src/app/middleware/rate_limit.py`
- [x] T037 [US2] Apply rate limiting to face search endpoint - FastAPI dependencies in `backend/src/app/api/dependencies/face_rate_limit.py`
- [x] T038 [US2] Apply rate limiting to face detection trigger endpoint - FastAPI dependencies in `backend/src/app/api/dependencies/face_rate_limit.py`
- [x] T039 [US2] Apply rate limiting to bulk face assign endpoint - FastAPI dependencies in `backend/src/app/api/dependencies/face_rate_limit.py`
- [x] T040 [US2] Apply rate limiting to face group merge endpoint - FastAPI dependencies in `backend/src/app/api/dependencies/face_rate_limit.py`
- [x] T041 [US2] Create rate limit config API endpoints (GET/PATCH /face-rate-limits) in `backend/src/app/api/v1/face_rate_limits.py`
- [x] T042 [US2] Create rate limit usage API endpoint (GET /face-rate-limits/usage) in `backend/src/app/api/v1/face_rate_limits.py`
- [x] T043 [US2] Create detection quota API endpoint (GET /face-detection-quota) in `backend/src/app/api/v1/face_rate_limits.py`
- [x] T044 [US2] Register rate limits router in `backend/src/app/api/v1/__init__.py`
- [x] T045 [US2] Ensure 429 responses include Retry-After header in `backend/src/app/api/dependencies/face_rate_limit.py`
- [x] T046 [US2] Add rate-limit-face middleware to Traefik config in `infrastructure/docker/traefik/dynamic.yaml` (already configured)
- [x] T047 [US2] Add audit logging for FACE_RATE_LIMIT_EXCEEDED events in `backend/src/app/api/dependencies/face_rate_limit.py`

**Checkpoint**: User Story 2 should be fully functional - rate-limited requests receive 429 with Retry-After

---

## Phase 5: User Story 3 - Generic Error Messages (Priority: P3)

**Goal**: Replace identifying error messages with generic responses to prevent information leakage

**Independent Test**: Request non-existent or unauthorized face IDs and verify error messages do not reveal the face ID.

**Finding**: SEC-002

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T048 [P] [US3] Unit test for face error sanitization in `backend/tests/unit/test_face_error_handler.py`
- [x] T049 [P] [US3] Integration test for generic error responses in `backend/tests/integration/test_face_error_responses.py`

### Implementation for User Story 3

- [x] T050 [US3] Create error message sanitization map (FACE_NOT_FOUND, GROUP_NOT_FOUND, ACCESS_DENIED) - implemented in `backend/src/app/api/v1/face_groups.py`
- [x] T051 [US3] Modify exception handler to use generic messages while preserving correlation_id in `backend/src/app/api/v1/face_groups.py`
- [x] T052 [US3] Create FaceNotFoundError and FaceGroupNotFoundError custom exceptions - used generic HTTP 404 with sanitized messages
- [x] T053 [US3] Audit and update HTTPException raises in faces.py to use custom exceptions in `backend/src/app/api/v1/faces.py`
- [x] T054 [US3] Audit and update HTTPException raises in face_groups.py to use custom exceptions in `backend/src/app/api/v1/face_groups.py`
- [x] T055 [US3] Ensure cross-workspace 404 returns same message as non-existent resource - implemented generic "Resource not found" messages
- [x] T056 [US3] Add structured logging for original error details with correlation_id in `backend/src/app/api/v1/face_groups.py`

**Checkpoint**: User Story 3 should be fully functional - zero face IDs appear in client-facing error responses

---

## Phase 6: User Story 4 - Face Data Retention Policy (Priority: P4)

**Goal**: Enforce configurable embedding retention with scheduled cleanup for SOC2/GDPR compliance

**Independent Test**: Configure retention periods and verify embeddings older than the retention period are automatically purged.

**Finding**: COM-002

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T057 [P] [US4] Unit test for FaceRetentionService in `backend/tests/unit/test_face_retention_service.py`
- [x] T058 [P] [US4] Integration test for retention cleanup worker in `backend/tests/integration/test_face_retention_worker.py`

### Implementation for User Story 4

- [x] T059 [US4] Create FaceRetentionService with retention check and cleanup logic in `backend/src/app/services/face_retention_service.py`
- [x] T060 [US4] Create face_retention_worker for nightly cleanup in `backend/src/app/workers/face_retention_worker.py` (implemented as standalone worker with polling loop instead of Celery)
- [x] T061 [US4] Implement batch processing with checkpoints (1000 per batch) in `backend/src/app/services/face_retention_service.py`
- [x] T062 [US4] Add schedule for nightly cleanup (3 AM UTC) in `backend/src/app/workers/face_retention_worker.py` (implemented via worker internal scheduling instead of Celery Beat)
- [x] T063 [US4] Create retention policy API endpoints (GET/PATCH /face-retention) in `backend/src/app/api/v1/face_retention.py`
- [x] T064 [US4] Create retention stats API endpoint (GET /face-retention/stats) in `backend/src/app/api/v1/face_retention.py`
- [x] T065 [US4] Create retention jobs history API endpoint (GET /face-retention/jobs) in `backend/src/app/api/v1/face_retention.py`
- [x] T066 [US4] Create admin manual cleanup trigger endpoint (POST /admin/face-retention/cleanup) in `backend/src/app/api/v1/face_retention.py`
- [x] T067 [US4] Register retention router in `backend/src/app/api/v1/__init__.py`
- [x] T068 [US4] Add audit logging for FACE_RETENTION_CLEANUP_STARTED and COMPLETED events in `backend/src/app/services/face_retention_service.py`
- [x] T069 [US4] Handle legal hold exemptions in retention cleanup in `backend/src/app/services/face_retention_service.py` (checks legal holds before deletion in both full deletion and retention cleanup methods)

**Checkpoint**: User Story 4 should be fully functional - embeddings deleted after retention period with audit logging

---

## Phase 7: User Story 5 - Face Group Query Caching (Priority: P5)

**Goal**: Add Redis caching for face group queries to improve gallery load times

**Independent Test**: Query face groups multiple times and measure response time improvement and database query reduction.

**Finding**: PERF-001

### Tests for User Story 5

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T070 [P] [US5] Unit test for face group caching in `backend/tests/unit/test_face_group_caching.py`
- [x] T071 [P] [US5] Integration test for cache hit/miss metrics in `backend/tests/integration/test_face_group_cache.py`

### Implementation for User Story 5

- [x] T072 [US5] Add cache decorator to find_by_gallery_id_with_stats method in `backend/src/app/services/face_group_cache_service.py`
- [x] T073 [US5] Configure cache key pattern (face_groups:{workspace_id}:{gallery_id}:{page}:{limit}) in `backend/src/app/services/face_group_cache_service.py`
- [x] T074 [US5] Set cache TTL to 120 seconds (2 minutes) in `backend/src/app/services/face_group_cache_service.py`
- [x] T075 [US5] Implement cache invalidation method (invalidate_cache) in `backend/src/app/services/face_group_cache_service.py`
- [x] T076 [US5] Add cache invalidation on POST /face-groups (create) in `backend/src/app/api/v1/face_groups.py`
- [x] T077 [US5] Add cache invalidation on PUT /face-groups/{id} (update) in `backend/src/app/api/v1/face_groups.py`
- [x] T078 [US5] Add cache invalidation on POST /face-groups/merge in `backend/src/app/api/v1/face_groups.py`
- [x] T079 [US5] Add cache invalidation on face assignment changes in `backend/src/app/api/v1/faces.py`
- [x] T080 [US5] Add cache hit/miss metrics for monitoring in `backend/src/app/services/face_group_cache_service.py`

**Checkpoint**: User Story 5 should be fully functional - 90%+ cache hit rate, queries return within 50ms

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T081 [P] Update CLAUDE.md with face audit remediation feature context
- [ ] T082 [P] Add API documentation for new endpoints in `docs/api/`
- [ ] T083 Run quickstart.md validation scenarios for all 5 user stories
- [ ] T084 Performance validation - verify rate limit check <10ms p95
- [ ] T085 Performance validation - verify cached queries <50ms p95
- [ ] T086 Performance validation - verify consent check <5ms p95 (cached)
- [ ] T087 Security review - verify all error messages are sanitized
- [ ] T088 Security review - verify workspace isolation in all new endpoints
- [ ] T089 [P] Create default workspace_biometric_settings for existing workspaces (disabled by default)
- [ ] T090 [P] Set default retention period (2555 days) for existing workspaces

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - User stories can proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3 → P4 → P5)
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1) - Consent**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2) - Rate Limits**: Can start after Foundational (Phase 2) - Independent of other stories
- **User Story 3 (P3) - Error Messages**: Can start after Foundational (Phase 2) - Independent of other stories
- **User Story 4 (P4) - Retention**: Can start after Foundational (Phase 2) - Independent of other stories
- **User Story 5 (P5) - Caching**: Can start after Foundational (Phase 2) - Independent of other stories

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Models → Repositories → Services → API endpoints → Frontend (if applicable)
- Core implementation before integration with other components
- Story complete before moving to next priority

### Parallel Opportunities

- All Foundational tasks marked [P] can run in parallel (T006-T012)
- All tests for a user story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members
- Frontend tasks (T027, T028, T030) can run in parallel with unrelated backend tasks

---

## Parallel Example: User Story 1 (Biometric Consent)

```bash
# Launch all tests for User Story 1 together:
Task: "Unit test for BiometricConsentService" (T014)
Task: "Integration test for biometric consent API" (T015)
Task: "Contract test for biometric-consent-api.yaml" (T016)

# After tests, launch parallel model/repository work:
Task: "Create BiometricConsentRepository" (T017)

# Then sequential service → API → frontend:
Task: "Create BiometricConsentService" (T018)
Task: "Create biometric consent API endpoints" (T020-T022)
Task: "Add consent check to face_detection_service" (T024)

# Frontend can run in parallel with later backend tasks:
Task: "Create BiometricSettingsPanel component" (T027)
Task: "Create biometricConsentService API client" (T028)
```

---

## Implementation Strategy

### Risk-Based Implementation Order (Recommended)

The quickstart.md recommends implementing in this order based on risk and complexity:

1. **SEC-002 (US3)** - Generic Error Messages - Low risk, immediate security value
2. **PERF-001 (US5)** - Face Group Caching - Quick win, low risk
3. **SEC-001 (US2)** - Rate Limiting - Medium complexity
4. **COM-001 (US1)** - Biometric Consent - High complexity, requires frontend
5. **COM-002 (US4)** - Retention Policy - Medium complexity, requires worker

This order allows quick wins first while deferring the most complex work (consent with frontend).

### Priority-Based Implementation Order (Spec Priority)

Follow spec.md user story priorities if business risk is the driver:

1. **US1 (P1)** - Consent - GDPR compliance is highest business risk
2. **US2 (P2)** - Rate Limits - Security and cost control
3. **US3 (P3)** - Error Messages - Security hardening
4. **US4 (P4)** - Retention - Compliance documentation
5. **US5 (P5)** - Caching - Performance optimization

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (migrations)
2. Complete Phase 2: Foundational (models, schemas)
3. Complete Phase 3: User Story 1 (Consent)
4. **STOP and VALIDATE**: Test consent flow independently
5. Deploy if ready - other stories add incremental value

### Incremental Delivery

Each story adds compliance/security value independently:

1. Setup + Foundational → Foundation ready
2. Add US3 (Error Messages) → Security hardening (quick win)
3. Add US5 (Caching) → Performance improvement (quick win)
4. Add US2 (Rate Limits) → Resource protection
5. Add US1 (Consent) → GDPR compliance
6. Add US4 (Retention) → Full compliance

---

## Summary

| Phase | Tasks | Parallel Tasks |
|-------|-------|----------------|
| Setup | 5 | 0 |
| Foundational | 8 | 7 |
| US1: Consent | 17 | 6 |
| US2: Rate Limits | 17 | 2 |
| US3: Error Messages | 9 | 2 |
| US4: Retention | 13 | 2 |
| US5: Caching | 11 | 2 |
| Polish | 10 | 4 |
| **Total** | **90** | **25** |

**MVP Scope**: Phase 1 + Phase 2 + User Story 1 (30 tasks)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
