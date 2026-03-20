---
phase: 19-downloads-delivery
plan: 02
subsystem: gallery-expiration
tags: [expiration, middleware, notifications, worker, frontend]
dependency_graph:
  requires: []
  provides: [gallery-expiration-middleware, expiration-reminder-worker, expired-gallery-page]
  affects: [gallery-service, notifications-service, frontend-public-gallery]
tech_stack:
  added: []
  patterns: [redis-deduplication, milestone-based-notifications, 410-gone-response]
key_files:
  created:
    - services/gallery-service/src/middleware/expiration.py
    - services/gallery-service/tests/unit/test_expiration.py
    - services/notifications-service/src/workers/expiration_reminder_worker.py
    - services/notifications-service/tests/unit/test_expiration_reminder_worker.py
    - frontend/src/pages/public/ExpiredGalleryPage.tsx
  modified:
    - services/gallery-service/src/api/v1/public/galleries.py
    - services/gallery-service/src/schemas/gallery.py
    - services/gallery-service/src/services/gallery_service.py
    - frontend/src/pages/public/PublicGalleryShell.tsx
    - frontend/src/hooks/usePublicGallery.ts
decisions:
  - Moved expiration check from service layer to API endpoint layer so 410 response includes gallery details (name, photographer) instead of generic 404
  - Used dependency injection pattern for ExpirationReminderWorker (overridable _db_fetch, _redis_get, _redis_setex, _enqueue_email) for clean unit testing without mocking imports
  - Milestone detection uses days-based calculation with 6-7 day window for 7d milestone to handle scan timing
metrics:
  duration: 335s
  completed: "2026-03-20T08:56:08Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 18
  files_created: 5
  files_modified: 5
---

# Phase 19 Plan 02: Gallery Expiration System Summary

Gallery expiration middleware blocking expired galleries with 410 Gone, reminder email worker at 7d/1d/expired milestones with Redis deduplication, and professional expired gallery UI page.

## Completed Tasks

| Task | Name | Commit | Tests |
|------|------|--------|-------|
| 1 | Expiration middleware + gallery settings + expired gallery page | 6853800e | 9 |
| 2 | Expiration reminder email worker | cdad8384 | 9 |

## Task Details

### Task 1: Expiration Middleware + Frontend

**TDD cycle completed:** RED (9 failing) -> GREEN (9 passing)

- Created `check_gallery_expiration()` utility raising HTTPException 410 with structured detail (error, expired_at, gallery_name, photographer_name)
- Created `compute_days_until_expiry()` returning integer days (negative if past)
- Integrated into public gallery endpoint -- called after fetching gallery data, before returning response
- Added `days_until_expiry` field to GalleryResponse schema
- Moved expiration check from gallery_service.py (which raised GalleryNotFoundError/404) to API layer (which raises 410 with gallery details)
- Created ExpiredGalleryPage.tsx with motion fade-in, clock icon, gallery name, expiration date, photographer contact prompt
- Updated PublicGalleryShell to render ExpiredGalleryPage when 410 detected
- Updated usePublicGallery hook with `expired: GalleryExpiredInfo | null` state

### Task 2: Expiration Reminder Email Worker

**TDD cycle completed:** RED (9 failing) -> GREEN (9 passing)

- Created ExpirationReminderWorker with daily scan loop
- SQL query joins galleries with users for owner_email and photo_count
- Three milestones: MILESTONE_7D, MILESTONE_1D, MILESTONE_EXPIRED
- Redis deduplication keys: `expiration:notified:{gallery_id}:{milestone}` with TTLs (8d, 2d, 30d)
- Template codes: gallery_expiring_7d, gallery_expiring_1d, gallery_expired
- Email payloads include: gallery_name, expires_at, photo_count, gallery_id
- Dependency injection pattern for testability without import mocking

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Expiration check returned 404 instead of 410**
- **Found during:** Task 1
- **Issue:** gallery_service.py raised GalleryNotFoundError (404) for expired galleries, losing gallery details needed for the 410 response
- **Fix:** Removed the expiration check from service layer, added it to the API endpoint layer where gallery data is available for structured 410 detail
- **Files modified:** services/gallery-service/src/services/gallery_service.py, services/gallery-service/src/api/v1/public/galleries.py
- **Commit:** 6853800e

## Verification

- 18 total tests passing across both services
- Expiration middleware: passthrough for NULL/future, 410 for past, days computation
- Reminder worker: 7d/1d/expired milestones, deduplication, payload validation
