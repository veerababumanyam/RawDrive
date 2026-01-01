# Implementation Plan: Digital Invitations Enhancement

**Branch**: `017-digital-wedding-invitations` | **Date**: 2026-01-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/017-digital-wedding-invitations/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

This feature **extends the existing digital invitations system** (feature 016-save-the-date) to add:
- 30+ gradient templates with enhanced customization
- Video and audio media support with transcoding
- AI-powered text generation (via user's Gemini API key)
- AI-powered background generation (via user's Imagen/Nano Banana key)
- Multi-event support (e.g., 3-day weddings, multi-session conferences)
- Enhanced analytics with device/geo breakdown
- PDF and video export capabilities
- Live device preview in editor

The platform supports **all event types** (weddings, birthdays, anniversaries, corporate events, baby showers, etc.) - not limited to weddings.

~60% of the spec requirements are already implemented via feature 016. This plan covers the remaining 40%.

## Technical Context

**Language/Version**: Python 3.11 (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 19, SQLAlchemy 2.0+, asyncpg 0.29+, BullMQ, FFmpeg, Puppeteer
**Storage**: PostgreSQL 16 (new tables), Redis 7 (job queues), Cloudflare R2 (media storage)
**Testing**: pytest (backend), Vitest + React Testing Library (frontend)
**Target Platform**: Linux server (backend), Modern browsers (frontend)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: Video transcoding < 5min for 90s video, AI generation < 15s for text, < 60s for images
**Constraints**: Video max 100MB upload, 90s duration; Audio max 10MB, 180s; PDF export < 30s
**Scale/Scope**: 10k workspaces, 100 concurrent invitation editors

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution is a template without specific constraints. The following standard RawDrive practices apply:

| Gate | Status | Notes |
|------|--------|-------|
| Multi-tenant isolation | PASS | All tables include workspace_id, queries scoped |
| API versioning | PASS | All endpoints under /v1/ |
| Security (API key encryption) | PASS | Using existing AES-256-GCM pattern |
| Input validation | PASS | Zod (frontend), Pydantic (backend) |
| Error handling | PASS | User-friendly messages, audit logging |
| Accessibility | PASS | WCAG 2.1 AA for new components |

## Project Structure

### Documentation (this feature)

```text
specs/017-digital-wedding-invitations/
├── plan.md              # This file
├── research.md          # Phase 0 output - technical decisions
├── data-model.md        # Phase 1 output - 5 new tables
├── quickstart.md        # Phase 1 output - developer guide
├── contracts/           # Phase 1 output - OpenAPI spec
│   └── api-contracts.yaml
├── checklists/
│   └── requirements.md  # Spec validation checklist
└── tasks.md             # Phase 2 output (/speckit.tasks - NOT created yet)
```

### Source Code (repository root)

```text
backend/
├── src/app/
│   ├── api/v1/
│   │   ├── digital_invitations.py    # Modify: add new endpoints
│   │   ├── invitation_sub_events.py  # NEW: multi-event endpoints
│   │   ├── invitation_media.py       # NEW: video/audio endpoints
│   │   ├── invitation_ai.py          # NEW: AI generation endpoints
│   │   └── invitation_export.py      # NEW: PDF/video export
│   ├── services/
│   │   ├── digital_invitation_service.py  # Modify: sub-events relation
│   │   ├── invitation_sub_event_service.py    # NEW
│   │   ├── invitation_media_service.py        # NEW
│   │   ├── invitation_ai_service.py           # NEW
│   │   ├── invitation_export_service.py       # NEW
│   │   └── invitation_analytics_service.py   # NEW
│   ├── repositories/
│   │   ├── invitation_sub_event_repository.py # NEW
│   │   ├── invitation_media_repository.py     # NEW
│   │   └── invitation_analytics_repository.py # NEW
│   └── workers/
│       ├── video_transcoding_worker.py  # NEW: FFmpeg jobs
│       └── pdf_export_worker.py         # NEW: Puppeteer jobs
├── migrations/versions/
│   ├── 0067_invitation_sub_events.py    # NEW
│   ├── 0068_invitation_media.py         # NEW
│   ├── 0069_image_generation_settings.py # NEW
│   ├── 0070_invitation_ai_generations.py # NEW
│   ├── 0071_invitation_view_analytics.py # NEW
│   └── 0072_invitation_schema_updates.py # NEW (ALTER existing tables)
└── tests/
    ├── unit/
    │   └── services/invitation_*.py
    └── integration/
        └── api/invitation_*.py

frontend/
├── src/
│   ├── components/
│   │   └── invitations/
│   │       ├── SubEventEditor.tsx      # NEW
│   │       ├── SubEventList.tsx        # NEW
│   │       ├── MediaUploader.tsx       # NEW
│   │       ├── VideoPlayer.tsx         # NEW
│   │       ├── AudioPlayer.tsx         # NEW
│   │       ├── DevicePreview.tsx       # NEW
│   │       ├── AITextGenerator.tsx     # NEW
│   │       ├── AIBackgroundGenerator.tsx # NEW
│   │       └── AnalyticsDashboard.tsx  # NEW
│   ├── pages/
│   │   └── InvitationEditor.tsx        # Modify: integrate new features
│   ├── services/
│   │   └── invitationService.ts        # Modify: add API methods
│   └── types/
│       └── invitations.ts              # Modify: add new interfaces
└── tests/
    └── components/invitations/*.test.tsx
```

**Structure Decision**: Web application structure with separate frontend and backend. Extends existing invitation modules rather than creating new top-level directories.

## Complexity Tracking

> No constitution violations. All patterns follow existing RawDrive architecture.

| Pattern | Justification |
|---------|---------------|
| 6 new migrations | Modular schema evolution, each migration is atomic |
| 5 new backend services | Single responsibility, matches existing service pattern |
| 9 new frontend components | Focused UI components, reusable across event types |
| 2 new worker types | Isolates CPU-intensive tasks from API |

## Key Technical Decisions

See [research.md](./research.md) for detailed rationale. Summary:

1. **Video Transcoding**: FFmpeg via BullMQ workers (not cloud transcoding)
2. **AI Text Generation**: Extends existing Gemini integration pattern
3. **AI Background Generation**: New `image_generation_settings` table for multiple providers
4. **Multi-Event Support**: `invitation_sub_events` table (one-to-many)
5. **PDF Export**: Puppeteer server-side rendering
6. **Device Preview**: CSS-based iframe simulation (frontend-only)
7. **Font Library**: 20 Google Fonts bundled + WOFF2 uploads
8. **MP4 Export**: Deferred to Phase 2 (Remotion integration)

## Implementation Phases

### Phase 1: Core Enhancements (P1 stories)
- 30+ gradient templates
- Video media type + transcoding
- Device preview component
- Font library bundling

### Phase 2: AI & Multi-Event (P2 stories)
- AI text generation endpoint
- Multi-event schema + UI
- Enhanced RSVP questions
- Audio media support

### Phase 3: Advanced Features (P3 stories)
- AI background generation
- PDF export
- Enhanced analytics
- Social sharing cards
- MP4 export (stretch)

## References

| Document | Purpose |
|----------|---------|
| [spec.md](./spec.md) | Feature requirements (67 FRs, 10 user stories) |
| [research.md](./research.md) | Technical decisions with rationale |
| [data-model.md](./data-model.md) | Database schema (5 new tables) |
| [quickstart.md](./quickstart.md) | Developer setup guide |
| [api-contracts.yaml](./contracts/api-contracts.yaml) | OpenAPI 3.0.3 specification |
| [requirements.md](./checklists/requirements.md) | Spec quality checklist |
