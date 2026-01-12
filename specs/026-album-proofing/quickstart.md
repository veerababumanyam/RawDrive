# Quickstart: Album Preview & Proofing

**Feature Branch**: `026-album-proofing`
**Created**: 2026-01-09

---

## Overview

This feature adds client-facing album proofing capabilities to RawDrive:

1. **Proofing Viewer** - Read-only album viewer with flipbook mode
2. **Positioned Comments** - Click-to-place comment pins on spreads
3. **Approval Workflow** - "Approve to Print" with confirmation
4. **Version Control** - Snapshots, comparison, rollback
5. **Preview PDF** - Watermarked download for offline review

---

## Prerequisites

- Docker stack running (PostgreSQL, Redis)
- Backend API server running
- Gallery service running (for WebSocket infrastructure)
- Notifications service running (for alerts)

```bash
# Start infrastructure
docker compose -f infrastructure/docker/docker-compose.yml up -d

# Start services
cd backend && uvicorn app.main:app --reload --port 8000
bash scripts/dev-gallery-service.sh  # Port 8004
```

---

## Database Setup

### Run Migrations

Create migration for album tables:

```bash
cd backend
alembic revision --autogenerate -m "Add album proofing tables"
alembic upgrade head
```

### Tables Created

| Table | Purpose |
|-------|---------|
| `albums` | Core album entity |
| `album_spreads` | Spread pages |
| `album_elements` | Design elements on spreads |
| `album_versions` | Version snapshots |
| `album_comments` | Positioned comments |
| `album_renders` | PDF generation records |

---

## API Endpoints

### Authenticated Routes (Photographer)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/workspaces/{ws}/albums` | List albums |
| POST | `/api/v1/workspaces/{ws}/albums` | Create album |
| GET | `/api/v1/workspaces/{ws}/albums/{id}` | Get album detail |
| PATCH | `/api/v1/workspaces/{ws}/albums/{id}` | Update album |
| POST | `/api/v1/workspaces/{ws}/albums/{id}/send-proof` | Send to client |
| POST | `/api/v1/workspaces/{ws}/albums/{id}/versions` | Create snapshot |
| POST | `/api/v1/workspaces/{ws}/albums/{id}/renders` | Generate PDF |

### Public Routes (Client via Share Link)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/public/albums/{token}` | View album proof |
| POST | `/api/v1/public/albums/{token}/comments` | Add comment |
| POST | `/api/v1/public/albums/{token}/approve` | Approve album |
| GET | `/api/v1/public/albums/{token}/download` | Download PDF |

---

## Quick Test Flow

### 1. Create Album (Photographer)

```bash
curl -X POST http://localhost:8000/api/v1/workspaces/${WORKSPACE_ID}/albums \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Smith Wedding Album",
    "gallery_id": "optional-gallery-uuid",
    "page_size": "12x36"
  }'
```

### 2. Send Proof to Client

```bash
curl -X POST http://localhost:8000/api/v1/workspaces/${WORKSPACE_ID}/albums/${ALBUM_ID}/send-proof \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "client_email": "client@example.com",
    "client_name": "John Smith",
    "message": "Please review your album!",
    "expires_in_days": 30
  }'
```

Response:
```json
{
  "share_link": "https://app.rawdrive.com/album/abc123token",
  "expires_at": "2026-02-09T00:00:00Z",
  "notification_sent": true
}
```

### 3. Client Views Album

```bash
curl http://localhost:8000/api/v1/public/albums/abc123token
```

Response includes spreads with signed URLs and permissions.

### 4. Client Adds Comment

```bash
curl -X POST http://localhost:8000/api/v1/public/albums/abc123token/comments \
  -H "Content-Type: application/json" \
  -d '{
    "spread_id": "spread-uuid",
    "body": "Please swap this photo",
    "position_x": 42.5,
    "position_y": 63.2,
    "author_name": "John Smith",
    "author_email": "client@example.com"
  }'
```

### 5. Client Approves Album

```bash
curl -X POST http://localhost:8000/api/v1/public/albums/abc123token/approve \
  -H "Content-Type: application/json" \
  -d '{
    "client_name": "John Smith",
    "client_email": "client@example.com"
  }'
```

---

## Frontend Components

### New Components to Create

```
frontend/src/components/features/album-proofing/
├── AlbumProofViewer.tsx       # Main viewer container
├── SpreadViewer.tsx           # Individual spread display
├── SpreadThumbnailStrip.tsx   # Navigation thumbnails
├── FlipbookViewer.tsx         # Animated page turns
├── CommentPin.tsx             # Positioned comment marker
├── CommentPinPopover.tsx      # Comment input/display
├── CommentThread.tsx          # Threaded replies
├── ApprovalDialog.tsx         # Confirmation modal
├── ApprovalBadge.tsx          # Status indicator
├── VersionHistory.tsx         # Version list sidebar
├── VersionComparison.tsx      # Side-by-side diff
└── PreviewDownloadButton.tsx  # PDF download trigger
```

### New Hooks

```
frontend/src/hooks/
├── useAlbumProof.ts           # Fetch album via share token
├── useAlbumComments.ts        # Comment CRUD
├── useAlbumVersions.ts        # Version management
└── useAlbumWebSocket.ts       # Real-time updates
```

### New Services

```
frontend/src/services/
├── albumProofingService.ts    # API client for public routes
└── albumService.ts            # API client for authenticated routes
```

---

## WebSocket Events

### Channel

```
album:{album_id}:proofing
```

### Event Types

| Event | Payload | Description |
|-------|---------|-------------|
| `album:comment_added` | `{ comment_id, spread_id, author_name }` | New comment |
| `album:comment_replied` | `{ comment_id, parent_id }` | Reply added |
| `album:comment_resolved` | `{ comment_id }` | Status changed |
| `album:approved` | `{ approved_by, approved_at }` | Client approved |
| `album:version_created` | `{ version_id, label }` | New snapshot |
| `album:spread_updated` | `{ spread_id }` | Design changed |

---

## Notification Events

### New Event Types

| Event | Channel | Transactional |
|-------|---------|---------------|
| `album.proof_sent` | Email | Yes |
| `album.comment_added` | Email, In-App | No |
| `album.comment_replied` | Email, In-App | No |
| `album.changes_requested` | Email | Yes |
| `album.approved` | Email, In-App | Yes |

---

## Testing

### Run Tests

```bash
# Backend unit tests
cd backend
pytest tests/unit/services/test_album_service.py -v

# Backend integration tests
pytest tests/integration/api/test_album_api.py -v

# Frontend component tests
cd frontend
npm test -- --grep "AlbumProofViewer"
```

### Test Coverage Targets

| Area | Target |
|------|--------|
| Album Service | 85% |
| Album API | 85% |
| Comment Service | 85% |
| UI Components | 70% |

---

## Development Workflow

### Branch Strategy

```bash
git checkout -b 026-album-proofing
# Make changes
git commit -m "feat(album): add proofing viewer"
git push -u origin 026-album-proofing
```

### Commit Convention

```
feat(album): add proofing viewer with flipbook mode
feat(album): add positioned comment pins
feat(album): add approval workflow
fix(album): handle expired share links gracefully
```

---

## Key Files Reference

| Purpose | Path |
|---------|------|
| **Spec** | `specs/026-album-proofing/spec.md` |
| **Data Model** | `specs/026-album-proofing/data-model.md` |
| **API Contract** | `specs/026-album-proofing/contracts/album-proofing-api.yaml` |
| **Research** | `specs/026-album-proofing/research.md` |
| **Magic Link Service** | `backend/src/app/services/magic_link_service.py` |
| **Comment Service** | `backend/src/app/services/comment_service.py` |
| **WebSocket Service** | `backend/src/app/services/websocket_service.py` |
| **Gallery Proofing Mode** | `frontend/src/components/features/gallery/ProofingMode.tsx` |

---

## Debugging

### Common Issues

**Share link returns 403**
- Check token expiration in `magic_links` table
- Verify `access_count < max_accesses`
- Confirm `status = 'active'`

**Comments not appearing**
- Check `workspace_id` matches
- Verify `deleted = FALSE`
- Check position values are 0-100

**PDF generation stuck**
- Check Celery worker logs
- Verify R2 credentials
- Check album has spreads

### Logging

```python
# Enable debug logging for album operations
import logging
logging.getLogger("app.services.album").setLevel(logging.DEBUG)
```

---

## Next Steps

After implementation:

1. Run `/speckit.tasks` to generate task breakdown
2. Follow task order for incremental delivery
3. Run tests after each story completion
4. Update documentation in `docs/Features/`
