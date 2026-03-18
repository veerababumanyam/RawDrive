---
phase: 08-notifications
plan: 02
subsystem: notifications
tags: [churn, curation, websocket, redis, notification-wiring, real-time]
dependency_graph:
  requires: [08-01]
  provides: [churn-notification-events, curation-websocket-events]
  affects: [churn-intervention-worker, curation-session-service]
tech_stack:
  added: []
  patterns: [notification-event-publishing, websocket-event-emission, try-except-ws-guard]
key_files:
  created:
    - backend/tests/test_churn_notification_wiring.py
    - backend/tests/test_curation_notification_wiring.py
  modified:
    - backend/src/app/workers/churn_intervention_worker.py
    - backend/src/app/services/curation_session_service.py
decisions:
  - Wrap emit_event in try/except so WebSocket failure never breaks core notification logic
  - Use priority "high" for churn email interventions since they are time-sensitive
metrics:
  duration: 4min
  completed: "2026-03-19T00:28:00Z"
  tasks: 2
  files: 4
---

# Phase 08 Plan 02: Notification Stub Wiring Summary

Replaced churn intervention "Would send" email stub and curation session TODO with actual notification event publishing and WebSocket event emission via publish_notification_event and emit_event.

## What was done

### Task 1: TDD RED tests for churn and curation notification wiring
- Created `test_churn_notification_wiring.py` with 2 tests: email publishes event, in-app emits WebSocket
- Created `test_curation_notification_wiring.py` with 2 tests: progress emits event, completion emits event
- All 4 tests failed (RED) as expected -- stubs not yet replaced
- Commit: `ff87a05f`

### Task 2: Wire notifications -- make tests GREEN
- Added `publish_notification_event` import and call in `_send_email_intervention`, replacing the "Would send" log stub
- Added `emit_event` call after DB insert in `_create_in_app_notification` for real-time WebSocket delivery
- Added `emit_event` call in `update_progress` replacing the TODO comment in curation session service
- All emit_event calls wrapped in try/except to prevent WebSocket failures from breaking core logic
- All 4 tests pass (GREEN)
- Commit: `4c2f855b`

## Verification

- All 4 new tests pass
- All 9 notification tests pass (Plan 01 + Plan 02 combined)
- No remaining "Would send" stub in churn_intervention_worker.py
- No remaining "TODO: Send WebSocket notification" in curation_session_service.py
- publish_notification_event count in churn worker: 2 (import + call)
- emit_event count in churn worker: 2 (import + call)
- emit_event count in curation service: 2 (import + call)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed async context manager mock in test**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Test mock for `pool.acquire()` used `AsyncMock` which doesn't support async context manager protocol correctly
- **Fix:** Created explicit `FakeAcquire` class with `__aenter__`/`__aexit__` methods
- **Files modified:** backend/tests/test_churn_notification_wiring.py
- **Commit:** 4c2f855b

## Decisions Made

1. **try/except guard on emit_event**: WebSocket event emission is wrapped in try/except in both churn worker and curation service so that Redis/WebSocket failures never break core notification creation or session progress tracking.
2. **High priority for churn emails**: Churn intervention email events use `priority="high"` since they are time-sensitive re-engagement communications.
