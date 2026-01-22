# Data Model: Pro Review Mode & Desktop Sync

**Feature**: 029-pro-review-xmp-sync | **Date**: 2026-01-22 | **Phase**: 1

## Overview

This document defines the database schema changes required for the Pro Review Mode and Desktop Sync feature. Changes are organized into three migrations to allow incremental deployment.

## Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│     Workspace    │       │      Gallery     │       │      Asset       │
│──────────────────│       │──────────────────│       │──────────────────│
│ id (PK)          │──┐    │ id (PK)          │──┐    │ id (PK)          │
│ name             │  │    │ workspace_id (FK)│  │    │ gallery_id (FK)  │
│ ...              │  │    │ name             │  │    │ workspace_id (FK)│
└──────────────────┘  │    │ ...              │  │    │ filename         │
                      │    └──────────────────┘  │    │ rating      NEW  │
                      │             │            │    │ flag        NEW  │
                      │             │            │    │ color_label NEW  │
                      │             ▼            │    │ ...              │
                      │    ┌──────────────────┐  │    └──────────────────┘
                      │    │   SyncApiKey     │  │             │
                      │    │──────────────────│  │             │
                      │    │ id (PK)          │  │             ▼
                      └───▶│ workspace_id (FK)│  │    ┌──────────────────┐
                           │ gallery_id (FK)  │◀─┘    │  SyncAuditLog    │
                           │ key_hash         │       │──────────────────│
                           │ name             │       │ id (PK)          │
                           │ permissions      │       │ workspace_id (FK)│
                           │ last_used_at     │       │ gallery_id (FK)  │
                           │ expires_at       │       │ api_key_id (FK)  │
                           │ is_active        │       │ action           │
                           │ created_at       │       │ asset_ids        │
                           └──────────────────┘       │ ip_address       │
                                    │                 │ user_agent       │
                                    │                 │ created_at       │
                                    └────────────────▶└──────────────────┘

┌──────────────────┐
│  FolderMapping   │ (Desktop app local storage - not in PostgreSQL)
│──────────────────│
│ id (PK)          │
│ local_path       │
│ gallery_id       │
│ api_key_id       │
│ sync_direction   │
│ last_sync_at     │
│ created_at       │
└──────────────────┘
```

---

## Migration 1: Asset Rating & Flag Columns

**File**: `backend/migrations/versions/0169_add_asset_rating_flag.py`

### Schema Changes

```sql
-- Add rating, flag, and color_label columns to assets table
ALTER TABLE assets
ADD COLUMN rating SMALLINT DEFAULT NULL
    CHECK (rating IS NULL OR (rating >= 0 AND rating <= 5)),
ADD COLUMN flag VARCHAR(10) DEFAULT NULL
    CHECK (flag IS NULL OR flag IN ('pick', 'unflagged', 'reject')),
ADD COLUMN color_label VARCHAR(10) DEFAULT NULL
    CHECK (color_label IS NULL OR color_label IN ('none', 'red', 'yellow', 'green', 'blue', 'purple'));

-- Index for filtering by rating in galleries
CREATE INDEX idx_assets_gallery_rating ON assets (gallery_id, rating)
    WHERE rating IS NOT NULL;

-- Index for filtering by flag in galleries
CREATE INDEX idx_assets_gallery_flag ON assets (gallery_id, flag)
    WHERE flag IS NOT NULL;

-- Index for filtering by color label in galleries
CREATE INDEX idx_assets_gallery_color_label ON assets (gallery_id, color_label)
    WHERE color_label IS NOT NULL;

-- Comment on columns
COMMENT ON COLUMN assets.rating IS 'Star rating 0-5 (Lightroom compatible: 0=unrated, 1-5=stars)';
COMMENT ON COLUMN assets.flag IS 'Pick status: pick, unflagged, reject (Lightroom P/U/X)';
COMMENT ON COLUMN assets.color_label IS 'Color label: none, red, yellow, green, blue, purple';
```

### SQLAlchemy Model Update

```python
# backend/src/app/models/asset.py

class Asset(Base):
    __tablename__ = "assets"

    # ... existing columns ...

    # NEW: Review Mode metadata
    rating: Mapped[Optional[int]] = mapped_column(
        SmallInteger,
        CheckConstraint('rating IS NULL OR (rating >= 0 AND rating <= 5)'),
        nullable=True,
        default=None,
        comment="Star rating 0-5 (Lightroom compatible)"
    )
    flag: Mapped[Optional[str]] = mapped_column(
        String(10),
        CheckConstraint("flag IS NULL OR flag IN ('pick', 'unflagged', 'reject')"),
        nullable=True,
        default=None,
        comment="Pick status: pick, unflagged, reject"
    )
    color_label: Mapped[Optional[str]] = mapped_column(
        String(10),
        CheckConstraint("color_label IS NULL OR color_label IN ('none', 'red', 'yellow', 'green', 'blue', 'purple')"),
        nullable=True,
        default=None,
        comment="Color label for organization"
    )
```

### Alembic Migration

```python
# backend/migrations/versions/0169_add_asset_rating_flag.py

"""Add rating, flag, and color_label columns to assets

Revision ID: 0169
Revises: 0168
Create Date: 2026-01-22
"""
from alembic import op
import sqlalchemy as sa

revision = '0169'
down_revision = '0168'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add columns
    op.add_column('assets', sa.Column(
        'rating',
        sa.SmallInteger(),
        nullable=True,
        comment='Star rating 0-5 (Lightroom compatible)'
    ))
    op.add_column('assets', sa.Column(
        'flag',
        sa.String(10),
        nullable=True,
        comment='Pick status: pick, unflagged, reject'
    ))
    op.add_column('assets', sa.Column(
        'color_label',
        sa.String(10),
        nullable=True,
        comment='Color label for organization'
    ))

    # Add check constraints
    op.create_check_constraint(
        'ck_assets_rating_range',
        'assets',
        'rating IS NULL OR (rating >= 0 AND rating <= 5)'
    )
    op.create_check_constraint(
        'ck_assets_flag_values',
        'assets',
        "flag IS NULL OR flag IN ('pick', 'unflagged', 'reject')"
    )
    op.create_check_constraint(
        'ck_assets_color_label_values',
        'assets',
        "color_label IS NULL OR color_label IN ('none', 'red', 'yellow', 'green', 'blue', 'purple')"
    )

    # Add partial indexes for filtering
    op.create_index(
        'idx_assets_gallery_rating',
        'assets',
        ['gallery_id', 'rating'],
        postgresql_where=sa.text('rating IS NOT NULL')
    )
    op.create_index(
        'idx_assets_gallery_flag',
        'assets',
        ['gallery_id', 'flag'],
        postgresql_where=sa.text('flag IS NOT NULL')
    )
    op.create_index(
        'idx_assets_gallery_color_label',
        'assets',
        ['gallery_id', 'color_label'],
        postgresql_where=sa.text('color_label IS NOT NULL')
    )


def downgrade() -> None:
    op.drop_index('idx_assets_gallery_color_label')
    op.drop_index('idx_assets_gallery_flag')
    op.drop_index('idx_assets_gallery_rating')
    op.drop_constraint('ck_assets_color_label_values', 'assets')
    op.drop_constraint('ck_assets_flag_values', 'assets')
    op.drop_constraint('ck_assets_rating_range', 'assets')
    op.drop_column('assets', 'color_label')
    op.drop_column('assets', 'flag')
    op.drop_column('assets', 'rating')
```

---

## Migration 2: Sync API Keys Table

**File**: `backend/migrations/versions/0170_add_sync_api_keys.py`

### Schema

```sql
-- Create sync_api_keys table
CREATE TABLE sync_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    key_hash VARCHAR(64) NOT NULL,  -- SHA-256 hash, never store plaintext
    key_prefix VARCHAR(20) NOT NULL, -- First 20 chars for identification
    name VARCHAR(100) NOT NULL,      -- User-friendly name
    permissions JSONB NOT NULL DEFAULT '{"read": true, "write": true}',
    last_used_at TIMESTAMPTZ,
    last_used_ip INET,
    expires_at TIMESTAMPTZ,          -- NULL = never expires
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    revoked_at TIMESTAMPTZ,
    revoked_reason VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),

    -- Constraints
    CONSTRAINT uq_sync_api_keys_hash UNIQUE (key_hash),
    CONSTRAINT uq_sync_api_keys_prefix UNIQUE (key_prefix)
);

-- Indexes
CREATE INDEX idx_sync_api_keys_workspace ON sync_api_keys (workspace_id);
CREATE INDEX idx_sync_api_keys_gallery ON sync_api_keys (gallery_id);
CREATE INDEX idx_sync_api_keys_active ON sync_api_keys (workspace_id, is_active)
    WHERE is_active = TRUE;

-- Comments
COMMENT ON TABLE sync_api_keys IS 'API keys for desktop sync and XMP import/export';
COMMENT ON COLUMN sync_api_keys.key_hash IS 'SHA-256 hash of the API key';
COMMENT ON COLUMN sync_api_keys.key_prefix IS 'First 20 chars of key for identification in logs';
COMMENT ON COLUMN sync_api_keys.permissions IS 'JSON object: {read: bool, write: bool, delete: bool}';
```

### SQLAlchemy Model

```python
# services/gallery-service/src/models/sync_api_key.py

from datetime import datetime
from typing import Optional
from uuid import UUID
from sqlalchemy import String, Boolean, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import JSONB, INET
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class SyncApiKey(Base):
    __tablename__ = "sync_api_keys"

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    gallery_id: Mapped[UUID] = mapped_column(ForeignKey("galleries.id", ondelete="CASCADE"), nullable=False)

    key_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    permissions: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default={"read": True, "write": True, "delete": False}
    )

    last_used_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    last_used_ip: Mapped[Optional[str]] = mapped_column(INET, nullable=True)

    expires_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    revoked_at: Mapped[Optional[datetime]] = mapped_column(nullable=True)
    revoked_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"), nullable=False)
    created_by: Mapped[Optional[UUID]] = mapped_column(ForeignKey("users.id"), nullable=True)

    # Relationships
    workspace = relationship("Workspace", back_populates="sync_api_keys")
    gallery = relationship("Gallery", back_populates="sync_api_keys")
    audit_logs = relationship("SyncAuditLog", back_populates="api_key")

    __table_args__ = (
        Index('idx_sync_api_keys_workspace', 'workspace_id'),
        Index('idx_sync_api_keys_gallery', 'gallery_id'),
        Index(
            'idx_sync_api_keys_active',
            'workspace_id', 'is_active',
            postgresql_where=text('is_active = TRUE')
        ),
    )
```

### Pydantic Schemas

```python
# services/gallery-service/src/schemas/sync_api_key.py

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field


class SyncApiKeyPermissions(BaseModel):
    read: bool = True
    write: bool = True
    delete: bool = False


class SyncApiKeyCreate(BaseModel):
    gallery_id: UUID
    name: str = Field(..., min_length=1, max_length=100)
    permissions: SyncApiKeyPermissions = SyncApiKeyPermissions()
    expires_at: Optional[datetime] = None


class SyncApiKeyResponse(BaseModel):
    id: UUID
    gallery_id: UUID
    key_prefix: str
    name: str
    permissions: SyncApiKeyPermissions
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SyncApiKeyCreated(SyncApiKeyResponse):
    """Returned only on creation - includes the full key (shown once)"""
    api_key: str  # Full key, only shown once


class SyncApiKeyRevoke(BaseModel):
    reason: Optional[str] = Field(None, max_length=255)
```

---

## Migration 3: Sync Audit Log Table

**File**: `backend/migrations/versions/0171_add_sync_audit_log.py`

### Schema

```sql
-- Create sync_audit_log table for SOC2/GDPR compliance
CREATE TABLE sync_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES sync_api_keys(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    action VARCHAR(50) NOT NULL,  -- 'xmp_export', 'xmp_import', 'file_upload', 'file_delete', 'rating_update', 'flag_update'
    action_source VARCHAR(20) NOT NULL,  -- 'web', 'desktop_app', 'api'

    asset_count INTEGER,
    asset_ids UUID[],  -- Array of affected asset IDs (limited to first 100)

    request_details JSONB,  -- Additional context (file names, etc.)

    ip_address INET,
    user_agent TEXT,

    success BOOLEAN NOT NULL DEFAULT TRUE,
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX idx_sync_audit_log_workspace_time ON sync_audit_log (workspace_id, created_at DESC);
CREATE INDEX idx_sync_audit_log_gallery_time ON sync_audit_log (gallery_id, created_at DESC);
CREATE INDEX idx_sync_audit_log_api_key ON sync_audit_log (api_key_id, created_at DESC)
    WHERE api_key_id IS NOT NULL;
CREATE INDEX idx_sync_audit_log_action ON sync_audit_log (action, created_at DESC);

-- Partition by month for large-scale deployments (optional)
-- CREATE TABLE sync_audit_log_y2026m01 PARTITION OF sync_audit_log
--     FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- Comments
COMMENT ON TABLE sync_audit_log IS 'Audit trail for sync operations (SOC2/GDPR compliance)';
COMMENT ON COLUMN sync_audit_log.action IS 'Type of sync action performed';
COMMENT ON COLUMN sync_audit_log.action_source IS 'Origin: web, desktop_app, or api';
```

### SQLAlchemy Model

```python
# services/gallery-service/src/models/sync_audit_log.py

from datetime import datetime
from typing import Optional, List
from uuid import UUID
from sqlalchemy import String, Boolean, Integer, Text, ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import JSONB, INET, ARRAY, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class SyncAuditLog(Base):
    __tablename__ = "sync_audit_log"

    id: Mapped[UUID] = mapped_column(primary_key=True, server_default=text("gen_random_uuid()"))
    workspace_id: Mapped[UUID] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    gallery_id: Mapped[UUID] = mapped_column(ForeignKey("galleries.id", ondelete="CASCADE"), nullable=False)
    api_key_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("sync_api_keys.id", ondelete="SET NULL"), nullable=True)
    user_id: Mapped[Optional[UUID]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    action: Mapped[str] = mapped_column(String(50), nullable=False)
    action_source: Mapped[str] = mapped_column(String(20), nullable=False)

    asset_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    asset_ids: Mapped[Optional[List[UUID]]] = mapped_column(ARRAY(PGUUID), nullable=True)

    request_details: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)

    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    success: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"), nullable=False)

    # Relationships
    api_key = relationship("SyncApiKey", back_populates="audit_logs")

    __table_args__ = (
        Index('idx_sync_audit_log_workspace_time', 'workspace_id', 'created_at'),
        Index('idx_sync_audit_log_gallery_time', 'gallery_id', 'created_at'),
        Index(
            'idx_sync_audit_log_api_key',
            'api_key_id', 'created_at',
            postgresql_where=text('api_key_id IS NOT NULL')
        ),
        Index('idx_sync_audit_log_action', 'action', 'created_at'),
    )
```

### Audit Action Types

```python
# services/gallery-service/src/schemas/sync_audit.py

from enum import Enum


class SyncAuditAction(str, Enum):
    # XMP operations
    XMP_EXPORT = "xmp_export"
    XMP_IMPORT = "xmp_import"

    # File operations (desktop sync)
    FILE_UPLOAD = "file_upload"
    FILE_DELETE = "file_delete"
    FILE_RENAME = "file_rename"
    FILE_UPDATE = "file_update"

    # Metadata operations
    RATING_UPDATE = "rating_update"
    FLAG_UPDATE = "flag_update"
    COLOR_LABEL_UPDATE = "color_label_update"
    BATCH_METADATA_UPDATE = "batch_metadata_update"

    # API key operations
    API_KEY_CREATED = "api_key_created"
    API_KEY_REVOKED = "api_key_revoked"
    API_KEY_USED = "api_key_used"


class SyncAuditSource(str, Enum):
    WEB = "web"
    DESKTOP_APP = "desktop_app"
    API = "api"
```

---

## Desktop App Local Storage (SQLite)

The desktop app uses local SQLite for offline queue persistence:

```sql
-- ~/.rawdrive/sync.db (desktop app local storage)

CREATE TABLE folder_mappings (
    id TEXT PRIMARY KEY,
    local_path TEXT NOT NULL UNIQUE,
    gallery_id TEXT NOT NULL,
    gallery_name TEXT NOT NULL,
    api_key_id TEXT NOT NULL,
    sync_direction TEXT NOT NULL CHECK (sync_direction IN ('upload', 'download', 'bidirectional')),
    include_subfolders BOOLEAN NOT NULL DEFAULT TRUE,
    file_patterns TEXT,  -- JSON array of glob patterns, e.g., ["*.jpg", "*.raw"]
    last_sync_at TEXT,   -- ISO 8601 timestamp
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_mapping_id TEXT NOT NULL REFERENCES folder_mappings(id) ON DELETE CASCADE,
    local_path TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('upload', 'delete', 'rename', 'metadata_update')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
    priority INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    error_message TEXT,
    metadata TEXT,  -- JSON: {old_path, new_path, file_hash, etc.}
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    completed_at TEXT
);

CREATE TABLE sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_mapping_id TEXT NOT NULL,
    action TEXT NOT NULL,
    local_path TEXT NOT NULL,
    remote_asset_id TEXT,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    bytes_transferred INTEGER,
    duration_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX idx_sync_queue_status ON sync_queue (status, priority DESC, created_at ASC);
CREATE INDEX idx_sync_queue_folder ON sync_queue (folder_mapping_id, status);
CREATE INDEX idx_sync_history_folder ON sync_history (folder_mapping_id, created_at DESC);
```

---

## Data Retention & Cleanup

### Audit Log Retention
- **SOC2 requirement**: 1 year minimum retention
- **GDPR requirement**: Data minimization - only store what's necessary
- **Implementation**: Automated cleanup job deletes logs older than 2 years

```python
# Cleanup query (run weekly)
DELETE FROM sync_audit_log
WHERE created_at < NOW() - INTERVAL '2 years';
```

### Desktop Sync History
- Local sync history: 30 days retention
- Completed queue items: Deleted after 7 days

---

## Index Summary

| Table | Index | Purpose |
|-------|-------|---------|
| assets | idx_assets_gallery_rating | Filter by rating in gallery |
| assets | idx_assets_gallery_flag | Filter by flag in gallery |
| assets | idx_assets_gallery_color_label | Filter by color label |
| sync_api_keys | idx_sync_api_keys_workspace | List keys by workspace |
| sync_api_keys | idx_sync_api_keys_gallery | List keys by gallery |
| sync_api_keys | idx_sync_api_keys_active | Find active keys |
| sync_audit_log | idx_sync_audit_log_workspace_time | Audit queries by workspace |
| sync_audit_log | idx_sync_audit_log_gallery_time | Audit queries by gallery |
| sync_audit_log | idx_sync_audit_log_api_key | Audit queries by key |
| sync_audit_log | idx_sync_audit_log_action | Filter by action type |

---

**Data Model Status**: Complete
**Ready for Implementation**: Yes
**Last Updated**: 2026-01-22
