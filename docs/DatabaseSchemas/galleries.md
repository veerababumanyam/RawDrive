# Gallery Database Schema

This document describes the database schema for galleries, sub-galleries, and gallery assets in RawDrive.

## Tables

### galleries

Primary entity for photo collections shared with clients.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| gallery_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique gallery identifier |
| workspace_id | UUID | NOT NULL, FK → workspaces(workspace_id) | Tenant isolation key |
| title | VARCHAR(255) | NOT NULL | Gallery title (1-255 chars) |
| description | VARCHAR(1000) | NULL | Gallery description (max 1000 chars) |
| client_name | VARCHAR(255) | NULL | Display name for client in header |
| status | VARCHAR(50) | NOT NULL, DEFAULT 'draft', CHECK IN ('draft', 'published', 'archived') | Gallery status |
| branding_profile_id | UUID | NULL | Reference to workspace branding preset |
| portal_language | VARCHAR(10) | NULL | ISO language code (e.g., 'en-IN', 'hi-IN') |
| layout_style | VARCHAR(50) | DEFAULT 'tabs', CHECK IN ('tabs', 'continuous') | Layout style for client portal |
| theme | VARCHAR(50) | DEFAULT 'system', CHECK IN ('light', 'dark', 'system') | Theme mode |
| download_policy | VARCHAR(50) | DEFAULT 'view_only', CHECK IN ('view_only', 'web_only', 'watermarked_only', 'original_allowed') | Download policy |
| exif_visible | BOOLEAN | DEFAULT FALSE | Whether EXIF data is visible to clients |
| password_hash | VARCHAR(255) | NULL | bcrypt hash if password protected |
| email_registration_required | BOOLEAN | DEFAULT FALSE | Require email registration for access |
| expires_at | TIMESTAMPTZ | NULL | ISO timestamp for auto-expiry |
| custom_domain | VARCHAR(255) | NULL | Custom domain mapping (tier-gated) |
| cover_asset_id | UUID | NULL | Reference to cover photo asset |
| created_by_user_id | UUID | NOT NULL, FK → users(user_id) | User who created the gallery |
| published_at | TIMESTAMPTZ | NULL | Set when status changes to 'published' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Last update timestamp |

**Indexes:**
- `idx_galleries_workspace` ON `workspace_id`
- `idx_galleries_workspace_status` ON `workspace_id, status`
- `idx_galleries_workspace_created` ON `workspace_id, created_at DESC`
- `idx_galleries_created_by` ON `created_by_user_id`

**Computed Fields (not stored):**
- `photo_count`: Count of gallery_assets
- `video_count`: Count of video assets
- `favorites_count`: Count from client_interactions where type='favorite'
- `selections_count`: Count from client_interactions where type='select'
- `password_protected`: True if password_hash is not null
- `cover_image_url`: CDN URL from cover_asset_id or first asset

### sub_galleries

Organizational subdivision within a gallery (e.g., "Ceremony", "Reception").

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| sub_gallery_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique sub-gallery identifier |
| workspace_id | UUID | NOT NULL, FK → workspaces(workspace_id) | Tenant isolation key |
| gallery_id | UUID | NOT NULL, FK → galleries(gallery_id) | Parent gallery reference |
| name | VARCHAR(100) | NOT NULL, UNIQUE(gallery_id, name) | Sub-gallery name (1-100 chars, unique within gallery) |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | Integer for ordering tabs |
| visible | BOOLEAN | NOT NULL, DEFAULT TRUE | Controls visibility in client portal |
| cover_asset_id | UUID | NULL | Reference to cover photo |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

**Indexes:**
- `idx_sub_galleries_workspace` ON `workspace_id`
- `idx_sub_galleries_gallery` ON `gallery_id`
- `idx_sub_galleries_gallery_order` ON `gallery_id, sort_order`
- `idx_sub_galleries_ws_gallery_name_unique` UNIQUE ON `workspace_id, gallery_id, name`

**Computed Fields (not stored):**
- `photo_count`: Count of gallery_assets in this sub-gallery
- `cover_image_url`: CDN URL from cover_asset_id or first asset

### gallery_assets

Junction table linking assets to galleries with gallery-specific metadata.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| gallery_asset_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique junction record identifier |
| workspace_id | UUID | NOT NULL, FK → workspaces(workspace_id) | Tenant isolation key |
| gallery_id | UUID | NOT NULL, FK → galleries(gallery_id) | Parent gallery reference |
| sub_gallery_id | UUID | NULL, FK → sub_galleries(sub_gallery_id) | Sub-gallery assignment (NULL = Root Gallery) |
| asset_id | UUID | NOT NULL, FK → assets(asset_id) | Referenced asset |
| sort_order | INTEGER | NOT NULL, DEFAULT 0 | Integer for ordering within gallery/sub-gallery |
| visible | BOOLEAN | NOT NULL, DEFAULT TRUE | Controls visibility in client portal |
| is_private | BOOLEAN | NOT NULL, DEFAULT FALSE | Per-asset lock (requires access code to view) |
| access_code_hash | VARCHAR(255) | NULL | bcrypt hash for private photo access code |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Creation timestamp |

**Indexes:**
- `idx_gallery_assets_workspace` ON `workspace_id`
- `idx_gallery_assets_gallery` ON `gallery_id`
- `idx_gallery_assets_sub_gallery` ON `sub_gallery_id`
- `idx_gallery_assets_asset` ON `asset_id`
- `idx_gallery_assets_gallery_order` ON `gallery_id, sort_order`
- `idx_gallery_assets_ws_gallery_asset_unique` UNIQUE ON `workspace_id, gallery_id, asset_id`

**Computed Fields (not stored):**
- `is_favorited`: True if any client_interaction has type='favorite' for this asset
- `is_selected`: True if any client_interaction has type='select' for this asset
- `favorites_count`: Count of client_interactions with type='favorite'

### client_interactions

Records client interactions with gallery assets (views, favorites, selections, comments, downloads).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| interaction_id | UUID | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique interaction identifier |
| workspace_id | UUID | NOT NULL, FK → workspaces(workspace_id) | Tenant isolation key |
| gallery_id | UUID | NOT NULL, FK → galleries(gallery_id) | Gallery reference |
| asset_id | UUID | NULL, FK → assets(asset_id) | Asset reference (NULL for gallery-level interactions) |
| type | VARCHAR(50) | NOT NULL, CHECK IN ('view', 'favorite', 'select', 'comment', 'download') | Interaction type |
| actor | JSONB | NOT NULL | share_link_id or client profile information |
| payload | JSONB | NULL | Additional interaction data (e.g., comment text, rating) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | Interaction timestamp |

**Indexes:**
- `idx_client_interactions_workspace` ON `workspace_id`
- `idx_client_interactions_gallery` ON `gallery_id`
- `idx_client_interactions_asset` ON `asset_id`
- `idx_client_interactions_gallery_time` ON `gallery_id, created_at DESC`
- `idx_client_interactions_asset_time` ON `asset_id, created_at DESC`

## Relationships

```
workspaces (1) ──< (many) galleries
galleries (1) ──< (many) sub_galleries
galleries (1) ──< (many) gallery_assets
sub_galleries (1) ──< (many) gallery_assets
assets (1) ──< (many) gallery_assets
galleries (1) ──< (many) client_interactions
assets (1) ──< (many) client_interactions
users (1) ──< (many) galleries (created_by_user_id)
```

## Data Integrity Rules

1. **Workspace Scoping**: All tables include `workspace_id` for tenant isolation. All queries MUST filter by `workspace_id`.

2. **Gallery Status Lifecycle**:
   - `draft`: Staff can edit; portal access blocked
   - `published`: Portal access allowed per Share Link policy
   - `archived`: Read-only for staff; portal typically blocked

3. **Sub-Gallery Uniqueness**: Sub-gallery names must be unique within a gallery (enforced by UNIQUE constraint).

4. **Asset Uniqueness**: An asset can only appear once per gallery (enforced by UNIQUE constraint on `gallery_id, asset_id`).

5. **Publish Validation**: A gallery must have at least one visible asset to be published (enforced in application logic).

6. **Soft Delete**: Galleries are archived (status='archived') rather than hard-deleted to preserve data integrity.

## Migration History

- **0002_galleries_schema.py**: Initial gallery schema creation
  - Created `galleries`, `sub_galleries`, `gallery_assets`, `client_interactions` tables
  - Added indexes for performance
  - Enforced referential integrity with foreign keys

## Notes

- The `assets` table is referenced but created in a separate migration for storage/ingestion features.
- Foreign key constraint on `gallery_assets.asset_id` → `assets.asset_id` will be added when the assets table exists.
- All timestamps use `TIMESTAMPTZ` for timezone-aware storage.
- Computed fields are calculated at query time, not stored in the database.

