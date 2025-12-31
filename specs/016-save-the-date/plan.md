# Implementation Plan: Save The Date - Digital Invitation System

**Branch**: `016-save-the-date` | **Date**: December 30, 2025 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-save-the-date/spec.md`

## Summary

Build a comprehensive digital invitation system ("Save The Date") for Indian photographers and event organizers. The system enables template-based invitation creation, guest RSVP management, QR code generation, calendar integration (.ics), and multi-language support for cultural events. Integrates with existing RawDrive infrastructure: share_links_access for public URLs, QRCodeService for QR generation, notification service for RSVP alerts, and workspace-scoped storage for images.

## Technical Context

**Language/Version**: Python 3.11+ (Backend FastAPI), TypeScript 5.2+ (Frontend React 18.3)
**Primary Dependencies**:
- Backend: FastAPI 0.115+, SQLAlchemy 2.0+, asyncpg 0.29+, Pydantic 2.7+, python-icalendar (calendar), qrcode (existing)
- Frontend: React 18.3, React Router DOM, TailwindCSS, Lucide React (icons), react-hook-form, zod

**Storage**: PostgreSQL 16 (new tables: `invitations`, `invitation_templates`, `invitation_images`, `invitation_guests`, `invitation_rsvps`, `invitation_checkins`), Redis 7 (caching, auto-save drafts), Cloudflare R2 (invitation images, QR codes)

**Testing**: pytest (backend), Vitest + React Testing Library (frontend)

**Target Platform**: Web application (desktop + mobile responsive)

**Project Type**: Web application (frontend + backend)

**Performance Goals**:
- Public invitation page load: LCP < 2.5s on 4G
- RSVP submission: < 500ms response time
- Invitation creation wizard: real-time preview updates

**Constraints**:
- Public RSVP endpoints rate-limited: 100/hour per IP
- Auto-deletion 7 days post-event (configurable)
- Image upload: max 10 images, 10MB each
- Multi-tenant workspace isolation mandatory

**Scale/Scope**:
- 10,000+ concurrent invitation views
- 6 regional languages (English, Hindi, Tamil, Telugu, Kannada, Malayalam)
- 15+ pre-built templates at launch

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution template is not fully configured for this project. Applying RawDrive project standards from CLAUDE.md:

| Gate | Status | Notes |
|------|--------|-------|
| WCAG 2.1 AA Compliance | PASS | Spec includes FR-051 to FR-054 for accessibility |
| SOC 2 / GDPR / DPDP | PASS | FR-040 to FR-043 address data retention and privacy |
| Workspace Isolation | PASS | FR-047 requires workspace_id scoping |
| Design System Usage | PASS | Integration section specifies AppButton, AppInput, etc. |
| Rate Limiting | PASS | FR-048 specifies rate limits on public endpoints |
| Security Controls | PASS | FR-049, FR-050 address XSS/CSRF/injection protection |

**Constitution Check Result: PASS** - All gates satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/016-save-the-date/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── openapi.yaml     # API contract specification
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
backend/
├── src/app/
│   ├── api/v1/
│   │   ├── invitations.py           # Host-facing invitation CRUD
│   │   └── public_invitations.py    # Guest-facing public endpoints
│   ├── services/
│   │   ├── invitation_service.py    # [NEW] Core invitation business logic
│   │   ├── invitation_rsvp_service.py  # [NEW] RSVP management
│   │   ├── invitation_template_service.py  # [NEW] Template rendering
│   │   ├── calendar_service.py      # [NEW] .ics file generation
│   │   └── qr_service.py            # [EXISTING] QR code generation
│   ├── repositories/
│   │   ├── invitation_repository.py # [NEW] Invitation data access
│   │   └── rsvp_repository.py       # [NEW] RSVP data access
│   └── db/migrations/
│       └── 00XX_invitations.sql     # [NEW] Schema migration
└── tests/
    ├── unit/
    │   └── services/
    │       └── test_invitation_service.py
    └── integration/
        └── test_invitations_api.py

frontend/
├── src/
│   ├── components/features/invitations/
│   │   ├── InvitationWizard.tsx     # [NEW] 3-step creation wizard
│   │   ├── InvitationPreview.tsx    # [NEW] Real-time preview
│   │   ├── TemplateGallery.tsx      # [NEW] Template selection
│   │   ├── TemplateCustomizer.tsx   # [NEW] Color/font customization
│   │   ├── RSVPDashboard.tsx        # [NEW] Host RSVP management
│   │   ├── RSVPExport.tsx           # [NEW] CSV/PDF export
│   │   └── InvitationQRModal.tsx    # [NEW] QR code download
│   ├── pages/
│   │   ├── InvitationsPage.tsx      # [NEW] List/dashboard
│   │   ├── InvitationCreatePage.tsx # [NEW] Wizard host page
│   │   └── InvitationDetailPage.tsx # [NEW] Single invitation view
│   ├── pages/public/
│   │   └── PublicInvitationPage.tsx # [NEW] Guest-facing view
│   └── services/
│       └── invitationService.ts     # [NEW] API client
└── tests/
    └── components/invitations/
        └── InvitationWizard.test.tsx
```

**Structure Decision**: Web application with existing backend/frontend separation. New invitation feature adds services following established patterns (GalleryService, QRCodeService). Reuses existing infrastructure: share_links for public URLs, notification_service for RSVP alerts, storage patterns for images.

## Complexity Tracking

> No complexity violations detected. Feature uses existing patterns and infrastructure.

---

## Phase 0: Research (Completed)

See [research.md](./research.md) for full findings. Key decisions:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Template Storage | JSONB in PostgreSQL | Allows flexible schema, supports customization overlay |
| Public URL Pattern | `/invite/{slug}` | SEO-friendly, consistent with existing `/g/{token}` pattern |
| Calendar Library | `icalendar` Python package | Mature, RFC 5545 compliant, well-documented |
| RSVP Deduplication | Email-based with edit token | Simple, privacy-respecting, no account required |
| Auto-Save | Redis with 30s debounce | Fast, matches existing session patterns |

## Phase 1: Design Artifacts

Generated artifacts:
- [data-model.md](./data-model.md) - Entity definitions and relationships
- [contracts/openapi.yaml](./contracts/openapi.yaml) - API specification
- [quickstart.md](./quickstart.md) - Developer setup guide

---

## Implementation Phases

### Phase 1: Core Invitation CRUD (P1 Stories)

**Goal**: Enable invitation creation, editing, publishing, and public viewing.

**Tasks**:
1. Database migrations for `invitations`, `invitation_images` tables
2. `InvitationRepository` with CRUD operations
3. `InvitationService` with create, update, publish, archive
4. API endpoints: POST/GET/PATCH/DELETE `/v1/workspaces/{id}/invitations`
5. Public endpoint: GET `/v1/portal/invitations/{slug}`
6. Frontend: `InvitationWizard` with 3 steps
7. Frontend: `InvitationPreview` component
8. Integration with `share_links` for public URL generation

**Dependencies**: None (foundational)

### Phase 2: Template System (P1 Stories)

**Goal**: Provide culturally-appropriate templates with customization.

**Tasks**:
1. Database migration for `invitation_templates` table
2. Seed data: 15 initial templates (wedding, birthday, festival categories)
3. `InvitationTemplateService` for rendering with customization overlay
4. Frontend: `TemplateGallery` component
5. Frontend: `TemplateCustomizer` (color picker, font selector)
6. Regional font loading (Hindi, Tamil, Telugu, Kannada, Malayalam)

**Dependencies**: Phase 1

### Phase 3: RSVP System (P1 Stories)

**Goal**: Enable guests to RSVP without accounts; hosts to manage responses.

**Tasks**:
1. Database migration for `invitation_rsvps` table
2. `RSVPRepository` with create, update, get operations
3. `InvitationRSVPService` with submission, deduplication, confirmation
4. Public API: POST `/v1/portal/invitations/{slug}/rsvp`
5. Host API: GET `/v1/workspaces/{id}/invitations/{id}/rsvps`
6. Frontend: `RSVPForm` component (public)
7. Frontend: `RSVPDashboard` with filtering and statistics
8. Integration with notification service for RSVP alerts

**Dependencies**: Phase 1

### Phase 4: QR Codes & Calendar (P2 Stories)

**Goal**: Generate QR codes and .ics calendar files.

**Tasks**:
1. Extend existing `QRCodeService` for invitation URLs
2. `CalendarService` for .ics generation
3. API: GET `/v1/workspaces/{id}/invitations/{id}/qr`
4. Public API: GET `/v1/portal/invitations/{slug}/calendar`
5. Frontend: `InvitationQRModal` with format/size options
6. Frontend: "Add to Calendar" button on public page

**Dependencies**: Phase 1

### Phase 5: Sharing & Social (P2 Stories)

**Goal**: WhatsApp-optimized sharing with Open Graph meta tags.

**Tasks**:
1. Open Graph meta tag generation for invitation pages
2. Cover image optimization (1200x630px, <300KB)
3. WhatsApp share URL generation with prefilled message
4. Frontend: `ShareMenu` component with WhatsApp, copy link options

**Dependencies**: Phase 1

### Phase 6: Guest Management & Export (P1/P3 Stories)

**Goal**: Guest list management and RSVP export.

**Tasks**:
1. Database migration for `invitation_guests` table
2. Host API for guest list CRUD
3. Export API: GET `/v1/workspaces/{id}/invitations/{id}/export` (CSV, PDF)
4. Frontend: `RSVPExport` component
5. PDF generation with proper formatting

**Dependencies**: Phase 3

### Phase 7: Auto-Save & Drafts (P3 Stories)

**Goal**: Prevent data loss during invitation creation.

**Tasks**:
1. Redis-based draft storage with 30s debounce
2. API: GET/PUT `/v1/workspaces/{id}/invitations/drafts`
3. Frontend: Draft list view with resume capability
4. Auto-save indicator in wizard

**Dependencies**: Phase 1

### Phase 8: Check-In System (P3 Stories)

**Goal**: Event-day guest check-in via QR codes.

**Tasks**:
1. Database migration for `invitation_checkins` table
2. Signed JWT tokens for guest check-in QR codes
3. API: POST `/v1/workspaces/{id}/invitations/{id}/checkin`
4. Frontend: Check-in scanner view
5. Real-time check-in count updates

**Dependencies**: Phase 3, Phase 4

---

## Post-Design Constitution Re-Check

| Gate | Status | Notes |
|------|--------|-------|
| WCAG 2.1 AA | PASS | Form controls use AppInput with ARIA labels; contrast ratios maintained |
| SOC 2 / GDPR / DPDP | PASS | Auto-deletion scheduled; PII encrypted at rest |
| Workspace Isolation | PASS | All queries include workspace_id filter |
| Design System Usage | PASS | All components use existing UI primitives |
| Rate Limiting | PASS | Public RSVP endpoint uses content_moderation_abuse rate limiter |
| Security Controls | PASS | Zod validation, Turnstile optional, signed tokens for check-in |

**Post-Design Check: PASS** - All gates remain satisfied after detailed design.
