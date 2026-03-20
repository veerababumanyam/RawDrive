---
phase: 19-downloads-delivery
plan: 03
subsystem: ui
tags: [react, sse, eventsource, download, zip, expiration, countdown, progress-bar, tanstack-query]

requires:
  - phase: 19-01
    provides: "Backend download API endpoints (single, batch, SSE stream, download log)"
  - phase: 19-02
    provides: "Gallery expiration system (expires_at, days_until_expiry fields)"
provides:
  - "useGalleryDownload hook for single and batch downloads with SSE progress"
  - "BatchDownloadModal with size selector filtered by download_policy"
  - "DownloadProgressBar with animated progress and cancel support"
  - "ExpirationCountdown with urgency-based styling"
  - "DownloadTrackingPanel for photographer download analytics"
  - "PublicGalleryContent wired with download modal and expiration countdown"
  - "GalleryDetailPage wired with download tracking section"
affects: [20-sharing-analytics]

tech-stack:
  added: []
  patterns:
    - "SSE via EventSource for real-time batch download progress"
    - "Download policy filtering pattern for size availability"
    - "Urgency-based countdown styling (gray > amber > red)"

key-files:
  created:
    - frontend/src/hooks/useGalleryDownload.ts
    - frontend/src/hooks/useGalleryDownload.test.ts
    - frontend/src/components/features/gallery/public/BatchDownloadModal.tsx
    - frontend/src/components/features/gallery/public/BatchDownloadModal.test.tsx
    - frontend/src/components/features/gallery/public/DownloadProgressBar.tsx
    - frontend/src/components/features/gallery/public/ExpirationCountdown.tsx
    - frontend/src/components/features/gallery/public/ExpirationCountdown.test.tsx
    - frontend/src/components/features/gallery/DownloadTrackingPanel.tsx
    - frontend/src/components/features/gallery/DownloadTrackingPanel.test.tsx
  modified:
    - frontend/src/pages/public/PublicGalleryContent.tsx
    - frontend/src/pages/workspace/GalleryDetailPage.tsx

key-decisions:
  - "BatchDownloadModal replaces old per-file bulk download with ZIP-based batch via gallery-service API"
  - "ExpirationCountdown uses computed daysUntilExpiry from gallery.expires_at rather than relying on server-provided field"
  - "DownloadTrackingPanel uses collapsible details element in GalleryDetailPage to avoid cluttering the view"

patterns-established:
  - "SSE EventSource pattern: hook creates EventSource, tracks progress via onmessage, auto-closes on complete/error"
  - "Download policy filtering: isSizeAvailable() function centralizes policy-to-size availability mapping"

requirements-completed: [DWNL-01, DWNL-02, DWNL-04]

duration: 6min
completed: 2026-03-20
---

# Phase 19 Plan 03: Frontend Download UX Summary

**Batch download modal with policy-filtered sizes, SSE progress bar, expiration countdown, and photographer download tracking panel**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-20T09:05:07Z
- **Completed:** 2026-03-20T09:11:13Z
- **Tasks:** 3 (2 auto + 1 checkpoint auto-approved)
- **Files modified:** 11

## Accomplishments
- useGalleryDownload hook handles single and batch downloads with real-time SSE progress tracking
- BatchDownloadModal respects download_policy for available sizes (web_only/watermarked_only/original_allowed)
- ExpirationCountdown shows appropriate urgency styling (gray >7d, amber 3-7d, red <=3d)
- DownloadTrackingPanel provides paginated download history with totals for photographers
- PublicGalleryContent wired with download modal and expiration countdown
- GalleryDetailPage has collapsible Downloads section with tracking panel
- 23 tests passing across 4 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: useGalleryDownload hook + BatchDownloadModal + DownloadProgressBar + ExpirationCountdown** - `a17e1b3c` (feat)
2. **Task 2: DownloadTrackingPanel + wire everything into gallery pages** - `f6a48340` (feat)
3. **Task 3: Verify complete download and delivery system** - auto-approved checkpoint

## Files Created/Modified
- `frontend/src/hooks/useGalleryDownload.ts` - Hook orchestrating download requests and SSE progress
- `frontend/src/hooks/useGalleryDownload.test.ts` - 6 tests for hook behavior
- `frontend/src/components/features/gallery/public/BatchDownloadModal.tsx` - Download modal with size/scope selector
- `frontend/src/components/features/gallery/public/BatchDownloadModal.test.tsx` - 7 tests for modal
- `frontend/src/components/features/gallery/public/DownloadProgressBar.tsx` - Animated progress bar component
- `frontend/src/components/features/gallery/public/ExpirationCountdown.tsx` - Urgency-based countdown pill
- `frontend/src/components/features/gallery/public/ExpirationCountdown.test.tsx` - 6 tests for countdown
- `frontend/src/components/features/gallery/DownloadTrackingPanel.tsx` - Photographer download history table
- `frontend/src/components/features/gallery/DownloadTrackingPanel.test.tsx` - 4 tests for tracking panel
- `frontend/src/pages/public/PublicGalleryContent.tsx` - Wired download modal + expiration countdown
- `frontend/src/pages/workspace/GalleryDetailPage.tsx` - Added Downloads section with tracking panel

## Decisions Made
- Replaced old per-file bulk download in PublicGalleryContent with BatchDownloadModal using ZIP-based batch API
- ExpirationCountdown computes daysUntilExpiry from gallery.expires_at client-side for resilience
- DownloadTrackingPanel wrapped in collapsible `<details>` element to keep GalleryDetailPage clean

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Test assertion used `getByText` when multiple matching elements existed -- fixed with `getAllByText`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 19 (Downloads & Delivery) is complete across all 3 plans
- Phase 20 (Sharing, Analytics & Polish) can proceed with full download infrastructure in place

---
*Phase: 19-downloads-delivery*
*Completed: 2026-03-20*
