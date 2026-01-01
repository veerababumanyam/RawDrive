# Quickstart: Digital Invitations Enhancement

**Feature Branch**: `017-digital-wedding-invitations`
**Date**: 2026-01-01
**Extends**: Feature 016-save-the-date

---

## Prerequisites

Before starting development, ensure you have:

1. **Development environment running**:
   ```bash
   npm run docker:dev:up      # PostgreSQL + Redis
   npm run dev:all            # Frontend + Backend
   ```

2. **Database migrations applied** (up to 0066):
   ```bash
   cd backend && npm run db:migrate
   ```

3. **Existing invitation system working**:
   - Templates visible at `/dashboard/invitations/templates`
   - Can create/edit invitations
   - RSVP flow functional

---

## New Migrations

Apply these migrations in order after branching:

```bash
cd backend
npm run db:migrate:create 0067_invitation_sub_events
npm run db:migrate:create 0068_invitation_media
npm run db:migrate:create 0069_image_generation_settings
npm run db:migrate:create 0070_invitation_ai_generations
npm run db:migrate:create 0071_invitation_view_analytics
npm run db:migrate:create 0072_invitation_schema_updates
npm run db:migrate
```

See `data-model.md` for complete SQL definitions.

---

## Key Files to Modify

### Backend (New Services)

| File | Purpose |
|------|---------|
| `src/services/invitation_sub_event_service.py` | Multi-event CRUD |
| `src/services/invitation_media_service.py` | Video/audio upload |
| `src/services/invitation_ai_service.py` | AI text/image generation |
| `src/services/invitation_export_service.py` | PDF/video export |
| `src/services/invitation_analytics_service.py` | Enhanced analytics |

### Backend (Modify Existing)

| File | Change |
|------|--------|
| `src/services/digital_invitation_service.py` | Add sub-events relation |
| `src/api/v1/digital_invitations.py` | New endpoints |
| `src/workers/` | Add video transcoding job |

### Frontend (New Components)

| File | Purpose |
|------|---------|
| `src/components/invitations/SubEventEditor.tsx` | Multi-event UI |
| `src/components/invitations/MediaUploader.tsx` | Video/audio upload |
| `src/components/invitations/DevicePreview.tsx` | Live preview |
| `src/components/invitations/AITextGenerator.tsx` | AI content |
| `src/components/invitations/AnalyticsDashboard.tsx` | Analytics view |

### Frontend (Modify Existing)

| File | Change |
|------|--------|
| `src/types/invitations.ts` | Add new interfaces |
| `src/services/invitationService.ts` | Add API methods |
| `src/pages/InvitationEditor.tsx` | Integrate new features |

---

## Environment Variables

Add to `.env`:

```bash
# Video Processing (worker containers)
FFMPEG_PATH=/usr/bin/ffmpeg

# PDF Export
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# AI Generation (optional - user provides their own keys)
# These are NOT needed in backend - users configure in profile
```

---

## API Endpoints (New)

### Sub-Events
```
POST   /v1/workspaces/{id}/invitations/{id}/sub-events
GET    /v1/workspaces/{id}/invitations/{id}/sub-events
PATCH  /v1/workspaces/{id}/invitations/{id}/sub-events/{id}
DELETE /v1/workspaces/{id}/invitations/{id}/sub-events/{id}
```

### Media
```
POST   /v1/workspaces/{id}/invitations/{id}/media
GET    /v1/workspaces/{id}/invitations/{id}/media
DELETE /v1/workspaces/{id}/invitations/{id}/media/{id}
GET    /v1/workspaces/{id}/invitations/{id}/media/{id}/status
```

### AI Generation
```
POST   /v1/workspaces/{id}/invitations/{id}/ai/generate-text
POST   /v1/workspaces/{id}/invitations/{id}/ai/generate-background
GET    /v1/workspaces/{id}/ai/text-history
GET    /v1/workspaces/{id}/ai/background-history
```

### Analytics
```
GET    /v1/workspaces/{id}/invitations/{id}/analytics
GET    /v1/workspaces/{id}/invitations/{id}/analytics/devices
GET    /v1/workspaces/{id}/invitations/{id}/analytics/geography
```

### Export
```
POST   /v1/workspaces/{id}/invitations/{id}/export/pdf
POST   /v1/workspaces/{id}/invitations/{id}/export/video
GET    /v1/workspaces/{id}/exports/{id}/status
GET    /v1/workspaces/{id}/exports/{id}/download
```

See `contracts/api-contracts.yaml` for full OpenAPI spec.

---

## Testing Checklist

### Unit Tests
- [ ] Sub-event CRUD operations
- [ ] Media validation (size, duration, MIME type)
- [ ] AI prompt sanitization
- [ ] Analytics aggregation logic

### Integration Tests
- [ ] Sub-event creation with invitation
- [ ] Video upload → transcoding → ready
- [ ] AI text generation with mock Gemini
- [ ] PDF export with headless browser

### E2E Tests
- [ ] Create invitation with 3 sub-events
- [ ] Upload video, wait for processing
- [ ] Generate AI text, select option
- [ ] View analytics dashboard
- [ ] Export to PDF, download

---

## Development Tips

### Video Transcoding
```python
# Test locally with Docker
docker run -v $(pwd):/videos jrottenberg/ffmpeg \
  -i /videos/input.mov \
  -vf scale=1280:720 \
  -c:v libx264 -crf 23 \
  /videos/output.mp4
```

### AI Text Generation
```python
# Mock for development (avoid API costs)
@app.post("/mock/gemini/generate")
async def mock_generate(prompt: str):
    return {
        "options": [
            {"text": "Mock option 1", "confidence": 0.95},
            {"text": "Mock option 2", "confidence": 0.88},
            {"text": "Mock option 3", "confidence": 0.82},
        ]
    }
```

### Device Preview
```typescript
// Test different viewports
const PREVIEW_DEVICES = {
  'iPhone SE': { width: 375, height: 667 },
  'iPhone 14 Pro': { width: 393, height: 852 },
  'iPad': { width: 768, height: 1024 },
  'Desktop': { width: 1440, height: 900 },
};
```

---

## Rollout Strategy

1. **Phase 1** (Week 1-2): Template expansion + font library
2. **Phase 2** (Week 2-3): Video/audio upload + transcoding
3. **Phase 3** (Week 3-4): AI text generation + device preview
4. **Phase 4** (Week 4-5): Multi-event support + analytics
5. **Phase 5** (Week 5-6): AI background generation + export

Feature flags:
- `ENABLE_VIDEO_INVITATIONS`
- `ENABLE_AI_TEXT_GENERATION`
- `ENABLE_AI_BACKGROUND_GENERATION`
- `ENABLE_MULTI_EVENT_INVITATIONS`
- `ENABLE_INVITATION_EXPORT`

---

## References

| Document | Purpose |
|----------|---------|
| [spec.md](./spec.md) | Feature requirements |
| [research.md](./research.md) | Technical decisions |
| [data-model.md](./data-model.md) | Database schema |
| [api-contracts.yaml](./contracts/api-contracts.yaml) | API specification |
| [Existing spec](../../docs/TechnicalSpecs/digital_invitations.json) | Base implementation |
