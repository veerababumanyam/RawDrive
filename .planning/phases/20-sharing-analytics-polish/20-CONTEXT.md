# Phase 20: Sharing, Analytics & Polish - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Add social sharing with OG previews, QR codes, embed widgets, dark/light mode toggle, branded password pages, optional background music, per-gallery analytics dashboards, and gallery discovery features. The final polish layer on top of all prior gallery work.

</domain>

<decisions>
## Implementation Decisions

### Sharing (SHAR-01-04)
- OG meta tags: Traefik middleware for crawler detection (user-agent sniffing), serve HTML shell with OG tags for crawlers, SPA for browsers
- QR codes: generate client-side using `qrcode` npm package, display in modal with download option
- Embed codes: iframe-based embed with configurable width/height, generates copyable HTML snippet
- Dark/light toggle: CSS custom properties switch via toggle button in gallery header, persisted in localStorage

### Progressive Experience (PROG-02-03)
- Branded password page: custom entry page with photographer's logo, accent color, and optional welcome message from gallery settings
- Background music: audio upload to R2, HTML5 Audio element with play/pause/volume controls in gallery footer, autoplay disabled (user-initiated only)

### Gallery Analytics (GANLT-01-03)
- Per-gallery engagement: track views, unique visitors (via visitor_token), time spent (via beacon API on unload)
- Dashboard: new tab in gallery detail page showing views chart, visitor breakdown, device/geo stats
- Use existing analytics repository patterns from analytics-engagement skill

### Gallery Discovery (GDISC-01-02)
- Filtering: date range picker, status dropdown, client selector, tag multi-select in gallery list page
- Engagement ranking: sortable columns (views, downloads, shares) in gallery list with "Most Popular" preset filter

### Claude's Discretion
- QR code styling and customization options
- Embed code responsive behavior
- Analytics chart library (recharts already in project vs new)
- Music player UI design
- Geo-IP lookup approach for geographic breakdown

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `frontend/src/pages/public/PublicGalleryShell.tsx` — gallery orchestrator, can add dark/light toggle
- `services/gallery-service/src/middleware/` — existing middleware patterns for expiration (Phase 19)
- `backend/src/app/models/profile_view.py` — existing analytics model pattern
- `frontend/src/pages/workspace/GalleryDetailPage.tsx` — gallery detail where analytics tab goes
- `frontend/src/pages/workspace/GalleriesPage.tsx` — gallery list where discovery filters go
- react-helmet-async already installed for OG tags

### Integration Points
- Traefik middleware for OG crawler detection (or simpler: backend HTML shell endpoint)
- Gallery settings for branding (logo, colors, music upload)
- Analytics repository pattern from existing profile_view model
- Gallery list page for discovery filters and ranking

</code_context>

<specifics>
## Specific Ideas

- Research flagged Traefik crawler middleware for OG pre-rendering — simpler approach is backend HTML shell (already used for profile pages in Phase 11)
- Background music is HIGH complexity per research — keep scope minimal (upload + play/pause)
- recharts likely already available in the project for analytics charts

</specifics>

<deferred>
## Deferred Ideas

None — final phase, everything in scope

</deferred>
