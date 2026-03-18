---
phase: 09-shared-packages-test-coverage
plan: 02
subsystem: testing
tags: [pytest, integration-tests, auth, multi-tenant, email, httpx, asyncio]

# Dependency graph
requires:
  - phase: 01-security-hardening
    provides: Auth service with JWT, workspace isolation
  - phase: 02-email-infrastructure
    provides: Email verification and password reset services
  - phase: 05-email-auth-password
    provides: Signup email verification, password reset flow
provides:
  - Auth flow integration tests (login, signup, refresh, logout)
  - Multi-tenant workspace isolation tests (albums, comments, RSVPs)
  - Email integration tests (verification, reset, invitation, graceful degradation)
affects: [09-shared-packages-test-coverage]

# Tech tracking
tech-stack:
  added: []
  patterns: [FastAPI dependency_overrides for test isolation, mock pool with asynccontextmanager]

key-files:
  created:
    - backend/tests/integration/test_auth_flows.py
    - backend/tests/integration/test_multi_tenant.py
    - backend/tests/integration/test_email_integration.py
  modified: []

key-decisions:
  - "Used FastAPI dependency_overrides instead of patching _get_auth_service for reliable DI mocking"
  - "Error classes (InvalidCredentialsError etc.) take no constructor args - discovered during test execution"
  - "Used AlbumRepository and AlbumCommentRepository for multi-tenant tests since gallery is a separate microservice"

patterns-established:
  - "dependency_overrides pattern: override _get_auth_service via app.dependency_overrides[fn] for auth endpoint tests"
  - "mock pool pattern: _make_mock_pool with asynccontextmanager for repository-level tests"

requirements-completed: [TEST-01, TEST-02, TEST-03]

# Metrics
duration: 8min
completed: 2026-03-19
---

# Phase 09 Plan 02: Backend Integration Tests Summary

**19 integration tests covering auth flows, multi-tenant workspace isolation, and email sending with graceful degradation**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-18T23:43:24Z
- **Completed:** 2026-03-18T23:51:22Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- 9 auth flow tests covering login (valid/invalid/nonexistent), signup (success/duplicate), token refresh (valid/invalid), logout, and logout-then-refresh sequence
- 5 multi-tenant tests proving workspace_id isolation on albums, album-by-id, comments, RSVPs, and JWT-based workspace extraction
- 5 email tests verifying verification email on signup, password reset, invitation email, graceful degradation on SMTP failure, and no email enumeration leak

## Task Commits

Each task was committed atomically:

1. **Task 1: Auth flow integration tests** - `d06dd483` (test)
2. **Task 2: Multi-tenant isolation + email integration tests** - `99d4a159` (test)

## Files Created/Modified
- `backend/tests/integration/test_auth_flows.py` - 9 tests for login/signup/refresh/logout via httpx AsyncClient
- `backend/tests/integration/test_multi_tenant.py` - 5 tests for workspace_id isolation across repositories and services
- `backend/tests/integration/test_email_integration.py` - 5 tests for email sending triggers and graceful degradation

## Decisions Made
- Used FastAPI `dependency_overrides` instead of `patch("_get_auth_service")` because FastAPI captures the Depends function reference at import time, making simple patching ineffective
- Auth error classes (`InvalidCredentialsError`, `TokenInvalidError`, etc.) take no constructor arguments -- discovered and fixed during test execution
- Used `AlbumRepository` and `AlbumCommentRepository` for multi-tenant tests since `GalleryRepository` lives in the separate gallery microservice

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed error class constructors taking no arguments**
- **Found during:** Task 1 (auth flow tests)
- **Issue:** Tests passed string messages to `InvalidCredentialsError("msg")` but the class `__init__` takes no arguments
- **Fix:** Changed all error instantiations to no-arg: `InvalidCredentialsError()`
- **Files modified:** backend/tests/integration/test_auth_flows.py
- **Verification:** All 9 tests pass
- **Committed in:** d06dd483

**2. [Rule 1 - Bug] Fixed gallery_repository import (module doesn't exist in backend)**
- **Found during:** Task 2 (multi-tenant tests)
- **Issue:** Plan referenced `gallery_repository` but galleries are a separate microservice
- **Fix:** Used `AlbumRepository` and `AlbumCommentRepository` from the backend instead
- **Files modified:** backend/tests/integration/test_multi_tenant.py
- **Verification:** All 5 tests pass
- **Committed in:** 99d4a159

**3. [Rule 1 - Bug] Fixed fetchrow mock for album list count query**
- **Found during:** Task 2 (multi-tenant tests)
- **Issue:** `list_albums` uses `fetchrow` returning `{"count": N}`, not `fetchval`
- **Fix:** Changed mock to `mock_conn.fetchrow = AsyncMock(return_value={"count": 0})`
- **Files modified:** backend/tests/integration/test_multi_tenant.py
- **Verification:** All 5 tests pass
- **Committed in:** 99d4a159

---

**Total deviations:** 3 auto-fixed (3 bugs)
**Impact on plan:** All fixes necessary for test correctness. No scope creep.

## Issues Encountered
- FastAPI dependency injection required `dependency_overrides` pattern rather than simple `patch()` -- resolved by switching approach in Task 1

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 19 integration tests pass, providing regression coverage for auth, multi-tenant isolation, and email flows
- Ready for remaining Phase 09 plans (frontend tests, E2E tests)

---
*Phase: 09-shared-packages-test-coverage*
*Completed: 2026-03-19*
