# Research: Digital Invitations Enhancement

**Feature Branch**: `017-digital-wedding-invitations`
**Date**: 2026-01-01
**Status**: Complete

## Executive Summary

This feature **extends the existing digital invitations system** (feature 016-save-the-date) rather than building from scratch. The platform supports **all event types** (weddings, birthdays, anniversaries, corporate events, baby showers, etc.) - not limited to weddings. The user-provided spec focused on wedding use cases as the primary market, but the implementation is generic.

The existing implementation provides a solid foundation covering ~60% of the spec requirements. This research identifies gaps, integration patterns, and technical decisions for the remaining 40%.

---

## Existing Implementation Analysis

### Already Implemented (via 016-save-the-date)

| Component | Status | Location |
|-----------|--------|----------|
| Core invitation CRUD | Complete | `digital_invitation_service.py` |
| Template system | Complete | `invitation_template_service.py` |
| RSVP collection | Complete | `invitation_rsvp_service.py` |
| Guest management | Complete | `invitation_guests` table |
| Check-in/QR codes | Complete | `invitation_checkins`, QR service |
| Image uploads | Complete | `invitation_image_service.py` |
| Password/PIN protection | Complete | argon2 hashed |
| Share links (magic links) | Complete | `magic_links` integration |
| Multi-tenancy | Complete | workspace_id scoping |
| Analytics (views, RSVPs) | Partial | `view_count`, `rsvp_count` denormalized |
| Autosave/drafts | Complete | `invitation_draft_service.py` |

### Gaps to Implement

| Feature | Priority | Complexity | Notes |
|---------|----------|------------|-------|
| Video support | P1 | Medium | New media type + transcoding |
| Audio support | P2 | Medium | New media type + controls |
| AI text generation | P2 | Low | Integrate with existing Gemini |
| AI background generation | P3 | Medium | New provider integration |
| Live device preview | P1 | Medium | Frontend-only |
| 30+ gradient templates | P1 | Low | Design asset creation |
| PDF export | P3 | Medium | Server-side rendering |
| MP4 export | P3 | High | Animation capture |
| Enhanced analytics | P3 | Low | Device/geo breakdown |
| Font library (20+) | P1 | Low | Asset bundling |
| Custom font upload | P2 | Low | Storage + validation |
| Multi-event support | P2 | Medium | Schema extension |
| Countdown timer | P2 | Low | Frontend component |

---

## Technical Decisions

### Decision 1: Video Transcoding Approach

**Decision**: Use FFmpeg via BullMQ background jobs

**Rationale**:
- FFmpeg is proven, handles all input formats
- BullMQ already in use for asset processing jobs
- Produces web-optimized MP4 (H.264) + WebM (VP9) variants
- Fits existing worker architecture

**Alternatives Rejected**:
- Cloud transcoding (Mux, Cloudflare Stream): Higher cost, external dependency
- Client-side transcoding: Unreliable, browser limitations

**Implementation**:
```python
# New job type in workers
async def transcode_invitation_video(job: Job):
    # 1. Download from R2
    # 2. FFmpeg transcode: 720p H.264 + 720p VP9
    # 3. Generate thumbnail at 0s
    # 4. Upload variants to R2
    # 5. Update invitation_media record
```

### Decision 2: AI Text Generation Integration

**Decision**: Extend existing user_gemini_settings pattern

**Rationale**:
- Users already configure Gemini API keys in profile settings
- Reuse existing `gemini_models` table and validation
- Consistent UX with other AI features (smart tagging)

**Implementation**:
```python
# New endpoint
POST /v1/workspaces/{workspace_id}/invitations/{id}/ai/generate-text
{
  "field": "headline|bio|rsvp_text|custom",
  "prompt": "romantic beach wedding in Mumbai",
  "language": "en-IN"
}

# Response
{
  "options": [
    {"text": "...", "confidence": 0.92},
    {"text": "...", "confidence": 0.88},
    ...
  ]
}
```

### Decision 3: AI Background Generation (Imagen/Nano Banana)

**Decision**: Create new `image_generation_settings` table, separate from Gemini

**Rationale**:
- Different API keys/providers (Imagen vs Gemini LLM)
- May support multiple providers (Imagen, DALL-E, Midjourney)
- Separate rate limits and billing tracking

**Implementation**:
```sql
CREATE TABLE image_generation_settings (
  setting_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users,
  provider VARCHAR(50) NOT NULL, -- 'imagen', 'nano_banana', 'dalle'
  api_key_encrypted TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Decision 4: Multi-Event Support

**Decision**: Create `invitation_sub_events` table (one-to-many with invitations)

**Rationale**:
- Current schema supports single event_datetime
- Multi-day Indian weddings need 3-5 events with individual details
- Separate RSVP per event is optional enhancement

**Schema Extension**:
```sql
CREATE TABLE invitation_sub_events (
  sub_event_id UUID PRIMARY KEY,
  invitation_id UUID NOT NULL REFERENCES digital_invitations,
  workspace_id UUID NOT NULL REFERENCES workspaces,
  name VARCHAR(200) NOT NULL,
  event_datetime TIMESTAMPTZ NOT NULL,
  event_end_datetime TIMESTAMPTZ,
  venue_name VARCHAR(300),
  venue_address TEXT,
  venue_map_url TEXT,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  enable_individual_rsvp BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Decision 5: PDF Export

**Decision**: Use Puppeteer/Playwright for server-side rendering

**Rationale**:
- Invitation is already a responsive HTML page
- Puppeteer can screenshot at 300 DPI for print quality
- Handles custom fonts, gradients, images correctly

**Implementation**:
```python
# New background job
async def export_invitation_pdf(job: Job):
    # 1. Load invitation public URL in headless browser
    # 2. Set viewport to A4 @ 300 DPI
    # 3. Print to PDF
    # 4. Upload to R2 with 24h expiry
    # 5. Return presigned download URL
```

### Decision 6: MP4 Export (Animated)

**Decision**: Use Remotion or Lottie-based animation export

**Rationale**:
- Static screenshot won't capture animations
- Remotion can render React components to video
- 10-30 second invitation video is common for social sharing

**Alternatives Rejected**:
- Screen recording: Quality issues, unreliable timing
- GIF export: Large file size, limited colors

**Implementation (Phase 2 - deferred)**:
- Create dedicated animation layer in invitation templates
- Render with Remotion in background job
- Generate 1080x1920 (Story) and 1200x630 (Feed) variants

### Decision 7: Device Preview (Frontend)

**Decision**: CSS-based viewport simulation with iframe

**Rationale**:
- Real responsive CSS already works
- iframe with controlled width/height simulates device accurately
- No backend changes needed

**Implementation**:
```typescript
// InvitationPreview component
const viewports = {
  phone: { width: 375, height: 667, scale: 0.5 },
  tablet: { width: 768, height: 1024, scale: 0.4 },
  desktop: { width: 1280, height: 800, scale: 0.3 }
};

<iframe
  src={previewUrl}
  style={{
    width: viewports[device].width,
    height: viewports[device].height,
    transform: `scale(${viewports[device].scale})`
  }}
/>
```

### Decision 8: Font Library

**Decision**: Bundle 20 Google Fonts + support WOFF2 uploads

**Rationale**:
- Google Fonts are free, widely supported
- WOFF2 is optimal format for web
- Store custom fonts in R2 with workspace prefix

**Bundled Fonts** (curated for diverse events):

**Elegant/Formal** (weddings, anniversaries, galas):
1. Playfair Display (elegant serif)
2. Great Vibes (script)
3. Cormorant Garamond (classic serif)
4. Cinzel (display serif)
5. Pinyon Script (elegant script)

**Modern/Corporate** (business events, conferences):
6. Poppins (geometric sans)
7. Montserrat (versatile sans)
8. Raleway (modern sans)
9. Inter (professional sans)
10. Source Sans Pro (clean sans)

**Casual/Fun** (birthdays, baby showers, festivals):
11. Dancing Script (casual script)
12. Sacramento (handwritten)
13. Amatic SC (hand-drawn)
14. Satisfy (informal script)
15. Pacifico (friendly script)

**Versatile** (all event types):
16. Lora (book serif)
17. Merriweather (readable serif)
18. Libre Baskerville (editorial serif)
19. Josefin Sans (vintage sans)
20. Roboto Slab (modern slab)

---

## Integration Points

### With Existing Systems

| System | Integration | Notes |
|--------|-------------|-------|
| Gallery assets | `asset_id` reference | Allow selecting photos from galleries |
| User settings | `user_gemini_settings` | Reuse for AI text generation |
| Storage (R2) | Existing StorageService | Video/audio stored same as images |
| Background jobs | BullMQ workers | Video transcoding, PDF export |
| Notifications | Existing email/WhatsApp | RSVP confirmations |
| Analytics | Extend `invitation_events` | Device/geo tracking |

### New External Services

| Service | Purpose | Required Config |
|---------|---------|-----------------|
| Imagen API | AI background generation | `IMAGEN_API_KEY` per user |
| FFmpeg | Video transcoding | Bundled in worker container |
| Puppeteer | PDF export | Bundled in worker container |

---

## Performance Considerations

### Video Processing

- **Max size**: 100MB upload, transcode to ~20MB output
- **Transcoding time**: ~2-5 minutes for 90s video
- **Concurrency**: Limit to 2 concurrent transcoding jobs per worker

### AI Generation

- **Timeout**: 15 seconds for text, 60 seconds for images
- **Caching**: Cache prompts by hash for 24 hours
- **Fallback**: Graceful degradation to manual entry

### PDF Export

- **Max wait**: 30 seconds for render
- **Cache**: Store generated PDFs for 24 hours
- **Size**: Typical A4 PDF is 2-5MB

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Video transcoding overload | Medium | High | Queue limits, worker scaling |
| AI API rate limits | Low | Medium | User-level throttling, caching |
| Large template bundle | Medium | Low | Lazy load, CDN caching |
| Font rendering issues | Low | Medium | Test across browsers, fallbacks |
| Export timeouts | Medium | Medium | Retry logic, progress indicators |

---

## Recommended Implementation Order

### Phase 1: Core Enhancements (P1 stories)
1. Extend templates to 30+ with gradient configs
2. Add video media type + transcoding worker
3. Implement device preview component
4. Bundle font library

### Phase 2: AI & RSVP (P2 stories)
5. AI text generation endpoint
6. Multi-event schema + UI
7. Enhanced RSVP questions
8. Audio media support

### Phase 3: Advanced Features (P3 stories)
9. AI background generation
10. PDF export
11. Enhanced analytics (device/geo)
12. Social sharing cards
13. MP4 export (stretch goal)

---

## References

- Existing spec: `docs/TechnicalSpecs/digital_invitations.json`
- Migration files: `backend/migrations/versions/0059-0066`
- Frontend types: `frontend/src/types/invitations.ts`
- Services: `backend/src/app/services/invitation_*.py`
