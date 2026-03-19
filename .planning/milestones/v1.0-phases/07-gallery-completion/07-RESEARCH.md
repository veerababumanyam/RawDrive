# Phase 7: Gallery Completion - Research

**Researched:** 2026-03-18
**Domain:** Gallery slideshow, delivery emails, branding integration
**Confidence:** HIGH

## Summary

Phase 7 completes the gallery delivery workflow by connecting three already-scaffolded systems: the CinematicViewer slideshow component (frontend), the gallery delivery email (backend EmailService), and the gallery branding settings (gallery-service). The critical insight is that **most of the infrastructure already exists** -- the CinematicViewer component is fully implemented with Ken Burns, transitions, thumbnails, and settings; the EmailService has a complete `send_gallery_delivery_email` method; and SlideshowConfig/branding schemas exist in both frontend and backend. The work is primarily integration and wiring rather than greenfield development.

The main gaps are: (1) the slideshow does not yet read `slideshow_config` from gallery branding to apply photographer-configured defaults (interval, transition, captions, loop, autoplay), (2) the publish gallery endpoint does not trigger delivery emails, and (3) audio/music preference fields in SlideshowConfig exist in the frontend type but are not yet stored/served from the backend schema.

**Primary recommendation:** Wire existing components together -- extend publish_gallery to trigger delivery emails via magic link creation, pass slideshow_config branding through CinematicViewer props, and add music_preference fields to the backend SlideshowConfig schema.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None -- all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion. Specific targets:
- GAL-01: Slideshow generation for client-viewable gallery playback
- GAL-02: Gallery delivery emails sent to clients with magic link when gallery is ready
- GAL-03: Slideshow respects gallery branding settings (colors, logo, music preference)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GAL-01 | Slideshow generation for client-viewable gallery playback | CinematicViewer component exists with full slideshow functionality. Needs integration with slideshow_config from gallery settings to apply photographer defaults. |
| GAL-02 | Gallery delivery emails sent to clients when gallery is ready (includes magic link) | EmailService.send_gallery_delivery_email() exists. publish_gallery endpoint needs to trigger email + magic link creation when gallery has client_id with email. |
| GAL-03 | Slideshow respects gallery branding settings (colors, logo, music preference) | Branding already passes to CinematicViewer (name, logoUrl, primaryColor). SlideshowConfig backend schema needs music fields. Frontend must apply slideshow_config as default CinematicViewerSettings. |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | ^18 | Frontend UI | Project standard |
| framer-motion | ^11.0.0 | Slideshow transitions, animations | Already used by CinematicViewer |
| FastAPI | existing | Backend API | Project standard |
| Pydantic | existing | Schema validation | Project standard |
| asyncpg | existing | Database access | Gallery-service uses raw asyncpg |

### Supporting (Already in Project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | ^0.294.0 | Icons | Already used in CinematicViewer |
| react-router-dom | ^6.21.0 | Routing | Public gallery route already exists |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CinematicViewer (existing) | New slideshow component | Existing is feature-complete; no need to rebuild |
| Backend email trigger on publish | Frontend-triggered email | Backend is more reliable; prevents email without publish |

**Installation:** No new packages needed -- all dependencies already installed.

## Architecture Patterns

### Existing Code Architecture

The gallery delivery flow spans three layers:

```
services/gallery-service/
├── src/
│   ├── api/v1/
│   │   ├── galleries.py          # publish_gallery endpoint (MODIFY)
│   │   └── public/galleries.py   # Public gallery view (EXISTS)
│   ├── schemas/
│   │   ├── common.py             # SlideshowConfig (MODIFY - add music fields)
│   │   └── gallery.py            # GalleryResponse with slideshow_config (EXISTS)
│   └── services/
│       ├── gallery_service.py    # publish_gallery method (MODIFY)
│       └── magic_link_service.py # Magic link creation (EXISTS)
│
backend/src/app/services/
│   └── email_service.py          # send_gallery_delivery_email (EXISTS)
│
frontend/src/
├── pages/public/
│   └── PublicGalleryPage.tsx     # Client gallery view (MODIFY)
├── components/features/gallery/
│   └── presentation/
│       └── CinematicViewer.tsx   # Full slideshow component (MODIFY for branding defaults)
└── types/
    └── gallery.ts               # SlideshowConfig type (EXISTS with audio fields)
```

### Pattern 1: Gallery Delivery Flow (New Wiring)
**What:** When photographer publishes gallery, system auto-creates magic link and sends delivery email to client
**When to use:** Gallery has associated client with email address
**Example:**
```python
# In gallery_service.py publish_gallery method:
# 1. Publish gallery (existing)
# 2. Create magic link for client
# 3. Send delivery email via HTTP call to backend EmailService
# OR: gallery-service has its own PostalClient (Phase 5-02 pattern)
```

### Pattern 2: Branding-Aware Slideshow (Prop Mapping)
**What:** Map gallery's slideshow_config to CinematicViewerSettings defaults
**When to use:** When opening CinematicViewer from public gallery
**Example:**
```typescript
// Map SlideshowConfig to CinematicViewerSettings
const slideshowSettings: Partial<CinematicViewerSettings> = {
  interval: (gallery.slideshow_config?.interval_seconds ?? 5) * 1000,
  loop: gallery.slideshow_config?.loop ?? true,
  transition: mapTransition(gallery.slideshow_config?.transition ?? 'fade'),
  audio: {
    enabled: gallery.slideshow_config?.audio_enabled ?? false,
    volume: gallery.slideshow_config?.audio_volume ?? 0.7,
    muted: false,
  },
};
```

### Pattern 3: Cross-Service Email (Standalone PostalClient)
**What:** Gallery-service sends emails via its own PostalClient copy (not importing from backend)
**When to use:** Microservices cannot import from backend container
**Prior art:** Phase 05-02 decision: "Standalone PostalClient copy per microservice since containers cannot import from backend"

### Anti-Patterns to Avoid
- **Frontend-triggered emails:** Never let the client trigger delivery emails; always server-side on publish action
- **Hardcoded branding:** Never hardcode colors/fonts in slideshow; always read from gallery.slideshow_config and branding
- **Missing workspace_id:** Every gallery query MUST filter by workspace_id (multi-tenant rule)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Slideshow component | New slideshow from scratch | CinematicViewer (exists) | 600+ lines already implemented with Ken Burns, transitions, thumbnails, settings panel |
| Email delivery | Custom email sending | EmailService.send_gallery_delivery_email() | Already handles HTML templates, XSS escaping, provider fallback |
| Magic link generation | Custom token system | MagicLinkService.create_magic_link() | Handles token hashing, expiration, access counting, caching |
| Slide transitions | Custom CSS animations | framer-motion AnimatePresence | Already integrated in CinematicViewer with fade/slide/zoom/reveal/kenburns |

**Key insight:** This phase is 80% wiring and 20% new code. The components exist -- they just need to be connected.

## Common Pitfalls

### Pitfall 1: Email Sending from Wrong Service
**What goes wrong:** Trying to import backend EmailService from gallery-service container
**Why it happens:** Microservices run in separate Docker containers; cannot share Python imports
**How to avoid:** Use standalone PostalClient pattern from Phase 05-02, or make HTTP call to backend API
**Warning signs:** ImportError, module not found errors in gallery-service container

### Pitfall 2: SlideshowConfig Schema Mismatch
**What goes wrong:** Frontend SlideshowConfig has audio fields not in backend schema
**Why it happens:** Frontend types were expanded (audio_enabled, audio_url, audio_volume, etc.) but backend SlideshowConfig in common.py only has basic fields
**How to avoid:** Add audio/music fields to backend SlideshowConfig (common.py) and ensure the gallery DB column (JSONB) stores them
**Warning signs:** Audio settings silently lost on save/load cycle

### Pitfall 3: Missing Client Email on Publish
**What goes wrong:** Publish triggers but no email sent because client has no email
**Why it happens:** Gallery may not have client_id, or client may not have email
**How to avoid:** Make email delivery conditional -- only send when gallery.client_id exists AND client has email. Log skips gracefully.
**Warning signs:** Silent failure, no error but no email either

### Pitfall 4: Slideshow Autoplay Without User Interaction
**What goes wrong:** Browser blocks autoplay audio due to autoplay policy
**Why it happens:** Modern browsers require user gesture before audio playback
**How to avoid:** Start audio muted, show unmute button. Only autoplay video/audio after user interaction (clicking play).
**Warning signs:** Console warnings about autoplay policy, silent audio

## Code Examples

### Gallery Delivery Email Trigger (Backend Integration Pattern)
```python
# In gallery_service.py publish_gallery method
async def publish_gallery(self, workspace_id: UUID, gallery_id: UUID, publish: bool = True) -> dict:
    # ... existing publish logic ...

    if publish:
        # After successful publish, trigger delivery email
        await self._send_delivery_email_if_client(workspace_id, gallery_id)

    return await self.get_gallery(str(workspace_id), str(gallery_id))

async def _send_delivery_email_if_client(self, workspace_id: UUID, gallery_id: UUID):
    """Send delivery email to client if gallery has associated client with email."""
    async with get_connection() as conn:
        # Get gallery + client info
        row = await conn.fetchrow("""
            SELECT g.title, g.client_id, c.email, c.name,
                   g.cover_asset_id, u.display_name as photographer_name
            FROM galleries g
            LEFT JOIN clients c ON g.client_id = c.client_id
            LEFT JOIN users u ON g.created_by_user_id = u.user_id
            WHERE g.gallery_id = $1 AND g.workspace_id = $2
        """, gallery_id, workspace_id)

        if not row or not row["email"]:
            return  # No client email, skip

        # Create magic link
        magic_link = await magic_link_service.create_magic_link(
            workspace_id=str(workspace_id),
            gallery_id=str(gallery_id),
            created_by_user_id=str(row["created_by_user_id"]),
        )

        # Send email via PostalClient (standalone per-service pattern)
        await postal_client.send_gallery_delivery(
            to_email=row["email"],
            gallery_name=row["title"],
            photographer_name=row["photographer_name"],
            magic_link_url=magic_link["url"],
        )
```

### Slideshow Branding Integration (Frontend)
```typescript
// In PublicGalleryPage.tsx, pass slideshow_config to CinematicViewer
<CinematicViewer
    isOpen={showCinematicViewer}
    onClose={() => setShowCinematicViewer(false)}
    assets={canvasAssets}
    settings={{
        interval: (gallery.slideshow_config?.interval_seconds ?? 5) * 1000,
        loop: gallery.slideshow_config?.loop ?? true,
        transition: gallery.slideshow_config?.transition as CinematicTransition ?? 'fade',
        showProgress: true,
        showCounter: true,
        audio: {
            enabled: gallery.slideshow_config?.audio_enabled ?? false,
            volume: gallery.slideshow_config?.audio_volume ?? 0.7,
            muted: !gallery.slideshow_config?.audio_autoplay,
        },
    }}
    musicUrl={gallery.slideshow_config?.audio_url}
    galleryTitle={gallery.title}
    branding={{
        name: companyProfile?.name,
        logoUrl: companyProfile?.logo_url,
        primaryColor: gallery.primary_color,
    }}
/>
```

### Backend SlideshowConfig Schema Extension
```python
# In common.py - extend SlideshowConfig
class SlideshowConfig(BaseModel):
    """Slideshow configuration for galleries."""
    enabled: bool = Field(default=True)
    interval_seconds: Optional[int] = Field(default=5, ge=3, le=30)
    transition: Optional[str] = Field(default="fade")
    show_captions: Optional[bool] = Field(default=True)
    loop: Optional[bool] = Field(default=True)
    autoplay: Optional[bool] = Field(default=False)
    # Music preference (GAL-03)
    music_enabled: Optional[bool] = Field(default=False)
    music_url: Optional[str] = Field(default=None)
    music_volume: Optional[float] = Field(default=0.7, ge=0.0, le=1.0)
    music_autoplay: Optional[bool] = Field(default=False)
    music_loop: Optional[bool] = Field(default=True)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No slideshow | CinematicViewer component | Already built | Full slideshow with Ken Burns, transitions, thumbnails |
| No delivery email | EmailService.send_gallery_delivery_email | Phase 5 | HTML template with magic link, preview image, personal message |
| Basic gallery sharing | Magic link with PIN/password protection | Already built | Secure token-based access, rate-limited verification |

**Already complete:**
- CinematicViewer: Full-featured slideshow (fade, slide, zoom, kenburns, reveal transitions)
- EmailService: Gallery delivery email template with XSS protection
- MagicLinkService: Token generation, validation, access counting
- SlideshowConfig: Schema exists in both backend and frontend (frontend has more audio fields)
- Gallery branding: primary_color, gradient_config, font_family, company_profile all flow through

**Needs wiring:**
- publish_gallery does not trigger delivery email
- CinematicViewer does not read slideshow_config defaults from gallery
- Backend SlideshowConfig lacks music fields that frontend already types

## Open Questions

1. **Client Email Source**
   - What we know: Galleries have optional `client_id` linking to clients table
   - What's unclear: Whether clients table has email field reliably populated
   - Recommendation: Check clients table schema; fall back to gallery-level client_name if no email exists. Make delivery email optional.

2. **Music File Storage**
   - What we know: Frontend SlideshowConfig has audio_url field
   - What's unclear: Where music files are stored (R2? separate bucket?)
   - Recommendation: Store music files in same R2 bucket under `music/` prefix. Use signed URLs like other assets. Keep scope minimal -- URL field in config, upload handled separately if needed.

3. **Delivery Email Trigger Timing**
   - What we know: publish_gallery changes status to 'published'
   - What's unclear: Should email send on every publish (including re-publish after unpublish)?
   - Recommendation: Track `delivery_email_sent_at` on gallery. Only auto-send on first publish. Provide manual "resend delivery email" endpoint for re-sends.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (backend) / vitest (frontend) |
| Config file | services/gallery-service/tests/conftest.py, frontend/vitest.config.ts |
| Quick run command | `cd services/gallery-service && python -m pytest tests/unit/ -x` |
| Full suite command | `cd services/gallery-service && python -m pytest tests/ -x` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GAL-01 | Slideshow renders with gallery assets, respects play/pause, transitions work | unit | `cd frontend && pnpm test src/components/features/gallery/presentation/__tests__/CinematicViewer.test.tsx` | No - Wave 0 |
| GAL-02 | Publish gallery triggers delivery email when client has email | unit | `cd services/gallery-service && python -m pytest tests/unit/test_gallery_delivery.py -x` | No - Wave 0 |
| GAL-03 | SlideshowConfig branding applied as CinematicViewer defaults | unit | `cd frontend && pnpm test src/components/features/gallery/presentation/__tests__/CinematicViewer.test.tsx` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd services/gallery-service && python -m pytest tests/unit/ -x`
- **Per wave merge:** Full backend + frontend test suite
- **Phase gate:** Full suite green before /gsd:verify-work

### Wave 0 Gaps
- [ ] `services/gallery-service/tests/unit/test_gallery_delivery.py` -- covers GAL-02 (email trigger on publish)
- [ ] `frontend/src/components/features/gallery/presentation/__tests__/CinematicViewer.test.tsx` -- covers GAL-01, GAL-03 (slideshow + branding)

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: CinematicViewer.tsx (600+ lines, fully implemented)
- Direct codebase analysis: email_service.py send_gallery_delivery_email method
- Direct codebase analysis: gallery_service.py publish_gallery method
- Direct codebase analysis: SlideshowConfig in common.py and gallery.ts
- Direct codebase analysis: MagicLinkService create/validate methods

### Secondary (MEDIUM confidence)
- Phase 05-02 decision log: "Standalone PostalClient copy per microservice"
- Frontend SlideshowConfig type with audio fields (may not yet be wired to backend)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, no new deps needed
- Architecture: HIGH - existing patterns clearly established, mostly wiring work
- Pitfalls: HIGH - based on direct codebase analysis and prior phase decisions

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable -- internal codebase, no external API changes)
