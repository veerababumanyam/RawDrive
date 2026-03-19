# Technology Stack: v1.2 Public Gallery & Gallery Player Modernization

**Project:** RawDrive v1.2
**Researched:** 2026-03-19
**Focus:** Additions/changes needed for modern gallery viewing, fullscreen player, gestures, client favorites, download flows, social sharing, lightbox, and progressive image loading.

## Existing Stack (DO NOT ADD -- Already Available)

These libraries are already installed and should be used directly. Do NOT add alternatives.

| Library | Version | Use For v1.2 |
|---------|---------|--------------|
| `framer-motion` | ^11.0.0 | Page transitions, lightbox enter/exit animations, layout animations, shared layout for thumbnail-to-fullscreen morph |
| `@use-gesture/react` | ^10.3.1 | Swipe gestures in gallery player, pinch-to-zoom in lightbox, drag-to-dismiss |
| `react-hotkeys-hook` | ^4.6.1 | Keyboard navigation (arrows, Escape, F for fullscreen) in gallery player |
| `@tanstack/react-query` | ^5.90.16 | Gallery data fetching, asset pagination, favorites mutation with optimistic updates |
| `@tanstack/react-virtual` | ^3.13.18 | Virtualizing large gallery grids (preferred over react-window for new code) |
| `react-window` + `react-window-infinite-loader` | ^2.2.4 / ^2.0.0 | Already used elsewhere; use @tanstack/react-virtual for new gallery components instead |
| `react-helmet-async` | ^2.0.4 | Open Graph meta tags for social sharing previews |
| `react-router-dom` | ^6.21.0 | Gallery routes, deep-linking to specific photos |
| `lucide-react` | ^0.294.0 | Gallery UI icons (heart, download, share, zoom, grid, etc.) |
| `@dnd-kit/core` + `@dnd-kit/sortable` | ^6.3.1 / ^10.0.0 | Drag-to-reorder in album/sub-gallery management (photographer side) |
| `zod` | ^4.3.5 | Runtime validation of gallery API responses |
| `@fingerprintjs/fingerprintjs` | ^5.0.1 | Visitor identification for favorites/selections without login |
| `dompurify` | ^3.3.1 | Sanitize any user-generated content in comments |
| `workbox-window` + `vite-plugin-pwa` | ^7.4.0 / ^0.20.0 | Service worker for offline gallery caching |

**Backend already has:** ProofingService with favorites/selections/comments/ratings via WebSocket real-time updates, magic link access control, PIN/password verification, batch proofing, face search with pgvector, R2 signed URL generation, Redis pub/sub for real-time proofing events.

## New Additions Required

### Frontend Libraries

| Library | Version | Purpose | Why Needed |
|---------|---------|---------|------------|
| `justified-layout` | ^4.1.0 | Justified (Flickr-style) row layout algorithm | Pure geometry engine (no DOM dependency) from Flickr. Returns coordinates for justified rows given aspect ratios. Needed for the "justified" layout option alongside masonry and grid. ~3KB gzipped. No React wrapper needed -- use output coordinates to position elements directly. |
| `react-zoom-pan-pinch` | ^3.7.0 | Lightbox zoom, pan, pinch-to-zoom on images | Provides TransformWrapper/TransformComponent with smooth zoom/pan/pinch. Works alongside existing @use-gesture/react (use @use-gesture for swipe navigation between photos, react-zoom-pan-pinch for zoom/pan within a single photo). 600K+ weekly downloads, actively maintained. |
| `exifr` | ^7.1.3 | Client-side EXIF data extraction for lightbox info panel | Fastest JS EXIF reader (~9KB mini bundle). Reads camera model, lens, aperture, shutter speed, ISO, GPS from JPEG/HEIC without loading full image. Needed for the EXIF display panel in lightbox view. |
| `client-zip` | ^2.4.6 | Client-side ZIP creation for batch downloads | Streaming ZIP generator, ~2.6KB gzipped. 40x faster than JSZip. Creates ZIP from R2 signed URLs streamed directly to disk via service worker. No memory bloat for large galleries (100+ photos). |
| `file-saver` | ^2.0.5 | Trigger browser download for single files and ZIP archives | Standard saveAs() polyfill. Needed as fallback for browsers without native download support and for triggering ZIP downloads created by client-zip. ~3KB. |

### No New Backend Libraries Needed

The gallery-service already has all required backend capabilities:

- **Favorites/Selections:** ProofingService with toggle_favorite, toggle_selection, batch_proofing
- **Comments:** ProofingService.add_comment with WebSocket broadcast
- **Downloads:** DownloadRequest/DownloadResponse schemas exist; R2 signed URL batch generation exists
- **Real-time:** Redis pub/sub with WebSocket delivery already wired
- **Access control:** Magic links, PIN/password verification, visitor tracking
- **Ratings:** Client rating endpoint with denormalized averages

**Backend work is API enhancement, not new dependencies:** Extend existing endpoints for layout metadata, OG image data, download manifests, and EXIF metadata passthrough.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not Alternative |
|----------|-------------|-------------|---------------------|
| Justified layout | `justified-layout` | `react-masonry-css`, Masonic | justified-layout is a pure algorithm (geometry only, no DOM). We render ourselves with framer-motion for animations. Masonic is 15KB and opinionated about rendering. react-masonry-css is CSS columns (not true justified rows). |
| Zoom/Pan | `react-zoom-pan-pinch` | Building on @use-gesture/react alone | @use-gesture handles gesture detection but not transform state management (scale, translate bounds, double-tap zoom). react-zoom-pan-pinch wraps this cleanly. Building from scratch is 500+ lines of transform math. |
| EXIF reading | `exifr` | `exifreader`, `exif-parser` | exifr is 30x faster due to segment-aware parsing (not brute force). Mini bundle is 9KB vs ExifReader's 30KB+. Supports HEIC which photographers commonly shoot. |
| ZIP creation | `client-zip` | `JSZip` | client-zip streams to disk (no memory bloat). JSZip buffers entire ZIP in memory -- fails on 2GB+ galleries. client-zip is 2.6KB vs JSZip 45KB. |
| Download trigger | `file-saver` | Native anchor click | file-saver handles edge cases (Safari blob URLs, IE fallback, large file naming). One-liner API vs 20 lines of cross-browser code. |
| Masonry layout | Custom CSS columns + @tanstack/react-virtual | `masonic`, `react-masonry-css` | CSS columns with column-count + virtualization via @tanstack/react-virtual (already installed) is sufficient. No need for another masonry library when we already have virtualization. |
| Lightbox | Custom with framer-motion + react-zoom-pan-pinch | `yet-another-react-lightbox`, `photoswipe` | PhotoSwipe is excellent but has its own gesture system that conflicts with @use-gesture/react. Building lightbox shell with framer-motion (AnimatePresence, layoutId) + our gesture stack gives full control over UX and consistent animation language across the app. |
| OG images | Server-side meta tags via gallery-service API | `@vercel/og`, Satori | We are not on Next.js/Vercel. Gallery-service can return OG meta data; react-helmet-async renders the tags. For image previews, serve a gallery cover image URL from R2 directly -- no image generation needed. |
| Social sharing | Native Web Share API + fallback copy-to-clipboard | `react-share` | react-share is 30KB of platform-specific share buttons. Web Share API covers mobile natively. Desktop fallback is a simple copy-link + platform URL templates (3 lines each for Twitter/Facebook/Pinterest). No library needed. |

## Layout Strategy (No Library Needed)

For **grid** and **mosaic** layouts, use CSS Grid directly. For **masonry**, use CSS `column-count` with `break-inside: avoid`. For **filmstrip**, use CSS `overflow-x: auto` with snap points. For **slideshow**, use framer-motion AnimatePresence with drag gestures.

Only **justified** layout requires the algorithm library because it needs aspect-ratio-aware row balancing that CSS cannot do natively.

## Integration Architecture

### Gallery Player Component Stack

```
GalleryShell (layout selector, toolbar, branding)
  +-- LayoutEngine (grid | masonry | justified | filmstrip | mosaic | slideshow)
  |     +-- justified-layout (geometry only, for justified mode)
  |     +-- @tanstack/react-virtual (virtualization for all modes)
  |     +-- framer-motion (layout animations on mode switch)
  +-- LightboxOverlay (framer-motion AnimatePresence)
  |     +-- react-zoom-pan-pinch (zoom/pan within photo)
  |     +-- @use-gesture/react (swipe between photos, drag to dismiss)
  |     +-- react-hotkeys-hook (keyboard: arrows, escape, F, +/-)
  |     +-- ExifPanel (exifr for metadata display)
  +-- ProofingToolbar (favorites, selections, comments, ratings)
  |     +-- @tanstack/react-query (optimistic mutations)
  |     +-- WebSocket (real-time sync via existing infrastructure)
  +-- DownloadManager
  |     +-- client-zip (batch ZIP creation)
  |     +-- file-saver (download trigger)
  +-- SharePanel
        +-- react-helmet-async (OG tags)
        +-- Web Share API (native sharing)
```

### Backend Integration Points

| Feature | Existing Endpoint | Enhancement Needed |
|---------|-------------------|--------------------|
| Gallery data | `GET /public/{id}` | Add layout_type, theme config, branding to response |
| Assets | `GET /public/{id}/assets` | Add EXIF metadata, LQIP data URL, aspect_ratio to each asset |
| Favorites | ProofingService.toggle_favorite | Already complete -- wire to frontend |
| Selections | ProofingService.toggle_selection | Already complete -- wire to frontend |
| Comments | ProofingService.add_comment | Already complete -- wire to frontend |
| Ratings | `POST /public/{id}/rate` | Already complete -- wire to frontend |
| Downloads | DownloadRequest schema exists | Implement actual ZIP generation endpoint using R2 signed URLs |
| Real-time | WebSocket + Redis pub/sub | Already wired -- connect frontend WebSocket client |
| OG meta | None | New endpoint: `GET /public/{id}/og` returning title, description, cover image URL |
| Breadcrumbs | `GET /public/{id}/breadcrumbs` | Already complete |

## Installation

```bash
# New frontend dependencies (5 packages, ~20KB total gzipped)
cd frontend && pnpm add justified-layout react-zoom-pan-pinch exifr client-zip file-saver

# Type definitions
cd frontend && pnpm add -D @types/file-saver
```

**No backend package changes required.**

## Version Verification Notes

| Package | Verified Via | Confidence |
|---------|-------------|------------|
| `justified-layout` ^4.1.0 | npm registry, Flickr GitHub | HIGH -- stable, mature, no breaking changes since v4 |
| `react-zoom-pan-pinch` ^3.7.0 | npm registry, GitHub releases | HIGH -- actively maintained, 600K+ weekly downloads |
| `exifr` ^7.1.3 | npm registry, GitHub | HIGH -- mature, widely used |
| `client-zip` ^2.4.6 | npm registry, GitHub | MEDIUM -- smaller community but solid streaming approach |
| `file-saver` ^2.0.5 | npm registry | HIGH -- de facto standard, 5M+ weekly downloads |

## What NOT to Add

| Library | Why Skip |
|---------|----------|
| `photoswipe` | Conflicts with existing @use-gesture/react gesture system; brings its own CSS/animation layer that fights framer-motion |
| `react-share` | 30KB for share buttons we can build in 50 lines with Web Share API + URL templates |
| `yet-another-react-lightbox` | 25KB+ with its own rendering. We get better animations and consistency by composing framer-motion + react-zoom-pan-pinch |
| `masonic` | 15KB masonry library when CSS columns + @tanstack/react-virtual handles our use case |
| `react-masonry-css` | CSS column-based, not true justified. We already have better tools |
| `JSZip` | Buffers entire ZIP in memory. client-zip streams. Gallery ZIPs can be 2GB+ |
| `streamsaver` | Requires external service worker proxy hosted on different origin. client-zip + file-saver is simpler |
| `sharp` (frontend) | Image processing belongs in backend/upload pipeline. LQIP already generated at upload time |
| `blurhash` | LQIP (Low Quality Image Placeholder) already exists in the upload pipeline. No need for a separate blur hash system |
| Any lightbox library | Building custom gives us framer-motion consistency, shared layoutId animations, and full gesture control |

## Sources

- [Flickr justified-layout GitHub](https://github.com/flickr/justified-layout) -- pure geometry algorithm
- [react-zoom-pan-pinch GitHub](https://github.com/BetterTyped/react-zoom-pan-pinch) -- zoom/pan/pinch library
- [exifr GitHub](https://github.com/MikeKovarik/exifr) -- fastest JS EXIF reader
- [client-zip GitHub](https://github.com/Touffy/client-zip) -- streaming browser ZIP
- [file-saver GitHub](https://github.com/eligrey/FileSaver.js) -- browser file saving
- [Masonic GitHub](https://github.com/jaredLunde/masonic) -- considered but rejected (too opinionated)
- [Web Share API MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API) -- native sharing

---
*Stack research for v1.2 milestone. Last updated: 2026-03-19*
