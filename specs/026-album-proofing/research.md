# Research: Album Preview & Proofing

**Feature Branch**: `026-album-proofing`
**Researched**: 2026-01-09

---

## 1. Existing Infrastructure Analysis

### 1.1 Magic Links (Share Links) - REUSABLE

**Status**: Production-ready, extensible

| Component | Location | Notes |
|-----------|----------|-------|
| Database | Migration 0056 | `album_title` column exists |
| Backend Service | `backend/src/app/services/magic_link_service.py` | Full CRUD, SHA-256 tokens |
| Repository | `backend/src/app/repositories/magic_link_repository.py` | Workspace-isolated |
| API | `/api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/magic-links` | QR, expiration, access limits |
| Frontend Service | `frontend/src/services/magicLinkService.ts` | Full API client |

**Decision**: Extend `target_type` field to accept "album" alongside "gallery", "sub_gallery", "photo"

**Rationale**: Token validation, expiration, access counting, and QR generation all transfer directly. No new auth infrastructure needed.

**Alternatives Considered**:
- Create separate album token system → Rejected: Code duplication, inconsistent security model
- Use direct album_id in URL → Rejected: No access control, no expiration

---

### 1.2 Comment System - ADAPTABLE

**Status**: Exists for galleries, needs position extension

| Component | Location | Notes |
|-----------|----------|-------|
| Database | `comments` table | JSONB `annotations` field for extension |
| Backend Service | `backend/src/app/services/comment_service.py` | Workspace-scoped, status workflow |
| Frontend | `frontend/src/components/features/gallery/CommentSection.tsx` | CRUD, resolve toggle |

**Decision**: Extend `annotations` JSONB to store position data:
```json
{
  "position": { "x": 42.5, "y": 63.2 },
  "spread_id": "uuid"
}
```

**Rationale**: No schema migration required. JSONB handles flexible metadata. Existing status (open/in_progress/resolved), threading (parent_comment_id), and author tracking all reusable.

**Alternatives Considered**:
- New `album_comments` table with dedicated columns → Rejected: Duplication of comment infrastructure
- Pixel coordinates instead of percentages → Rejected: Breaks on viewport resize

---

### 1.3 WebSocket Real-Time - REUSABLE

**Status**: Production-ready, battle-tested for 50K concurrent

| Component | Location | Notes |
|-----------|----------|-------|
| Backend | `backend/src/app/services/websocket_service.py` | Redis pub/sub |
| Gallery Service | `services/gallery-service/src/api/v1/websocket.py` | Per-gallery channels |
| Connection Manager | Gallery service | Viewer count, connection limits |

**Decision**: Create new channel pattern `album:{album_id}:proofing`

**Rationale**: Mirrors gallery pattern. Reuses Redis pub/sub, JWT auth, connection management.

**Event Types**:
- `album:comment_added`
- `album:comment_replied`
- `album:comment_resolved`
- `album:approved`
- `album:version_created`
- `album:spread_updated`

---

### 1.4 PDF Generation - EXTENDABLE

**Status**: reportlab in use, Celery workers ready

| Component | Location | Notes |
|-----------|----------|-------|
| Library | reportlab | Pages, images, styles, tables |
| Generator | `backend/src/app/utils/pdf_generator.py` | RSVPPDFGenerator example |
| Export Worker | `backend/src/app/workers/gallery_export_worker.py` | Async processing |
| Export API | `backend/src/app/api/v1/gallery_exports.py` | Status tracking, expiration |

**Decision**: Create `AlbumRenderService` using reportlab + Celery

**Rationale**: Existing patterns for async generation, status polling, signed URL delivery.

**Alternatives Considered**:
- External PDF API service → Rejected: Added latency, cost, dependency
- Browser-based PDF (puppeteer) → Rejected: Complex setup, resource-heavy
- Return spread images only → Rejected: Clients expect downloadable PDF

---

### 1.5 Notification Service - READY

**Status**: Production microservice with event catalog

| Component | Location | Notes |
|-----------|----------|-------|
| Service | `services/notifications-service/` | Port 8010 |
| API | `POST /api/v1/workspaces/{workspace_id}/notifications` | Template-based |
| Channels | Email, SMS, in-app, push | Multi-channel |
| Event Types | `notifications-service/src/api/v1/event_types.py` | Catalog system |

**Decision**: Register new album event types in catalog

**New Event Types**:
```python
"album.proof_sent"      # Photographer sends proof
"album.comment_added"   # New comment on spread
"album.comment_replied" # Reply to comment
"album.changes_requested"  # Status update
"album.approved"        # Client approves for print
```

---

## 2. Technical Decisions

### 2.1 Where to Build Album Proofing UI

**Decision**: Gallery Service (port 8004)

**Rationale**:
- Mirrors existing proofing pattern (gallery proofing mode)
- 50K concurrent user support already implemented
- Separate scaling from backend API
- Shared auth/WebSocket infrastructure

**Alternatives Considered**:
- Backend monolith → Rejected: Scaling constraints, mixed concerns
- New album-service → Rejected: Over-engineering, duplicates gallery patterns

---

### 2.2 Comment Position Storage

**Decision**: Percentage-based coordinates (0-100%)

**Rationale**:
- Responsive across viewport sizes (mobile, tablet, desktop)
- No recalculation needed when spread is resized
- Matches face detection bounding box pattern in codebase

**Storage Schema**:
```json
{
  "position": {
    "x": 42.5,   // % from left edge
    "y": 63.2    // % from top edge
  }
}
```

---

### 2.3 Album Version Storage

**Decision**: Full JSONB snapshot per version

**Rationale**:
- Simple rollback: Replace current state with snapshot
- No delta calculation complexity
- JSONB GIN indexes handle query performance
- Acceptable storage cost (album data is small relative to photos)

**Schema**:
```python
class AlbumVersion:
    version_id: UUID
    album_id: UUID
    version_number: int
    label: str  # "V2 - After client round 1"
    snapshot_data: dict  # Complete serialized album state
    created_by_user_id: UUID
    created_at: datetime
```

---

### 2.4 Approval Workflow

**Decision**: State machine with explicit transitions

**Status Lifecycle**:
```
draft → proof_sent → changes_requested → approved → exported
                   ↗                    ↙
                   └────────────────────┘
```

**Transition Rules**:
| From | To | Trigger |
|------|-----|---------|
| draft | proof_sent | Photographer sends proof link |
| proof_sent | changes_requested | Client adds comment |
| proof_sent | approved | Client approves |
| changes_requested | proof_sent | Photographer resolves and re-sends |
| changes_requested | approved | Client approves despite comments |
| approved | changes_requested | Photographer makes changes post-approval |

**Rationale**: Prevents invalid states (e.g., approve without sending proof), provides audit trail.

---

### 2.5 Real-Time Sync Strategy

**Decision**: Extend existing WebSocket with album channels

**Implementation**:
- Channel: `album:{album_id}:proofing`
- Reuse Redis pub/sub, JWT auth
- New event handlers in gallery-service

**Rationale**: Avoid separate real-time infrastructure. All WebSocket patterns tested at scale.

---

## 3. Database Design Decisions

### 3.1 New Tables vs Extensions

**Decision**: Create dedicated album tables + extend magic_links

| Table | Type | Rationale |
|-------|------|-----------|
| `albums` | NEW | Core entity, distinct from galleries |
| `album_spreads` | NEW | Spread-based structure unique to albums |
| `album_elements` | NEW | Layout elements distinct from gallery assets |
| `album_versions` | NEW | Version snapshots specific to albums |
| `album_comments` | NEW | Position-aware comments |
| `album_renders` | NEW | PDF/image renders |
| `magic_links.album_id` | EXTEND | Reuse token infrastructure |

---

### 3.2 Multi-Tenant Isolation

**Decision**: All album tables include `workspace_id` with foreign key + index

**Pattern** (matches existing codebase):
```sql
workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id)
CREATE INDEX idx_albums_workspace ON albums(workspace_id);
```

---

## 4. Performance Considerations

### 4.1 Large Album Handling (100+ spreads)

**Strategy**: Progressive loading

- Load first spread immediately
- Thumbnail strip shows all spreads (low-res placeholders)
- Full spreads loaded on navigation
- Virtualized scroll for thumbnail strip

**Target**: First spread visible within 3 seconds

---

### 4.2 Concurrent Proofing Sessions

**Target**: 500 concurrent sessions

**Approach**:
- Gallery service handles WebSocket connections (proven at 50K)
- Redis pub/sub for event broadcasting
- Signed URLs for images (offload to CDN)
- Database connection pooling

---

### 4.3 PDF Generation Time

**Target**: < 2 minutes for 60-spread album

**Approach**:
- Celery worker for async generation
- Batch image fetching with signed URLs
- reportlab for PDF assembly
- Stream directly to R2 (no local disk)

---

## 5. Security Considerations

### 5.1 Access Control

**Approach**: Extend share link validation

```python
# Access flow
1. Client clicks share link with token
2. Hash token, lookup in magic_links
3. Validate: workspace_id, target_type="album", album_id, expiration, access_count
4. Return album data if valid
```

---

### 5.2 IDOR Prevention

**Approach**: Always validate workspace_id + album_id association

```python
# Every query pattern
SELECT * FROM albums
WHERE album_id = :album_id
  AND workspace_id = :workspace_id
```

---

### 5.3 Signed URLs for Images

**Approach**: Reuse existing signed URL generation

- Spread preview images via R2 signed URLs
- 4-hour TTL (matches gallery pattern)
- Client never sees raw storage paths

---

## 6. Unknowns Resolved

| Unknown | Resolution | Source |
|---------|------------|--------|
| How do magic links work? | SHA-256 tokens, workspace-scoped, QR support | `magic_link_service.py` |
| Can comments be extended? | Yes, via JSONB `annotations` | `comments` table schema |
| WebSocket infrastructure? | Redis pub/sub, per-entity channels | `websocket_service.py` |
| PDF generation library? | reportlab already in use | `pdf_generator.py` |
| Notification patterns? | Event catalog + templates | notifications-service |
| Album data model? | Defined in `album_designer.json` | Technical specs |

---

## 7. References

| Document | Path |
|----------|------|
| Album Designer Spec | `docs/TechnicalSpecs/album_designer.json` |
| Digital Album Features | `docs/Features/DigitalAlbumFeatures.md` |
| Gallery Requirements | `docs/Features/GALLERY_REQUIREMENTS_ANALYSIS.md` |
| Magic Link Service | `backend/src/app/services/magic_link_service.py` |
| Comment Service | `backend/src/app/services/comment_service.py` |
| WebSocket Service | `backend/src/app/services/websocket_service.py` |
| Gallery Service WebSocket | `services/gallery-service/src/api/v1/websocket.py` |
| Notifications Service | `services/notifications-service/` |
| PDF Generator | `backend/src/app/utils/pdf_generator.py` |
