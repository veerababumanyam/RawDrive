# Architecture Patterns: Public Gallery & Gallery Player Modernization

**Domain:** Photography gallery delivery platform (public-facing client experience)
**Researched:** 2026-03-19
**Confidence:** HIGH -- based on direct codebase analysis of existing services, schemas, and components

## Recommended Architecture

The modernization builds on top of the existing gallery-service (port 8004) and client-service (port 8011) without introducing new microservices. The core strategy is: **refactor the monolithic PublicGalleryPage.tsx into a composable component tree, add new gallery layout engines on the frontend, and extend existing backend API endpoints for download orchestration and social sharing metadata.**

### System Overview

```
Client Browser
    |
    v
[Traefik :80] --> [gallery-service :8004]  (gallery data, proofing, magic links)
    |                   |
    |                   +--> [PostgreSQL] (galleries, gallery_assets, client_interactions)
    |                   +--> [Redis] (URL cache, proofing pub/sub, session tokens)
    |                   +--> [R2/S3] (presigned URLs for thumbnails/preview/original)
    |
    +-----------> [client-service :8011]  (client records, contact linkage)
    |
    +-----------> [upload-service :8008]  (LQIP data, thumbnail generation)
    |
    v
[Frontend SPA] --> PublicGalleryShell (new)
                      |
                      +-- GalleryLayoutEngine (new) -- renders masonry/grid/justified/mosaic/filmstrip
                      +-- GalleryPlayer (new) -- fullscreen lightbox with zoom/pan/swipe/EXIF
                      +-- ClientInteractionBar (new) -- favorites/selections/comments unified toolbar
                      +-- DownloadManager (new) -- single/batch/full download flows
                      +-- SocialShareManager (new) -- OG tags, share links, embed codes
                      +-- ProgressiveImageLoader (enhanced) -- LQIP blur-up pipeline
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| **PublicGalleryShell** (new page component) | Orchestrates gallery loading, auth gates (PIN/password/email), theme application, and mounts layout + player | gallery-service API, magic link validation |
| **GalleryLayoutEngine** (new) | Renders photos in selected layout mode (masonry, grid, justified, mosaic, filmstrip, slideshow) with virtualization | Receives asset array, emits asset-click events |
| **GalleryPlayer** (new, replaces inline lightbox) | Fullscreen viewer with zoom, pan, swipe, keyboard nav, filmstrip, EXIF panel, proofing actions | gallery-service (asset URLs), proofing API |
| **ClientInteractionBar** (new) | Unified toolbar for favorites, selections, comments, ratings within gallery context | proofing API endpoints on gallery-service |
| **DownloadManager** (new) | Orchestrates single/batch/full-gallery downloads with progress, quota checks, watermark application | gallery-service download endpoints, R2 presigned URLs |
| **SocialShareManager** (new) | Generates share URLs, manages OG meta tags, provides embed code snippets | gallery-service (new OG metadata endpoint) |
| **ProgressiveImageLoader** (enhanced existing) | LQIP blur-up loading with IntersectionObserver, srcset for responsive images | R2 presigned URLs (thumbnail -> preview -> original) |
| **GalleryThemeProvider** (new context) | Applies gallery-specific theming (colors, fonts, dark/light mode, gradients) as CSS custom properties | GalleryDetailData branding fields |
| **Existing: CinematicViewer** | Slideshow presentation mode (already built) | Asset array, slideshow config |
| **Existing: ProofingService** (backend) | Favorites, selections, comments, batch operations, face search | PostgreSQL client_interactions table, Redis pub/sub |
| **Existing: R2URLService** (backend) | Presigned URL generation with Redis caching | R2/S3, Redis |
| **Existing: MagicLinkService** (backend) | Token validation, access control, view counting | PostgreSQL magic_links table |

## Data Flow

### 1. Gallery Load Flow (existing, unchanged)

```
Browser navigates to /gallery/:token
  -> PublicGalleryShell extracts token from URL params
  -> magicLinkService.validate(token) -> gallery-service /api/v1/public/magic-links/validate
  -> Returns: gallery_id, protection requirements, gallery metadata
  -> If PIN/password required: show verification modal
  -> On success: fetch gallery detail + assets in parallel
     -> GET /api/v1/public/galleries/{gallery_id} (with X-Magic-Link-Token header)
     -> GET /api/v1/public/galleries/{gallery_id}/assets?page=1&limit=50
  -> GalleryThemeProvider applies branding (primary_color, gradient_config, font_family, theme)
  -> GalleryLayoutEngine renders first batch of assets
  -> IntersectionObserver triggers progressive loading of subsequent pages
```

### 2. Gallery Player Flow (NEW)

```
User clicks photo in GalleryLayoutEngine
  -> GalleryPlayer opens in fullscreen overlay (portal to document.body)
  -> Loads preview_url immediately (already cached from grid view)
  -> Prefetches original_url for current + adjacent photos (N-1, N+1)
  -> Keyboard: ArrowLeft/Right navigate, Escape closes, F toggles fullscreen, I toggles info
  -> Touch: swipe left/right to navigate, pinch-to-zoom, double-tap zoom toggle
  -> Filmstrip at bottom shows thumbnails with current position indicator
  -> EXIF panel slides in from right (if gallery.exif_visible)
  -> Favorite/select buttons integrated in overlay toolbar
  -> Download button respects gallery.download_policy
  -> Share button generates direct link to this specific photo
```

### 3. Client Favorites/Selections Flow (existing APIs, new UI integration)

```
Client clicks heart icon on photo (in grid or in player)
  -> Optimistic UI update: toggle heart state, update local Set<string>
  -> POST /api/v1/public/galleries/{gallery_id}/proof/favorite
     Body: { asset_id, action: "favorite", value: true }
     Headers: X-Visitor-ID (from localStorage)
  -> Backend: ProofingService.toggle_favorite()
     -> UPDATE gallery_assets SET is_favorited = $value
     -> INSERT/UPDATE client_interactions (type: 'favorite')
     -> Publish to Redis channel: gallery:{gallery_id}:proofing
  -> WebSocket broadcasts update to other viewers
  -> If error: revert optimistic update, show toast

Tab switching (All / Favorites / Selections):
  -> Filter assets client-side from loaded array
  -> "Favorites" tab: assets.filter(a => localFavorites.has(a.asset_id))
  -> "Selections" tab: assets.filter(a => localSelections.has(a.asset_id))
  -> Selection limit enforcement: check gallery.selection_limit before toggling
```

### 4. Download Flow (existing partial, needs new orchestration)

```
Single photo download:
  -> User clicks download in GalleryPlayer
  -> Check gallery.download_policy:
     - "view_only": disable download button entirely
     - "web_only": serve preview_url (web-optimized)
     - "watermarked_only": request watermarked variant from backend
     - "original_allowed": serve original_url
  -> Check daily download quota (existing DownloadUsageResponse schema)
  -> Trigger browser download via <a download> with presigned URL

Batch download (favorites/selections):
  -> User clicks "Download Favorites" or "Download Selections"
  -> Collect asset_ids from localFavorites or localSelections set
  -> POST /api/v1/public/galleries/{gallery_id}/download (NEW endpoint needed)
     Body: { asset_ids: [...], format: "zip" }
  -> Backend: generate presigned URLs, create zip stream or return download manifest
  -> Frontend: show progress indicator, download zip when ready

Full gallery download:
  -> Same as batch but with all visible asset_ids
  -> Backend streams zip or returns download URL with expiry
```

### 5. Social Sharing Flow (NEW)

```
Share button on gallery or individual photo:
  -> ShareMenu generates URLs:
     - Gallery share: current URL (magic link)
     - Photo share: URL with ?photo={asset_id} query param
     - Embed code: <iframe> snippet pointing to /embed/gallery/{token}
  -> Copy to clipboard with toast confirmation
  -> Direct share: navigator.share() on mobile, fallback to share modal
  -> OG metadata: <Helmet> dynamically sets og:image, og:title, og:description
     - og:image uses cover_asset_id presigned URL for gallery
     - og:image uses specific asset preview_url for photo share
  -> Backend NEW endpoint: GET /api/v1/public/galleries/{gallery_id}/og-image
     -> Returns redirect to presigned URL (for social crawlers that don't send headers)
```

### 6. Progressive Image Loading Pipeline

```
Asset enters viewport (IntersectionObserver):
  1. Render LQIP placeholder (base64 data URI from asset.lqip field, ~200 bytes)
     -> CSS: filter: blur(20px); transform: scale(1.1); // hide blur edges
  2. Load thumbnail_url (~300px wide, fast)
     -> On load: crossfade from LQIP to thumbnail (opacity transition 300ms)
  3. If in GalleryPlayer (fullscreen): load preview_url (~1920px)
     -> On load: crossfade from thumbnail to preview
  4. If user requests original (download or zoom): load original_url
     -> Only when download_policy allows

Signed URL refresh:
  -> URLs expire after 1 hour (R2URLService cache TTL)
  -> Frontend tracks expiry via _signed_urls metadata
  -> Before URL expires: re-fetch via gallery-service
  -> During transition: keep current URL until new one resolves
```

## Patterns to Follow

### Pattern 1: Composable Gallery Shell (extract from monolithic page)

**What:** Break the 800+ line PublicGalleryPage.tsx into a shell component that composes focused sub-components via React Context.

**When:** Immediately -- this is the foundation for all other work.

**Example:**

```typescript
// PublicGalleryShell.tsx -- orchestrator
const PublicGalleryShell: React.FC = () => {
  const { token } = useParams<{ galleryId: string }>();
  const galleryQuery = usePublicGallery(token); // TanStack Query hook
  const assetsQuery = usePublicGalleryAssets(token, galleryQuery.data?.gallery_id);

  if (galleryQuery.isLoading) return <GalleryLoadingSkeleton />;
  if (galleryQuery.data?.pin_protected && !isPinVerified) return <PinGate />;

  return (
    <GalleryThemeProvider gallery={galleryQuery.data}>
      <GalleryInteractionProvider galleryId={galleryQuery.data.gallery_id}>
        <GalleryHeader gallery={galleryQuery.data} />
        <GalleryLayoutEngine
          assets={assetsQuery.data}
          layout={galleryQuery.data.layout_style}
          onAssetClick={openPlayer}
        />
        <GalleryPlayer />  {/* reads from context */}
      </GalleryInteractionProvider>
    </GalleryThemeProvider>
  );
};
```

### Pattern 2: Layout Engine with Strategy Pattern

**What:** A single GalleryLayoutEngine component that delegates to layout-specific renderers via a strategy map.

**When:** When building the layout system.

**Example:**

```typescript
// GalleryLayoutEngine.tsx
const layoutRenderers: Record<LayoutStyle, React.FC<LayoutRendererProps>> = {
  grid: GridLayout,
  masonry: MasonryLayout,       // existing component, needs enhancement
  justified: JustifiedLayout,   // NEW -- justified.js algorithm
  mosaic: MosaicLayout,         // NEW -- CSS grid auto-placement
  filmstrip: FilmstripLayout,   // NEW -- horizontal scroll
  slideshow: SlideshowLayout,   // wraps existing CinematicViewer
};

const GalleryLayoutEngine: React.FC<Props> = ({ assets, layout, onAssetClick }) => {
  const Renderer = layoutRenderers[layout] || layoutRenderers.masonry;
  return (
    <VirtualizedContainer>
      <Renderer assets={assets} onAssetClick={onAssetClick} />
    </VirtualizedContainer>
  );
};
```

### Pattern 3: Optimistic Proofing with Context

**What:** A React Context that manages client interaction state (favorites, selections) with optimistic updates and WebSocket sync.

**When:** When building the interaction layer.

**Example:**

```typescript
// GalleryInteractionContext.tsx
interface GalleryInteractionState {
  favorites: Set<string>;
  selections: Set<string>;
  toggleFavorite: (assetId: string) => Promise<void>;
  toggleSelection: (assetId: string) => Promise<void>;
  selectionCount: number;
  selectionLimit: number | null;
  isAtSelectionLimit: boolean;
}

// Provider wraps gallery, manages localStorage persistence,
// optimistic updates, and API calls to proofing endpoints
```

### Pattern 4: Presigned URL Management Hook

**What:** A custom hook that manages presigned URL lifecycle -- caching, prefetching, and refresh before expiry.

**When:** When building the image loading pipeline.

**Example:**

```typescript
// usePresignedUrl.ts
function usePresignedUrl(assetId: string, variant: 'thumbnail' | 'preview' | 'original') {
  // Check memory cache first
  // If expired or missing, fetch from gallery-service
  // Prefetch adjacent assets when in player mode
  // Return { url, isLoading, error }
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: God Component (CURRENT STATE)

**What:** PublicGalleryPage.tsx is 800+ lines with 30+ useState hooks managing lightbox, downloads, face discovery, proofing, breadcrumbs, zoom, video, accessibility, and more.

**Why bad:** Impossible to test individual features, every change risks breaking unrelated functionality, renders the entire tree on any state change.

**Instead:** Extract into PublicGalleryShell + focused components with React Context for shared state (see Pattern 1 above).

### Anti-Pattern 2: Client-Side Zip Generation

**What:** Generating zip files in the browser for batch downloads.

**Why bad:** Memory-intensive for large galleries (500+ photos), blocks main thread, poor progress reporting, can crash mobile browsers.

**Instead:** Backend generates zip with streaming response. Frontend displays progress via polling or SSE. For small batches (< 10), sequential presigned URL downloads with progress bar are acceptable.

### Anti-Pattern 3: Loading All Assets at Once

**What:** Fetching all gallery assets on initial load.

**Why bad:** Galleries can have 1000+ photos. Loading all metadata + generating all presigned URLs creates latency and memory pressure.

**Instead:** Paginated loading (existing: page/limit params) with IntersectionObserver-triggered next-page fetches. Virtual scrolling for large galleries (TanStack Virtual or custom implementation).

### Anti-Pattern 4: Storing Interaction State Only in localStorage

**What:** Using localStorage as the primary store for favorites/selections without backend sync.

**Why bad:** Lost when clearing browser data, not accessible from other devices, no photographer visibility.

**Instead:** localStorage for visitor session persistence + immediate backend sync via proofing API. Backend is source of truth, localStorage is optimistic cache.

## New vs Modified Files

### NEW Backend Files

| File | Purpose |
|------|---------|
| `services/gallery-service/src/api/v1/public/downloads.py` | Public download orchestration endpoints (single, batch, zip) |
| `services/gallery-service/src/api/v1/public/sharing.py` | OG metadata endpoint, embed endpoint |
| `services/gallery-service/src/services/download_service.py` | Download orchestration: quota checks, watermark routing, zip generation |
| `services/gallery-service/src/schemas/download.py` | Download request/response schemas (extend existing DownloadRequest/DownloadResponse) |

### MODIFIED Backend Files

| File | Change |
|------|--------|
| `services/gallery-service/src/api/v1/public/galleries.py` | Add `?photo=` query param support for deep-linking to specific asset |
| `services/gallery-service/src/services/gallery_service.py` | Add method to return OG-optimized gallery/asset metadata |
| `services/gallery-service/src/services/r2_service.py` | Add batch presigned URL generation for download manifests |

### NEW Frontend Files

| File | Purpose |
|------|---------|
| `frontend/src/pages/public/PublicGalleryShell.tsx` | New orchestrator component (replaces PublicGalleryPage logic) |
| `frontend/src/components/features/gallery/player/GalleryPlayer.tsx` | Fullscreen photo viewer with zoom/pan/swipe |
| `frontend/src/components/features/gallery/player/PlayerToolbar.tsx` | Player overlay toolbar (nav, download, share, favorite, info) |
| `frontend/src/components/features/gallery/player/PlayerFilmstrip.tsx` | Thumbnail filmstrip navigation at bottom of player |
| `frontend/src/components/features/gallery/player/PlayerExifPanel.tsx` | Slide-out EXIF metadata panel |
| `frontend/src/components/features/gallery/player/PlayerZoomContainer.tsx` | Pinch-to-zoom and pan container |
| `frontend/src/components/features/gallery/layouts/GalleryLayoutEngine.tsx` | Layout strategy dispatcher |
| `frontend/src/components/features/gallery/layouts/GridLayout.tsx` | CSS Grid layout renderer |
| `frontend/src/components/features/gallery/layouts/JustifiedLayout.tsx` | Justified/flickr-style row layout |
| `frontend/src/components/features/gallery/layouts/MosaicLayout.tsx` | Mixed-size mosaic grid layout |
| `frontend/src/components/features/gallery/layouts/FilmstripLayout.tsx` | Horizontal scroll filmstrip |
| `frontend/src/components/features/gallery/layouts/SlideshowLayout.tsx` | Wrapper around CinematicViewer |
| `frontend/src/components/features/gallery/interactions/ClientInteractionBar.tsx` | Unified favorites/selections toolbar |
| `frontend/src/components/features/gallery/interactions/SelectionCounter.tsx` | Selection count vs limit display |
| `frontend/src/components/features/gallery/download/DownloadManager.tsx` | Download flow orchestrator |
| `frontend/src/components/features/gallery/download/BatchDownloadProgress.tsx` | Progress indicator for batch downloads |
| `frontend/src/components/features/gallery/sharing/SocialSharePanel.tsx` | Share dialog with copy/social/embed options |
| `frontend/src/components/features/gallery/sharing/EmbedCodeGenerator.tsx` | Embed iframe code generator |
| `frontend/src/contexts/GalleryThemeContext.tsx` | Gallery-specific theme CSS custom properties |
| `frontend/src/contexts/GalleryInteractionContext.tsx` | Favorites/selections state management |
| `frontend/src/contexts/GalleryPlayerContext.tsx` | Player open/close state, current asset index |
| `frontend/src/hooks/usePublicGallery.ts` | TanStack Query hook for public gallery data |
| `frontend/src/hooks/usePublicGalleryAssets.ts` | TanStack Query infinite scroll hook for assets |
| `frontend/src/hooks/useGalleryPlayer.ts` | Player navigation, prefetch, keyboard shortcuts |
| `frontend/src/hooks/usePresignedUrl.ts` | URL lifecycle management with prefetch |
| `frontend/src/hooks/useProgressiveImage.ts` | LQIP -> thumbnail -> preview loading pipeline |
| `frontend/src/hooks/useGalleryDownload.ts` | Download flow with quota checking |
| `frontend/src/hooks/useTouchGestures.ts` | Swipe, pinch-to-zoom, double-tap gesture recognition |
| `frontend/src/hooks/useGalleryKeyboard.ts` | Keyboard shortcut registration for gallery/player |

### MODIFIED Frontend Files

| File | Change |
|------|--------|
| `frontend/src/pages/public/PublicGalleryPage.tsx` | Gutted -- delegates to PublicGalleryShell (kept for route compatibility) |
| `frontend/src/components/features/gallery/MasonryLayout.tsx` | Enhanced with progressive loading, interaction overlay |
| `frontend/src/components/features/gallery/GalleryCanvas.tsx` | Adapter to work with new layout engine |
| `frontend/src/components/features/gallery/Lightbox.tsx` | Deprecated in favor of new GalleryPlayer |
| `frontend/src/components/features/gallery/LightboxImage.tsx` | Deprecated in favor of PlayerZoomContainer |
| `frontend/src/components/features/gallery/LightboxFilmstrip.tsx` | Deprecated in favor of PlayerFilmstrip |
| `frontend/src/components/features/gallery/ShareMenu.tsx` | Enhanced with embed codes and OG preview |
| `frontend/src/types/gallery.ts` | Add layout types, player state types |
| `frontend/src/services/galleryService.ts` | Add download orchestration, OG metadata methods |

## Suggested Build Order (dependency-driven)

### Phase A: Foundation Refactor (no new features, zero visual change)

1. **Extract React Contexts** -- GalleryThemeContext, GalleryInteractionContext, GalleryPlayerContext
2. **Extract hooks** -- usePublicGallery, usePublicGalleryAssets, useGalleryKeyboard
3. **Create PublicGalleryShell** -- move orchestration logic from PublicGalleryPage
4. **Verify parity** -- existing behavior identical after refactor (snapshot tests)

**Rationale:** Every subsequent feature depends on the decomposed component tree. Building layouts or player on the monolith would make things worse.

### Phase B: Layout Engine + Progressive Loading

5. **GalleryLayoutEngine** with strategy pattern
6. **GridLayout** (baseline, simplest)
7. **Enhanced MasonryLayout** with virtualization
8. **JustifiedLayout** using justified-layout algorithm
9. **MosaicLayout** and **FilmstripLayout**
10. **useProgressiveImage** hook with LQIP blur-up
11. **SlideshowLayout** wrapping existing CinematicViewer

**Rationale:** Layouts are visual-only, no backend changes needed. Progressive loading applies across all layouts.

### Phase C: Gallery Player

12. **GalleryPlayer** shell with fullscreen portal
13. **PlayerZoomContainer** with pinch-to-zoom and pan
14. **useTouchGestures** hook
15. **PlayerFilmstrip** thumbnail navigation
16. **PlayerToolbar** with nav/close/fullscreen actions
17. **PlayerExifPanel** slide-out metadata display
18. **usePresignedUrl** for prefetching adjacent images

**Rationale:** Player depends on contexts from Phase A. Builds naturally on the progressive loading from Phase B.

### Phase D: Client Interactions in Player

19. **ClientInteractionBar** integrated into player and grid
20. **SelectionCounter** with limit enforcement
21. **WebSocket integration** for real-time proofing sync
22. **CommentSection** in player context

**Rationale:** Interaction APIs already exist. This phase wires new UI to existing proofing endpoints.

### Phase E: Download Flows

23. **Backend: download_service.py** with quota + watermark logic
24. **Backend: public/downloads.py** API endpoints
25. **DownloadManager** frontend component
26. **BatchDownloadProgress** with streaming/polling
27. **useGalleryDownload** hook

**Rationale:** Download needs backend work (zip orchestration). Player and interactions should work first so "download favorites" has data.

### Phase F: Social Sharing + Polish

28. **Backend: public/sharing.py** OG metadata endpoint
29. **SocialSharePanel** with copy/share/embed
30. **EmbedCodeGenerator** for iframe embeds
31. **Gallery password entry page** redesign (branded, premium feel)
32. **Dark/light mode** gallery theme finalization
33. **Mobile responsive polish** across all new components

**Rationale:** Sharing is lowest dependency. Polish comes last when all features are integrated.

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 1M users |
|---------|--------------|--------------|-------------|
| Presigned URL generation | Direct R2 calls, Redis cache 1hr | Redis cache essential, batch generation | CDN layer in front of R2, longer cache TTL |
| Asset pagination | 50/page, no virtualization needed | Virtual scrolling for galleries > 200 photos | Virtual scrolling + progressive page loading |
| Zip downloads | Sync generation, stream response | Async worker, poll for completion | Queue-based with S3 staging, download URL with expiry |
| WebSocket proofing | Single Redis pub/sub channel | Channel per gallery, connection pooling | Dedicated WebSocket service, fan-out via Redis Streams |
| OG image serving | Redirect to presigned URL | Cache OG image URLs in Redis | Edge worker generates OG images, CDN cache |

## Integration Points Summary

| Existing Service | Integration Type | What Changes |
|-----------------|-----------------|--------------|
| gallery-service (public galleries API) | Extend | Add download endpoints, OG metadata endpoint, photo deep-link support |
| gallery-service (proofing API) | Use as-is | Frontend wires new UI to existing toggle_favorite, toggle_selection, add_comment, batch_proofing |
| gallery-service (magic links) | Use as-is | No changes needed, validation flow unchanged |
| gallery-service (R2 service) | Extend | Add batch URL generation for download manifests |
| gallery-service (WebSocket) | Use as-is | Frontend connects to existing ws endpoint for proofing updates |
| client-service | No change | Client records already linked via visitor_id in proofing |
| upload-service | No change | LQIP data already generated during upload pipeline |
| Redis | Use as-is | Existing caching and pub/sub channels sufficient |

## Sources

- Direct codebase analysis: `services/gallery-service/src/` (API routes, services, schemas)
- Direct codebase analysis: `frontend/src/pages/public/PublicGalleryPage.tsx` (current 800+ line implementation)
- Direct codebase analysis: `frontend/src/types/gallery.ts` (GalleryDetailData, GalleryAssetItem, PublicGalleryAsset types)
- Direct codebase analysis: `frontend/src/components/features/gallery/` (60+ existing components including Lightbox, MasonryLayout, CinematicViewer)
- Existing backend schemas: GalleryResponse, GalleryAssetResponse, ProofingActionRequest/Response, DownloadRequest/Response, SlideshowConfig, WatermarkConfig
- Existing proofing API: toggle_favorite, toggle_selection, add_comment, batch_proofing, face_search endpoints
- Existing R2URLService: presigned URL generation with Redis caching, variant support (thumbnail/preview/original)
