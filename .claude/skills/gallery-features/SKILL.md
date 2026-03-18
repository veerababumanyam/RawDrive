---
name: gallery-features
description: "Gallery management features for RawDrive: Design Studio, cover templates, branding, magic links, public galleries, exports, proofing, and the gallery-service microservice. Use this skill when building gallery UI components, working with gallery design templates, implementing cover styles, managing gallery sharing/magic links, handling gallery exports (ZIP/PDF/slideshow), or working with the gallery-service (port 8004). Also use for gallery branding, password protection, download settings, face discovery in galleries, or client interaction features. Triggers on: gallery, Design Studio, cover template, magic link, public gallery, gallery share, gallery export, gallery branding, proofing, gallery-service, album."
---

# Gallery Features

Galleries are RawDrive's core product — the client viewing experience must be flawless. The gallery-service (port 8004) handles high-performance viewing with 50K concurrent magic link support.

## Gallery Service Architecture

```
services/gallery-service/src/
├── api/v1/          # Gallery CRUD, magic links, proofing endpoints
├── cache/           # 3-tier Redis caching (hot/warm/cold)
├── services/        # Business logic
├── schemas/         # Pydantic models
├── middleware/      # Rate limiting, correlation IDs
├── observability/   # Health checks, Prometheus metrics
├── resilience/      # Circuit breakers, retries
└── main.py          # FastAPI with lifespan management
```

## Frontend Gallery Components

Located in `frontend/src/components/features/gallery/`:

| Component Area | Key Components |
|---------------|----------------|
| **Design Studio** | `ColorStopEditor`, `DirectionSlider`, `CustomLinksEditor` |
| **Cover Templates** | `covers/` — CoverStyleGrid with 28+ SVG previews |
| **Client Features** | `ClientPeopleFilter`, `ClientInteractionSettings`, `ClientActivityBadge` |
| **Downloads** | `DownloadSettings`, `DownloadFavoritesButton`, `DownloadQuotaIndicator` |
| **Social** | `CommentSection`, `FaceDiscovery`, `FaceGroupMergeModal` |
| **Analytics** | `FavoritesAnalyticsDashboard`, `GalleryStats` |

## Gallery Design Templates

System templates + workspace-specific custom templates:

```python
# Backend: gallery_design_templates.py
@router.post("/galleries/{gallery_id}/design-templates")
async def create_template(gallery_id: UUID, data: TemplateCreate, ...):
    # Save design as reusable template
    # Categories, tags, search filtering
    # Thumbnail generation for preview

@router.post("/galleries/{gallery_id}/apply-template/{template_id}")
async def apply_template(gallery_id: UUID, template_id: UUID, ...):
    # Merge template design with current gallery settings
```

## Magic Links & Public Sharing

```python
# Gallery sharing flow:
# 1. Photographer creates share link with download policy
# 2. Client accesses via magic link (no account needed)
# 3. Gallery-service serves with 3-tier caching

# Download policies per share link:
# view_only       → No downloads
# web_only        → Max 2048px resolution
# watermarked_only → Download with watermark
# original_allowed → Full resolution originals
```

## Gallery Branding

Photographers can customize their gallery appearance:
- Logo, colors, fonts
- Cover photo/style (28+ premium cover styles)
- Custom links and social media
- Light/dark theme support
- Gradient backgrounds (ColorStopEditor)

## Gallery Exports

```python
# Export formats
# ZIP  — Bulk download selected/all assets
# PDF  — Photo book layout
# Slideshow — Animated presentation

@router.post("/galleries/{gallery_id}/exports")
async def create_export(gallery_id: UUID, data: ExportRequest, ...):
    # Validate download policy
    # Queue export job (async — large galleries can take minutes)
    # Notify client when ready
```

## Performance Patterns

The gallery-service is optimized for 50K concurrent viewers:

1. **3-tier caching:** Hot (frequently accessed) → Warm → Cold
2. **LQIP:** Low-quality image placeholders for instant perceived load
3. **KEDA autoscaling:** Scale pods based on concurrent connections
4. **Read replicas:** PostgreSQL read replicas for gallery queries
5. **CDN prefetching:** Preload next images in lightbox view

## Album Proofing

Clients can select, comment on, and approve photos:
- Selection sync between photographer and client
- Comment threads on individual photos
- Approval workflow with version history
- Collaboration context for real-time updates

**Deep dive:** Read `.claude/reference/microservices-patterns.md` (gallery-service as reference implementation)
