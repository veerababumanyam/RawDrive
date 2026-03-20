---
phase: 20-sharing-analytics-polish
plan: 04
subsystem: frontend, api, analytics
tags: [recharts, tanstack-query, analytics, gallery-views, engagement, filters]

# Dependency graph
requires:
  - phase: 20-sharing-analytics-polish/03
    provides: gallery_views table, analytics API endpoints, view tracking endpoints
provides:
  - GalleryAnalyticsTab dashboard with recharts charts (views, device, geo, downloads)
  - View tracking beacon on public gallery (POST + sendBeacon time-spent)
  - Gallery list engagement ranking (sort by views/downloads)
  - Gallery list discovery filters (date_from, date_to, client_id, tags)
  - View/download count badges on gallery cards
affects: [frontend, gallery-service]

# Tech tracking
tech-stack:
  added: [recharts]
  patterns:
    - "Recharts AreaChart/PieChart/BarChart for analytics visualization"
    - "sendBeacon API for reliable unload time-spent tracking"
    - "LEFT JOIN CTE aggregation for engagement counts in list queries"

key-files:
  created:
    - frontend/src/hooks/useGalleryAnalyticsTab.ts
    - frontend/src/components/features/gallery/analytics/GalleryAnalyticsTab.tsx
    - frontend/src/components/features/gallery/analytics/GalleryAnalyticsTab.test.tsx
    - frontend/src/components/features/gallery/analytics/ViewsChart.tsx
    - frontend/src/components/features/gallery/analytics/DeviceBreakdown.tsx
    - frontend/src/components/features/gallery/analytics/GeoBreakdown.tsx
    - frontend/src/components/features/gallery/analytics/DownloadStats.tsx
  modified:
    - frontend/src/pages/workspace/GalleryDetailPage.tsx
    - frontend/src/pages/public/PublicGalleryShell.tsx
    - frontend/src/pages/workspace/GalleriesPage.tsx
    - frontend/src/types/gallery.ts
    - frontend/src/hooks/useGallery.ts
    - services/gallery-service/src/schemas/gallery.py
    - services/gallery-service/src/api/v1/galleries.py
    - services/gallery-service/src/services/gallery_service.py
    - frontend/package.json

key-decisions:
  - "Used recharts (lightweight, well-maintained) over heavier charting alternatives"
  - "View tracking beacon uses localStorage UUID visitor_token (no fingerprinting library needed)"
  - "sendBeacon + visibilitychange for reliable time-spent tracking on tab close"
  - "LEFT JOIN CTE pattern for view/download counts avoids N+1 in gallery list query"

patterns-established:
  - "Analytics dashboard with period selector and recharts visualization"
  - "Public gallery view tracking beacon pattern"

requirements-completed: [GANLT-01, GANLT-02, GANLT-03, GDISC-01, GDISC-02]

# Metrics
duration: 9min
completed: 2026-03-20
---

# Phase 20 Plan 04: Gallery Analytics Dashboard & Discovery Summary

**Recharts analytics dashboard with views/device/geo/download charts, view tracking beacon on public gallery, and gallery list engagement ranking with filters**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-20T09:36:15Z
- **Completed:** 2026-03-20T09:45:26Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Full analytics dashboard tab on gallery detail page with period selector (7d/30d/90d/All)
- Summary cards showing total views, unique visitors, avg time spent, views today
- ViewsChart (area chart), DeviceBreakdown (donut chart with labels), GeoBreakdown (horizontal bar chart with country list), DownloadStats (cards with formatted file sizes)
- View tracking beacon on public gallery: POST view on mount with visitor_token/device/browser/OS, sendBeacon time-spent on unload
- Gallery list discovery: sort by Most Viewed / Most Downloaded
- Gallery list filters: date_from, date_to, client_id, tags
- "Most Popular" preset button (sort=views + status=published)
- View/download count badges on gallery cards in both grid and list views
- 9 passing tests for analytics tab component

## Task Commits

1. **Task 1: Analytics dashboard tab + view tracking beacon** - `5fd0e276` (feat)
2. **Task 2: Gallery discovery filters + engagement ranking** - `24f9564a` (feat)

## Files Created/Modified
- `frontend/src/hooks/useGalleryAnalyticsTab.ts` - TanStack Query hook wrapping gallery-service analytics API
- `frontend/src/components/features/gallery/analytics/GalleryAnalyticsTab.tsx` - Main analytics dashboard with period selector, summary cards, chart sections
- `frontend/src/components/features/gallery/analytics/GalleryAnalyticsTab.test.tsx` - 9 tests covering rendering, empty state, loading, period changes
- `frontend/src/components/features/gallery/analytics/ViewsChart.tsx` - Recharts AreaChart for views + visitors time series
- `frontend/src/components/features/gallery/analytics/DeviceBreakdown.tsx` - Recharts PieChart with device type labels
- `frontend/src/components/features/gallery/analytics/GeoBreakdown.tsx` - Recharts horizontal BarChart with country list
- `frontend/src/components/features/gallery/analytics/DownloadStats.tsx` - Summary cards for total downloads and bandwidth
- `frontend/src/pages/workspace/GalleryDetailPage.tsx` - Added collapsible Analytics section
- `frontend/src/pages/public/PublicGalleryShell.tsx` - Added view tracking beacon with sendBeacon
- `frontend/src/pages/workspace/GalleriesPage.tsx` - Added sort options, Popular preset, engagement badges
- `frontend/src/types/gallery.ts` - Added view_count, download_count to GalleryListItem
- `frontend/src/hooks/useGallery.ts` - Extended sort options with views/downloads
- `services/gallery-service/src/schemas/gallery.py` - Added view_count, download_count to GalleryListItemResponse
- `services/gallery-service/src/api/v1/galleries.py` - Added date_from, date_to, client_id, tags query params
- `services/gallery-service/src/services/gallery_service.py` - LEFT JOIN aggregation for view/download counts, new filter support
- `frontend/package.json` - Added recharts dependency

## Decisions Made
- Used recharts over alternatives (lightweight, composable, works well with React)
- localStorage UUID for visitor_token rather than fingerprintjs (simpler, no privacy concerns)
- sendBeacon + visibilitychange for reliable unload tracking
- LEFT JOIN CTE pattern keeps gallery list query efficient (single query, not N+1)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None

## Next Phase Readiness
- Phase 20 now complete (all 4 plans executed)
- Analytics backend + frontend fully wired
- Gallery discovery with engagement ranking functional
- Ready for v1.2 milestone closure

---
*Phase: 20-sharing-analytics-polish*
*Completed: 2026-03-20*

## Self-Check: PASSED
- All 7 created files verified on disk
- Both task commits (5fd0e276, 24f9564a) verified in git log
- 9/9 tests passing
