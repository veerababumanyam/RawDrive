# Feature Landscape: Public Gallery & Gallery Player Modernization

**Domain:** Professional photography client gallery delivery and viewing
**Researched:** 2026-03-19
**Competitors Analyzed:** Pixieset, Pic-Time, ShootProof, SmugMug, Zenfolio, CloudSpot, Pass, Narrative, Darkroom, Format, PhotoShelter

## Table Stakes

Features clients and photographers expect from any serious gallery platform. Missing any of these makes the product feel incomplete or amateur.

| Feature | Why Expected | Complexity | Existing in RawDrive | Notes |
|---------|--------------|------------|---------------------|-------|
| **Multiple gallery layouts** (masonry, grid, justified) | Every competitor offers 3+ layout options. Pixieset, Zenfolio, SmugMug all default to this. | Med | Partial (masonry + grid via GalleryCanvas) | Need justified/row layout. Existing MasonryLayout and PhotoGrid are solid foundations. |
| **Fullscreen lightbox with keyboard nav** | Universal across all platforms. Arrow keys, Escape to close, spacebar for slideshow. | Low | YES (Lightbox.tsx with useLightboxNavigation) | Already has zoom, filmstrip, compare mode. Needs polish, not rebuild. |
| **Touch gesture support** (swipe, pinch-zoom) | 60%+ gallery views happen on mobile. Pixieset, Pic-Time, CloudSpot all have native-feel touch. | Med | Partial (basic swipe likely) | Need proper Hammer.js or use-gesture for pinch-zoom, swipe nav, momentum scrolling. |
| **LQIP/blur-up progressive loading** | Pic-Time and Pixieset load galleries of 1000+ photos smoothly. Perceived performance is critical. | Low | YES (LightboxImage has LQIP) | Already implemented. Verify it works in all layout modes. |
| **Password-protected galleries** | Every competitor. Pixieset uses 4-digit PIN + password. ShootProof has password walls. | Low | YES (PasswordVerificationModal, PinVerificationModal, AccessCodeModal) | Already built. Needs branded entry page design upgrade. |
| **Client favorites/heart system** | Universal. Clients mark favorites, photographer sees selections. Pixieset, ShootProof, Pic-Time all have this. | Low | YES (proofing actions: favorite/select in proofing_service.py) | Already built with real-time WebSocket sync. |
| **Single photo + full gallery download** | Every platform. Pixieset offers gallery download + single photo download with size options. | Med | Partial (SinglePhotoDownloadModal, DownloadSettings exist) | Need batch/zip download with progress indicator. Backend zip generation needed. |
| **Download PIN protection** | Pixieset auto-generates 4-digit PINs. Standard for controlling who downloads originals. | Low | YES (PinSettings, PinVerificationModal) | Already implemented. |
| **Watermark on web-view images** | Pixieset, ShootProof, SmugMug all offer watermarks. Protects images before purchase/download approval. | Low | YES (WatermarkOverlay, WatermarkSettings) | Already built. Verify watermark removal on authorized downloads. |
| **Gallery branding** (logo, colors, fonts) | Every competitor. Photographer's brand, not platform brand. Pixieset, ShootProof have per-gallery branding. | Low | YES (BrandingSettings, VisualIdentitySettings, GradientEditor) | Already extensive. Design Studio covers this. |
| **Responsive mobile-first design** | Non-negotiable. CloudSpot specifically markets "mobile-friendly galleries." | Med | Partial (layouts exist but need mobile polish) | Audit all gallery views on mobile breakpoints. |
| **Social sharing** (copy link, native share) | Basic sharing is expected. Every platform has share buttons. | Low | YES (ShareMenu, ShareDialog) | Already built. Need OG meta tags for rich previews. |
| **Gallery expiration dates** | Pixieset, ShootProof offer auto-expiry with reminder emails. Standard for event photography. | Med | Unclear | Need backend support for expiry dates + automated reminder emails via Postal. |
| **Sub-galleries / folders** | Pixieset has collections with sets. ShootProof has albums within galleries. Organizing large events. | Low | YES (SubGalleryTree, SubGallerySelector, nested hierarchy up to 3 levels) | Already built with proper nesting. |
| **Open Graph / social preview meta tags** | When clients share gallery links on social media, rich previews are expected. | Low | Partial (Helmet in PublicGalleryPage) | Need proper OG image, title, description from gallery cover + metadata. |

## Differentiators

Features that set a gallery platform apart. Not universally expected, but valued by photographers who encounter them.

| Feature | Value Proposition | Complexity | Existing in RawDrive | Notes |
|---------|-------------------|------------|---------------------|-------|
| **Cinematic slideshow / presentation mode** | Pic-Time has autoplay with background music. Pixieset has slideshow with speed/loop controls. Creates emotional "reveal" moment. | Med | YES (CinematicViewer, LightboxSlideshow, PresentationModeSelector) | Already built with transitions. Strong differentiator -- polish and add music library. |
| **Background music / audio on galleries** | Pic-Time offers licensed music library for gallery slideshows. Emotional impact for wedding delivery. | High | Partial (audio config exists in SlideshowConfig) | Audio infrastructure exists. Need music library or upload capability. Licensing is complex. |
| **AI-powered face search ("Find Me")** | TurtlePic uses QR + selfie. Pic-Time has AI search. Guests find their own photos at events. | Med | YES (FaceDiscovery, FindMeSettings, FaceSearchRequest, ClientPeopleFilter) | Already built with CLIP embeddings. Major differentiator vs most competitors. |
| **Client selections workflow** (approve/reject for albums) | ShootProof has favorites + labels. Advanced proofing with approve/reject status per image. | Med | Partial (proofing has favorite/select, but not full approve/reject workflow) | Need status labels: approved, rejected, maybe. Batch operations. |
| **Guestbook / visitor comments** | CloudSpot and some platforms allow gallery-level comments. Creates community feel for weddings. | Low | YES (Guestbook component, ProofingCommentRequest) | Already built. Ensure it works well on public galleries. |
| **Image comparison mode** | Side-by-side comparison for retouching proofing. Useful for portrait/headshot photographers. | Low | YES (LightboxCompare) | Already built in lightbox. Rare among competitors. |
| **Dark/light mode toggle on galleries** | Zenfolio and SmugMug offer theme options. Photographer chooses per gallery. | Low | Partial (theme infrastructure exists) | Add explicit dark/light/auto toggle on public gallery. Map to CSS custom properties. |
| **Gallery activity tracking / analytics** | Pixieset shows views, downloads, favorites. Photographer sees client engagement. | Med | Partial (ActivityTrackingConfig exists, GalleryAnalyticsPage exists) | Backend tracking exists. Need to surface analytics properly. |
| **Embed codes for websites** | SmugMug and Zenfolio offer iframe/JS embed. Photographers embed galleries on their own sites. | Low | No | Simple iframe embed with responsive wrapper. Low effort, high value for SEO-focused photographers. |
| **QR code sharing** | Zenfolio recently added QR gallery sharing. Event photographers print QR codes at venues. | Low | No | Generate QR from gallery magic link. Simple library integration (qrcode.react). |
| **Filmstrip navigation in lightbox** | Pixieset and Pic-Time show thumbnail strip below main image for quick jumping. | Low | YES (LightboxFilmstrip) | Already built. Ensure it virtualizes for large galleries. |
| **EXIF data display** | SmugMug shows camera/lens/settings. Valued by photography enthusiasts and for educational content. | Low | YES (LightboxMetadata) | Already built. Toggle on/off per gallery preference. |
| **Slideshow with multiple transitions** | Fade, ken burns, slide, dissolve. Cinematic feel. | Low | YES (CinematicViewer supports transitions) | Already built. Add more transition options (ken burns, zoom, parallax). |
| **Download size options** | Pixieset offers web-sized (640/1024/2048px) and original. Clients choose quality. | Med | Partial (download policies exist: view_only, web_only, watermarked_only, original_allowed) | Backend resize pipeline needed for on-demand size variants. |
| **Batch download with progress** | Zip generation with real-time progress bar. Pixieset shows download progress. | Med | Partial (BULK_DOWNLOAD_DELAY_MS constant exists) | Need server-side zip streaming or pre-generation with WebSocket progress. |
| **Gallery cover video/GIF** | Pixieset allows photo, GIF, or video as gallery cover. Dynamic first impression. | Med | Partial (cover templates exist in Design Studio) | Extend cover system to support video/animated covers. |

## Anti-Features

Features to explicitly NOT build. Either poor ROI, scope creep, or actively harmful to the product.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Integrated print store / e-commerce** | Massive scope. Pixieset, Pic-Time, ShootProof have dedicated fulfillment partnerships (WHCC, Loxley). Building this is a separate product. | Provide "order prints" CTA that links to photographer's preferred print lab or external store URL. |
| **Built-in music licensing library** | Legal complexity, ongoing licensing costs, DMCA risk. Pic-Time has this but it is a major operational burden. | Allow photographers to upload their own licensed audio files. Support popular royalty-free sources via links. |
| **Mobile native app per gallery** | CloudSpot offers per-client mobile apps. Enormous maintenance burden for marginal value. PWA covers this. | Optimize PWA experience. Add "Add to Home Screen" prompt on mobile gallery pages. |
| **Augmented reality preview** | CloudSpot offers AR for wall art. Niche, complex, requires 3D rendering pipeline. | Skip entirely. Not expected by photography clients. |
| **Video upload/processing** | Storage costs, transcoding pipeline, CDN bandwidth. Pixieset limits to Pro/Ultimate plans for good reason. | Defer to v2+. Allow video embed links (YouTube/Vimeo) in gallery descriptions. |
| **Real-time collaborative commenting** (Google Docs-style) | Over-engineering. Photographers review comments asynchronously, not in real-time collaborative sessions. | Keep existing comment system. WebSocket notifications for new comments are sufficient. |
| **Custom CSS per gallery** | Support burden. Broken galleries, inconsistent experience, debugging nightmare. | Provide enough theme customization (colors, fonts, spacing) that custom CSS is unnecessary. |
| **AI auto-curation of gallery order** | Risky. Photographers are artists -- they want control over image ordering. AI suggestions feel presumptuous. | Keep AI for face search and duplicate detection. Let photographers manually curate order with drag-and-drop. |
| **Client login/account system** | Pixieset requires email to access galleries. Creates friction for clients. Magic links are better UX. | Keep magic link + optional password/PIN approach. No client accounts needed. |

## Feature Dependencies

```
Gallery Layouts (masonry/grid/justified)
  --> Lightbox (click any photo to open)
    --> Filmstrip navigation
    --> Slideshow / cinematic mode
    --> Zoom / pan / touch gestures
    --> EXIF display
    --> Image comparison

Password/PIN protection (existing)
  --> Branded entry page (design upgrade)
  --> Download PIN verification (existing)

Client favorites system (existing)
  --> Client selections workflow (approve/reject)
  --> Download favorites as zip
  --> Selection quotas ("pick your top 50")

Gallery branding (existing)
  --> Dark/light mode toggle
  --> Custom fonts
  --> Cover video/GIF support

Download system
  --> Download size options (requires image resize pipeline)
  --> Batch zip download (requires server-side zip generation)
  --> Download progress indicator (requires WebSocket or SSE)

Social sharing (existing)
  --> OG meta tags (requires SSR or prerender for crawlers)
  --> QR code generation
  --> Embed codes

Face search / Find Me (existing)
  --> Guest self-service photo finding
  --> QR code at event --> selfie --> find my photos

Gallery expiration
  --> Reminder emails (depends on Postal infrastructure, already available)
  --> Expired gallery landing page
  --> Grace period / extension workflow
```

## MVP Recommendation

### Phase 1: Gallery Player Polish (highest impact, builds on existing)

Prioritize these because RawDrive already has the foundations -- this is polish, not greenfield:

1. **Justified/row layout** -- Add third layout option alongside existing masonry and grid
2. **Touch gesture upgrade** -- Proper pinch-zoom and swipe with momentum in lightbox
3. **Branded password entry page** -- Replace modal with full-page branded experience
4. **OG meta tags** -- Proper social previews when sharing gallery links
5. **Mobile responsiveness audit** -- Ensure all gallery views are polished on phone screens

### Phase 2: Download & Delivery (core workflow completion)

6. **Batch zip download with progress** -- Server-side zip generation, WebSocket progress
7. **Download size options** -- Offer web-sized variants alongside originals
8. **Gallery expiration** -- Date-based auto-expiry with Postal reminder emails
9. **Selection quotas** -- "Pick your top N" workflow for album proofing

### Phase 3: Differentiators (competitive edge)

10. **QR code sharing** -- Simple, high-value for event photographers
11. **Embed codes** -- iframe/JS snippet for photographer websites
12. **Dark/light mode gallery toggle** -- Per-gallery theme preference
13. **Cinematic slideshow polish** -- More transitions, photographer audio upload
14. **Gallery activity dashboard** -- Surface view/download/favorite analytics

### Defer Entirely

- Print store / e-commerce
- Video processing
- Mobile native apps
- AR features
- Music licensing library

## Complexity Budget

| Complexity | Count | Features |
|------------|-------|----------|
| Low | 9 | Justified layout, OG tags, QR codes, embed codes, dark/light toggle, branded entry page, selection quotas UI, EXIF toggle, more transitions |
| Medium | 5 | Touch gestures, batch zip download, download size options, gallery expiration + emails, activity dashboard |
| High | 1 | Background music upload (audio processing, storage, playback sync) |

**Total estimated effort:** ~15 features across 3 phases, heavily leveraging existing infrastructure.

## Sources

- [Pixieset Client Gallery Features](https://pixieset.com/client-gallery/) -- HIGH confidence
- [Pixieset 15+ Hidden Features](https://blog.pixieset.com/blog/pixieset-client-gallery-features/) -- HIGH confidence
- [Pixieset Download Settings](https://help.pixieset.com/hc/en-us/articles/115003795572-Collection-Download-Settings) -- HIGH confidence
- [Pixieset Slideshow Controls](https://help.pixieset.com/hc/en-us/articles/9731769811469-Controlling-Slideshows-in-Client-Gallery) -- HIGH confidence
- [Pic-Time Gallery Platform](https://www.pic-time.com) -- MEDIUM confidence
- [Pic-Time Autoplay Music](https://help.pic-time.com/en/articles/7914654-how-do-i-add-gallery-autoplay-music) -- HIGH confidence
- [ShootProof Feature Index](https://www.shootproof.com/feature-index/) -- MEDIUM confidence
- [ShootProof Gallery Customization Updates](https://www.shootproof.com/blog/gallery-customization-updates/) -- MEDIUM confidence
- [Zenfolio vs SmugMug Comparison](https://zenfolio.com/compare/zenfolio-vs-smugmug/) -- MEDIUM confidence
- [CloudSpot Client Galleries](https://cloudspot.io/client-galleries) -- MEDIUM confidence
- [CloudSpot Mobile-Friendly Galleries](https://blog.cloudspot.io/posts/mobile-image-and-photo-gallery-sharing-platform) -- MEDIUM confidence
- [7 Best Photography Client Gallery Platforms 2026](https://fast.io/resources/photography-client-gallery/) -- MEDIUM confidence
- [Best Client Gallery for Photographers 2026](https://imagen-ai.com/valuable-tips/best-client-gallery-for-photographers/) -- MEDIUM confidence
- [16 Best Online Proofing Galleries 2026](https://aftershoot.com/blog/best-online-proofing-galleries/) -- MEDIUM confidence
- [TurtlePic AI Gallery Platform](https://turtlepic.com/blog/best-client-gallery-platforms-for-photographers/) -- MEDIUM confidence
- [Client Proofing Gallery Integration 2025](https://onewebcare.com/blog/client-proofing-gallery-integration/) -- MEDIUM confidence
- [Gallery Layout Best Practices 2025](https://onewebcare.com/blog/gallery-layout-best-practices/) -- LOW confidence
