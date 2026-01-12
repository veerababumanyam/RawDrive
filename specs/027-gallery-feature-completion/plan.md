# Implementation Plan: Gallery Feature Completion

**Branch**: `027-gallery-feature-completion` | **Date**: 2026-01-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/027-gallery-feature-completion/spec.md`

## Summary

Complete 10 missing/incomplete gallery features to achieve production-ready state. Features span across Tier 1 (Critical UX), Tier 2 (Accessibility), Tier 3 (Enhanced Features), and Tier 4 (Media Enhancements). Two features have partial implementations (per-photo access codes with existing DB field, RTL with existing i18n config). Implementation requires database migrations, backend API endpoints, gallery-service updates, and frontend components.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript 5.3+ (frontend)
**Primary Dependencies**: FastAPI, SQLAlchemy 2.0, React 18.3, TailwindCSS, Redis 7
**Storage**: PostgreSQL 16 (primary), Redis 7 (download quota tracking), Cloudflare R2 (audio files)
**Testing**: pytest (backend), Vitest (frontend)
**Target Platform**: Web (Desktop/Mobile browsers), PWA-capable
**Project Type**: Web application (microservices architecture)
**Performance Goals**: <500ms access code verification, <60s email delivery, smooth 4G audio streaming
**Constraints**: WCAG 2.1 AA compliance, 3-level max nesting, 10MB audio file limit
**Scale/Scope**: 50K concurrent gallery viewers, 8 microservices, multi-tenant architecture

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with RawDrive Constitution (`.specify/memory/constitution.md`):

- [x] **I. Security**: Access codes hashed (bcrypt), parameterized queries via SQLAlchemy, input validation via Pydantic/Zod
- [x] **II. Accessibility**: WCAG 2.1 AAA for high contrast (7:1), skip links, keyboard nav, RTL support
- [x] **III. Design System**: Uses design tokens, no hardcoded colors, SkipLinks uses standard UI components
- [x] **IV. Multi-Tenant Isolation**: All queries filter by workspace_id, RBAC enforced via JWT middleware
- [x] **V. Testing**: 95% coverage for access code verification (security), 85% for APIs, 70% for UI components
- [x] **VI. Clean Code**: SOLID principles, components <600 lines, no over-engineering
- [x] **VII. Observability**: Structured logging with correlation IDs, Prometheus metrics for download limits

## Project Structure

### Documentation (this feature)

```text
specs/027-gallery-feature-completion/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (OpenAPI specs)
│   ├── access-codes.yaml
│   ├── download-limits.yaml
│   ├── magic-links.yaml
│   └── password-reset.yaml
├── checklists/
│   └── requirements.md  # Spec validation checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# Backend (main API)
backend/
├── src/app/
│   ├── api/v1/
│   │   ├── public_galleries.py    # Add: verify-code, password-reset endpoints
│   │   └── media.py               # Add: download limit enforcement
│   ├── models/                    # Existing models
│   ├── services/
│   │   ├── access_code_service.py # NEW: code verification logic
│   │   ├── download_quota_service.py # NEW: Redis-based quota tracking
│   │   └── gallery_password_reset_service.py # NEW: email reset flow
│   └── middleware/
│       └── download_limit_middleware.py # NEW: rate limiting
├── migrations/versions/
│   └── 0162_gallery_feature_completion.py # NEW: schema changes
└── tests/

# Gallery Microservice
services/gallery-service/
├── src/
│   ├── api/v1/
│   │   ├── galleries.py           # Update: nested sub-galleries
│   │   └── public/galleries.py    # Update: UTM tracking, access codes
│   ├── services/
│   │   └── gallery_service.py     # Update: hierarchy support
│   └── schemas/
│       ├── gallery.py             # Update: audio_url, utm_params
│       └── sub_gallery.py         # Update: parent_sub_gallery_id
└── tests/

# Frontend
frontend/
├── src/
│   ├── components/
│   │   ├── ui/
│   │   │   └── SkipLinks.tsx           # NEW: accessibility skip links
│   │   └── features/gallery/
│   │       ├── AccessCodeModal.tsx      # NEW: code entry UI
│   │       ├── Breadcrumbs.tsx          # NEW: navigation breadcrumbs
│   │       ├── HighContrastToggle.tsx   # NEW: accessibility toggle
│   │       ├── PasswordResetModal.tsx   # NEW: forgot password UI
│   │       └── SlideshowAudioPlayer.tsx # NEW: background music
│   ├── pages/public/
│   │   └── PublicGalleryPage.tsx  # Update: RTL, skip links, access codes
│   ├── hooks/
│   │   └── useRTL.ts              # NEW: RTL detection hook
│   └── styles/
│       └── high-contrast.css      # NEW: AAA contrast variables
└── tests/
```

**Structure Decision**: Web application with microservices architecture. Changes span main backend, gallery-service, and frontend. No new services required - extends existing gallery-service and main backend.

## Complexity Tracking

No Constitution violations identified. All features align with existing patterns:
- Access codes: Same pattern as gallery password hashing
- Download limits: Same pattern as existing rate limiting
- RTL support: Extends existing i18n infrastructure
- Nested sub-galleries: Extends existing sub-gallery model

## Implementation Phases

### Phase 0: Research (Complete)
See [research.md](./research.md) for technology decisions and best practices.

### Phase 1: Design (Complete)
- [data-model.md](./data-model.md): Entity definitions and relationships
- [contracts/](./contracts/): OpenAPI specifications
- [quickstart.md](./quickstart.md): Developer setup guide

### Phase 2: Tasks (Next)
Run `/speckit.tasks` to generate actionable task list from this plan.

## Feature-to-File Mapping

| Feature | Backend Files | Frontend Files | Migration |
|---------|---------------|----------------|-----------|
| Per-photo access codes | `access_code_service.py`, `public_galleries.py` | `AccessCodeModal.tsx` | 0162 |
| Daily download limits | `download_quota_service.py`, `download_limit_middleware.py` | - | 0162 |
| High contrast mode | - | `HighContrastToggle.tsx`, `high-contrast.css` | - |
| Skip links | - | `SkipLinks.tsx` | - |
| RTL layout | - | `useRTL.ts`, CSS updates | - |
| Breadcrumb navigation | gallery-service schemas | `Breadcrumbs.tsx` | 0162 |
| Nested sub-galleries | gallery-service | `SubGalleryTree.tsx` | 0162 |
| UTM tracking | gallery-service schemas | `ShareMenu.tsx` update | 0162 |
| Password reset | `gallery_password_reset_service.py` | `PasswordResetModal.tsx` | 0162 |
| Slideshow audio | gallery-service schemas | `SlideshowAudioPlayer.tsx` | 0162 |

## Dependencies

### External
- Redis 7: Download quota tracking (already deployed)
- Notifications-service: Password reset emails (already deployed)
- Cloudflare R2: Audio file storage (already deployed)

### Internal
- Migration 0157-0159: Must be applied (gallery settings)
- i18n infrastructure: Already configured for Urdu

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| RTL CSS breaks existing layouts | Use logical properties only, thorough testing |
| Download limit bypass via multiple sessions | Track by gallery_id + client fingerprint |
| Access code brute force | 5-minute lockout after 3 failed attempts |
| Audio autoplay blocked by browser | Provide manual "Play music" button |
