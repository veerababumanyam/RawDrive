# Data Model: Public Gallery Branding & Album Title

**Feature Branch**: `013-public-gallery-branding`
**Date**: 2025-12-29
**Status**: Complete

## Entity Changes

### Magic Link (Extended)

The `magic_links` table requires one new column to support custom album titles.

#### New Column

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `album_title` | VARCHAR(200) | NULLABLE | Client-facing album title displayed on public gallery page |

#### Complete Entity Definition

```sql
-- magic_links table (extended)
CREATE TABLE magic_links (
    -- Primary key
    link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Multi-tenant isolation
    workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

    -- Gallery association
    gallery_id UUID NOT NULL REFERENCES galleries(gallery_id) ON DELETE CASCADE,

    -- Security: SHA-256 hash of token (plaintext returned only on creation)
    token_hash VARCHAR(64) NOT NULL UNIQUE,

    -- Scoping
    target_type magic_link_target_type NOT NULL DEFAULT 'gallery',
    target_id UUID,

    -- Management
    label VARCHAR(100),                    -- Internal label for organizing links
    album_title VARCHAR(200),              -- NEW: Client-facing title for public display

    -- Access controls
    expires_at TIMESTAMPTZ,
    max_accesses INTEGER CHECK (max_accesses IS NULL OR max_accesses > 0),
    access_count INTEGER NOT NULL DEFAULT 0,

    -- Status
    status magic_link_status NOT NULL DEFAULT 'active',

    -- QR code settings
    qr_config JSONB NOT NULL DEFAULT '{"size": 1024, "color": null, "logo_enabled": true, "error_correction": "H"}'::jsonb,

    -- Stored public URL for sharing
    public_url TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL
);

COMMENT ON COLUMN magic_links.label IS
    'Internal label for workspace admins to organize and identify links';

COMMENT ON COLUMN magic_links.album_title IS
    'Client-facing album title displayed on public gallery page. Falls back to gallery title if NULL (backward compatibility).';
```

### Existing Entities (No Changes Required)

#### Company Profile (Reference Only)
The company profile already contains the `name` field needed for header branding:

```sql
-- company_profiles table (existing - no changes)
-- Key fields used:
--   name VARCHAR(200)      -- Company name to display in header
--   logo_url TEXT          -- Logo URL to display in header
--   brand_color VARCHAR(7) -- Used for theming
--   website TEXT           -- Used in footer
```

#### Gallery (Reference Only)
The gallery already has the cover photo field:

```sql
-- galleries table (existing - no changes)
-- Key fields used:
--   cover_asset_id UUID    -- Cover photo for hero section
--   title VARCHAR(200)     -- Fallback when album_title is NULL
--   description TEXT       -- Optional description in hero
```

## TypeScript Type Definitions

### MagicLink Interface (Extended)

```typescript
// frontend/src/types/gallery.ts

export interface MagicLink {
  link_id: string;
  gallery_id: string;
  label?: string;              // Internal management label
  album_title?: string;        // NEW: Client-facing album title
  target_type: MagicLinkTargetType;
  target_id?: string;
  status: MagicLinkStatus;
  expires_at?: string;
  max_accesses?: number;
  access_count: number;
  qr_config?: QRConfig;
  created_at: string;
  updated_at: string;
  token?: string;              // Only on creation
  url?: string;                // Only on creation
  public_url?: string;         // Stored in database
}

export interface CreateMagicLinkRequest {
  label?: string;              // Optional internal label
  album_title: string;         // NEW: Required client-facing title
  target_type?: MagicLinkTargetType;
  target_id?: string;
  expires_at?: string;
  max_accesses?: number;
  qr_config?: QRConfig;
}
```

### ValidateMagicLinkResponse (Backend)

```python
# backend/src/app/api/schemas.py

class ValidateMagicLinkResponse(BaseModel):
    """Response from validating a magic link token."""
    link_id: UUID
    gallery_id: UUID
    target_type: str
    target_id: Optional[UUID] = None
    album_title: Optional[str] = None    # NEW: Album title from magic link
    gallery: dict                         # Contains title as fallback
    company_profile: Optional[dict] = None
```

## Data Flow

### Creation Flow
```
User enters album_title in ShareDialog
    ↓
CreateMagicLinkRequest { album_title: "Sarah & John's Wedding" }
    ↓
Backend stores in magic_links.album_title
    ↓
Returns MagicLink with album_title
```

### Display Flow
```
Client visits public link
    ↓
Backend validates token → ValidateMagicLinkResponse
    ↓
Response includes:
  - album_title (from magic_links)
  - gallery.title (fallback)
  - company_profile.name (for header)
    ↓
Frontend displays:
  - Header: company_profile.name next to logo
  - Hero: album_title || gallery.title
```

## Backward Compatibility

### Existing Magic Links
- `album_title` will be NULL for all existing links
- Frontend uses fallback: `album_title || gallery.title`
- No data migration required

### API Compatibility
- `album_title` is required in `CreateMagicLinkRequest` (new links)
- `album_title` is optional in `MagicLink` response (handles existing links)
- `album_title` is optional in `ValidateMagicLinkResponse` (handles existing links)

## Validation Rules

| Field | Rule | Error Message |
|-------|------|---------------|
| `album_title` | Required on creation | "Album title is required" |
| `album_title` | Max 200 characters | "Album title must be 200 characters or less" |
| `album_title` | Trim whitespace | (automatic, no error) |
| `album_title` | Allow special chars | (allowed, no validation) |
| `album_title` | Allow emojis | (allowed, no validation) |

## Migration Strategy

### Migration File: `0056_add_album_title_to_magic_links.py`

```python
"""Add album_title column to magic_links table.

Supports the Public Gallery Branding feature where photographers can
set a custom client-facing title when creating share links.

Revision ID: 0056
Revises: 0055
Create Date: 2025-12-29
"""

from alembic import op

revision = "0056"
down_revision = "0055"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add album_title column to magic_links."""
    op.execute("""
        ALTER TABLE magic_links
        ADD COLUMN IF NOT EXISTS album_title VARCHAR(200);

        COMMENT ON COLUMN magic_links.album_title IS
        'Client-facing album title displayed on public gallery page. Falls back to gallery title if NULL.';
    """)


def downgrade() -> None:
    """Remove album_title column from magic_links."""
    op.execute("ALTER TABLE magic_links DROP COLUMN IF EXISTS album_title;")
```

## Index Considerations

No new indexes required for `album_title` as it is:
- Not used in WHERE clauses
- Not used in ORDER BY
- Only retrieved with the parent record
