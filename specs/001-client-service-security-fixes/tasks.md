# Tasks: Client Service Security Remediation

**Input**: Design documents from `/specs/001-client-service-security-fixes/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Security tests are included as this is a security remediation with test-first approach specified.

**Organization**: Tasks are grouped by user story (security finding) to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1=Rate Limiting, US2=Auth Errors, US3=Timeouts, US4=RBAC, US5=Audit)
- All paths relative to `services/client-service/`

---

## Phase 1: Setup ✅

**Purpose**: Project preparation and dependency verification

- [x] T001 Verify Python 3.11+ and dependencies in services/client-service/requirements.txt
- [x] T002 [P] Create test directories if missing: services/client-service/tests/unit/ and tests/integration/
- [x] T003 [P] Add error response schemas to services/client-service/src/schemas/common.py per contracts/security-responses.yaml

**Checkpoint**: Setup complete - proceed to foundational tasks

---

## Phase 2: Foundational (Blocking Prerequisites) ✅

**Purpose**: Shared security infrastructure that MUST be complete before user story work

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Create PII field constants in services/client-service/src/constants/pii_fields.py per data-model.md
- [x] T005 [P] Create permission matrix constants in services/client-service/src/constants/permissions.py per plan.md RBAC section
- [x] T006 [P] Update services/client-service/src/middleware/__init__.py to export new middleware classes

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Secure Rate Limiting (Priority: P1) 🎯 MVP ✅

**Goal**: Replace spoofable header-based identification with JWT user_id and trusted IP extraction. Implement fail-closed behavior.

**Independent Test**: Attempt to exceed rate limits while manipulating X-User-ID, X-Visitor-ID, and X-Forwarded-For headers. System should block based on actual JWT user_id or connection IP.

### Tests for User Story 1

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T007 [P] [US1] Create rate limit bypass test: Test spoofed X-User-ID header is ignored in services/client-service/tests/unit/test_rate_limiter_security.py
- [x] T008 [P] [US1] Create rate limit bypass test: Test spoofed X-Visitor-ID header is ignored in services/client-service/tests/unit/test_rate_limiter_security.py
- [x] T009 [P] [US1] Create rate limit bypass test: Test spoofed X-Forwarded-For header is ignored in services/client-service/tests/unit/test_rate_limiter_security.py
- [x] T010 [P] [US1] Create fail-closed test: Test 503 returned when Redis unavailable in services/client-service/tests/unit/test_rate_limiter_security.py
- [x] T011 [P] [US1] Create rate limit test: Test authenticated user identified by JWT user_id from request.state in services/client-service/tests/unit/test_rate_limiter_security.py
- [x] T012 [P] [US1] Create rate limit test: Test anonymous user identified by request.client.host in services/client-service/tests/unit/test_rate_limiter_security.py

### Implementation for User Story 1

- [x] T013 [US1] Fix client identification in services/client-service/src/middleware/rate_limiter.py: Replace lines 136-144 to use request.state.user_id (from JWT) or request.client.host only
- [x] T014 [US1] Fix fail-open vulnerability in services/client-service/src/middleware/rate_limiter.py: Replace lines 189-191 to return 503 with SERVICE_UNAVAILABLE error when Redis fails
- [x] T015 [US1] Add structured logging for rate limit events in services/client-service/src/middleware/rate_limiter.py: Log blocked requests with user identity
- [x] T016 [US1] Verify auth middleware sets request.state.user_id in services/client-service/src/middleware/auth.py (required for rate limiter to work)

**Checkpoint**: US1 complete - Rate limiting cannot be bypassed via header manipulation, fails closed on Redis outage

---

## Phase 4: User Story 2 - Generic Authentication Error Messages (Priority: P1) ✅

**Goal**: Remove information disclosure from JWT validation error responses. All auth errors return identical generic message.

**Independent Test**: Send expired, invalid signature, and malformed JWT tokens. All should return identical "Invalid authentication token" response.

### Tests for User Story 2

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T017 [P] [US2] Create error disclosure test: Expired token returns generic message in services/client-service/tests/unit/test_auth_error_messages.py
- [x] T018 [P] [US2] Create error disclosure test: Invalid signature returns generic message in services/client-service/tests/unit/test_auth_error_messages.py
- [x] T019 [P] [US2] Create error disclosure test: Malformed token returns generic message in services/client-service/tests/unit/test_auth_error_messages.py
- [x] T020 [P] [US2] Create error disclosure test: All auth errors return IDENTICAL response body in services/client-service/tests/unit/test_auth_error_messages.py
- [x] T021 [P] [US2] Create internal logging test: Detailed errors logged at DEBUG level in services/client-service/tests/unit/test_auth_error_messages.py

### Implementation for User Story 2

- [x] T022 [US2] Fix ExpiredSignatureError handler in services/client-service/src/middleware/auth.py line 87-91: Return generic "Invalid authentication token" message
- [x] T023 [US2] Fix InvalidTokenError handler in services/client-service/src/middleware/auth.py line 92-96: Return generic "Invalid authentication token" message
- [x] T024 [US2] Add catch-all handler in services/client-service/src/middleware/auth.py: Return generic message for any other JWT exceptions
- [x] T025 [US2] Add internal DEBUG logging in services/client-service/src/middleware/auth.py: Log detailed error with token prefix for troubleshooting
- [x] T026 [US2] Update get_current_user exception handler in services/client-service/src/middleware/auth.py line 133-140: Return generic message

**Checkpoint**: US2 complete - All JWT errors return identical response, no information disclosure

---

## Phase 5: User Story 3 - Request Timeout Protection (Priority: P2) ✅

**Goal**: Enforce request timeouts (30s read, 60s write) to prevent resource exhaustion attacks.

**Independent Test**: Send slow requests exceeding timeout thresholds. Verify they are terminated with 504 and proper cleanup.

### Tests for User Story 3

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T027 [P] [US3] Create timeout test: GET request exceeding 30s returns 504 in services/client-service/tests/unit/test_timeout.py
- [x] T028 [P] [US3] Create timeout test: POST request exceeding 60s returns 504 in services/client-service/tests/unit/test_timeout.py
- [x] T029 [P] [US3] Create timeout test: Request completing within limits succeeds in services/client-service/tests/unit/test_timeout.py
- [x] T030 [P] [US3] Create timeout test: X-Timeout-Limit and X-Timeout-Remaining headers present in response in services/client-service/tests/unit/test_timeout.py

### Implementation for User Story 3

- [x] T031 [US3] Create TimeoutConfig dataclass in services/client-service/src/middleware/timeout.py: Define read_timeout=30.0, write_timeout=60.0, route_overrides
- [x] T032 [US3] Implement TimeoutMiddleware class in services/client-service/src/middleware/timeout.py: Port pattern from backend/src/app/middleware/timeout.py
- [x] T033 [US3] Implement _get_timeout method in services/client-service/src/middleware/timeout.py: Support method-based and route-specific timeouts
- [x] T034 [US3] Implement dispatch method with asyncio.wait_for in services/client-service/src/middleware/timeout.py: Handle TimeoutError with 504 response
- [x] T035 [US3] Add route overrides for import/export in services/client-service/src/middleware/timeout.py: /clients/import → 120s, /clients/export → 120s
- [x] T036 [US3] Register TimeoutMiddleware in services/client-service/src/main.py: Add to middleware stack after auth middleware

**Checkpoint**: US3 complete - All requests have enforced timeouts, slow requests terminated gracefully

---

## Phase 6: User Story 4 - Role-Based Access Control (Priority: P2) ✅

**Goal**: Implement fixed permission matrix (viewer/editor/admin) for all protected endpoints.

**Independent Test**: Assign different roles to test users and verify each role can only perform permitted operations.

### Tests for User Story 4

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T037 [P] [US4] Create RBAC test: Viewer cannot create/update clients in services/client-service/tests/unit/test_rbac.py
- [x] T038 [P] [US4] Create RBAC test: Editor cannot bulk delete in services/client-service/tests/unit/test_rbac.py
- [x] T039 [P] [US4] Create RBAC test: Editor cannot GDPR export in services/client-service/tests/unit/test_rbac.py
- [x] T040 [P] [US4] Create RBAC test: Admin can bulk delete in services/client-service/tests/unit/test_rbac.py
- [x] T041 [P] [US4] Create RBAC test: Permission denial returns 403 with correct message in services/client-service/tests/unit/test_rbac.py
- [x] T042 [P] [US4] Create RBAC test: Permission denial is logged with user identity in services/client-service/tests/unit/test_rbac.py

### Implementation for User Story 4

- [x] T043 [US4] Create require_permission dependency factory in services/client-service/src/middleware/rbac.py: Accept permission string, return FastAPI dependency
- [x] T044 [US4] Implement permission check logic in services/client-service/src/middleware/rbac.py: Extract role/permissions from JWT, check against matrix
- [x] T045 [US4] Add permission denial logging in services/client-service/src/middleware/rbac.py: Log user_id, action, missing permission
- [x] T046 [US4] Add require_permission to clients.py endpoints in services/client-service/src/api/v1/clients.py: POST/PUT/DELETE require clients:write
- [x] T047 [US4] Add require_permission to bulk_ops.py endpoints in services/client-service/src/api/v1/bulk_ops.py: Bulk delete requires clients:bulk_delete
- [x] T048 [US4] Add require_permission to gdpr.py endpoints in services/client-service/src/api/v1/gdpr.py: Export requires clients:export
- [x] T049 [US4] Add require_permission to import_export.py endpoints in services/client-service/src/api/v1/import_export.py: Import requires clients:import

**Checkpoint**: US4 complete - All protected operations enforce role-based permissions

---

## Phase 7: User Story 5 - Comprehensive Audit Logging (Priority: P3) ✅

**Goal**: Add field-level PII access logging for SOC2 CC6.3 compliance.

**Independent Test**: Perform various data operations and verify complete audit records are created with required compliance fields.

### Tests for User Story 5

> **Write these tests FIRST, ensure they FAIL before implementation**

- [x] T050 [P] [US5] Create audit test: GDPR export creates audit record in services/client-service/tests/unit/test_audit_logging.py
- [x] T051 [P] [US5] Create audit test: PII field access is logged in services/client-service/tests/unit/test_audit_logging.py
- [x] T052 [P] [US5] Create audit test: Bulk operation logs record count in services/client-service/tests/unit/test_audit_logging.py
- [x] T053 [P] [US5] Create audit test: Audit failure doesn't fail operation (best effort) in services/client-service/tests/unit/test_audit_logging.py

### Implementation for User Story 5

- [x] T054 [US5] Add log_pii_access method to services/client-service/src/services/audit_service.py: Accept fields_accessed list, filter to PII fields
- [x] T055 [US5] Add "access" action type to services/client-service/src/services/audit_service.py: Extend valid_actions set
- [x] T056 [US5] Add best-effort wrapper to services/client-service/src/services/audit_service.py: Catch exceptions, log alert, never fail operations
- [x] T057 [US5] Integrate PII logging in services/client-service/src/api/v1/clients.py GET endpoints: Call log_pii_access for single client retrieval
- [x] T058 [US5] Integrate PII logging in services/client-service/src/api/v1/gdpr.py: Call log_pii_access for data exports

**Checkpoint**: US5 complete - Complete audit trails for compliance

---

## Phase 8: Polish & Integration ✅

**Purpose**: Cross-cutting concerns and final validation

- [x] T059 [P] Create end-to-end security integration test in services/client-service/tests/integration/test_security_integration.py: Test all 5 security fixes together
- [x] T060 [P] Add Prometheus metrics for security events in services/client-service/src/observability/metrics.py: rate_limit_blocked, auth_failed, permission_denied, timeout_exceeded
- [x] T061 Run all unit tests: pytest services/client-service/tests/unit/ -v
- [x] T062 Run integration tests: pytest services/client-service/tests/integration/ -v
- [x] T063 Validate quickstart.md security test procedures in specs/001-client-service-security-fixes/quickstart.md
- [x] T064 Run bandit security scan: bandit -r services/client-service/src/

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - start immediately
- **Phase 2 (Foundational)**: Depends on Setup - BLOCKS all user stories
- **Phase 3-7 (User Stories)**: All depend on Foundational completion
  - US1 (P1) and US2 (P1) can run in parallel - both are P1 priority
  - US3 (P2) and US4 (P2) can run in parallel after US1/US2 - both are P2 priority
  - US5 (P3) can start after US4 (needs RBAC for GDPR operations)
- **Phase 8 (Polish)**: Depends on all user stories being complete

### User Story Dependencies

```
Setup (Phase 1)
    ↓
Foundational (Phase 2)
    ↓
    ├── US1: Rate Limiting (P1) ─────────────┐
    │                                         │
    └── US2: Auth Errors (P1) ──────────────┤ (can run in parallel)
                                             ↓
    ├── US3: Timeouts (P2) ──────────────────┤
    │                                         │
    └── US4: RBAC (P2) ──────────────────────┤ (can run in parallel)
                                             ↓
                                       US5: Audit (P3)
                                             ↓
                                       Polish (Phase 8)
```

### Within Each User Story

1. Tests MUST be written and FAIL before implementation
2. Fix/create middleware before API integration
3. Core implementation before logging/metrics
4. Story complete before moving to next priority

---

## Parallel Execution Examples

### User Story 1 - Tests (all can run in parallel)

```bash
# Launch all US1 tests together:
Task: T007 "Rate limit bypass test: spoofed X-User-ID"
Task: T008 "Rate limit bypass test: spoofed X-Visitor-ID"
Task: T009 "Rate limit bypass test: spoofed X-Forwarded-For"
Task: T010 "Fail-closed test: Redis unavailable"
Task: T011 "Rate limit test: JWT user_id"
Task: T012 "Rate limit test: client.host"
```

### User Story 4 - Tests (all can run in parallel)

```bash
# Launch all US4 tests together:
Task: T037 "RBAC test: Viewer cannot create/update"
Task: T038 "RBAC test: Editor cannot bulk delete"
Task: T039 "RBAC test: Editor cannot GDPR export"
Task: T040 "RBAC test: Admin can bulk delete"
Task: T041 "RBAC test: Permission denial 403"
Task: T042 "RBAC test: Permission denial logged"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 - Rate Limiting (CRITICAL)
4. Complete Phase 4: User Story 2 - Auth Errors (HIGH)
5. **STOP and VALIDATE**: Run security tests for rate limiting and auth
6. Deploy if P1 issues are resolved

### Full Security Remediation

1. Complete MVP (above)
2. Add User Story 3 - Timeouts → Test → Deploy
3. Add User Story 4 - RBAC → Test → Deploy
4. Add User Story 5 - Audit → Test → Deploy
5. Complete Phase 8 - Polish

### Parallel Team Strategy

With 2 developers:

1. Both complete Setup + Foundational
2. After Foundational:
   - Developer A: US1 (Rate Limiting) then US3 (Timeouts)
   - Developer B: US2 (Auth Errors) then US4 (RBAC)
3. Both: US5 (Audit) - requires RBAC integration
4. Both: Polish & Integration testing

---

## Task Summary

| Phase | Tasks | Parallel Opportunities |
|-------|-------|----------------------|
| Setup | 3 | 2 parallel |
| Foundational | 3 | 2 parallel |
| US1 - Rate Limiting | 10 | 6 tests parallel |
| US2 - Auth Errors | 10 | 5 tests parallel |
| US3 - Timeouts | 10 | 4 tests parallel |
| US4 - RBAC | 13 | 6 tests parallel |
| US5 - Audit | 9 | 4 tests parallel |
| Polish | 6 | 2 parallel |
| **Total** | **64** | ~31 parallel opportunities |

---

## Notes

- [P] tasks = different files, no dependencies between them
- All file paths are relative to `services/client-service/`
- Tests use pytest-asyncio for async testing
- Security tests should verify ABSENCE of information, not just presence
- Verify tests FAIL before implementing fixes
- Commit after each task or logical group
- Stop at any checkpoint to validate security fixes
