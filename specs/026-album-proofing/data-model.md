# Data Model: Album Preview & Proofing

**Feature Branch**: `026-album-proofing`
**Created**: 2026-01-09

---

## Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────────┐       ┌─────────────────┐
│  Workspace   │       │      Album       │       │   AlbumSpread   │
│──────────────│       │──────────────────│       │─────────────────│
│ workspace_id │◄──────│ workspace_id     │       │ spread_id       │
│ name         │       │ album_id         │◄──────│ album_id        │
└──────────────┘       │ gallery_id (opt) │       │ page_number     │
                       │ title            │       │ template_id     │
                       │ status           │       │ background      │
                       │ page_size        │       └────────┬────────┘
                       │ bleed_mm         │                │
                       │ safe_margin_mm   │                │
                       └────────┬─────────┘                │
                                │                          │
          ┌─────────────────────┼───────────────┐          │
          │                     │               │          │
          ▼                     ▼               ▼          ▼
┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  AlbumVersion   │  │   AlbumRender    │  │  AlbumElement    │
│─────────────────│  │──────────────────│  │──────────────────│
│ version_id      │  │ render_id        │  │ element_id       │
│ album_id        │  │ album_id         │  │ spread_id        │
│ version_number  │  │ render_type      │  │ asset_id (opt)   │
│ label           │  │ status           │  │ type             │
│ snapshot_data   │  │ storage_path     │  │ position_x/y     │
│ created_by      │  │ expires_at       │  │ width/height     │
└─────────────────┘  └──────────────────┘  │ rotation         │
                                           │ z_index          │
                                           │ styling          │
                                           └──────────────────┘
                                                    │
          ┌─────────────────────────────────────────┘
          │
          ▼
┌──────────────────┐       ┌──────────────────┐
│  AlbumComment    │       │   MagicLink      │
│──────────────────│       │──────────────────│
│ comment_id       │       │ link_id          │
│ album_id         │       │ workspace_id     │
│ spread_id        │       │ album_id (NEW)   │
│ position_x/y     │       │ target_type      │
│ body             │       │ token_hash       │
│ status           │       │ expires_at       │
│ parent_id        │       └──────────────────┘
│ author_user_id   │
└──────────────────┘
```

---

## Entity Definitions

### 1. Album

Core entity representing a digital/print album design project.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `album_id` | UUID | PK | Unique identifier |
| `workspace_id` | UUID | FK, NOT NULL, INDEX | Multi-tenant isolation |
| `gallery_id` | UUID | FK, NULL | Optional source gallery for photos |
| `title` | VARCHAR(255) | NOT NULL | Album display name |
| `description` | TEXT | NULL | Optional description |
| `status` | VARCHAR(50) | NOT NULL, CHECK | Lifecycle state (see below) |
| `page_size` | VARCHAR(50) | NULL | e.g., "12x36", "A4", "10x10" |
| `width_mm` | DECIMAL(10,2) | NULL | Page width in millimeters |
| `height_mm` | DECIMAL(10,2) | NULL | Page height in millimeters |
| `bleed_mm` | DECIMAL(5,2) | DEFAULT 3.0 | Bleed zone for printing |
| `safe_margin_mm` | DECIMAL(5,2) | DEFAULT 10.0 | Safe zone from edge |
| `lab_preset_id` | UUID | NULL | Reference to lab preset config |
| `cover_spread_id` | UUID | NULL | Featured spread for thumbnail |
| `created_by_user_id` | UUID | FK | Creating user |
| `approved_by_email` | VARCHAR(255) | NULL | Client email on approval |
| `approved_at` | TIMESTAMP | NULL | Approval timestamp |
| `proof_sent_at` | TIMESTAMP | NULL | When proof was sent |
| `version_number` | INT | DEFAULT 1 | Current version counter |
| `created_at` | TIMESTAMP | NOT NULL | Creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL | Last update |

**Status Values**:
- `draft` - Initial creation, not shared
- `proof_sent` - Shared with client for review
- `changes_requested` - Client has added comments
- `approved` - Client approved for print
- `exported` - Print PDF generated

**Indexes**:
- `idx_albums_workspace` ON (workspace_id)
- `idx_albums_workspace_status` ON (workspace_id, status)
- `idx_albums_workspace_gallery` ON (workspace_id, gallery_id)

---

### 2. AlbumSpread

A spread (typically two facing pages) within an album.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `spread_id` | UUID | PK | Unique identifier |
| `album_id` | UUID | FK, NOT NULL, INDEX | Parent album |
| `workspace_id` | UUID | FK, NOT NULL | Redundant for query performance |
| `page_number` | INT | NOT NULL | Position in album (1-based) |
| `template_id` | VARCHAR(100) | NULL | Layout template code |
| `background_color` | VARCHAR(7) | NULL | Hex color (#RRGGBB) |
| `background_image_asset_id` | UUID | NULL | Optional background photo |
| `left_page_config` | JSONB | NULL | Left page overrides |
| `right_page_config` | JSONB | NULL | Right page overrides |
| `created_at` | TIMESTAMP | NOT NULL | Creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL | Last update |

**Constraints**:
- UNIQUE (album_id, page_number)

**Indexes**:
- `idx_album_spreads_album` ON (album_id)
- `idx_album_spreads_album_page` ON (album_id, page_number)

---

### 3. AlbumElement

Individual design element placed on a spread.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `element_id` | UUID | PK | Unique identifier |
| `spread_id` | UUID | FK, NOT NULL, INDEX | Parent spread |
| `workspace_id` | UUID | FK, NOT NULL | Redundant for query performance |
| `type` | VARCHAR(50) | NOT NULL, CHECK | Element type: photo, text, shape |
| `asset_id` | UUID | FK, NULL | Photo asset reference (if type=photo) |
| `text_content` | TEXT | NULL | Text content (if type=text) |
| `position_x` | DECIMAL(10,2) | NOT NULL | X position (pixels from left) |
| `position_y` | DECIMAL(10,2) | NOT NULL | Y position (pixels from top) |
| `width` | DECIMAL(10,2) | NOT NULL | Element width (pixels) |
| `height` | DECIMAL(10,2) | NOT NULL | Element height (pixels) |
| `rotation` | DECIMAL(5,2) | DEFAULT 0 | Rotation angle (degrees) |
| `opacity` | DECIMAL(3,2) | DEFAULT 1.0 | 0.0 to 1.0 |
| `z_index` | INT | NOT NULL | Stacking order |
| `crop` | JSONB | NULL | Crop rect: {x, y, width, height} normalized |
| `styling` | JSONB | NULL | Borders, shadows, text styles |
| `locked` | BOOLEAN | DEFAULT FALSE | Prevent accidental edits |
| `created_at` | TIMESTAMP | NOT NULL | Creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL | Last update |

**Type Values**:
- `photo` - Image element with asset_id
- `text` - Text box with text_content
- `shape` - Geometric shape (rect, circle, line)

**Styling JSONB Schema**:
```json
{
  "border": {
    "width": 2,
    "color": "#000000",
    "style": "solid"
  },
  "shadow": {
    "offset_x": 2,
    "offset_y": 2,
    "blur": 4,
    "color": "rgba(0,0,0,0.25)"
  },
  "font": {
    "family": "Playfair Display",
    "size": 24,
    "weight": "bold",
    "color": "#333333",
    "align": "center"
  },
  "fill": "#FFFFFF",
  "radius": 8
}
```

**Indexes**:
- `idx_album_elements_spread` ON (spread_id)
- `idx_album_elements_spread_zindex` ON (spread_id, z_index)

---

### 4. AlbumVersion

Point-in-time snapshot of album state for version control.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `version_id` | UUID | PK | Unique identifier |
| `album_id` | UUID | FK, NOT NULL, INDEX | Parent album |
| `workspace_id` | UUID | FK, NOT NULL | Redundant for query performance |
| `version_number` | INT | NOT NULL | Sequential version number |
| `label` | VARCHAR(255) | NULL | User-provided label |
| `snapshot_data` | JSONB | NOT NULL | Complete serialized album state |
| `created_by_user_id` | UUID | FK, NOT NULL | User who created version |
| `created_at` | TIMESTAMP | NOT NULL | Creation timestamp |

**Snapshot Data Schema**:
```json
{
  "album": { /* album fields */ },
  "spreads": [
    {
      "spread_id": "uuid",
      "page_number": 1,
      "elements": [ /* element objects */ ]
    }
  ],
  "metadata": {
    "total_photos": 45,
    "total_spreads": 20
  }
}
```

**Indexes**:
- `idx_album_versions_album` ON (album_id)
- `idx_album_versions_album_number` ON (album_id, version_number)

---

### 5. AlbumComment

Position-aware comment pin on album spreads.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `comment_id` | UUID | PK | Unique identifier |
| `album_id` | UUID | FK, NOT NULL, INDEX | Parent album |
| `spread_id` | UUID | FK, NOT NULL, INDEX | Specific spread |
| `workspace_id` | UUID | FK, NOT NULL | Redundant for query performance |
| `author_user_id` | UUID | NULL | Authenticated user (if logged in) |
| `author_name` | VARCHAR(255) | NOT NULL | Display name |
| `author_email` | VARCHAR(255) | NULL | Email for notifications |
| `body` | TEXT | NOT NULL, CHECK(length > 0) | Comment content |
| `position_x` | DECIMAL(5,2) | NOT NULL, CHECK | X as percentage (0-100) |
| `position_y` | DECIMAL(5,2) | NOT NULL, CHECK | Y as percentage (0-100) |
| `status` | VARCHAR(50) | DEFAULT 'open' | open, in_progress, resolved |
| `parent_comment_id` | UUID | FK, NULL | For threading (self-reference) |
| `resolved_by_user_id` | UUID | FK, NULL | Who resolved |
| `resolved_at` | TIMESTAMP | NULL | When resolved |
| `is_internal` | BOOLEAN | DEFAULT FALSE | Photographer-only note |
| `created_at` | TIMESTAMP | NOT NULL | Creation timestamp |
| `updated_at` | TIMESTAMP | NOT NULL | Last update |
| `deleted` | BOOLEAN | DEFAULT FALSE | Soft delete |

**Position Constraints**:
- CHECK (position_x >= 0 AND position_x <= 100)
- CHECK (position_y >= 0 AND position_y <= 100)

**Indexes**:
- `idx_album_comments_album` ON (album_id) WHERE deleted = FALSE
- `idx_album_comments_spread` ON (spread_id) WHERE deleted = FALSE
- `idx_album_comments_album_status` ON (album_id, status) WHERE deleted = FALSE
- `idx_album_comments_parent` ON (parent_comment_id)

---

### 6. AlbumRender

Generated output files (PDF, images) for album.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `render_id` | UUID | PK | Unique identifier |
| `album_id` | UUID | FK, NOT NULL, INDEX | Parent album |
| `workspace_id` | UUID | FK, NOT NULL | Redundant for query performance |
| `render_type` | VARCHAR(50) | NOT NULL, CHECK | Type of render |
| `status` | VARCHAR(50) | NOT NULL | queued, running, ready, failed |
| `storage_path` | VARCHAR(500) | NULL | R2/S3 path when ready |
| `file_size_bytes` | BIGINT | NULL | Generated file size |
| `page_count` | INT | NULL | Number of pages in PDF |
| `resolution_dpi` | INT | NULL | Image resolution |
| `watermarked` | BOOLEAN | DEFAULT FALSE | Has watermark applied |
| `error_message` | TEXT | NULL | Error details if failed |
| `requested_by_user_id` | UUID | FK | User who requested |
| `created_at` | TIMESTAMP | NOT NULL | Request timestamp |
| `completed_at` | TIMESTAMP | NULL | Completion timestamp |
| `expires_at` | TIMESTAMP | NULL | When render expires |

**Render Type Values**:
- `preview_pdf` - Low-res watermarked PDF for client review
- `print_pdf` - High-res print-ready PDF
- `spread_images` - Individual spread images for display

**Indexes**:
- `idx_album_renders_album` ON (album_id)
- `idx_album_renders_album_type` ON (album_id, render_type)
- `idx_album_renders_expires` ON (expires_at) WHERE status = 'ready'

---

### 7. MagicLink Extension

Extend existing `magic_links` table for album targeting.

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `album_id` | UUID | FK, NULL, INDEX | NEW: Target album |

**Modified target_type Values**:
- `gallery` (existing)
- `sub_gallery` (existing)
- `photo` (existing)
- `album` (NEW)

**Validation Rule**:
- If `target_type = 'album'`, then `album_id` MUST be NOT NULL
- `gallery_id` can be NULL when targeting album

---

## State Transitions

### Album Status Lifecycle

```
┌─────────┐
│  draft  │
└────┬────┘
     │ Photographer sends proof link
     ▼
┌────────────┐
│ proof_sent │◄─────────────────────┐
└─────┬──────┘                      │
      │                             │
      ├─────────────────┐           │
      │ Client comments │           │ Photographer resolves
      ▼                 │           │ and re-sends
┌─────────────────────┐ │           │
│ changes_requested   │─┘───────────┘
└─────────┬───────────┘
          │ Client approves
          ▼
    ┌──────────┐
    │ approved │
    └─────┬────┘
          │ Print PDF generated
          ▼
    ┌──────────┐
    │ exported │
    └──────────┘
```

### Comment Status Lifecycle

```
┌──────┐     Photographer      ┌─────────────┐
│ open │ ──────begins────────► │ in_progress │
└──┬───┘     working           └──────┬──────┘
   │                                  │
   │         Resolved                 │ Resolved
   └────────────────────┬─────────────┘
                        ▼
                  ┌──────────┐
                  │ resolved │
                  └────┬─────┘
                       │ Reopen
                       ▼
                  ┌──────┐
                  │ open │
                  └──────┘
```

---

## Validation Rules

### Album

1. `title` length: 1-255 characters
2. `status` must be valid enum value
3. `bleed_mm` and `safe_margin_mm` must be non-negative
4. `workspace_id` must reference valid workspace

### AlbumSpread

1. `page_number` must be positive integer
2. Unique constraint on (album_id, page_number)
3. Background color must be valid hex (#RRGGBB)

### AlbumElement

1. `position_x`, `position_y`, `width`, `height` must be non-negative
2. `rotation` must be 0-360
3. `opacity` must be 0.0-1.0
4. `type` must be photo, text, or shape
5. If type=photo, asset_id must be provided
6. If type=text, text_content must be provided

### AlbumComment

1. `position_x` and `position_y` must be 0-100 (percentage)
2. `body` must have at least 1 character
3. `author_name` required
4. `parent_comment_id` must reference existing comment in same album

### AlbumVersion

1. `version_number` must be positive integer
2. `snapshot_data` must be valid JSON
3. Versions are immutable after creation

---

## Migration Notes

**Migration Order**:
1. Create `albums` table
2. Create `album_spreads` table (FK to albums)
3. Create `album_elements` table (FK to spreads)
4. Create `album_versions` table (FK to albums)
5. Create `album_comments` table (FK to albums, spreads)
6. Create `album_renders` table (FK to albums)
7. Alter `magic_links` to add `album_id` column

**Rollback Strategy**:
- All migrations include down() methods
- FK constraints use ON DELETE CASCADE where appropriate
- Soft delete used for user data (comments)
