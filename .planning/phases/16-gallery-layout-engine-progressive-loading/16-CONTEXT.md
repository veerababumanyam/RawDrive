# Phase 16: Gallery Layout Engine & Progressive Loading - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Build a layout engine that renders public galleries in multiple modern layout modes (justified, mosaic, enhanced masonry) with a viewer-facing layout switcher and progressive LQIP blur-up image loading. All layouts integrate with the PublicGalleryShell decomposition from Phase 15.

</domain>

<decisions>
## Implementation Decisions

### Layout Rendering
- Use `justified-layout` npm package (Flickr's library, ~3KB) for justified/row layout with row balancing
- Use CSS `column-count` with JS reordering for masonry layout (chronological order fix) — no additional library
- Mosaic tile sizing uses algorithmic approach based on aspect ratio + position (hero images get larger tiles)
- Layout transitions use Framer Motion `layout` prop with `AnimatePresence` for smooth morph between layouts

### Layout Switcher UX
- Switcher positioned top-right of gallery, inline with gallery header — always visible
- Icon buttons for each layout (grid/masonry/justified/mosaic/filmstrip icons) with tooltip labels
- Visitor layout preference saved to localStorage per gallery — persists across visits
- Default layout is photographer's configured layout_style from gallery settings

### Progressive Loading (LQIP)
- Use existing LQIP data from upload pipeline (already generated) — zero backend work needed
- Blur-up transition: CSS filter blur(20px) → blur(0) with opacity crossfade over 300ms
- Virtualization via `@tanstack/react-virtual` for galleries with 500+ photos — only render visible rows
- Loading skeleton uses aspect-ratio boxes matching photo dimensions with LQIP blur — no layout shift (CLS = 0)

### Claude's Discretion
- Strategy pattern implementation details for layout dispatcher
- Component file structure and naming conventions
- Responsive breakpoint values for each layout mode
- filmstrip layout implementation approach (horizontal scroll)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/pages/public/PublicGalleryShell.tsx` — Orchestrator from Phase 15, provides context providers
- `frontend/src/pages/public/PublicGalleryContent.tsx` — Current gallery body, renders GalleryCanvas
- `frontend/src/contexts/GalleryThemeContext.tsx` — Theme resolution with CSS custom properties
- `frontend/src/hooks/usePublicGalleryAssets.ts` — TanStack Query hook for filtered asset fetching
- `packages/shared-types/src/gallery.ts` — LayoutStyle enum with 8 values (grid, masonry, justified, mosaic, filmstrip, slideshow, collage, timeline)
- Existing `SmartMasonryGrid.tsx` component — has masonry logic that can be referenced

### Established Patterns
- Framer Motion for animations throughout the app
- TanStack Query for data fetching
- TailwindCSS for styling with design tokens
- React Context providers from Phase 15 decomposition

### Integration Points
- Layout components plug into PublicGalleryContent where GalleryCanvas currently renders
- Layout switcher UI integrates with gallery header area
- LQIP data available on asset objects from the upload pipeline
- LayoutStyle from gallery settings drives the default layout selection

</code_context>

<specifics>
## Specific Ideas

- Research says `justified-layout` exact version should be confirmed at install time (^4.x range)
- CSS `column-count` masonry has top-to-bottom fill order — need custom reordering for chronological display
- `@tanstack/react-virtual` already in the project's ecosystem (TanStack family)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
