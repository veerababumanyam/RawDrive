---
phase: 19-downloads-delivery
plan: 01
subsystem: api
tags: [downloads, zip, pillow, r2, redis, sse, policy-enforcement, resize]

requires:
  - phase: 15-public-gallery-proofing
    provides: magic link validation, gallery_visitor_actions table
  - phase: 18-client-interactions-gallery-ux
    provides: gallery service with proofing, WebSocket, and R2 signed URLs
provides:
  - DownloadService with 4-policy enforcement (view_only, web_only, watermarked_only, original_allowed)
  - Pillow-based on-demand image resize with R2 caching (web=1920px, print=4000px)
  - ZipWorker for async background ZIP generation with Redis progress tracking
  - gallery_downloads tracking table with workspace_id isolation
  - Public download API endpoints (single, batch, job status, SSE stream)
  - Authenticated download log endpoint for photographer dashboard
affects: [19-02, 19-03, frontend-download-ui]

tech-stack:
  added: [Pillow]
  patterns: [async-zip-via-asyncio-create-task, sse-progress-polling, policy-enforcement-service]

key-files:
  created:
    - backend/migrations/versions/0203_add_expires_at_and_gallery_downloads.py
    - services/gallery-service/src/schemas/downloads.py
    - services/gallery-service/src/services/download_service.py
    - services/gallery-service/src/services/zip_worker.py
    - services/gallery-service/src/api/v1/public/downloads.py
    - services/gallery-service/tests/unit/test_download_service.py
    - services/gallery-service/tests/unit/test_zip_worker.py
  modified:
    - services/gallery-service/src/api/v1/public/__init__.py
    - services/gallery-service/src/api/v1/galleries.py
    - services/gallery-service/requirements.txt

key-decisions:
  - "asyncio.create_task for ZIP generation instead of Celery (gallery-service has no Celery infrastructure)"
  - "2GB memory guard on batch downloads to prevent OOM in container"
  - "No-upscale guard in resize to avoid quality degradation on small images"

patterns-established:
  - "Policy enforcement pattern: validate_download_policy() returns {allowed, max_dimension, watermark_required}"
  - "ZIP worker pattern: Redis key download:job:{job_id} with status/progress/download_url"
  - "SSE progress stream: polls Redis every 1s, yields JSON events until terminal state"

requirements-completed: [DWNL-01, DWNL-02, DWNL-04]

duration: 7min
completed: 2026-03-20
---

# Phase 19 Plan 01: Download Infrastructure Summary

**Download service with 4-policy enforcement, Pillow resize (web/print variants), async ZIP worker with Redis progress, and public download API with SSE streaming**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-20T08:55:31Z
- **Completed:** 2026-03-20T09:02:21Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- DownloadService enforces all 4 download policies (view_only, web_only, watermarked_only, original_allowed) server-side
- Pillow-based on-demand resize generates web (1920px) and print (4000px) variants with R2 caching
- ZipWorker generates ZIP archives in background tasks with Redis progress tracking and R2 upload
- Public download API extracts workspace_id from magic link tokens (never client-supplied)
- SSE endpoint streams real-time progress events for batch downloads
- Download tracking logs every download with workspace_id isolation

## Task Commits

Each task was committed atomically:

1. **Task 1: DB migration + download schemas + download service** - `9115c67a` (feat)
2. **Task 2: ZIP worker + public download API + SSE progress** - `01bd40fa` (feat)

## Files Created/Modified
- `backend/migrations/versions/0203_add_expires_at_and_gallery_downloads.py` - Migration adding expires_at and gallery_downloads table
- `services/gallery-service/src/schemas/downloads.py` - Request/response schemas for downloads
- `services/gallery-service/src/services/download_service.py` - Download orchestration with policy enforcement and resize
- `services/gallery-service/src/services/zip_worker.py` - Async ZIP generation worker with Redis progress
- `services/gallery-service/src/api/v1/public/downloads.py` - Public download endpoints (single, batch, job, SSE)
- `services/gallery-service/src/api/v1/public/__init__.py` - Registered downloads router
- `services/gallery-service/src/api/v1/galleries.py` - Added authenticated download log endpoint
- `services/gallery-service/requirements.txt` - Added Pillow dependency
- `services/gallery-service/tests/unit/test_download_service.py` - 16 tests for download service
- `services/gallery-service/tests/unit/test_zip_worker.py` - 7 tests for ZIP worker

## Decisions Made
- Used asyncio.create_task for ZIP generation (gallery-service has no Celery; per CONTEXT.md decision for server-side async ZIP)
- 2GB memory guard on batch downloads to prevent OOM in container environments
- No-upscale guard in resize: images already smaller than target dimension are returned unchanged
- Download tracking uses separate `gallery_downloads` table (not audit log) for efficient dashboard queries

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Download infrastructure complete, ready for Plan 02 (frontend download UI)
- ZIP worker and SSE endpoints ready for client integration
- Download tracking API ready for photographer dashboard

## Self-Check: PASSED

- All 7 created files verified on disk
- Commit 9115c67a (Task 1) verified in git log
- Commit 01bd40fa (Task 2) verified in git log
- 23 unit tests pass (16 download service + 7 zip worker)

---
*Phase: 19-downloads-delivery*
*Completed: 2026-03-20*
