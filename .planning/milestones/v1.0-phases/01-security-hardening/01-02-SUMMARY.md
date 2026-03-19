---
phase: 01-security-hardening
plan: 02
subsystem: backend/curation
tags: [security, state-machine, advisory-locks, race-condition]
dependency_graph:
  requires: []
  provides: [atomic-state-transitions, curation-advisory-locks]
  affects: [curation-session-service, curation-session-repository]
tech_stack:
  added: []
  patterns: [pg_advisory_xact_lock, state-machine-validation, atomic-update]
key_files:
  created:
    - backend/tests/security/test_curation_state_locking.py
  modified:
    - backend/src/app/repositories/curation_session_repository.py
    - backend/src/app/services/curation_session_service.py
decisions:
  - Used pg_advisory_xact_lock(hashtext(session_id)) for lock key derivation
  - Kept deprecated update_status method for backward compatibility
  - Returns None on invalid transition rather than raising (repository level); service raises InvalidStateTransitionError
metrics:
  duration: 162s
  completed: "2026-03-18T20:19:36Z"
---

# Phase 01 Plan 02: Curation State Machine Locking Summary

Advisory-lock-protected curation session state transitions with VALID_TRANSITIONS map, preventing race conditions on concurrent start/pause/complete/fail operations.

## What Was Done

### Task 1: Add advisory-lock-protected atomic state transitions
**Commit:** 78da8e0d

- Added `update_status_atomic` method to `CurationSessionRepository` that acquires `pg_advisory_xact_lock(hashtext(session_id))` before reading current status and conditionally updating
- Added `VALID_TRANSITIONS` constant mapping each target status to allowed source statuses
- Added `InvalidStateTransitionError` exception class
- Updated `start_session`, `pause_session`, `complete_session`, and `fail_session` to use `update_status_atomic` instead of read-then-update pattern
- Marked old `update_status` as deprecated (kept for backward compatibility)
- Added `_allowed_update_fields()` helper to whitelist fields for `extra_updates`

### Task 2: Regression tests for curation state machine locking
**Commit:** 662e077c

- Created `backend/tests/security/test_curation_state_locking.py` with 10 regression tests
- Tests verify `pg_advisory_xact_lock` present in repository source
- Tests verify `VALID_TRANSITIONS` defines all expected state transitions
- Tests verify all 4 service methods call `update_status_atomic`
- Tests verify terminal states (completed, failed) cannot be transitioned from
- All 10 tests pass

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| pg_advisory_xact_lock in repo | >= 1 | 1 | PASS |
| update_status_atomic in service | >= 4 | 4 | PASS |
| VALID_TRANSITIONS in service | >= 1 | 5 | PASS |
| InvalidStateTransitionError in service | >= 2 | 4 | PASS |
| All regression tests pass | 10/10 | 10/10 | PASS |

## Decisions Made

1. **Lock key derivation**: Used `hashtext(session_id::text)` to convert UUID to int for advisory lock key, matching existing codebase pattern
2. **Backward compatibility**: Kept old `update_status` method marked as deprecated rather than removing it, since other callers may still reference it
3. **Repository returns None on invalid transition**: The repository layer returns None for rejected transitions; the service layer interprets this and raises the appropriate exception (InvalidStateTransitionError or SessionNotPausableError)
