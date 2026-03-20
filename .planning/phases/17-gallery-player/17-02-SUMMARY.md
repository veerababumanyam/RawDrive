---
phase: 17-gallery-player
plan: 02
subsystem: frontend/gallery-player
tags: [exif, metadata, gallery-player, wiring, lightbox-replacement]
dependency_graph:
  requires: [17-01]
  provides: [full-gallery-player-experience]
  affects: [PublicGalleryContent, GalleryPlayer, PlayerExifPanel]
tech_stack:
  added: []
  patterns: [slide-up-overlay, AnimatePresence-exit, context-driven-player]
key_files:
  created:
    - frontend/src/components/features/gallery/player/PlayerExifPanel.tsx
    - frontend/src/components/features/gallery/player/PlayerExifPanel.test.tsx
  modified:
    - frontend/src/components/features/gallery/player/GalleryPlayer.tsx
    - frontend/src/components/features/gallery/player/index.ts
    - frontend/src/pages/public/PublicGalleryContent.tsx
decisions:
  - Used motion.div with slide-up animation (y:20->0) and backdrop-blur-md for EXIF overlay
  - Replaced PublicGalleryLightbox entirely with GalleryPlayer in PublicGalleryContent
  - openPlayer(index) from GalleryPlayerContext replaces old lightboxAsset/lightboxIndex state
metrics:
  duration: 318s
  completed: "2026-03-20T07:55:51Z"
  tasks_completed: 2
  tasks_total: 2
  tests_added: 7
  tests_total: 15
---

# Phase 17 Plan 02: EXIF Panel & GalleryPlayer Wiring Summary

EXIF metadata slide-up overlay with blur backdrop showing camera/lens/aperture/shutter/ISO/resolution/date/caption/tags, wired into PublicGalleryContent replacing old PublicGalleryLightbox.

## What Was Done

### Task 1: Build PlayerExifPanel and wire GalleryPlayer into PublicGalleryContent

**TDD: RED -> GREEN -> REFACTOR**

- Created `PlayerExifPanel.tsx` -- slide-up overlay (Framer Motion) positioned bottom-right above filmstrip
  - Two-column label/value layout with lucide icons for each metadata field
  - Only renders rows where data exists; returns null when no displayable metadata
  - Shows caption (photographer or AI) with separator when present
  - Shows tags as small pills when present
  - "Press I to toggle" hint at bottom
- Updated `GalleryPlayer.tsx` to render PlayerExifPanel wrapped in AnimatePresence when showExif is true
- Updated barrel export `index.ts` with PlayerExifPanel
- Wired GalleryPlayer into `PublicGalleryContent.tsx`:
  - Replaced `PublicGalleryLightbox` import/rendering with `GalleryPlayer`
  - Photo clicks in both GalleryLayoutEngine and GalleryCanvas now call `openPlayer(index)` from GalleryPlayerContext
  - Removed old lightbox state: `lightboxAsset`, `lightboxIndex`, `openLightbox`, `navigateLightbox`
  - CinematicViewer initialIndex simplified (no longer depends on removed lightboxIndex)

**Commit:** `bdba603e`

### Task 2: Visual verification (auto-approved)

Build compiles successfully. All 15 player tests pass (7 ExifPanel + 8 existing GalleryPlayer/Filmstrip/Toolbar).

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- 15/15 player tests pass
- TypeScript compilation clean for all modified files (pre-existing errors in PublicProfilePage.tsx are out of scope)
- Frontend build succeeds

## Self-Check: PASSED

- [x] PlayerExifPanel.tsx exists and exports correctly
- [x] PlayerExifPanel.test.tsx exists with 7 passing tests
- [x] GalleryPlayer.tsx imports and renders PlayerExifPanel
- [x] PublicGalleryContent.tsx uses GalleryPlayer instead of PublicGalleryLightbox
- [x] Commit bdba603e verified
