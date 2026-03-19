---
phase: 15-foundation-refactor-data-model
plan: "02"
subsystem: frontend-gallery-public
tags: [refactor, react-context, tanstack-query, decomposition]
dependency_graph:
  requires: [15-01]
  provides: [GalleryThemeContext, GalleryInteractionContext, GalleryPlayerContext, usePublicGallery, usePublicGalleryAssets, PublicGalleryShell]
  affects: [PublicGalleryPage, CinematicViewer.test]
tech_stack:
  added: []
  patterns: [react-context-providers, tanstack-query-hooks, component-decomposition]
key_files:
  created:
    - frontend/src/contexts/GalleryThemeContext.tsx
    - frontend/src/contexts/GalleryInteractionContext.tsx
    - frontend/src/contexts/GalleryPlayerContext.tsx
    - frontend/src/hooks/usePublicGallery.ts
    - frontend/src/hooks/usePublicGalleryAssets.ts
    - frontend/src/pages/public/PublicGalleryShell.tsx
    - frontend/src/pages/public/PublicGalleryContent.tsx
    - frontend/src/pages/public/PublicGalleryLightbox.tsx
  modified:
    - frontend/src/pages/public/PublicGalleryPage.tsx
    - frontend/src/components/features/gallery/presentation/__tests__/CinematicViewer.test.tsx
decisions:
  - Extracted lightbox to separate component (PublicGalleryLightbox.tsx) to meet 400-line-per-file constraint
  - Split ShellContent into PublicGalleryContent.tsx rather than keeping monolithic inner component
  - GalleryPlayerContext provides navigation primitives only; Phase 17 will integrate lightbox hooks
  - canvasAssets mapping sets is_favorited/is_selected to false since interaction state flows via GalleryInteractionContext
metrics:
  duration: ~17m
  completed: "2026-03-19T23:38:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 8
  files_modified: 2
requirements:
  - FNDN-01
---

# Phase 15 Plan 02: Public Gallery Page Decomposition Summary

Decomposed the 2317-line PublicGalleryPage.tsx monolith into a composable architecture with 3 React Context providers, 2 TanStack Query hooks, and a multi-file shell/content/lightbox structure, all under 400 lines per file.

## Task 1: Create React Contexts and TanStack Query Hooks

**Commit:** `be157748`

Created 5 new files:

- **GalleryThemeContext.tsx** (181 lines): Resolves gallery theme from the 9-theme registry, generates CSS custom property map with gallery overrides > theme defaults, manages dark mode state, provides hero gradient computation.
- **GalleryInteractionContext.tsx** (234 lines): Manages visitor favorites/selections with optimistic updates and rollback on error. Reads visitor token from localStorage. Enforces selection limits.
- **GalleryPlayerContext.tsx** (116 lines): Manages player open/close state, current index, wrap-around navigation. Minimal surface area for Phase 17 extension.
- **usePublicGallery.ts**: TanStack Query hook wrapping magic-link validation and gallery data assembly. Detects UUID-format URLs for security. 5-minute stale time.
- **usePublicGalleryAssets.ts**: TanStack Query hook for filtered asset fetching supporting workflow tabs, sub-gallery, and emotion filters. 2-minute stale time.

## Task 2: Create PublicGalleryShell and Refactor PublicGalleryPage

**Commit:** `fb24570a`

- **PublicGalleryPage.tsx** (12 lines): Thin route wrapper rendering PublicGalleryShell. Default export preserved for router.
- **PublicGalleryShell.tsx** (248 lines): Orchestrator that validates token, manages auth gates, computes displayed/canvas assets, composes GalleryThemeProvider > GalleryInteractionProvider > GalleryPlayerProvider.
- **PublicGalleryContent.tsx** (333 lines): Page body with header, hero section, workflow tabs, sub-gallery navigation, emotion/face/person filters, GalleryCanvas, footer, auth modals, cinematic viewer, guestbook.
- **PublicGalleryLightbox.tsx** (250 lines): Photo/video viewer with zoom, swipe navigation, keyboard shortcuts, EXIF panel, watermark overlay, favorite/selection actions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extracted lightbox and content to separate files**
- **Found during:** Task 2
- **Issue:** Plan specified PublicGalleryShell.tsx should be ~300 lines max and no file exceeds 400 lines, but the monolith's functionality couldn't fit in a single Shell file under 400 lines.
- **Fix:** Split into three files: Shell (orchestrator), Content (page body), Lightbox (viewer). All under 400 lines.
- **Files created:** PublicGalleryContent.tsx, PublicGalleryLightbox.tsx

**2. [Rule 3 - Blocking] Updated CinematicViewer test import path**
- **Found during:** Task 2
- **Issue:** Test file imported `mapSlideshowConfigToSettings` from PublicGalleryPage which was gutted.
- **Fix:** Moved export to PublicGalleryContent.tsx, re-exported from PublicGalleryShell.tsx, updated test import.
- **Files modified:** CinematicViewer.test.tsx

## Verification Results

- TypeScript compilation: PASSED (no new errors; only pre-existing PublicProfilePage errors)
- PublicGalleryPage.tsx: 12 lines (under 20-line limit)
- PublicGalleryShell.tsx: 248 lines (under 400-line limit)
- PublicGalleryContent.tsx: 333 lines (under 400-line limit)
- PublicGalleryLightbox.tsx: 250 lines (under 400-line limit)
- All 3 context providers export named provider and hook
- Both TanStack Query hooks use proper query keys
- GalleryCanvas preserved in content component
- Default export preserved on PublicGalleryPage.tsx

## Self-Check: PASSED

All 8 created files verified on disk. Both commits (be157748, fb24570a) verified in git log.
