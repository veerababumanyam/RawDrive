# Research: Client Favorites System

**Feature**: 012-client-favorites
**Date**: December 29, 2025
**Status**: Complete

## Overview

This document captures technical research and decisions for implementing the Client Favorites System. All NEEDS CLARIFICATION items from the spec have been resolved through codebase exploration.

## Existing Infrastructure Analysis

### Current Favorites Implementation

The codebase already has partial favorites support:

1. **Database Tables**
   - `client_interactions` table (migration 0002) stores favorite events with:
     - `type = 'favorite'` for favorite actions
     - `actor` JSONB for visitor/client identification
     - Per-asset, per-gallery tracking
   - `gallery_assets` has `is_favorited` boolean and `favorites_count` integer

2. **Backend Services**
   - `GalleryService.toggle_public_favorite()` - toggles favorite state
   - `GalleryService.get_filtered_public_assets()` - supports `filter_type='favorites'`
   - `ClientInteractionRequest` schema with `type='favorite'`

3. **Frontend Components**
   - `FilterType = 'all' | 'picks' | 'favorites' | 'selections'` in types
   - 45 files reference favorites functionality
   - `HoverOverlay.tsx`, `PhotoCard.tsx` have favorite button placeholders

4. **Missing for Spec Requirements**
   - No favorite lists (multiple collections)
   - No share link generation
   - No ZIP download for favorites
   - No photographer aggregate view
   - Client token persistence needs enhancement

### Client Identification

**Current Mechanism**:
- Visitors identified via JSONB `actor` field in `client_interactions`
- Contains `visitor_id`, optional `email`, `user_agent`
- Token stored in browser localStorage/sessionStorage

**Enhancement Needed**:
- Persist client token across sessions (spec FR-003, FR-006)
- Associate token with email when visitor registers (existing `VisitorRegisterRequest`)
- Sync favorites across devices (spec FR-006) - achieved via email association

### ZIP Download Patterns

**Existing in Codebase**:
- `DataExportService` handles user data exports
- `R2StorageService` has presigned URL generation
- No streaming ZIP implementation exists

**Recommended Approach**:
```python
# python-zipstream-ng for memory-efficient streaming
from zipstream import ZipFile, ZIP_DEFLATED

async def generate_favorites_zip(favorites: list[Asset]) -> AsyncGenerator:
    zf = ZipFile(mode='w', compression=ZIP_DEFLATED)
    for asset in favorites:
        presigned = await storage.get_download_url(asset.object_key)
        zf.write_iter(asset.filename, stream_from_url(presigned))
    async for chunk in zf:
        yield chunk
```

## Technical Decisions

### TD-001: Favorite Lists Data Model

**Decision**: Create new `favorite_lists` table linked to `client_interactions`

**Rationale**:
- Spec requires multiple named lists per client per gallery
- Current `client_interactions` has no list concept
- Adding `list_id` FK to `client_interactions` maintains existing pattern

**Schema**:
```sql
CREATE TABLE favorite_lists (
    list_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id),
    gallery_id UUID NOT NULL REFERENCES galleries(gallery_id),
    client_token VARCHAR(255) NOT NULL,  -- Links to actor.visitor_id
    name VARCHAR(50) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(gallery_id, client_token, name)
);

-- Add list_id to client_interactions
ALTER TABLE client_interactions
ADD COLUMN list_id UUID REFERENCES favorite_lists(list_id);
```

### TD-002: Share Link Security

**Decision**: Use cryptographically secure random tokens with optional expiration

**Rationale**:
- Spec FR-023 requires shareable links
- Spec FR-024 requires read-only access
- Must not expose internal IDs

**Implementation**:
```python
import secrets

def generate_share_token() -> str:
    return secrets.token_urlsafe(32)  # 256-bit entropy
```

**Schema**:
```sql
CREATE TABLE favorite_shares (
    share_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES favorite_lists(list_id),
    share_token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ,  -- Optional expiration
    access_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ
);
```

### TD-003: ZIP Generation Strategy

**Decision**: Background job with presigned download URL

**Rationale**:
- Large galleries (100+ photos) exceed HTTP timeout limits
- Spec SC-003 requires <30s for 100 photos
- User needs progress visibility (spec FR-016)

**Flow**:
1. Client requests ZIP for favorites/list
2. Backend creates job in `favorite_downloads` table
3. Worker streams ZIP to R2 temporary bucket
4. Worker updates job status to `completed` with presigned URL
5. Client polls for status, downloads when ready
6. R2 lifecycle rule deletes after 24 hours

**Schema**:
```sql
CREATE TABLE favorite_downloads (
    download_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    list_id UUID NOT NULL REFERENCES favorite_lists(list_id),
    status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed, failed
    progress INTEGER DEFAULT 0,  -- 0-100
    file_size_bytes BIGINT,
    download_url TEXT,  -- Presigned URL when completed
    error_message TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
```

### TD-004: Photographer Aggregate View

**Decision**: Materialized view refreshed on-demand with manual refresh option

**Rationale**:
- Spec FR-019-22 requires aggregate favorite counts
- Real-time accuracy not critical (photographer view)
- Avoid expensive queries on every page load

**Implementation**:
```sql
CREATE MATERIALIZED VIEW gallery_favorites_summary AS
SELECT
    ga.workspace_id,
    ga.gallery_id,
    ga.asset_id,
    COUNT(DISTINCT ci.actor->>'visitor_id') as unique_favorite_count,
    MAX(ci.created_at) as last_favorited_at
FROM gallery_assets ga
LEFT JOIN client_interactions ci
    ON ga.gallery_id = ci.gallery_id
    AND ga.asset_id = ci.asset_id
    AND ci.type = 'favorite'
GROUP BY ga.workspace_id, ga.gallery_id, ga.asset_id;

CREATE UNIQUE INDEX idx_gfs_gallery_asset ON gallery_favorites_summary(gallery_id, asset_id);
```

### TD-005: Default Favorites List

**Decision**: Auto-create default list on first favorite, make it undeletable

**Rationale**:
- Spec FR-008 requires default "Favorites" list that cannot be deleted
- Avoids empty state issues
- Maintains backwards compatibility with existing favorites

**Implementation**:
- Create default list when client first favorites any photo
- `is_default = TRUE` prevents deletion via API constraint
- Default list has `name = 'Favorites'` (localized client-side)

## Performance Considerations

### Indexes Required

```sql
-- favorite_lists
CREATE INDEX idx_fl_gallery_client ON favorite_lists(gallery_id, client_token);

-- client_interactions (extend existing)
CREATE INDEX idx_ci_list ON client_interactions(list_id) WHERE list_id IS NOT NULL;

-- favorite_shares
CREATE INDEX idx_fs_token ON favorite_shares(share_token);

-- favorite_downloads
CREATE INDEX idx_fd_list_status ON favorite_downloads(list_id, status);
```

### Caching Strategy

| Data | Cache Key | TTL | Invalidation |
|------|-----------|-----|--------------|
| Client's lists | `fav:lists:{gallery_id}:{client_token}` | 5 min | On list CRUD |
| List favorites | `fav:items:{list_id}` | 1 min | On favorite toggle |
| Share link metadata | `fav:share:{share_token}` | 10 min | On share update |
| Gallery favorites summary | Materialized view | On-demand | Manual refresh |

## API Endpoint Summary

### Client-Facing (Public Gallery Context)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/public/galleries/{id}/favorites` | Toggle favorite |
| GET | `/public/galleries/{id}/favorites` | List my favorites |
| GET | `/public/galleries/{id}/favorites/lists` | List my favorite lists |
| POST | `/public/galleries/{id}/favorites/lists` | Create new list |
| PATCH | `/public/galleries/{id}/favorites/lists/{list_id}` | Update list |
| DELETE | `/public/galleries/{id}/favorites/lists/{list_id}` | Delete list |
| POST | `/public/galleries/{id}/favorites/lists/{list_id}/photos` | Add to list |
| DELETE | `/public/galleries/{id}/favorites/lists/{list_id}/photos/{asset_id}` | Remove from list |
| POST | `/public/galleries/{id}/favorites/lists/{list_id}/share` | Generate share link |
| POST | `/public/galleries/{id}/favorites/lists/{list_id}/download` | Request ZIP |
| GET | `/public/galleries/{id}/favorites/downloads/{download_id}` | Check download status |

### Photographer Dashboard

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/workspaces/{id}/galleries/{id}/favorites/analytics` | Aggregate favorites view |
| GET | `/workspaces/{id}/galleries/{id}/favorites/export` | Export CSV of favorites |

### Shared Favorites (Public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/shared/favorites/{share_token}` | View shared favorites |

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ZIP generation timeout | Medium | Medium | Background job + polling |
| Client token collision | Low | High | UUID + validation on conflict |
| Storage costs (temp ZIPs) | Low | Low | 24h lifecycle, size limits |
| Share link abuse | Low | Medium | Rate limiting, optional expiry |

## Open Questions Resolved

1. **Q**: How to identify clients across sessions without login?
   **A**: Persist `visitor_id` token in localStorage, associate with email via `VisitorRegisterRequest`

2. **Q**: How to handle deleted photos in favorites?
   **A**: Keep favorite record, show "Photo no longer available" placeholder (per spec edge case)

3. **Q**: How to enforce download limits?
   **A**: Track in `favorite_downloads` table, check against gallery settings

4. **Q**: How to handle gallery expiration?
   **A**: Check `galleries.expires_at` before serving favorites, return 410 Gone with message

## Dependencies

- **python-zipstream-ng**: Streaming ZIP generation
- **secrets**: Python stdlib for secure token generation
- Existing: asyncpg, FastAPI, React, TailwindCSS
