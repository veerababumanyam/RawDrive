---
phase: 01-security-hardening
plan: 01
subsystem: auth
tags: [hmac, sha256, timing-safe, multi-tenant, security, regression-tests]

# Dependency graph
requires: []
provides:
  - "Timing-safe A2A API key validation using hmac.compare_digest"
  - "Workspace-isolated comment gallery lookup"
  - "Regression tests for SEC-01 and SEC-02"
affects: [04-rate-limiting, 09-shared-packages-test-coverage]

# Tech tracking
tech-stack:
  added: []
  patterns: ["hmac.compare_digest for all secret comparisons", "workspace_id filter on every cross-table lookup"]

key-files:
  created:
    - backend/tests/security/test_a2a_timing_safe.py
    - backend/tests/security/test_comment_workspace_isolation.py
  modified:
    - backend/src/app/middleware/a2a_auth.py
    - backend/src/app/services/comment_service.py

key-decisions:
  - "Fetch all active keys for workspace then loop with hmac.compare_digest rather than single-row SQL lookup"
  - "Removed incompatible asyncio_default_fixture_loop_scope from pyproject.toml to unblock test runner"

patterns-established:
  - "Timing-safe comparison: always use hmac.compare_digest for secret/hash comparisons, never string == or SQL crypt()"
  - "Cross-table lookups: always include workspace_id filter to prevent cross-tenant data leakage"
  - "Regression tests: source-inspection tests that fail if security patterns are reverted"

requirements-completed: [SEC-01, SEC-02, SEC-04]

# Metrics
duration: 3min
completed: 2026-03-18
---

# Phase 1 Plan 1: Timing-safe A2A Comparison and Comment Permission Checks Summary

**SHA-256 + hmac.compare_digest for A2A key validation replacing SQL crypt(), workspace_id filter on comment gallery lookup, 11 regression tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-18T20:16:58Z
- **Completed:** 2026-03-18T20:19:39Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Replaced insecure SQL crypt() key comparison with Python-side SHA-256 hashing and hmac.compare_digest
- Added workspace_id filter to gallery title lookup in comment creation, preventing cross-tenant data leakage
- Created 11 regression tests (5 for A2A timing safety, 6 for comment workspace isolation) that fail if fixes are reverted

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix A2A timing-safe key comparison and comment workspace isolation** - `63e34da8` (fix)
2. **Task 2: Regression tests for timing-safe comparison and comment isolation** - `94600073` (test)

## Files Created/Modified
- `backend/src/app/middleware/a2a_auth.py` - Replaced SQL crypt() with SHA-256 + hmac.compare_digest for API key validation
- `backend/src/app/services/comment_service.py` - Added workspace_id filter to gallery title lookup
- `backend/tests/security/test_a2a_timing_safe.py` - 5 regression tests for timing-safe comparison
- `backend/tests/security/test_comment_workspace_isolation.py` - 6 regression tests for workspace isolation
- `backend/pyproject.toml` - Removed incompatible asyncio_default_fixture_loop_scope config option

## Decisions Made
- Fetch all active keys for workspace then loop with hmac.compare_digest, rather than attempting a single-row SQL lookup with hash comparison. This ensures timing-safe comparison happens in Python, not SQL.
- Removed `asyncio_default_fixture_loop_scope` from pyproject.toml as it is incompatible with the installed pytest-asyncio 0.23.8 / pytest 7.4.4 combination.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed incompatible asyncio_default_fixture_loop_scope from pyproject.toml**
- **Found during:** Task 2 (Regression tests)
- **Issue:** `asyncio_default_fixture_loop_scope = "function"` in pyproject.toml caused `ERROR: Unknown config option` with pytest-asyncio 0.23.8 / pytest 7.4.4, preventing all test collection
- **Fix:** Removed the incompatible config line
- **Files modified:** backend/pyproject.toml
- **Verification:** All 11 tests collected and passed
- **Committed in:** 94600073 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Pre-existing config issue blocking test execution. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Security fixes for A2A key validation and comment isolation are complete with regression tests
- Ready for Plan 01-02 (Curation state machine locking and remaining security regression tests)
- Rate limiting (Phase 4) can build on the corrected A2A key validation

---
*Phase: 01-security-hardening*
*Completed: 2026-03-18*
