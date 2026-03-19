# Phase 15: Foundation Refactor & Data Model - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Decompose the 2317-line PublicGalleryPage.tsx monolith into composable components with React Contexts, create visitor-scoped proofing data model (gallery_visitor_actions table), and synchronize LayoutStyle enum across all layers. Zero visible change to end users — pure architectural refactor.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — pure infrastructure phase. Key guidance from research:

- Decompose into PublicGalleryShell + 3 React Contexts (GalleryThemeContext, GalleryInteractionContext, GalleryPlayerContext)
- Extract ~30 useState hooks into context providers
- gallery_visitor_actions table should use composite key (gallery_id, visitor_token) for per-visitor proofing state
- LayoutStyle enum source of truth should be in @rawdrive/shared-types, with backend/gallery-service consuming generated types
- Visitor token can use cookie-based anonymous identification (no auth required for public galleries)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/pages/public/PublicGalleryPage.tsx` — 2317-line monolith to decompose (the target)
- `packages/shared-types/src/index.ts` — already has LayoutStyle enum
- `frontend/src/types/gallery.ts` — frontend gallery types
- `backend/src/app/models/gallery.py` — backend gallery model with layout_style field
- `services/gallery-service/src/schemas/gallery.py` — gallery-service schemas
- `services/gallery-service/src/api/v1/public/proofing.py` — existing proofing API (currently global, not per-visitor)

### Established Patterns
- 3-layer architecture: API → Service → Repository
- workspace_id isolation on all queries
- TanStack Query for data fetching in frontend
- Framer Motion for animations
- Alembic for database migrations

### Integration Points
- Gallery-service proofing endpoints need visitor_token parameter
- LayoutStyle enum flows: shared-types → frontend types → backend models → gallery-service schemas
- PublicGalleryPage currently handles routing, data fetching, theming, interactions, and rendering all in one file

</code_context>

<specifics>
## Specific Ideas

No specific requirements — infrastructure phase. Research recommends:
- Use strategy pattern for layout dispatch (prepare for Phase 16 layouts)
- Proofing state globally scoped currently — must be per-visitor before Phase 18 adds favorites UI
- 4 competing viewer components exist — shared hooks should be extracted (prepare for Phase 17 player)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
