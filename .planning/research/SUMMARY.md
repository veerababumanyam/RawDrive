# Project Research Summary

**Project:** RawDrive v1.2 — Public Gallery & Gallery Player Modernization
**Domain:** Professional photography client gallery delivery and viewing
**Researched:** 2026-03-19
**Confidence:** HIGH

## Executive Summary

RawDrive v1.2 is a modernization of an already-capable gallery delivery platform, not a greenfield build. Research reveals RawDrive already has 70%+ of what competitors offer — fullscreen lightbox, proofing system, WebSocket real-time sync, watermarking, password protection, branding, sub-galleries, face search, and cinematic slideshow. The three genuine gaps are: justified/row layout algorithm (CSS cannot do aspect-ratio-aware row balancing), client-side ZIP creation for batch downloads (the current staggered-download approach crashes browsers on large galleries), and gallery expiration dates. Everything else is polish, wiring, or decomposition work.

The critical architectural bloat is `PublicGalleryPage.tsx` at 800+ lines with 30+ `useState` hooks. All meaningful v1.2 work depends on decomposing this monolith first. The recommended approach: Phase 1 decomposes the page into composable contexts and hooks with zero visible change, then subsequent phases build new capabilities cleanly on that foundation. Only 5 new npm packages (~20KB total gzipped) are needed. Zero new backend packages. The gallery-service is extended, not replaced.

The top risks are threefold: (1) new public endpoints bypassing magic link validation and leaking private gallery data, (2) generating signed URLs for 500-2000 photo galleries all at once causing thread pool exhaustion, and (3) building a fourth viewer component instead of refactoring shared hooks from the existing three (`Lightbox.tsx`, `CinematicViewer.tsx`, inline lightbox in `PublicGalleryPage.tsx`). The mitigation is clear: validate all public routes through `MagicLinkService`, generate URLs lazily via `IntersectionObserver` batches, and extract a `ViewerCore` before building `GalleryPlayer`.

## Key Findings

### Recommended Stack

See full analysis: `.planning/research/STACK.md`

RawDrive's existing stack already covers the full gallery use case. `framer-motion`, `@use-gesture/react`, `react-hotkeys-hook`, `@tanstack/react-query`, `@tanstack/react-virtual`, `react-helmet-async`, and `@fingerprintjs/fingerprintjs` are all installed. The backend has ProofingService, R2URLService, MagicLinkService, Redis pub/sub, and WebSocket infrastructure fully operational.

**Five new packages needed (all frontend):**
- `justified-layout` ^4.1.0 — Flickr's geometry algorithm for row-balanced layout; pure math, no DOM; ~3KB gzipped
- `react-zoom-pan-pinch` ^3.7.0 — transform state management for zoom/pan/pinch within a single photo; complements `@use-gesture` which handles swipe navigation
- `exifr` ^7.1.3 — fastest JS EXIF reader (~9KB mini bundle); supports HEIC; needed for lightbox info panel
- `client-zip` ^2.4.6 — streaming browser ZIP, 40x faster than JSZip, no memory bloat; critical for 2GB+ galleries
- `file-saver` ^2.0.5 — saveAs() polyfill for triggering ZIP downloads; de facto standard at 5M+ weekly downloads

**Do not add:** PhotoSwipe (conflicts with `@use-gesture`), JSZip (memory bloat on large galleries), react-share (30KB for what Web Share API covers natively), or any prebuilt lightbox library (framer-motion + react-zoom-pan-pinch gives better control and animation consistency).

### Expected Features

See full analysis: `.planning/research/FEATURES.md`

RawDrive has most table stakes. The gaps to close in v1.2 are targeted.

**Must have (table stakes gaps):**
- Justified/row layout — every serious competitor offers 3+ layouts; CSS cannot do aspect-ratio-aware row balancing
- Batch ZIP download with progress — current staggered individual downloads fail on mobile and trigger browser popup blockers
- Gallery expiration dates — expected for event photography; reminder emails via existing Postal infrastructure
- OG meta tags with social preview — shared gallery links currently show generic "RawDrive" instead of gallery cover photo

**Should have (differentiators to polish):**
- Touch gesture upgrade (pinch-zoom + swipe momentum in player) — 60%+ gallery views are mobile
- QR code sharing — high value for event photographers; simple `qrcode.react` integration
- Embed codes — iframe snippet for photographer websites; zero backend work required
- Dark/light mode gallery toggle — per-gallery theme preference
- Gallery activity dashboard — surface existing tracking data already captured but not displayed
- Selection quotas ("pick your top N") — completes the proofing workflow loop

**Defer to v2+:**
- Background music library (licensing complexity, operational burden)
- Download size variants requiring on-demand resize pipeline
- Video upload and processing
- Print store / e-commerce
- Mobile native apps (PWA covers this adequately)

### Architecture Approach

See full analysis: `.planning/research/ARCHITECTURE.md`

The build targets gallery-service (port 8004) exclusively — no new microservices. Frontend work is the bulk of the effort. The strategy: decompose `PublicGalleryPage.tsx` into a `PublicGalleryShell` orchestrator backed by three React Contexts (`GalleryThemeContext`, `GalleryInteractionContext`, `GalleryPlayerContext`) and a `GalleryLayoutEngine` using the strategy pattern for layout modes. Only two new backend endpoint files are needed — `downloads.py` for ZIP orchestration and `sharing.py` for OG metadata — plus extensions to existing gallery endpoints to return `layout_type`, `aspect_ratio`, EXIF passthrough, and LQIP data per asset.

**Major components:**
1. `PublicGalleryShell` — page orchestrator; replaces the 800-line monolith; handles auth gating, theme application, context setup
2. `GalleryLayoutEngine` — strategy dispatcher for grid/masonry/justified/mosaic/filmstrip/slideshow; delegates to layout-specific renderers; virtualizes via `@tanstack/react-virtual`
3. `GalleryPlayer` — fullscreen viewer built on refactored shared hooks (`useLightboxZoom`, `useLightboxNavigation`, `useLightboxGestures`) + new `PlayerZoomContainer` shell; not a fourth monolithic viewer
4. `GalleryInteractionContext` — optimistic favorites/selections state with WebSocket sync; localStorage for session persistence, backend as source of truth
5. `DownloadManager` — batch download orchestrator; `client-zip` for streaming presigned URL assembly; server-side ZIP worker for batches >50 files

**Key patterns:**
- Composable Shell + React Context (not prop drilling through an 800-line component)
- Strategy pattern for layout rendering (easily extensible to new layout types)
- Optimistic updates with rollback for all interaction mutations
- `IntersectionObserver`-driven lazy URL generation (never generate all signed URLs upfront)

### Critical Pitfalls

See full analysis: `.planning/research/PITFALLS.md`

1. **Public endpoint data leakage** — New routes added without `MagicLinkService.validate_magic_link()` bypass access control entirely. All public endpoints must derive `workspace_id` and `gallery_id` from the validated token, never from client-supplied params. Prevention: integration tests calling every new endpoint with no token, expired token, and wrong-gallery token.

2. **Signed URL thundering herd** — Generating 3 URLs × 2000 photos = 6000 R2 calls on first gallery load causes thread pool exhaustion and 10-30s page load times. Prevention: batch URL generation triggered by `IntersectionObserver` in groups of 20-30; extend signed URL TTL to 1 hour; circuit breaker at 100 URL ceiling.

3. **Viewer component fragmentation** — Three overlapping viewers already exist (`Lightbox.tsx`, `CinematicViewer.tsx`, inline in `PublicGalleryPage.tsx`). Adding a fourth `GalleryPlayer.tsx` monolith creates permanent divergence of gesture handling and keyboard shortcuts. Prevention: refactor `useLightboxZoom`/`useLightboxNavigation`/`useLightboxGestures` to be auth-context-agnostic first, then build `GalleryPlayer` as a composition of those shared hooks.

4. **Globally-scoped proofing state** — `is_favorited`/`is_selected` are boolean columns on `gallery_assets`, not per-visitor. Client A's favorites are visible to Client B. Prevention: new `gallery_visitor_actions` table with `(visitor_id, gallery_id, asset_id, action_type)` unique constraint; aggregate counts remain on `gallery_assets` for photographer view.

5. **Layout enum mismatch across 6 layers** — Adding new `LayoutStyle` values requires synchronized changes to shared-types TypeScript, generated Python types, Alembic migration, `GalleryUpdateRequest` schema, `validate_magic_link` query, and frontend renderer switch. Missing any one causes silent data loss (saved layout silently reverts to grid). Prevention: single migration checklist; round-trip integration test for each layout value.

6. **OG tags invisible to social crawlers** — React SPA meta tags require JavaScript; Facebook/Twitter/iMessage crawlers don't execute JS. Shared gallery links show "RawDrive" with no cover image. Prevention: lightweight Traefik middleware that intercepts known crawler user-agents on `/g/{token}` and returns pre-rendered OG HTML. Do not pursue full SSR migration — massive scope creep for this benefit.

## Implications for Roadmap

Based on combined research, the architecture's 6-phase build order maps directly to natural roadmap phases. The sequence is dependency-driven, not arbitrary.

### Phase 1: Foundation Refactor + Data Model Hardening
**Rationale:** Every subsequent feature depends on the decomposed component tree. Data model pitfalls (visitor-scoped proofing, layout enum synchronization, aspect ratio backfill, download policy backend enforcement, debug log cleanup) must be resolved before any visible feature work to avoid mid-build rewrites. This phase has zero visible user-facing change but eliminates all structural blockers.
**Delivers:** `PublicGalleryShell` orchestrator, three React Contexts, core TanStack Query hooks, lightbox hooks decoupled from auth, `gallery_visitor_actions` DB table, `LayoutStyle` enum extended across all 6 layers, debug logs removed from `r2_service.py`
**Addresses:** Prerequisite for justified layout (enum), proofing correctness, security hardening
**Avoids:** Pitfalls 1 (public endpoint auth), 3 (viewer fragmentation — hooks refactored here), 4 (proofing scoping), 5 (enum mismatch), 13 (debug log disk bloat)
**Research flag:** Skip — refactor and data migration patterns are well-documented.

### Phase 2: Gallery Layout Engine + Progressive Loading
**Rationale:** Layouts are purely frontend with no backend changes. Once the shell exists, layout renderers slot in cleanly via the strategy pattern. Progressive loading (LQIP blur-up) should be built with the first layout renderer to validate the pipeline end-to-end.
**Delivers:** `GalleryLayoutEngine` with strategy pattern, `GridLayout`, enhanced `MasonryLayout`, `JustifiedLayout` (using `justified-layout` algorithm), `MosaicLayout`, `FilmstripLayout`, `useProgressiveImage` hook
**Uses:** `justified-layout` ^4.1.0 (new), `@tanstack/react-virtual` (existing), LQIP from asset API response
**Avoids:** Pitfalls 2 (signed URL explosion — viewport-triggered generation), 8 (null aspect ratio crashes — default 3:2 fallback), 11 (LQIP not wired to public gallery)
**Research flag:** Skip — CSS layout, `justified-layout` library, and TanStack Virtual all have stable documentation.

### Phase 3: Gallery Player
**Rationale:** Player depends on decomposed contexts (Phase 1) and benefits from the LQIP progressive loading infrastructure (Phase 2). Building third means the player can reuse the existing asset-click events from the layout engine and the image loading pipeline.
**Delivers:** `GalleryPlayer` fullscreen viewer, `PlayerZoomContainer` (react-zoom-pan-pinch), `PlayerFilmstrip`, `PlayerToolbar`, `PlayerExifPanel` (exifr), `useTouchGestures`, `usePresignedUrl` prefetch hook, keyboard shortcuts
**Uses:** `react-zoom-pan-pinch` ^3.7.0 (new), `exifr` ^7.1.3 (new), existing `useLightboxGestures` and `react-hotkeys-hook`
**Avoids:** Pitfalls 3 (viewer fragmentation — built on shared hooks from Phase 1), 10 (gesture conflicts — priority system: if zoomed pan/zoom, if not zoomed swipe-to-navigate)
**Research flag:** Skip — zoom/pan/swipe composition patterns are established; react-zoom-pan-pinch has thorough documentation.

### Phase 4: Client Interactions in Player
**Rationale:** All proofing APIs already exist on the backend — this phase is entirely frontend wiring. Doing it after the player means the UI context (overlay) where interactions live is already built and tested.
**Delivers:** `ClientInteractionBar` in player overlay and grid view, `SelectionCounter` with limit enforcement, WebSocket real-time sync wired to frontend, `CommentSection` in player, visitor-scoped favorites/selections via `gallery_visitor_actions` (created Phase 1)
**Uses:** Existing ProofingService endpoints, WebSocket (existing infrastructure), `@tanstack/react-query` optimistic mutations
**Avoids:** Pitfall 4 (globally-scoped proofing — new table from Phase 1 activated here)
**Research flag:** Skip — all backend endpoints exist; WebSocket wiring follows established gallery-service patterns.

### Phase 5: Download Flows
**Rationale:** Downloads require the only substantive new backend work in this milestone. Doing it fifth means "download favorites" has correct visitor-scoped selection data (Phase 4) and the player download button has a UI context (Phase 3).
**Delivers:** `download_service.py` backend with quota enforcement and download_policy server-side validation, `public/downloads.py` ZIP endpoint, `DownloadManager` frontend component, `BatchDownloadProgress` with streaming progress indicator, `useGalleryDownload` hook, background ZIP worker for batches >50 files
**Uses:** `client-zip` ^2.4.6 (new), `file-saver` ^2.0.5 (new), existing R2URLService batch URL generation
**Avoids:** Pitfall 5 (browser crash on batch download — server-side ZIP worker for large batches, client-zip streaming for small; download_policy enforced backend-side not frontend-only)
**Research flag:** Needs research — async ZIP streaming architecture (in-process async vs Celery task vs SSE progress reporting) should be investigated before implementation. Flag for `/gsd:research-phase`.

### Phase 6: Social Sharing, Expiration + Polish
**Rationale:** Sharing infrastructure (OG tags, embed codes, QR) has minimal dependencies on earlier phases. Gallery expiration requires Postal template design. Polish is last when all features are integrated and cross-cutting issues (mobile responsiveness, dark mode edge cases) surface together.
**Delivers:** `public/sharing.py` OG metadata endpoint, Traefik crawler middleware for pre-rendered OG HTML, `SocialSharePanel`, `EmbedCodeGenerator`, QR code generation, gallery expiration with reminder emails via Postal, dark/light mode gallery toggle, branded password entry page redesign, mobile responsive audit across all new components
**Uses:** `react-helmet-async` (existing), Web Share API (no library needed), `qrcode.react` (new, ~12KB)
**Avoids:** Pitfall 6 (OG tags invisible to crawlers — Traefik middleware, not SSR), Pitfall 7 (theme/custom color conflict — explicit precedence: gallery custom > theme default > platform default), Pitfall 14 (font loading blocking first paint — font-display: swap)
**Research flag:** Needs research — Traefik middleware for crawler user-agent detection and OG pre-rendering is a niche pattern. Flag for `/gsd:research-phase`.

### Phase Ordering Rationale

- **Foundation first** is non-negotiable: the 800-line monolith cannot absorb new features without causing regressions across unrelated state; data model fixes (visitor-scoped proofing, layout enum) must precede any rendering work
- **Layouts before Player** because justified layout requires aspect ratios in the API response, a data concern verified in Phase 1, and the LQIP pipeline built in Phase 2 feeds directly into the player's progressive image loading
- **Interactions after Player** because the primary interaction surface is the player overlay — building interactions before the UI exists causes rework
- **Downloads after Interactions** because "download favorites" depends on visitor-scoped selection state being correct
- **Sharing last** because it is the least dependent on other phases and contains external-facing infrastructure (Traefik) that should be validated against a complete gallery experience

### Research Flags

**Needs phase research before planning:**
- **Phase 5 (Downloads):** Async ZIP worker architecture — in-process async/await streaming vs Celery task vs SSE progress reporting; whether gallery-service needs a Celery worker added or if streaming response is sufficient for the expected batch sizes
- **Phase 6 (Social Sharing):** Traefik middleware for crawler user-agent detection and OG pre-rendering — middleware WASM/Go plugin options, caching strategy for pre-rendered HTML, performance impact on non-crawler traffic

**Standard patterns (skip research-phase):**
- **Phase 1:** React refactoring, Context extraction, and data migrations are well-documented
- **Phase 2:** CSS layout, `justified-layout` library, and TanStack Virtual have stable official documentation
- **Phase 3:** Zoom/pan/swipe gesture composition is established; react-zoom-pan-pinch docs are comprehensive
- **Phase 4:** All backend proofing endpoints exist; WebSocket wiring follows established gallery-service patterns

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All 5 new packages verified on npm with weekly download counts and maintenance status confirmed. Existing stack coverage verified against actual codebase. Alternatives evaluated with clear rejection rationale. |
| Features | HIGH | 11+ competitors analyzed including Pixieset, Pic-Time, ShootProof, SmugMug, CloudSpot. Feature gaps identified from direct codebase inspection against competitor benchmarks. |
| Architecture | HIGH | Based on direct codebase analysis of gallery-service source, frontend component tree, existing schemas, and live service boundaries. Component boundaries and build order derived from actual code dependencies, not assumption. |
| Pitfalls | HIGH | All 14 pitfalls identified through direct code inspection with specific file names, function names, table columns, and constants cited. Each pitfall has a concrete existing code artifact causing the risk. |

**Overall confidence:** HIGH

### Gaps to Address

- **Visitor actions migration scope:** The `gallery_visitor_actions` table fix for globally-scoped proofing requires clarifying whether historical favorites data (currently aggregated booleans on `gallery_assets`) needs preservation or can be reset. Clarify with product before Phase 1 DB migration.
- **ZIP worker infrastructure:** Phase 5 requires async ZIP generation. The gallery-service has no Celery workers today. Confirm whether ZIP tasks should use in-process async streaming for small galleries and a separate worker queue for large ones, or uniformly queue all jobs — this affects Phase 5 scope significantly.
- **Gallery expiration email templates:** Reminder emails for expiring/expired galleries require Postal integration and new email template designs ("expires in 7 days", "your gallery has expired"). Flag for design work before Phase 6 implementation begins.
- **client-zip production validation:** `client-zip` has a smaller community than JSZip (~200K vs 10M+ weekly downloads). The streaming approach is architecturally superior, but validate with a 100+ file prototype before committing to it as the batch download strategy.

## Sources

### Primary (HIGH confidence — direct codebase analysis)
- `services/gallery-service/src/` — API routes, services, schemas, R2 integration, WebSocket, proofing service
- `frontend/src/pages/public/PublicGalleryPage.tsx` — current 800+ line monolith under analysis
- `frontend/src/components/features/gallery/` — 60+ existing components including Lightbox, CinematicViewer, MasonryLayout
- `packages/shared-types/src/gallery.ts` — LayoutStyle enum, GalleryDetailData, PublicGalleryAsset types
- `services/gallery-service/src/services/proofing_service.py` — visitor_id handling, globally-scoped is_favorited/is_selected issue
- `services/gallery-service/src/services/r2_service.py` — signed URL generation, Redis cache TTL, debug log issue

### Primary (HIGH confidence — official library sources)
- [Flickr justified-layout GitHub](https://github.com/flickr/justified-layout) — geometry algorithm, stable API
- [react-zoom-pan-pinch GitHub](https://github.com/BetterTyped/react-zoom-pan-pinch) — zoom/pan library docs
- [client-zip GitHub](https://github.com/Touffy/client-zip) — streaming browser ZIP approach
- [Web Share API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) — native sharing API coverage

### Secondary (HIGH-MEDIUM confidence — competitor analysis)
- [Pixieset Client Gallery](https://pixieset.com/client-gallery/) — feature benchmark, HIGH confidence
- [ShootProof Feature Index](https://www.shootproof.com/feature-index/) — feature benchmark, MEDIUM confidence
- [Pic-Time Platform](https://www.pic-time.com) — differentiator comparison, MEDIUM confidence
- [CloudSpot Client Galleries](https://cloudspot.io/client-galleries) — mobile/PWA patterns, MEDIUM confidence
- [Imagen AI Best Client Gallery 2026](https://imagen-ai.com/valuable-tips/best-client-gallery-for-photographers/) — market landscape overview

---
*Research completed: 2026-03-19*
*Ready for roadmap: yes*
