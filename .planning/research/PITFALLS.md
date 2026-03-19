# Domain Pitfalls

**Domain:** Public Gallery & Gallery Player Modernization for Existing Photography Platform
**Researched:** 2026-03-19
**Confidence:** HIGH (based on direct codebase analysis of gallery-service, public endpoints, frontend components, shared types, and R2 integration)

## Critical Pitfalls

Mistakes that cause rewrites, data leakage, or major performance issues.

### Pitfall 1: Public Gallery Data Leakage Through New Layout Endpoints

**What goes wrong:** Adding new gallery layout endpoints (masonry, justified, filmstrip) that return asset data without going through the existing magic link validation chain. The current system routes all public access through `magic_links.py` -> `MagicLinkService.validate_magic_link()` which checks token hash, gallery publish status, expiration, and max access count. New endpoints added for layout-specific data (e.g., aspect ratios for justified layout, EXIF for filmstrip) could bypass this chain.

**Why it happens:** The gallery-service has two separate auth paths: JWT-based for workspace owners (`middleware/auth.py`) and magic-link-token-based for public visitors (`api/v1/public/`). Developers adding new API routes forget to wire them through the magic link validation, especially when creating "convenience" endpoints for frontend layout calculations.

**Consequences:** Private gallery data (asset URLs, EXIF metadata, visitor interactions) exposed to unauthenticated users. The `workspace_id` isolation that every query requires (per CLAUDE.md mandatory rules) gets silently bypassed on public routes that don't extract workspace_id from the validated magic link.

**Warning signs:**
- New API routes under `/api/v1/` instead of `/api/v1/public/`
- Endpoints that accept `gallery_id` as a URL parameter without validating it came from a valid magic link
- Missing `workspace_id` filter in queries (the `workspace-id-guard` hook should catch this, but public routes may not trigger it if they use raw SQL)

**Prevention:**
- All new public endpoints MUST go through `MagicLinkService.validate_magic_link()` first to get the `workspace_id` and `gallery_id`
- Never accept `gallery_id` directly from client in public routes -- derive it from the validated magic link token
- Add integration tests that attempt to access gallery data with invalid/expired tokens for every new endpoint
- The existing `proofing.py` pattern is correct: it takes `gallery_id` from the URL but should be additionally validated against the magic link session

**Detection:** Run security tests that call new endpoints with (a) no token, (b) expired token, (c) token for a different gallery. All three must return 401/404.

**Phase:** Must be addressed in Phase 1 (foundation) before any new public endpoints are added.

---

### Pitfall 2: Signed URL Explosion for Large Galleries (500-2000+ Photos)

**What goes wrong:** The current `R2URLService.generate_signed_urls_batch()` generates 3 signed URLs per asset (thumbnail, preview, original) using parallel `asyncio.gather()`. For a 2000-photo gallery, that is 6000 presigned URL generations hitting R2/S3 in a single request. The boto3 client runs synchronously via `run_in_executor`, consuming thread pool workers. Redis cache helps on repeat visits, but first load of a large gallery creates a thundering herd.

**Why it happens:** The existing batch URL generation was designed for workspace owners viewing their own galleries (typically paginated at 20-50 items). Public gallery views need to load all visible thumbnails for masonry/justified layouts to calculate positioning before render. The temptation is to fetch all asset URLs upfront.

**Consequences:**
- First load of large galleries takes 10-30+ seconds
- Thread pool exhaustion in the gallery-service container blocks other requests
- R2 rate limiting kicks in, returning empty URLs that the frontend can't recover from
- Redis memory bloat from caching 6000+ URLs per gallery visit

**Warning signs:**
- API response times >3 seconds for gallery asset listing
- Thread pool warnings in gallery-service logs
- Redis memory growing faster than expected
- Frontend showing broken image placeholders on first load

**Prevention:**
- Implement cursor-based pagination for public gallery asset endpoints (not offset-based -- offset degrades with large datasets)
- Generate signed URLs on-demand as thumbnails scroll into viewport, not all at once
- Use IntersectionObserver on frontend to trigger URL generation in batches of 20-30
- Add a dedicated "thumbnail manifest" endpoint that returns only thumbnail URLs (skip preview/original until lightbox opens)
- Set `R2_SIGNED_URL_EXPIRY` to 1 hour minimum for public galleries (current 15-minute default forces too-frequent regeneration)
- Add circuit breaker on batch URL generation: if >100 URLs requested, automatically paginate

**Detection:** Load test with 1000+ asset gallery. Measure time-to-first-thumbnail and total thread pool usage.

**Phase:** Must be addressed in Phase 1 (data layer) -- this is the number one performance bottleneck for large galleries.

---

### Pitfall 3: Layout Style Enum Mismatch Between Frontend, Backend, and Database

**What goes wrong:** The shared `LayoutStyle` enum currently has 4 values: `tabs`, `continuous`, `grid`, `masonry`. Adding new layouts (`justified`, `filmstrip`, `mosaic`, `slideshow`) requires synchronized changes across: `packages/shared-types/src/gallery.ts`, the generated Python types (`packages/shared-types/generated/python/types.py`), the gallery-service database schema (PostgreSQL CHECK constraint or enum type), the `GalleryUpdateRequest` schema validation, the `GalleryResponse` schema, and the `validate_magic_link` query which returns `layout_style`. Missing any one of these causes silent data loss or 422 validation errors.

**Why it happens:** The `LayoutStyle` enum is used in 6+ places across 3 layers (shared package, frontend types, backend schemas). The `pnpm generate:python` command generates Python types from TypeScript, but the database migration must be done separately via Alembic. Developers add the new value to TypeScript, forget the migration, and galleries saved with the new layout_style silently revert to `grid` on the next read because the database rejects the unknown value.

**Consequences:**
- Photographers save a gallery with "justified" layout, reload the page, and it is back to "grid"
- The `validate_magic_link` query returns `layout_style` to public visitors -- if the value is not in the frontend enum, the layout renderer crashes or falls back silently
- The `GalleryUpdateRequest` Pydantic schema with `extra = "allow"` masks the error instead of rejecting it

**Warning signs:**
- Gallery layout_style not persisting after save
- `422 Unprocessable Entity` on gallery update
- Frontend falling back to grid layout when another was selected
- Mismatched values between `shared-types` package and `gallery_service` schemas

**Prevention:**
- Create a single migration checklist for adding a layout style: (1) `shared-types/gallery.ts`, (2) `pnpm generate:python`, (3) Alembic migration for CHECK/enum, (4) gallery-service `GalleryUpdateRequest` allowed values, (5) `validate_magic_link` query, (6) frontend layout renderer switch statement
- Add an integration test that creates a gallery with each layout style and reads it back
- Remove `extra = "allow"` from `GalleryUpdateRequest` (it currently masks validation errors)
- Use a database migration that ALTERs the enum/CHECK constraint, not a new column

**Detection:** Automated test that sets each LayoutStyle value on a gallery via API, reads it back, and asserts equality.

**Phase:** Phase 1 (schema changes) -- must be the very first thing done before any layout rendering work.

---

### Pitfall 4: Fullscreen Gallery Player Breaks Existing Lightbox/CinematicViewer

**What goes wrong:** The codebase already has THREE overlapping viewer components: `Lightbox.tsx` (workspace owner view with EXIF, tagging, face overlay, compare mode), `CinematicViewer.tsx` (slideshow presentation mode), and the inline lightbox in `PublicGalleryPage.tsx` (public visitor view with zoom, swipe, download). Adding a "gallery player" creates a fourth viewer component. Over time, bug fixes and features are applied to one viewer but not the others, creating divergent behavior.

**Why it happens:** Each viewer was built for a different context (owner vs public, browsing vs presentation). The `Lightbox.tsx` component has 60+ lines of props and deeply coupled dependencies (useSignedUrl, useAuth, TagInput, CommentSection, FaceOverlay). It cannot easily be reused for public gallery viewing. Developers conclude "easier to build a new one" and create yet another viewer.

**Consequences:**
- 4 viewer components, each with subtly different keyboard shortcuts, gesture handling, and zoom behavior
- Users report "zoom works in lightbox but not in gallery player" -- different implementations
- Accessibility fixes (screen reader, keyboard nav) applied to one viewer but not others
- Bundle size bloat from duplicate viewer code
- The existing `useLightboxZoom`, `useLightboxNavigation`, `useLightboxGestures`, `useImagePreloader` hooks are only used by the workspace Lightbox, not shared

**Warning signs:**
- Creating a new file called `GalleryPlayer.tsx` or `PublicLightbox.tsx` that reimplements zoom/swipe
- Different keyboard shortcut sets across viewers
- Gesture handling code duplicated instead of using `useLightboxGestures` hook
- The `lightbox/` hooks directory being unused by the new component

**Prevention:**
- Refactor the existing lightbox hooks (`useLightboxZoom`, `useLightboxNavigation`, `useLightboxGestures`, `useImagePreloader`) to be context-agnostic (remove useAuth dependency)
- Build the gallery player as a composition of these shared hooks + a new UI shell, NOT as a monolithic component
- Create a `ViewerCore` component that handles image display, zoom, pan, and navigation -- then wrap it with different chrome for workspace vs public contexts
- Kill the inline lightbox in `PublicGalleryPage.tsx` (currently ~200 lines of inline state management for zoom, swipe, video) and replace with the shared viewer
- Document which viewer to use when: `ViewerCore` for all, `WorkspaceLightbox` for owner features, `GalleryPlayer` for public presentation

**Detection:** `grep -r "touchStartRef\|onTouchStart\|onTouchMove" frontend/src/` returns more than 2 files -- duplication has occurred.

**Phase:** Phase 2 (gallery player) -- but the hook refactoring should happen in Phase 1 to avoid building on the wrong foundation.

---

### Pitfall 5: Batch Download Without Server-Side ZIP Causes Browser Crashes

**What goes wrong:** The current download approach uses `BULK_DOWNLOAD_DELAY_MS = 300` to stagger individual file downloads. For a client selecting 200 photos for download, this means 200 separate browser download triggers over 60 seconds. Browsers throttle after ~10 concurrent downloads, and users see "multiple file download blocked" warnings. Some downloads silently fail. On mobile, this approach is completely broken.

**Why it happens:** The gallery-service has no server-side zip/archive endpoint. The R2 signed URLs are for individual file access. Building a zip endpoint requires downloading all files from R2 to the server (or a worker), compressing them, and streaming the result back -- which requires significant server resources and new infrastructure.

**Consequences:**
- "Download All" button triggers browser security warnings
- Partial downloads (user gets 47 of 200 photos) with no way to know which ones failed
- Mobile browsers completely block multi-file downloads
- Clients contact photographer saying "I couldn't download my photos"
- The `download_policy` enforcement (view_only, web_only, watermarked_only) is only checked on the frontend -- a client with the signed URL can download originals regardless

**Warning signs:**
- Browser popup blocker warnings when testing batch download
- Downloads working on Chrome desktop but failing on Safari/mobile
- No progress indicator for which files have been downloaded
- Missing download_policy enforcement on the backend

**Prevention:**
- Build a server-side zip endpoint in gallery-service that: (1) validates magic link + download_policy, (2) streams files from R2 into a zip archive, (3) streams the zip to the client with progress headers
- Use a background worker (Celery) for large downloads (>50 files): create a "download job", process in background, notify via WebSocket when ready, provide a temporary download link
- Implement download_policy enforcement on the backend -- the signed URL for "original" variant should not be generated if download_policy is `view_only` or `web_only`
- For `watermarked_only` policy, watermark must be applied server-side before serving -- current R2 URLs serve the raw file
- Add download tracking: the `activity_tracking.track_downloads` field exists in the schema but is not wired to any tracking logic

**Detection:** Test batch download of 50+ files on Safari iOS. If any fail silently, the approach is broken.

**Phase:** Phase 3 (download flows) -- but download_policy backend enforcement should be in Phase 1.

---

### Pitfall 6: Open Graph Meta Tags for Dynamic Gallery URLs Break with SPA Routing

**What goes wrong:** RawDrive is a React SPA. Social media crawlers (Facebook, Twitter, iMessage) do NOT execute JavaScript. When a user shares a gallery URL like `/g/{token}`, the crawler receives the SPA shell HTML with generic `<meta>` tags, not the gallery-specific title, description, and cover image. The shared link preview shows "RawDrive" instead of "Sarah & John's Wedding Gallery" with a beautiful cover photo.

**Why it happens:** The `PublicGalleryPage` uses `react-helmet-async` to set `<Helmet>` tags, but these are only rendered after JavaScript hydration. Social crawlers fetch the raw HTML and leave. Server-side rendering (SSR) or a dedicated pre-rendering solution is needed, but the current architecture is purely client-side.

**Consequences:**
- Shared gallery links look unprofessional on social media (no preview image, generic title)
- Photographers lose a key marketing channel -- beautiful gallery previews drive referrals
- iMessage/WhatsApp link previews show blank or default fallback
- SEO for public gallery pages is non-existent

**Warning signs:**
- Testing OG tags with Facebook Sharing Debugger shows fallback/empty values
- `<Helmet>` tags render correctly in browser but not in `view-source:`
- No SSR or pre-rendering infrastructure exists

**Prevention:**
- Implement a lightweight OG tag pre-rendering endpoint: when a request comes from a known crawler user-agent (facebookexternalhit, Twitterbot, WhatsApp, Slackbot, iMessageBot), return a minimal HTML page with correct `<meta og:*>` tags fetched from the gallery-service API
- This can be done at the Traefik level (middleware) or as a small Node.js/edge function that intercepts `/g/{token}` requests from crawlers
- Do NOT implement full SSR (Next.js migration) just for OG tags -- that is massive scope creep
- Store a pre-generated OG image URL on the gallery (e.g., cover photo thumbnail) so the pre-renderer does not need to call R2
- The `validate_magic_link` response already returns `gallery_title`, `primary_color`, and other branding fields -- use these for OG tags

**Detection:** Run `curl -H "User-Agent: facebookexternalhit/1.1" https://app.rawdrive.in/g/{token}` and verify OG tags are present in the HTML response.

**Phase:** Phase 4 (social sharing) -- but the Traefik middleware approach should be designed in Phase 1 to avoid architectural dead ends.

## Moderate Pitfalls

### Pitfall 7: Gallery Branding Customization Breaks Existing Theme System

**What goes wrong:** The gallery-service stores branding as individual columns (`primary_color`, `font_family`, `theme`, `gradient_config`) AND has a `branding_profile_id` reference to a company profile. The 9 curated themes in `galleryThemes.ts` define complete color token sets (10 CSS variables each in light/dark mode). Adding per-gallery font/color customization on top of the theme system creates conflicts: does the photographer's custom `primary_color` override the theme's `accentPrimary`? Does a custom font override the theme's font stack?

**Why it happens:** The theme system and the per-gallery branding were built at different times. Themes are frontend-only (CSS variables), while branding fields are stored in the database. There is no defined precedence: gallery.primary_color vs theme.accentPrimary vs companyProfile.brand_color.

**Warning signs:**
- Colors looking "off" with certain theme + custom color combinations
- Dark mode rendering incorrectly when custom colors are set
- Company profile branding overriding gallery-specific settings unexpectedly

**Prevention:**
- Define explicit precedence: gallery custom values > theme defaults > platform defaults
- Map each database branding field to exactly one CSS variable
- Add a `resolveGalleryTheme()` utility that merges theme tokens with gallery overrides, producing a single token set
- Test with all 9 themes x light/dark mode x custom color overrides = 18+ visual combinations

**Phase:** Phase 2 (branding customization).

---

### Pitfall 8: Masonry/Justified Layout Requires Aspect Ratios Not Currently in API Response

**What goes wrong:** Masonry and justified layouts require knowing each image's aspect ratio (width/height) BEFORE rendering to calculate column heights or row composition. The current `PublicGalleryAsset` type has optional `width` and `height` fields, but these come from EXIF extraction during upload processing. If the upload worker failed to extract dimensions (common with RAW files, HEIC, or corrupted EXIF), `width` and `height` are null. The layout algorithm has no fallback and either crashes or produces ugly gaps.

**Why it happens:** The `AssetMetadata` schema shows `width: Optional[int] = None` and `height: Optional[int] = None`. The EXIF extraction happens in the ai-processing-service as a background task. There is no guarantee it completes before the gallery is published. The existing grid layout does not care about aspect ratios (all cells are same size via `GRID_ASPECT_RATIO = '3/2'`), so missing dimensions were never a problem.

**Warning signs:**
- Large gaps or overlapping images in masonry layout
- Console errors about division by zero or NaN in layout calculations
- Layout "jumping" as images load and reveal their true dimensions

**Prevention:**
- Add a migration that backfills missing width/height from the stored image files (can use a Celery task)
- In the layout algorithm, use a default aspect ratio (3:2 for landscape, 2:3 for portrait based on EXIF orientation) when dimensions are null
- The existing `SmartMasonryGrid.tsx` component may already handle this -- verify it works with null dimensions
- For justified layout (Flickr-style), use a library like `justified-layout` that accepts items with missing dimensions gracefully
- Add a frontend warning in the Design Studio when switching to masonry/justified if >10% of assets lack dimensions

**Phase:** Phase 1 (data layer) -- backfill must run before layout rendering can be reliable.

---

### Pitfall 9: Proofing State (Favorites/Selections) Not Scoped to Visitor

**What goes wrong:** The current `proofing_service.py` stores favorites and selections on the `gallery_assets` table (`is_favorited`, `is_selected` columns). These are GLOBAL flags -- when Client A favorites a photo, Client B sees it as favorited too. The `visitor_id` is passed to the proofing endpoints and published via WebSocket, but it is NOT used to scope the favorite/selection state per visitor. Multiple clients viewing the same gallery see each other's selections, which is confusing and violates client privacy.

**Why it happens:** The database schema has `is_favorited` and `is_selected` as boolean columns on `gallery_assets`, not in a separate `visitor_actions` table. The `visitor_id` from the `X-Visitor-ID` header is only used for WebSocket attribution, not for storage scoping.

**Warning signs:**
- Client A favorites a photo, Client B refreshes and sees it favorited
- "Favorites count" showing 1 when the current visitor hasn't favorited anything
- Photographers confused about which client made which selections

**Prevention:**
- Create a `gallery_visitor_actions` table: `(visitor_id, gallery_id, asset_id, action_type, value, created_at)` with a unique constraint on `(visitor_id, gallery_id, asset_id, action_type)`
- Keep the existing `gallery_assets.is_favorited` / `is_selected` as aggregate counts (photographer sees total favorites across all visitors)
- The proofing API must return visitor-specific state when `X-Visitor-ID` is present
- This is a data model change that affects the proofing service, WebSocket broadcasts, and the frontend state management -- it must be done early

**Phase:** Phase 1 (data model) -- fundamental to client interaction correctness.

---

### Pitfall 10: Touch Gesture Conflicts Between Layout Scroll and Player Swipe

**What goes wrong:** Adding swipe-to-navigate in the gallery player conflicts with native browser scroll gestures. On mobile, horizontal swipe on an image should navigate to next/previous photo in the player, but horizontal swipe on the gallery grid should scroll. Vertical swipe should close the player (pull-down-to-dismiss pattern), but if the image is zoomed, vertical swipe should pan the image. The `PublicGalleryPage.tsx` already has inline touch handling (`touchStartRef`, swipe threshold of 50px), but this does not account for zoomed state or conflict with the browser's back-swipe gesture.

**Why it happens:** The existing touch handling in `PublicGalleryPage.tsx` is basic: it checks horizontal distance > 50px and triggers next/prev. It does not distinguish between intentional navigation swipes and accidental touches during zoom/pan. Safari's "swipe back" gesture on iOS further complicates this.

**Warning signs:**
- Swiping on a zoomed image navigates to next photo instead of panning
- Browser back navigation triggering when swiping right on the first photo
- Vertical scroll on gallery grid occasionally triggering player dismiss

**Prevention:**
- Use the `useLightboxGestures` hook (already exists) instead of inline touch handling
- Implement a gesture priority system: if zoomed, all gestures are pan/zoom; if not zoomed, horizontal = navigate, vertical down = dismiss
- Add `touch-action: none` CSS on the player container to prevent browser default gestures
- Use pointer events API instead of touch events for unified mouse/touch/pen support
- Test on actual iOS devices -- Safari's gesture handling differs significantly from Chrome Android

**Phase:** Phase 2 (gallery player).

## Minor Pitfalls

### Pitfall 11: LQIP Blur-Up Not Wired to Public Gallery Asset Loading

**What goes wrong:** The `AssetInfo` type has an `lqip` field for blur-up placeholders, and the `LightboxImage` component supports it. However, the public gallery endpoint may not return LQIP data for each asset, causing the blur-up effect to show a gray box instead of a blurred preview. The LQIP data must be generated during upload processing and included in the public assets API response.

**Prevention:**
- Verify LQIP data is populated in the `gallery_assets` table (or `assets` table) during upload processing
- Include LQIP in the public gallery assets endpoint response
- Use CSS `background-color` from the image's dominant color as a fallback when LQIP is missing
- Keep LQIP data small (<1KB base64) to avoid bloating the assets list response

**Phase:** Phase 2 (progressive loading).

---

### Pitfall 12: Gallery Expiration Race Condition with Cached Magic Links

**What goes wrong:** The `validate_magic_link` result is cached in Redis with `CACHE_TTL_MAGIC_LINK`. If a photographer sets an expiration on a gallery or unpublishes it, the cached validation may still return `valid: true` until the cache expires. Visitors can access the gallery after it should have expired.

**Prevention:**
- When a gallery is updated (expiration changed, unpublished), invalidate all magic link caches for that gallery
- Add a Redis key pattern like `magic_link:*:gallery:{gallery_id}` that can be bulk-invalidated
- Set cache TTL to the minimum of `CACHE_TTL_MAGIC_LINK` and `(gallery.expires_at - now)`

**Phase:** Phase 1 (security hardening).

---

### Pitfall 13: Debug Logging in Production R2 Service

**What goes wrong:** The `r2_service.py` file contains multiple `#region agent log` blocks that write to `/app/debug.log` on every signed URL generation. In production with 2000-photo galleries, this writes thousands of log entries per page load, consuming disk I/O and potentially filling the container's filesystem.

**Prevention:**
- Remove all `#region agent log` blocks from `r2_service.py` before v1.2 work begins
- Use structured logging via the existing `logger` instance instead
- Add a pre-flight cleanup task to the v1.2 milestone

**Phase:** Phase 0 (cleanup before starting).

---

### Pitfall 14: Font Loading for Custom Gallery Fonts Blocks First Paint

**What goes wrong:** Gallery branding allows custom `font_family`. If the font is a Google Font or custom upload, the browser blocks text rendering until the font loads (FOIT - Flash of Invisible Text). On slow connections, the entire gallery title and navigation are invisible for 1-3 seconds.

**Prevention:**
- Use `font-display: swap` for all custom fonts (show system font, swap when loaded)
- Preload the gallery's custom font via `<link rel="preload">` in the `<Helmet>`
- Limit custom fonts to a curated list (Google Fonts subset) rather than arbitrary uploads
- Include font URL in the `validate_magic_link` response so it can be preloaded before gallery data loads

**Phase:** Phase 3 (branding polish).

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Schema/Data Layer | Layout enum mismatch (P3), Missing aspect ratios (P8), Visitor-scoped proofing (P9) | Single migration that adds all new layout values, backfills dimensions, creates visitor_actions table |
| Gallery Layouts | Signed URL explosion (P2), Layout crash on null dimensions (P8) | Viewport-based lazy URL generation, default aspect ratios for missing data |
| Gallery Player | Viewer component fragmentation (P4), Touch gesture conflicts (P10) | Refactor shared hooks first, gesture priority system |
| Download Flows | Browser crash on batch download (P5), Download policy not enforced server-side (P5) | Server-side zip worker, backend policy enforcement |
| Social Sharing | OG tags invisible to crawlers (P6) | Traefik crawler middleware, not full SSR |
| Branding | Theme/custom color conflict (P7), Font blocking (P14) | Explicit precedence rules, font-display: swap |
| Security | Magic link bypass (P1), Cache race condition (P12) | All public endpoints through magic link validation, cache invalidation on gallery update |
| Performance | R2 URL thundering herd (P2), Debug log bloat (P13) | Lazy generation, remove debug logs pre-work |

## Integration Pitfalls with Existing Gallery-Service

### The gallery-service is the reference microservice. Changes here ripple everywhere.

1. **Singleton pattern fragility:** Services like `MagicLinkService`, `ProofingService`, `R2URLService` use module-level singletons (`_magic_link_service = None`). Adding new services that depend on these (e.g., a `DownloadService` that needs `R2URLService`) requires careful initialization order. Do NOT create circular imports between services.

2. **Raw SQL in public endpoints:** The proofing and magic link services use raw SQL (`conn.fetchrow()`, `conn.execute()`) rather than SQLAlchemy models. New endpoints MUST follow this pattern for consistency, but MUST also ensure every query includes `workspace_id` filtering. The `workspace-id-guard` hook watches for Write/Edit operations but may not catch raw SQL in new files.

3. **WebSocket broadcast coupling:** `ProofingService._publish_proofing_update()` publishes to `gallery:{gallery_id}:proofing` channel. New real-time features (download progress, layout change notifications) must use distinct channels to avoid message parsing errors in existing WebSocket consumers.

4. **Redis cache key collisions:** The service uses multiple cache key patterns (`signed_url:{asset_id}:{variant}`, `magic_link:{token}`, proofing caches). New features must document their cache key patterns and ensure no collisions. Add cache key prefixes for new feature domains (e.g., `download_job:`, `og_meta:`).

5. **Metric name conflicts:** The `metrics` singleton tracks `proofing_action`, `magic_link_validated`, etc. New metrics must follow the existing naming convention (`gallery_{feature}_{action}`) and be added to the Prometheus/Grafana dashboards, not just emitted silently.

6. **PublicGalleryPage.tsx is 800+ lines:** The main public gallery page is a monolithic component with 25+ state variables, inline lightbox rendering, inline touch handling, and mixed concerns (auth gating, layout rendering, proofing, slideshow). Adding new features to this file directly will make it unmaintainable. Extract into sub-components before adding gallery player or new layout modes.

## Sources

- Direct codebase analysis of gallery-service (`services/gallery-service/src/`)
- Frontend component analysis (`frontend/src/components/features/gallery/`, `frontend/src/pages/public/`)
- Shared types analysis (`packages/shared-types/src/gallery.ts`)
- Schema analysis (`services/gallery-service/src/schemas/gallery.py`)
- R2 service implementation (`services/gallery-service/src/services/r2_service.py`)
- Magic link service (`services/gallery-service/src/services/magic_link_service.py`)
- Proofing service (`services/gallery-service/src/services/proofing_service.py`)
- Gallery constants (`frontend/src/constants/gallery.ts`, `frontend/src/constants/galleryThemes.ts`)
- HIGH confidence: All findings based on direct code inspection of the existing system
