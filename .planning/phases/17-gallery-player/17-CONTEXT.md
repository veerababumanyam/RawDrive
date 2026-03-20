# Phase 17: Gallery Player - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a premium fullscreen gallery player (lightbox) with zoom/pan, swipe navigation, EXIF metadata overlay, and filmstrip thumbnail navigation. Replaces/enhances the existing PublicGalleryLightbox from Phase 15 decomposition. Integrates with GalleryPlayerContext.

</domain>

<decisions>
## Implementation Decisions

### Player Design
- Build on `react-zoom-pan-pinch` for zoom/pan + `@use-gesture/react` for swipe gestures + Framer Motion for animations
- EXIF panel: slide-up overlay with blur backdrop, toggled via info icon button
- Filmstrip: bottom of player, horizontal scroll, current photo highlighted with accent border
- Navigation: arrow overlays on hover (desktop) + swipe gestures (mobile) + keyboard arrows/escape

### Mobile Experience
- Pinch-to-zoom: smooth 1x-5x range with momentum, double-tap toggles 2x zoom
- Swipe threshold: 50px horizontal triggers navigation, vertical swipe closes player
- Orientation: lock to portrait on phones, allow landscape on tablets
- Player background: black with 95% opacity backdrop over gallery

### Claude's Discretion
- Component decomposition within the player (single file vs multiple)
- Animation timing curves and durations
- EXIF field display order and formatting
- Filmstrip thumbnail sizing and scroll behavior
- Keyboard shortcut mapping beyond arrows/escape

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/pages/public/PublicGalleryLightbox.tsx` — current lightbox from Phase 15 (250 lines), to be enhanced/replaced
- `frontend/src/contexts/GalleryPlayerContext.tsx` — player state context (open/close, current index)
- `frontend/src/hooks/useLightboxZoom.ts` — existing zoom hook (auth-agnostic per Phase 15)
- `frontend/src/hooks/useLightboxNavigation.ts` — existing navigation hook
- `frontend/src/hooks/useLightboxGestures.ts` — existing gesture hook
- `frontend/src/components/features/gallery/layouts/ProgressiveImage.tsx` — LQIP blur-up from Phase 16
- `packages/shared-types/src/gallery.ts` — GalleryAsset type with EXIF fields

### Established Patterns
- Framer Motion for all animations
- React Context for state management
- TailwindCSS for styling
- `exifr` package available for EXIF parsing (from research)

### Integration Points
- GalleryPlayerContext.openPlayer(index) called when user clicks photo in any layout
- Player renders as portal/overlay above gallery content
- Filmstrip thumbnails use same asset data as gallery layouts
- EXIF data may need to be fetched from asset metadata or parsed client-side

</code_context>

<specifics>
## Specific Ideas

- Research confirmed existing lightbox hooks are auth-agnostic and ready for reuse
- `react-zoom-pan-pinch` is ~8KB, `exifr` is ~30KB (tree-shakeable to ~5KB for JPEG EXIF only)
- Player should use `createPortal` to render above all gallery content

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
