# Data Model: Client Favorites System

**Feature**: 012-client-favorites
**Date**: December 29, 2025
**Migration**: 0053_client_favorites.py

## Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│   workspaces    │       │    galleries    │       │     assets      │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ workspace_id PK │◄──────│ workspace_id FK │       │ asset_id PK     │
│ ...             │       │ gallery_id PK   │       │ workspace_id FK │
└─────────────────┘       │ ...             │       │ ...             │
                          └────────┬────────┘       └────────┬────────┘
                                   │                         │
                                   │                         │
         ┌─────────────────────────┼─────────────────────────┘
         │                         │
         ▼                         ▼
┌─────────────────┐       ┌─────────────────┐
│  favorite_lists │       │gallery_assets   │
├─────────────────┤       ├─────────────────┤
│ list_id PK      │       │ gallery_asset_id│
│ workspace_id FK │       │ workspace_id FK │
│ gallery_id FK   │       │ gallery_id FK   │
│ client_token    │       │ asset_id FK     │
│ name            │       │ is_favorited    │
│ is_default      │       │ favorites_count │
│ sort_order      │       └────────┬────────┘
│ created_at      │                │
│ updated_at      │                │
└────────┬────────┘                │
         │                         │
         │    ┌────────────────────┘
         │    │
         ▼    ▼
┌─────────────────────────┐
│   client_interactions   │
├─────────────────────────┤
│ interaction_id PK       │
│ workspace_id FK         │
│ gallery_id FK           │
│ asset_id FK             │
│ list_id FK (NEW)        │◄── Links to favorite_lists
│ type                    │
│ actor JSONB             │
│ payload JSONB           │
│ created_at              │
└─────────────────────────┘
         │
         │
         ▼
┌─────────────────┐       ┌─────────────────┐
│ favorite_shares │       │favorite_downloads│
├─────────────────┤       ├─────────────────┤
│ share_id PK     │       │ download_id PK  │
│ list_id FK      │       │ list_id FK      │
│ share_token     │       │ status          │
│ expires_at      │       │ progress        │
│ access_count    │       │ file_size_bytes │
│ created_at      │       │ download_url    │
│ last_accessed_at│       │ error_message   │
└─────────────────┘       │ expires_at      │
                          │ created_at      │
                          │ completed_at    │
                          └─────────────────┘
```

## New Tables

### favorite_lists

Stores named collections of favorites per client per gallery.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `list_id` | UUID | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `workspace_id` | UUID | FK workspaces, NOT NULL | Tenant isolation |
| `gallery_id` | UUID | FK galleries, NOT NULL | Parent gallery |
| `client_token` | VARCHAR(255) | NOT NULL | Identifies the client (visitor_id) |
| `name` | VARCHAR(50) | NOT NULL | User-defined list name |
| `is_default` | BOOLEAN | DEFAULT FALSE | Cannot be deleted if true |
| `sort_order` | INTEGER | DEFAULT 0 | Display ordering |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Last modification |

**Constraints**:
- `UNIQUE(gallery_id, client_token, name)` - One list per name per client per gallery

**Indexes**:
- `idx_fl_gallery_client` on `(gallery_id, client_token)` - List lookup

### favorite_shares

Stores shareable links for favorite lists.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `share_id` | UUID | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `list_id` | UUID | FK favorite_lists, NOT NULL | Parent list |
| `share_token` | VARCHAR(64) | UNIQUE, NOT NULL | Public share token |
| `expires_at` | TIMESTAMPTZ | NULL | Optional expiration |
| `access_count` | INTEGER | DEFAULT 0 | View counter |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| `last_accessed_at` | TIMESTAMPTZ | NULL | Last view timestamp |

**Indexes**:
- `idx_fs_token` on `(share_token)` - Token lookup
- `idx_fs_list` on `(list_id)` - List's shares

### favorite_downloads

Tracks ZIP download requests and their status.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `download_id` | UUID | PK, DEFAULT gen_random_uuid() | Unique identifier |
| `list_id` | UUID | FK favorite_lists, NOT NULL | Source list |
| `status` | VARCHAR(20) | DEFAULT 'pending' | pending, processing, completed, failed |
| `progress` | INTEGER | DEFAULT 0 | 0-100 percentage |
| `file_size_bytes` | BIGINT | NULL | Final ZIP size |
| `download_url` | TEXT | NULL | Presigned URL when ready |
| `error_message` | TEXT | NULL | Error details if failed |
| `expires_at` | TIMESTAMPTZ | NULL | URL expiration |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Request timestamp |
| `completed_at` | TIMESTAMPTZ | NULL | Completion timestamp |

**Indexes**:
- `idx_fd_list_status` on `(list_id, status)` - Status queries

## Modified Tables

### client_interactions

Add foreign key to link interactions to specific lists.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `list_id` | UUID | FK favorite_lists, NULL | Optional list association |

**Migration**:
```sql
ALTER TABLE client_interactions
ADD COLUMN list_id UUID REFERENCES favorite_lists(list_id) ON DELETE SET NULL;

CREATE INDEX idx_ci_list ON client_interactions(list_id) WHERE list_id IS NOT NULL;
```

## Materialized View

### gallery_favorites_summary

Pre-aggregated favorite counts for photographer dashboard.

```sql
CREATE MATERIALIZED VIEW gallery_favorites_summary AS
SELECT
    ga.workspace_id,
    ga.gallery_id,
    ga.asset_id,
    a.original_object_key,
    COUNT(DISTINCT ci.actor->>'visitor_id') AS unique_favorite_count,
    MAX(ci.created_at) AS last_favorited_at
FROM gallery_assets ga
JOIN assets a ON ga.asset_id = a.asset_id
LEFT JOIN client_interactions ci
    ON ga.gallery_id = ci.gallery_id
    AND ga.asset_id = ci.asset_id
    AND ci.type = 'favorite'
WHERE ga.visible = TRUE AND a.deleted = FALSE
GROUP BY ga.workspace_id, ga.gallery_id, ga.asset_id, a.original_object_key;

CREATE UNIQUE INDEX idx_gfs_gallery_asset ON gallery_favorites_summary(gallery_id, asset_id);
CREATE INDEX idx_gfs_workspace_count ON gallery_favorites_summary(workspace_id, unique_favorite_count DESC);
```

**Refresh Strategy**:
- Manual refresh via API endpoint
- Auto-refresh on gallery publish (eventual)
- Stale data acceptable for dashboard use

## Data Types (Python/Pydantic)

```python
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field

class FavoriteList(BaseModel):
    """A named collection of favorited photos."""
    list_id: UUID
    workspace_id: UUID
    gallery_id: UUID
    client_token: str
    name: str = Field(max_length=50)
    is_default: bool = False
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime

class FavoriteShare(BaseModel):
    """A shareable link to a favorites list."""
    share_id: UUID
    list_id: UUID
    share_token: str = Field(max_length=64)
    expires_at: Optional[datetime] = None
    access_count: int = 0
    created_at: datetime
    last_accessed_at: Optional[datetime] = None

class FavoriteDownload(BaseModel):
    """A ZIP download request."""
    download_id: UUID
    list_id: UUID
    status: str  # pending, processing, completed, failed
    progress: int = Field(ge=0, le=100, default=0)
    file_size_bytes: Optional[int] = None
    download_url: Optional[str] = None
    error_message: Optional[str] = None
    expires_at: Optional[datetime] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
```

## Data Types (TypeScript)

```typescript
export interface FavoriteList {
  list_id: string;
  workspace_id: string;
  gallery_id: string;
  client_token: string;
  name: string;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  photo_count?: number;  // Computed field
}

export interface FavoriteShare {
  share_id: string;
  list_id: UUID;
  share_token: string;
  share_url: string;  // Full URL computed client-side
  expires_at?: string;
  access_count: number;
  created_at: string;
}

export interface FavoriteDownload {
  download_id: string;
  list_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  file_size_bytes?: number;
  download_url?: string;
  error_message?: string;
  expires_at?: string;
  created_at: string;
  completed_at?: string;
}

export interface FavoriteItem {
  asset_id: string;
  list_id: string;
  thumbnail_url: string;
  filename: string;
  width: number;
  height: number;
  favorited_at: string;
}

export interface GalleryFavoritesSummary {
  asset_id: string;
  filename: string;
  thumbnail_url: string;
  unique_favorite_count: number;
  last_favorited_at: string;
}
```

## Migration Script

```python
"""Add favorite lists and sharing tables.

Revision ID: 0053
Revises: 0052
Create Date: 2025-12-29
"""

from alembic import op

revision = "0053"
down_revision = "0052"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # favorite_lists table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS favorite_lists (
            list_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
            gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,
            client_token VARCHAR(255) NOT NULL,
            name VARCHAR(50) NOT NULL,
            is_default BOOLEAN DEFAULT FALSE,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(gallery_id, client_token, name)
        );
        """
    )

    # favorite_shares table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS favorite_shares (
            share_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            list_id UUID NOT NULL REFERENCES favorite_lists(list_id) ON DELETE CASCADE,
            share_token VARCHAR(64) NOT NULL UNIQUE,
            expires_at TIMESTAMPTZ,
            access_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_accessed_at TIMESTAMPTZ
        );
        """
    )

    # favorite_downloads table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS favorite_downloads (
            download_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            list_id UUID NOT NULL REFERENCES favorite_lists(list_id) ON DELETE CASCADE,
            status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
            progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
            file_size_bytes BIGINT,
            download_url TEXT,
            error_message TEXT,
            expires_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            completed_at TIMESTAMPTZ
        );
        """
    )

    # Add list_id to client_interactions
    op.execute(
        """
        ALTER TABLE client_interactions
        ADD COLUMN IF NOT EXISTS list_id UUID REFERENCES favorite_lists(list_id) ON DELETE SET NULL;
        """
    )

    # Indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_fl_gallery_client ON favorite_lists(gallery_id, client_token);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_fl_workspace ON favorite_lists(workspace_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_fs_token ON favorite_shares(share_token);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_fs_list ON favorite_shares(list_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_fd_list_status ON favorite_downloads(list_id, status);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_ci_list ON client_interactions(list_id) WHERE list_id IS NOT NULL;")

    # Materialized view for photographer dashboard
    op.execute(
        """
        CREATE MATERIALIZED VIEW IF NOT EXISTS gallery_favorites_summary AS
        SELECT
            ga.workspace_id,
            ga.gallery_id,
            ga.asset_id,
            SUBSTRING(a.original_object_key FROM '[^/]+$') AS filename,
            COUNT(DISTINCT ci.actor->>'visitor_id') AS unique_favorite_count,
            MAX(ci.created_at) AS last_favorited_at
        FROM gallery_assets ga
        JOIN assets a ON ga.asset_id = a.asset_id
        LEFT JOIN client_interactions ci
            ON ga.gallery_id = ci.gallery_id
            AND ga.asset_id = ci.asset_id
            AND ci.type = 'favorite'
        WHERE ga.visible = TRUE AND a.deleted = FALSE
        GROUP BY ga.workspace_id, ga.gallery_id, ga.asset_id, a.original_object_key;
        """
    )
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_gfs_gallery_asset ON gallery_favorites_summary(gallery_id, asset_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_gfs_workspace_count ON gallery_favorites_summary(workspace_id, unique_favorite_count DESC);")


def downgrade() -> None:
    # Drop materialized view
    op.execute("DROP MATERIALIZED VIEW IF EXISTS gallery_favorites_summary;")

    # Drop indexes
    op.execute("DROP INDEX IF EXISTS idx_ci_list;")
    op.execute("DROP INDEX IF EXISTS idx_fd_list_status;")
    op.execute("DROP INDEX IF EXISTS idx_fs_list;")
    op.execute("DROP INDEX IF EXISTS idx_fs_token;")
    op.execute("DROP INDEX IF EXISTS idx_fl_workspace;")
    op.execute("DROP INDEX IF EXISTS idx_fl_gallery_client;")

    # Remove list_id from client_interactions
    op.execute("ALTER TABLE client_interactions DROP COLUMN IF EXISTS list_id;")

    # Drop tables in reverse order
    op.execute("DROP TABLE IF EXISTS favorite_downloads;")
    op.execute("DROP TABLE IF EXISTS favorite_shares;")
    op.execute("DROP TABLE IF EXISTS favorite_lists;")
```

## Validation Rules

| Entity | Field | Rule |
|--------|-------|------|
| FavoriteList | name | 1-50 characters, trimmed, unique per client+gallery |
| FavoriteList | client_token | Must match actor.visitor_id from request |
| FavoriteShare | share_token | 43 characters (256-bit base64url) |
| FavoriteDownload | progress | 0-100 integer |
| All | workspace_id | Must match authenticated workspace |
