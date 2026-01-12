# Implementation Plan: Album Preview & Proofing

**Branch**: `026-album-proofing` | **Date**: 2026-01-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/026-album-proofing/spec.md`

---

## Summary

Enable photographers to share album designs with clients for review, positioned feedback, and approval before printing. The feature extends existing infrastructure (Magic Links, Comments, WebSocket, PDF generation) rather than building new systems.

**Core Capabilities**:
1. Album proofing viewer with flipbook navigation
2. Click-to-place positioned comment pins
3. Approval workflow with status lifecycle
4. Version snapshots with comparison and rollback
5. Watermarked preview PDF download

---

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript 5.2+ (frontend)
**Primary Dependencies**: FastAPI, SQLAlchemy 2.0, React 19, reportlab (PDF)
**Storage**: PostgreSQL 16 (album data), Redis 7 (real-time), Cloudflare R2 (renders)
**Testing**: pytest (backend 85%), Vitest (frontend 70%)
**Target Platform**: Web application (responsive: mobile, tablet, desktop)
**Project Type**: Web application (frontend + backend + gallery-service)
**Performance Goals**: First spread < 3s, 500 concurrent sessions, PDF < 2min for 60 spreads
**Constraints**: Workspace isolation (multi-tenant), WCAG 2.1 AA
**Scale/Scope**: Standard album 20-60 spreads, large albums 100+ spreads with progressive loading

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Verify compliance with RawDrive Constitution (`.specify/memory/constitution.md`):

- [x] **I. Security**: No hardcoded secrets, parameterized queries, input validation
  - Share link tokens hashed (SHA-256), never stored plaintext
  - All queries parameterized via SQLAlchemy
  - Zod validation on frontend, Pydantic on backend
  - Signed URLs for image access

- [x] **II. Accessibility**: WCAG 2.1 AA compliance, keyboard nav, screen reader support
  - Keyboard navigation for spread viewer (arrow keys, Escape)
  - ARIA labels on comment pins and interactive elements
  - Focus management for dialogs
  - 44x44px touch targets on mobile

- [x] **III. Design System**: Uses design tokens, no hardcoded colors, standard UI components
  - AppButton, AppInput for all forms
  - CSS variables for theming (--color-primary, etc.)
  - Dark/light mode support

- [x] **IV. Multi-Tenant Isolation**: All queries include workspace_id, RBAC enforced
  - All album tables include workspace_id with foreign key
  - Every query filtered by workspace_id from JWT context
  - RBAC permissions checked via middleware

- [x] **V. Testing**: Coverage targets defined (95% security, 85% services, 70% UI)
  - Album service: 85% coverage
  - Comment service: 85% coverage
  - API endpoints: 85% coverage
  - UI components: 70% coverage

- [x] **VI. Clean Code**: SOLID principles, max file lengths, no over-engineering
  - Single responsibility: separate services for album, comments, versions, renders
  - Max 600 lines per component, 800 per service
  - Reuse existing infrastructure where possible

- [x] **VII. Observability**: Structured logging, metrics, audit trail for sensitive ops
  - JSON structured logging with correlation IDs
  - Prometheus metrics for render times, comment rates
  - Audit log for approvals (immutable)

---

## Project Structure

### Documentation (this feature)

```text
specs/026-album-proofing/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Technical research findings
├── data-model.md        # Entity definitions
├── quickstart.md        # Development quickstart
├── contracts/           # API contracts
│   └── album-proofing-api.yaml
└── tasks.md             # Task breakdown (from /speckit.tasks)
```

### Source Code (repository root)

```text
# Backend (Python FastAPI)
backend/
├── src/app/
│   ├── api/v1/
│   │   ├── albums.py                 # Album CRUD endpoints
│   │   ├── album_comments.py         # Comment endpoints
│   │   ├── album_versions.py         # Version endpoints
│   │   ├── album_renders.py          # PDF generation endpoints
│   │   └── album_public.py           # Public proofing routes
│   ├── models/
│   │   ├── album.py                  # Album, AlbumSpread, AlbumElement
│   │   ├── album_version.py          # AlbumVersion model
│   │   ├── album_comment.py          # AlbumComment model
│   │   └── album_render.py           # AlbumRender model
│   ├── repositories/
│   │   ├── album_repository.py       # Album data access
│   │   └── album_comment_repository.py
│   ├── services/
│   │   ├── album_service.py          # Album business logic
│   │   ├── album_comment_service.py  # Comment business logic
│   │   ├── album_version_service.py  # Version snapshots
│   │   ├── album_render_service.py   # PDF generation
│   │   └── album_approval_service.py # Approval workflow
│   └── workers/
│       └── album_render_worker.py    # Celery PDF generation
├── migrations/versions/
│   └── 0160_add_album_proofing_tables.py
└── tests/
    ├── unit/services/
    │   ├── test_album_service.py
    │   └── test_album_comment_service.py
    └── integration/api/
        └── test_album_api.py

# Frontend (React TypeScript)
frontend/
├── src/
│   ├── components/features/album-proofing/
│   │   ├── AlbumProofViewer.tsx      # Main viewer container
│   │   ├── SpreadViewer.tsx          # Individual spread display
│   │   ├── SpreadThumbnailStrip.tsx  # Navigation thumbnails
│   │   ├── FlipbookViewer.tsx        # Page-turn animations
│   │   ├── CommentPin.tsx            # Positioned marker
│   │   ├── CommentPinPopover.tsx     # Comment input/display
│   │   ├── CommentThread.tsx         # Threaded replies
│   │   ├── ApprovalDialog.tsx        # Confirmation modal
│   │   ├── ApprovalBadge.tsx         # Status indicator
│   │   ├── VersionHistory.tsx        # Version list
│   │   ├── VersionComparison.tsx     # Side-by-side diff
│   │   └── PreviewDownloadButton.tsx
│   ├── pages/public/
│   │   └── AlbumProofPage.tsx        # Public proofing route
│   ├── hooks/
│   │   ├── useAlbumProof.ts          # Fetch via share token
│   │   ├── useAlbumComments.ts       # Comment CRUD
│   │   ├── useAlbumVersions.ts       # Version management
│   │   └── useAlbumWebSocket.ts      # Real-time updates
│   ├── services/
│   │   ├── albumProofingService.ts   # Public API client
│   │   └── albumService.ts           # Authenticated API client
│   └── types/
│       └── album.ts                  # TypeScript interfaces
└── tests/
    └── components/album-proofing/
        └── AlbumProofViewer.test.tsx

# Gallery Service (extends WebSocket)
services/gallery-service/
├── src/api/v1/
│   └── album_websocket.py            # Album proofing WebSocket channel
└── src/services/
    └── album_broadcast_service.py    # Real-time event broadcasting
```

**Structure Decision**: Web application structure with backend API, frontend React, and gallery-service extension for WebSocket. Follows existing RawDrive patterns for gallery proofing.

---

## Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Album proofing location | Gallery Service | Mirrors gallery proofing, 50K concurrent support |
| Comment positions | Percentage (0-100%) | Responsive across viewports |
| Version storage | Full JSONB snapshot | Simple rollback, no delta complexity |
| PDF generation | reportlab + Celery | Already in use, async processing |
| Real-time sync | Extend existing WebSocket | Redis pub/sub, JWT auth, proven at scale |
| Access control | Extend Magic Links | Existing token validation, QR support |

---

## Implementation Approach

### Phase 1: Core Data Model
1. Create album database migrations (6 tables)
2. Create SQLAlchemy models
3. Create repository layer
4. Extend magic_links for album targeting

### Phase 2: Album CRUD API
1. Implement album service
2. Create CRUD endpoints
3. Add version snapshot service
4. Add render/PDF service

### Phase 3: Public Proofing API
1. Create public album endpoints
2. Implement share link validation for albums
3. Add approval workflow
4. Integrate notifications

### Phase 4: Frontend Viewer
1. Create AlbumProofViewer component
2. Add spread navigation and thumbnails
3. Implement flipbook mode
4. Add zoom and full-screen

### Phase 5: Comment System
1. Create positioned comment pins
2. Add comment CRUD
3. Implement threading
4. Add real-time updates via WebSocket

### Phase 6: Approval & Versions
1. Create approval dialog
2. Implement version history UI
3. Add version comparison
4. Add rollback functionality

### Phase 7: PDF Download
1. Implement PDF render worker
2. Add download endpoint
3. Add watermarking
4. Create download UI

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Large albums (100+ spreads) slow | Progressive loading, virtual scroll |
| PDF generation timeout | Celery worker with extended timeout, chunked processing |
| WebSocket connection drops | Auto-reconnect with exponential backoff |
| Comment pin positioning drift | Percentage-based coords, viewport-independent |

---

## Artifacts Generated

| Artifact | Path | Status |
|----------|------|--------|
| Research | `research.md` | Complete |
| Data Model | `data-model.md` | Complete |
| API Contract | `contracts/album-proofing-api.yaml` | Complete |
| Quickstart | `quickstart.md` | Complete |
| Tasks | `tasks.md` | Pending (`/speckit.tasks`) |

---

## Next Steps

1. Run `/speckit.tasks` to generate task breakdown
2. Follow story order for incremental delivery:
   - P1: Client Reviews Album Proof
   - P2: Client Leaves Positioned Comments
   - P3: Client Approves Album for Print
   - P4: Photographer Manages Versions
   - P5: Download Preview PDF
3. Each story is independently deployable

---

## Complexity Tracking

> No Constitution violations requiring justification.

All implementation follows established patterns:
- Extends existing Magic Links (no new auth system)
- Adapts existing Comments (adds positioning via JSONB)
- Reuses WebSocket infrastructure (new channel pattern)
- Leverages reportlab for PDF (no new library)
