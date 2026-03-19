---
phase: 04-rate-limiting
plan: 01
subsystem: api
tags: [redis, rate-limiting, a2a, sliding-window, fastapi]

# Dependency graph
requires:
  - phase: 01-security-hardening
    provides: A2A auth middleware with API key validation
provides:
  - Per-key RPM enforcement for A2A agent API keys via Redis sliding window
  - Log-only / enforcing mode toggle for safe rollout
  - 429 + Retry-After response in enforcing mode
  - Graceful degradation when Redis is unavailable
affects: [05-workspace-management, 06-ai-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns: [a2a-rate-limit-wiring, log-only-safe-rollout]

key-files:
  created:
    - backend/tests/unit/test_a2a_rate_limit.py
  modified:
    - backend/src/app/middleware/a2a_auth.py
    - backend/src/app/services/rate_limit_service.py
    - backend/src/app/config/settings.py

key-decisions:
  - "Default a2a_rate_limit_mode is log_only for safe production rollout (RATE-04)"
  - "Used monotonic time mock in tests to avoid sorted-set member collisions from rapid calls"

patterns-established:
  - "A2A rate limit wiring: RateLimitService.check_rate_limit() with custom_config from context.rate_limit_rpm"
  - "Log-only toggle pattern: settings field controls enforce vs log-only for gradual rollout"

requirements-completed: [RATE-01, RATE-02, RATE-03, RATE-04]

# Metrics
duration: 4min
completed: 2026-03-18
---

# Phase 4 Plan 1: A2A Rate Limiting Summary

**Redis sliding window rate limiting wired into A2A auth flow with per-key RPM enforcement, 429+Retry-After responses, and log-only safe rollout mode**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-18T21:27:46Z
- **Completed:** 2026-03-18T21:31:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Per-key RPM enforcement for external agent API keys using existing RateLimitService
- Log-only mode (default) for safe production rollout; enforcing mode returns 429 with Retry-After
- Service-to-service calls bypass rate limiting; Redis unavailability degrades gracefully
- Full TDD cycle: 6 failing tests (RED) then implementation to pass all (GREEN)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for A2A rate limiting (RED)** - `89a9f91e` (test)
2. **Task 2: Implement A2A rate limiting (GREEN)** - `f2504930` (feat)

## Files Created/Modified
- `backend/tests/unit/test_a2a_rate_limit.py` - 6 tests covering RATE-01 through RATE-04 plus edge cases
- `backend/src/app/middleware/a2a_auth.py` - Added rate_limit_rpm to A2AContext, implemented check_a2a_rate_limit
- `backend/src/app/services/rate_limit_service.py` - Added RateLimitType.A2A enum value
- `backend/src/app/config/settings.py` - Added a2a_rate_limit_mode setting (default "log_only")

## Decisions Made
- Default a2a_rate_limit_mode is "log_only" for safe production rollout per RATE-04
- Used monotonic time mock in tests to avoid sorted-set member collisions from rapid successive calls with identical timestamps

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test time resolution collision in sliding window**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Rapid test calls produced identical `time.time()` values, causing sorted-set member overwrites instead of additions
- **Fix:** Added `_monotonic_time` fixture that monkeypatches `time.time` to return values 1ms apart
- **Files modified:** backend/tests/unit/test_a2a_rate_limit.py
- **Verification:** All 6 tests pass reliably
- **Committed in:** f2504930 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for test reliability. No scope creep.

## Issues Encountered
None beyond the time resolution fix documented above.

## User Setup Required
None - no external service configuration required. The A2A_RATE_LIMIT_MODE env var defaults to "log_only" and can be changed to "enforcing" when ready.

## Next Phase Readiness
- A2A rate limiting is fully wired and tested
- Ready for Phase 5 (workspace management) and Phase 6 (AI wiring)
- To activate enforcement in production: set `A2A_RATE_LIMIT_MODE=enforcing`

---
*Phase: 04-rate-limiting*
*Completed: 2026-03-18*
