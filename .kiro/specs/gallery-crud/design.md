# Design Document: Gallery CRUD

## Overview

This design document outlines the technical architecture for RawDrive's Gallery CRUD feature within the workspace. The gallery management interface enables photographers to create, organize, and curate photo collections before sharing them with clients.

### Key Design Principles

1. **Workspace-Scoped**: All galleries are scoped to `workspace_id` for multi-tenant isolation
2. **Mobile-First**: Responsive design starting from mobile and scaling up
3. **Performance-Driven**: Virtualized scrolling, lazy loading, and CDN-optimized images
4. **Real-Time Feedback**: Upload progress, optimistic updates, and instant UI responses
5. **Drag-Drop Native**: Intuitive organization through drag-and-drop interactions

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Workspace Routes                             │
│                   /workspace/galleries/*                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │   Gallery List        │    │      Gallery Detail           │  │
│  │   /galleries          │    │   /galleries/:id              │  │
│  │                       │    │                               │  │
│  │  - Gallery cards      │    │  - Header + toolbar           │  │
│  │  - Status badges      │    │  - Sub-gallery tabs           │  │
│  │  - Create button      │    │  - Photo grid/list            │  │
│  │  - Sort/filter        │    │  - Lightbox viewer            │  │
│  └──────────────────────┘    └──────────────────────────────┘  │
│           │                              │                       │
│           ▼                              ▼                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Gallery Services                         │  │
│  │  - galleryService.ts (API client)                         │  │
│  │  - uploadService.ts (R2 signed URLs + progress)           │  │
│  │  - useGallery hook (state management)                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   Backend API (v1)                         │  │
│  │  POST /galleries, GET /galleries/:id, PATCH, DELETE       │  │
│  │  POST /uploads, POST /uploads/:id/commit                  │  │
│  │  GET /galleries/:id/assets, PATCH /assets/:id             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              PostgreSQL + Cloudflare R2                    │  │
│  │  galleries, sub_galleries, gallery_assets, assets         │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Route Structure

```typescript
// Workspace gallery routes
/workspace/galleries              → GalleryListPage
/workspace/galleries/new          → GalleryCreatePage
/workspace/galleries/:id          → GalleryDetailPage
/workspace/galleries/:id/settings → GallerySettingsPage
```

## Components and Interfaces

### Gallery Components (`frontend/src/components/gallery/`)

```
gallery/
├── GalleryList/
│   ├── GalleryList.tsx           # Main list container
│   ├── GalleryCard.tsx           # Individual gallery card
│   ├── GalleryStatusBadge.tsx    # Draft/Published/Archived badge
│   └── GalleryEmptyState.tsx     # Empty state with CTA
├── GalleryDetail/
│   ├── GalleryHeader.tsx         # Title, stats, back link
│   ├── GalleryToolbar.tsx        # Actions toolbar
│   ├── SubGalleryTabs.tsx        # Tab navigation
│   └── GalleryStats.tsx          # Item count, favorites count
├── PhotoGrid/
│   ├── PhotoGrid.tsx             # Masonry grid container
│   ├── PhotoCard.tsx             # Individual photo card
│   ├── PhotoBadges.tsx           # Favorite/Private/Video badges
│   ├── PhotoActions.tsx          # Hover action buttons
│   └── VirtualizedGrid.tsx       # Virtualized scrolling wrapper
├── PhotoList/
│   ├── PhotoListView.tsx         # Table/list view
│   └── PhotoListRow.tsx          # Individual row
├── Lightbox/
│   ├── Lightbox.tsx              # Modal container
│   ├── LightboxImage.tsx         # Zoomable image
│   ├── LightboxNav.tsx           # Prev/next navigation
│   └── LightboxMetadata.tsx      # Photo info panel
├── Upload/
│   ├── UploadDropzone.tsx        # Drag-drop area
│   ├── UploadProgress.tsx        # Progress indicators
│   ├── UploadQueue.tsx           # Queue management
│   └── UploadThumbnail.tsx       # Preview thumbnail
├── Settings/
│   ├── GallerySettingsPanel.tsx  # Settings modal/panel
│   ├── AccessSettings.tsx        # Password, expiry, email
│   ├── DownloadSettings.tsx      # Download policy
│   └── BrandingSettings.tsx      # Branding profile
└── shared/
    ├── BulkActionBar.tsx         # Bulk operations bar
    ├── FilterBar.tsx             # Search + filters
    └── ViewModeToggle.tsx        # Grid/List toggle
```

### Component Interfaces

```typescript
// ============================================
// GALLERY LIST COMPONENTS
// ============================================

interface GalleryCardProps {
  gallery: GalleryListItem;         // MANDATORY: gallery data
  onClick: () => void;              // MANDATORY: click handler
}

// Uses GalleryListItem from API Response Types above

// ============================================
// GALLERY DETAIL COMPONENTS
// ============================================

interface GalleryHeaderProps {
  // === MANDATORY PROPS ===
  gallery: GalleryDetailData;
  onTitleChange: (title: string) => void;
  onBack: () => void;
}

interface GalleryDetailData {
  // === MANDATORY FIELDS (always displayed) ===
  gallery_id: string;
  title: string;
  status: GalleryStatus;
  created_at: string;
  stats: GalleryStats;
  
  // === OPTIONAL FIELDS ===
  client_name?: string;             // displayed in header if present
  description?: string;
}

interface GalleryToolbarProps {
  // === MANDATORY PROPS ===
  gallery: GalleryDetailData;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onUpload: () => void;
  onShare: () => void;
  onSettings: () => void;
  
  // === OPTIONAL PROPS ===
  selectedCount?: number;           // for bulk action bar
  onBulkAction?: (action: BulkAction) => void;
}

type ViewMode = 'grid' | 'list';
type BulkAction = 'move' | 'delete' | 'download';

// ============================================
// SUB-GALLERY COMPONENTS
// ============================================

interface SubGalleryTabsProps {
  // === MANDATORY PROPS ===
  subGalleries: SubGalleryItem[];   // from API response
  activeId: string | null;          // null = "Root Gallery"
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  
  // === OPTIONAL PROPS ===
  onReorder?: (ids: string[]) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  onToggleVisibility?: (id: string, visible: boolean) => void;
}

// Uses SubGalleryItem from API Response Types above

// ============================================
// PHOTO GRID COMPONENTS
// ============================================

interface PhotoGridProps {
  // === MANDATORY PROPS ===
  photos: GalleryAssetItem[];       // from API response
  onPhotoClick: (id: string) => void;
  
  // === OPTIONAL PROPS (for selection mode) ===
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelect?: (id: string, multi: boolean) => void;
  onReorder?: (ids: string[]) => void;
}

interface PhotoCardProps {
  // === MANDATORY PROPS ===
  photo: GalleryAssetItem;
  onClick: () => void;
  
  // === OPTIONAL PROPS ===
  selected?: boolean;
  onSelect?: (multi: boolean) => void;
  showActions?: boolean;            // show hover actions
}

// Uses GalleryAssetItem from API Response Types above

// ============================================
// UPLOAD COMPONENTS
// ============================================

interface UploadDropzoneProps {
  // === MANDATORY PROPS ===
  galleryId: string;
  onUploadComplete: (assets: GalleryAssetItem[]) => void;
  
  // === OPTIONAL PROPS ===
  subGalleryId?: string;            // target sub-gallery
  onUploadStart?: () => void;
  onUploadError?: (error: UploadError) => void;
}

interface UploadFile {
  // === MANDATORY FIELDS ===
  id: string;                       // client-generated UUID
  file: File;                       // original File object
  status: UploadStatus;
  progress: number;                 // 0-100
  
  // === OPTIONAL FIELDS ===
  error?: string;                   // error message if status='error'
  thumbnailUrl?: string;            // local blob URL for preview
  uploadId?: string;                // server upload session ID
  assetId?: string;                 // assigned after commit
}

type UploadStatus = 'queued' | 'uploading' | 'processing' | 'complete' | 'error';

interface UploadError {
  fileId: string;
  fileName: string;
  code: UploadErrorCode;
  message: string;
  retryable: boolean;
}

type UploadErrorCode = 
  | 'UPLOAD_FAILED'
  | 'CHECKSUM_MISMATCH'
  | 'FILE_TOO_LARGE'
  | 'INVALID_FILE_TYPE'
  | 'QUOTA_EXCEEDED';

// ============================================
// LIGHTBOX COMPONENTS
// ============================================

interface LightboxProps {
  // === MANDATORY PROPS ===
  photos: GalleryAssetItem[];
  initialIndex: number;
  onClose: () => void;
  
  // === OPTIONAL PROPS ===
  onFavoriteToggle?: (id: string) => void;
  onSelectToggle?: (id: string) => void;
  onDelete?: (id: string) => void;
}

interface LightboxMetadataProps {
  // === MANDATORY PROPS ===
  asset: AssetInfo;
  
  // === OPTIONAL PROPS ===
  showExif?: boolean;               // controlled by gallery.exif_visible
}

// ============================================
// SETTINGS COMPONENTS
// ============================================

interface GallerySettingsProps {
  // === MANDATORY PROPS ===
  gallery: GalleryDetailResponse['data'];
  onSave: (settings: GalleryUpdateRequest) => void;
  onClose: () => void;
  
  // === OPTIONAL PROPS ===
  brandingProfiles?: BrandingProfile[];  // workspace presets
}

interface BrandingProfile {
  // === MANDATORY FIELDS ===
  branding_profile_id: string;
  name: string;
  
  // === OPTIONAL FIELDS ===
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

// Uses GalleryUpdateRequest from API Response Types above
```

## Data Models

### Field Classification Legend

- **MANDATORY**: Required field, must always have a value
- **OPTIONAL**: Field may be null/undefined
- **COMPUTED**: Derived from other data, not stored directly
- **SYSTEM**: Auto-generated by the system (timestamps, IDs)

### Database Schema (aligned with `galleries_client_portal.json`)

```typescript
/**
 * Gallery Entity
 * Primary entity for photo collections shared with clients
 */
interface GalleryEntity {
  // === SYSTEM FIELDS (auto-generated) ===
  gallery_id: string;              // SYSTEM: UUID primary key
  workspace_id: string;            // SYSTEM: UUID, tenant isolation key
  created_at: string;              // SYSTEM: ISO timestamp
  
  // === MANDATORY FIELDS ===
  title: string;                   // MANDATORY: 1-255 chars, non-empty
  status: GalleryStatus;           // MANDATORY: default 'draft'
  created_by_user_id: string;      // MANDATORY: UUID of creating user
  
  // === OPTIONAL FIELDS ===
  description?: string;            // OPTIONAL: max 1000 chars
  client_name?: string;            // OPTIONAL: for display in header
  branding_profile_id?: string;    // OPTIONAL: UUID, workspace branding preset
  portal_language?: string;        // OPTIONAL: ISO language code (e.g., 'en-IN', 'hi-IN')
  layout_style?: LayoutStyle;      // OPTIONAL: default 'tabs'
  theme?: ThemeMode;               // OPTIONAL: default 'system'
  download_policy?: DownloadPolicy; // OPTIONAL: default 'view_only'
  exif_visible?: boolean;          // OPTIONAL: default false
  password_hash?: string;          // OPTIONAL: bcrypt hash if password protected
  email_registration_required?: boolean; // OPTIONAL: default false
  expires_at?: string;             // OPTIONAL: ISO timestamp for auto-expiry
  custom_domain?: string;          // OPTIONAL: tier-gated feature
  published_at?: string;           // OPTIONAL: set when status changes to 'published'
  cover_asset_id?: string;         // OPTIONAL: UUID of cover photo
}

type GalleryStatus = 'draft' | 'published' | 'archived';
type LayoutStyle = 'tabs' | 'continuous';
type ThemeMode = 'light' | 'dark' | 'system';
type DownloadPolicy = 'view_only' | 'web_only' | 'watermarked_only' | 'original_allowed';

/**
 * SubGallery Entity
 * Organizational subdivision within a gallery (e.g., "Ceremony", "Reception")
 */
interface SubGalleryEntity {
  // === SYSTEM FIELDS ===
  sub_gallery_id: string;          // SYSTEM: UUID primary key
  workspace_id: string;            // SYSTEM: UUID, tenant isolation
  created_at: string;              // SYSTEM: ISO timestamp
  
  // === MANDATORY FIELDS ===
  gallery_id: string;              // MANDATORY: UUID, parent gallery
  name: string;                    // MANDATORY: 1-100 chars, unique within gallery
  sort_order: number;              // MANDATORY: integer for ordering, default 0
  visible: boolean;                // MANDATORY: default true
  
  // === OPTIONAL FIELDS ===
  cover_asset_id?: string;         // OPTIONAL: UUID of cover photo
}

/**
 * GalleryAsset Entity (Junction Table)
 * Links assets to galleries with gallery-specific metadata
 */
interface GalleryAssetEntity {
  // === SYSTEM FIELDS ===
  gallery_asset_id: string;        // SYSTEM: UUID primary key
  workspace_id: string;            // SYSTEM: UUID, tenant isolation
  created_at: string;              // SYSTEM: ISO timestamp
  
  // === MANDATORY FIELDS ===
  gallery_id: string;              // MANDATORY: UUID, parent gallery
  asset_id: string;                // MANDATORY: UUID, referenced asset
  sort_order: number;              // MANDATORY: integer for ordering
  visible: boolean;                // MANDATORY: default true
  is_private: boolean;             // MANDATORY: default false (locked photo)
  
  // === OPTIONAL FIELDS ===
  sub_gallery_id?: string;         // OPTIONAL: UUID, null = "Root Gallery"
  access_code_hash?: string;       // OPTIONAL: bcrypt hash for private photos
  
  // === COMPUTED FIELDS (from joins) ===
  // is_favorited: boolean;        // COMPUTED: from selection_items
  // is_selected: boolean;         // COMPUTED: from selection_items
  // favorites_count: number;      // COMPUTED: count of favorites
  // selections_count: number;     // COMPUTED: count of selections
}

/**
 * Asset Entity (from storage_ingestion_byos.json)
 * Core media file record
 */
interface AssetEntity {
  // === SYSTEM FIELDS ===
  asset_id: string;                // SYSTEM: UUID primary key
  workspace_id: string;            // SYSTEM: UUID, tenant isolation
  created_at: string;              // SYSTEM: ISO timestamp
  
  // === MANDATORY FIELDS ===
  library_id: string;              // MANDATORY: UUID, asset library
  type: AssetType;                 // MANDATORY: 'photo' | 'video'
  original_object_key: string;     // MANDATORY: R2/S3 object key
  original_bytes: number;          // MANDATORY: file size in bytes
  sha256: string;                  // MANDATORY: content hash for integrity
  mime_type: string;               // MANDATORY: e.g., 'image/jpeg', 'video/mp4'
  status: AssetStatus;             // MANDATORY: processing state
  created_by_user_id: string;      // MANDATORY: UUID of uploader
  
  // === OPTIONAL FIELDS ===
  folder_id?: string;              // OPTIONAL: UUID, organizational folder
  filename?: string;               // OPTIONAL: original filename
  exif?: AssetExif;                // OPTIONAL: extracted EXIF metadata
}

type AssetType = 'photo' | 'video';
type AssetStatus = 'uploading' | 'available' | 'processing' | 'failed' | 'deleted';

/**
 * Asset EXIF Metadata (extracted from media files)
 * All fields are OPTIONAL as EXIF data varies by camera/device
 */
interface AssetExif {
  // === CAMERA INFO ===
  make?: string;                   // OPTIONAL: camera manufacturer
  model?: string;                  // OPTIONAL: camera model
  lens?: string;                   // OPTIONAL: lens model
  
  // === CAPTURE SETTINGS ===
  aperture?: number;               // OPTIONAL: f-stop (e.g., 2.8)
  shutter_speed?: string;          // OPTIONAL: e.g., "1/250"
  iso?: number;                    // OPTIONAL: ISO sensitivity
  focal_length?: number;           // OPTIONAL: mm
  flash?: boolean;                 // OPTIONAL: flash fired
  
  // === IMAGE DIMENSIONS ===
  width?: number;                  // OPTIONAL: pixels (may differ from derivative)
  height?: number;                 // OPTIONAL: pixels
  orientation?: number;            // OPTIONAL: EXIF orientation (1-8)
  
  // === DATE/TIME ===
  date_taken?: string;             // OPTIONAL: ISO timestamp from EXIF
  
  // === LOCATION (if GPS enabled) ===
  latitude?: number;               // OPTIONAL: GPS latitude
  longitude?: number;              // OPTIONAL: GPS longitude
  altitude?: number;               // OPTIONAL: GPS altitude in meters
}

/**
 * Asset Derivative (from media_processing.json)
 * Generated variants of original assets
 */
interface AssetDerivative {
  // === SYSTEM FIELDS ===
  derivative_id: string;           // SYSTEM: UUID primary key
  workspace_id: string;            // SYSTEM: UUID, tenant isolation
  created_at: string;              // SYSTEM: ISO timestamp
  
  // === MANDATORY FIELDS ===
  asset_id: string;                // MANDATORY: UUID, parent asset
  variant: DerivativeVariant;      // MANDATORY: derivative type
  object_key: string;              // MANDATORY: R2/S3 object key
  bytes: number;                   // MANDATORY: file size
  sha256: string;                  // MANDATORY: content hash
  
  // === OPTIONAL FIELDS (depends on variant) ===
  width?: number;                  // OPTIONAL: pixels (for images)
  height?: number;                 // OPTIONAL: pixels (for images)
  duration_ms?: number;            // OPTIONAL: milliseconds (for videos)
}

type DerivativeVariant = 
  | 'thumb_sm'      // 256px thumbnail
  | 'thumb_md'      // 512px thumbnail
  | 'preview'       // 2048px preview
  | 'web'           // 3840px web-optimized
  | 'download'      // original quality for download
  | 'watermarked'   // watermarked variant
  | 'video_720p'    // video transcode
  | 'video_1080p';  // video transcode

/**
 * Client Interaction Data (from proofing_selections_comments.json)
 * Favorites and selections are stored in selection_items table
 */
interface SelectionItem {
  // === SYSTEM FIELDS ===
  selection_item_id: string;       // SYSTEM: UUID primary key
  workspace_id: string;            // SYSTEM: UUID, tenant isolation
  created_at: string;              // SYSTEM: ISO timestamp
  
  // === MANDATORY FIELDS ===
  selection_set_id: string;        // MANDATORY: UUID, parent selection set
  asset_id: string;                // MANDATORY: UUID, referenced asset
  favorite: boolean;               // MANDATORY: default false
  
  // === OPTIONAL FIELDS ===
  rating?: number;                 // OPTIONAL: 1-5 star rating
  notes?: string;                  // OPTIONAL: client notes
}
```

### API Response Types

```typescript
/**
 * Gallery List Response
 * GET /v1/workspaces/{workspace_id}/galleries
 */
interface GalleryListResponse {
  data: GalleryListItem[];
  meta: {
    page: number;           // MANDATORY: current page (1-indexed)
    limit: number;          // MANDATORY: items per page
    total: number;          // MANDATORY: total gallery count
    totalPages: number;     // MANDATORY: total pages
  };
}

interface GalleryListItem {
  // === MANDATORY FIELDS (always present) ===
  gallery_id: string;
  title: string;
  status: GalleryStatus;
  photo_count: number;              // COMPUTED: count of assets
  created_at: string;
  
  // === OPTIONAL FIELDS ===
  description?: string;
  client_name?: string;
  cover_image_url?: string;         // COMPUTED: CDN URL of cover or first photo
  published_at?: string;
}

/**
 * Gallery Detail Response
 * GET /v1/workspaces/{workspace_id}/galleries/{gallery_id}
 */
interface GalleryDetailResponse {
  data: {
    // === MANDATORY FIELDS ===
    gallery_id: string;
    workspace_id: string;
    title: string;
    status: GalleryStatus;
    created_by_user_id: string;
    created_at: string;
    
    // === OPTIONAL FIELDS ===
    description?: string;
    client_name?: string;
    branding_profile_id?: string;
    portal_language?: string;
    layout_style?: LayoutStyle;
    theme?: ThemeMode;
    download_policy?: DownloadPolicy;
    exif_visible?: boolean;
    password_protected: boolean;      // COMPUTED: true if password_hash exists
    email_registration_required?: boolean;
    expires_at?: string;
    published_at?: string;
    cover_asset_id?: string;
    
    // === NESTED DATA ===
    sub_galleries: SubGalleryItem[];  // MANDATORY: array (may be empty)
    stats: GalleryStats;              // MANDATORY: computed statistics
  };
}

interface SubGalleryItem {
  // === MANDATORY FIELDS ===
  sub_gallery_id: string;
  name: string;
  sort_order: number;
  visible: boolean;
  photo_count: number;              // COMPUTED: count of assets in sub-gallery
  
  // === OPTIONAL FIELDS ===
  cover_asset_id?: string;
  cover_image_url?: string;         // COMPUTED: CDN URL
}

interface GalleryStats {
  // === MANDATORY FIELDS (always computed) ===
  total_items: number;              // photos + videos
  total_photos: number;
  total_videos: number;
  favorites_count: number;          // from client interactions
  selections_count: number;         // from client interactions
}

/**
 * Gallery Assets Response
 * GET /v1/workspaces/{workspace_id}/galleries/{gallery_id}/assets
 */
interface GalleryAssetsResponse {
  data: GalleryAssetItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

interface GalleryAssetItem {
  // === MANDATORY FIELDS ===
  gallery_asset_id: string;
  asset_id: string;
  sort_order: number;
  visible: boolean;
  is_private: boolean;
  
  // === OPTIONAL FIELDS ===
  sub_gallery_id?: string;
  
  // === COMPUTED CLIENT INTERACTION DATA ===
  is_favorited: boolean;            // COMPUTED: from selection_items
  is_selected: boolean;             // COMPUTED: from selection_items
  favorites_count: number;          // COMPUTED: total favorites across all clients
  
  // === NESTED ASSET DATA ===
  asset: AssetInfo;                 // MANDATORY: asset details
}

interface AssetInfo {
  // === MANDATORY FIELDS ===
  type: AssetType;
  status: AssetStatus;
  mime_type: string;
  
  // === MANDATORY CDN URLs (generated from derivatives) ===
  thumbnail_url: string;            // thumb_md variant
  preview_url: string;              // preview variant
  
  // === OPTIONAL FIELDS ===
  filename?: string;
  original_url?: string;            // only if download_policy allows
  width?: number;                   // from EXIF or derivative
  height?: number;
  duration_ms?: number;             // for videos only
  date_taken?: string;              // from EXIF
  
  // === OPTIONAL EXIF (if exif_visible=true) ===
  exif?: AssetExif;
}

/**
 * Upload Session Response
 * POST /v1/workspaces/{workspace_id}/uploads
 */
interface UploadSessionResponse {
  // === MANDATORY FIELDS ===
  upload_id: string;
  provider: 'r2' | 'byos';
  upload_url: string;               // presigned URL for direct upload
  headers: Record<string, string>;  // required headers for upload
  expires_at: string;               // ISO timestamp, typically 1 hour
}

/**
 * Upload Commit Response
 * POST /v1/workspaces/{workspace_id}/uploads/{upload_id}/commit
 */
interface UploadCommitResponse {
  // === MANDATORY FIELDS ===
  asset_id: string;
  status: 'available' | 'processing';
  
  // === OPTIONAL (available after processing) ===
  thumbnail_url?: string;
}

/**
 * Gallery Create/Update Request
 * POST /v1/workspaces/{workspace_id}/galleries
 * PATCH /v1/workspaces/{workspace_id}/galleries/{gallery_id}
 */
interface GalleryCreateRequest {
  // === MANDATORY FIELDS ===
  title: string;                    // 1-255 chars, non-empty
  
  // === OPTIONAL FIELDS ===
  description?: string;             // max 1000 chars
  client_name?: string;             // max 255 chars
}

interface GalleryUpdateRequest {
  // === ALL FIELDS OPTIONAL (partial update) ===
  title?: string;
  description?: string;
  client_name?: string;
  layout_style?: LayoutStyle;
  theme?: ThemeMode;
  download_policy?: DownloadPolicy;
  exif_visible?: boolean;
  password?: string;                // plain text, will be hashed
  remove_password?: boolean;        // set to true to remove password
  email_registration_required?: boolean;
  expires_at?: string | null;       // null to remove expiry
  branding_profile_id?: string | null;
  cover_asset_id?: string | null;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Based on the prework analysis, the following properties have been identified after reflection to eliminate redundancy:

### Property 1: Gallery List Data Completeness
*For any* gallery displayed in the list, the gallery card SHALL contain title, cover image (or placeholder), status badge, photo count, and creation date.
**Validates: Requirements 1.1**

### Property 2: Gallery List Default Sort Order
*For any* gallery list displayed, galleries SHALL be sorted by creation date in descending order (newest first) by default.
**Validates: Requirements 1.2**

### Property 3: Status Badge Visual Distinction
*For any* gallery status (draft, published, archived), the status badge SHALL have a distinct visual style (draft=gray, published=green, archived=amber).
**Validates: Requirements 1.5**

### Property 4: Gallery Title Validation
*For any* gallery creation or update, the title field SHALL reject empty strings and whitespace-only strings.
**Validates: Requirements 2.2**

### Property 5: Workspace Scoping
*For any* gallery created, the gallery SHALL be associated with the current workspace_id and created_by_user_id.
**Validates: Requirements 2.5**

### Property 6: Gallery Header Data Display
*For any* gallery detail view, the header SHALL display the gallery title, client name (if set), creation date, and status badge.
**Validates: Requirements 3.1**

### Property 7: Statistics Accuracy
*For any* gallery displayed, the total items count SHALL equal the actual number of assets in the gallery, and favorites count SHALL equal the number of favorited assets.
**Validates: Requirements 3.3**

### Property 8: Sub-Gallery Tab Rendering
*For any* gallery with sub-galleries, the tabs SHALL be rendered in sort_order with "Root Gallery" as the first tab.
**Validates: Requirements 4.1**

### Property 9: Sub-Gallery Filtering
*For any* sub-gallery tab selection, the photo grid SHALL display only photos belonging to that sub-gallery (or unassigned photos for Root Gallery).
**Validates: Requirements 4.3**

### Property 10: File Type Validation
*For any* file upload attempt, the system SHALL accept only valid image types (JPEG, PNG, WebP, HEIC) and video types (MP4, MOV), rejecting all other file types.
**Validates: Requirements 5.1**

### Property 11: Upload Concurrency Limit
*For any* batch upload, the system SHALL process a maximum of 3 concurrent uploads with remaining files queued.
**Validates: Requirements 5.6**

### Property 12: Photo Aspect Ratio Preservation
*For any* photo displayed in the masonry grid, the rendered aspect ratio SHALL match the original photo's aspect ratio.
**Validates: Requirements 6.1**

### Property 13: Lazy Loading Images
*For any* photo thumbnail displayed, the image element SHALL have loading="lazy" attribute for below-fold images.
**Validates: Requirements 6.2**

### Property 14: Favorite Badge Rendering
*For any* photo with is_favorited=true, the photo card SHALL display a heart icon with "FAVORITE" badge.
**Validates: Requirements 6.3**

### Property 15: Private Badge Rendering
*For any* photo with is_private=true, the photo card SHALL display a lock icon with "PRIVATE" badge.
**Validates: Requirements 6.4**

### Property 16: Video Badge Rendering
*For any* video asset, the photo card SHALL display a play icon and duration badge.
**Validates: Requirements 6.5**

### Property 17: Lightbox Keyboard Navigation
*For any* lightbox view, pressing ArrowRight SHALL navigate to next photo, ArrowLeft to previous, and Escape SHALL close the lightbox.
**Validates: Requirements 7.3**

### Property 18: Lightbox Metadata Display
*For any* photo in lightbox view, the metadata panel SHALL display filename, dimensions, and date taken (if available in EXIF).
**Validates: Requirements 7.4**

### Property 19: Favorites Filter Accuracy
*For any* active favorites filter, the displayed photos SHALL include only photos where is_favorited=true.
**Validates: Requirements 8.2**

### Property 20: Picks Filter Accuracy
*For any* active picks filter, the displayed photos SHALL include only photos where is_selected=true.
**Validates: Requirements 8.3**

### Property 21: Download Policy Options
*For any* gallery settings form, the download policy dropdown SHALL contain exactly four options: view_only, web_only, watermarked_only, original_allowed.
**Validates: Requirements 9.4**

### Property 22: Publish Button Visibility
*For any* gallery with status='draft', the header SHALL display a "Publish" button. For status='published', it SHALL display "Unpublish".
**Validates: Requirements 10.1, 10.3**

### Property 23: Publish Validation
*For any* publish attempt on a gallery with zero photos, the system SHALL reject the publish and display an error message.
**Validates: Requirements 10.2**

### Property 24: Sort Order Persistence
*For any* photo reordering operation, the new sort_order values SHALL be persisted to the backend.
**Validates: Requirements 11.5**

### Property 25: List View Columns
*For any* list view mode, the table SHALL display columns: thumbnail, filename, dimensions, date, favorites status, selections status.
**Validates: Requirements 12.3**

### Property 26: View Mode State Preservation
*For any* view mode switch (grid to list or vice versa), the current filter state and selection state SHALL be preserved.
**Validates: Requirements 12.4**

### Property 27: Search Filter Behavior
*For any* search query, the displayed photos SHALL include only photos whose filename contains the search string (case-insensitive).
**Validates: Requirements 13.2**

### Property 28: Combined Filter Support
*For any* combination of search query and favorites/picks filter, the results SHALL satisfy both filter conditions.
**Validates: Requirements 13.3**

### Property 29: Mobile Grid Columns
*For any* mobile viewport (width < 768px), the masonry grid SHALL display 2 columns. For tablet (768px-1024px), 3-4 columns.
**Validates: Requirements 14.3**

### Property 30: Mobile Touch Targets
*For any* interactive element on mobile viewport, the element SHALL have minimum dimensions of 48px × 48px.
**Validates: Requirements 14.5**

### Property 31: CDN Image URLs
*For any* thumbnail displayed, the image src SHALL use CDN-optimized URLs with appropriate sizing parameters.
**Validates: Requirements 15.3**

## Error Handling

### Client-Side Errors

```typescript
// Gallery service errors
const GALLERY_ERRORS = {
  GALLERY_NOT_FOUND: 'Gallery not found',
  GALLERY_EMPTY: 'Gallery must have at least one photo to publish',
  FORBIDDEN: 'You do not have permission to access this gallery',
  VALIDATION_ERROR: 'Please check the form for errors',
  UPLOAD_FAILED: 'Upload failed. Please try again.',
  UPLOAD_TOO_LARGE: 'File exceeds maximum size limit',
  INVALID_FILE_TYPE: 'File type not supported',
};

// Error boundary for gallery pages
class GalleryErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  
  render() {
    if (this.state.hasError) {
      return <GalleryErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

### Upload Error Handling

```typescript
interface UploadError {
  fileId: string;
  fileName: string;
  error: 'UPLOAD_FAILED' | 'CHECKSUM_MISMATCH' | 'FILE_TOO_LARGE' | 'INVALID_TYPE';
  message: string;
  retryable: boolean;
}

// Retry logic for failed uploads
const retryUpload = async (file: UploadFile, maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await uploadFile(file);
    } catch (error) {
      if (attempt === maxRetries || !isRetryable(error)) {
        throw error;
      }
      await delay(Math.pow(2, attempt) * 1000); // Exponential backoff
    }
  }
};
```

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests:

1. **Unit Tests**: Verify specific component rendering and behavior
2. **Property-Based Tests**: Verify universal properties hold across all inputs

### Property-Based Testing Library

**Library**: `fast-check` (TypeScript-native, excellent React integration)

**Configuration**:
```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    testTimeout: 30000,
  },
});

// Property test setup
import fc from 'fast-check';

fc.configureGlobal({
  numRuns: 100,
  verbose: true,
});
```

### Test File Structure

```
frontend/src/components/gallery/
├── GalleryList/
│   ├── GalleryList.test.tsx           # Unit tests
│   └── GalleryList.property.test.tsx  # Property tests
├── PhotoGrid/
│   ├── PhotoGrid.test.tsx
│   └── PhotoGrid.property.test.tsx
├── Upload/
│   ├── UploadDropzone.test.tsx
│   └── Upload.property.test.tsx
└── __tests__/
    └── gallery.property.test.tsx      # Cross-cutting properties
```

### Unit Test Examples

```typescript
// GalleryList.test.tsx
describe('GalleryList', () => {
  it('renders gallery cards with required fields', () => {
    const galleries = [mockGallery({ title: 'Wedding Photos' })];
    render(<GalleryList galleries={galleries} />);
    expect(screen.getByText('Wedding Photos')).toBeInTheDocument();
    expect(screen.getByTestId('status-badge')).toBeInTheDocument();
  });

  it('displays empty state when no galleries', () => {
    render(<GalleryList galleries={[]} />);
    expect(screen.getByText('Create your first gallery')).toBeInTheDocument();
  });
});
```

### Property Test Examples

```typescript
/**
 * **Feature: gallery-crud, Property 4: Gallery Title Validation**
 * **Validates: Requirements 2.2**
 */
describe('Property 4: Gallery Title Validation', () => {
  it('rejects empty and whitespace-only titles', () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constantFrom(' ', '\t', '\n', '')),
        (whitespaceTitle) => {
          const result = validateGalleryTitle(whitespaceTitle);
          return result.valid === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: gallery-crud, Property 10: File Type Validation**
 * **Validates: Requirements 5.1**
 */
describe('Property 10: File Type Validation', () => {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime'];
  
  it('accepts valid file types', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...validTypes),
        (mimeType) => {
          return isValidFileType(mimeType) === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects invalid file types', () => {
    fc.assert(
      fc.property(
        fc.string().filter(s => !validTypes.includes(s)),
        (mimeType) => {
          return isValidFileType(mimeType) === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

/**
 * **Feature: gallery-crud, Property 19: Favorites Filter Accuracy**
 * **Validates: Requirements 8.2**
 */
describe('Property 19: Favorites Filter Accuracy', () => {
  it('filter returns only favorited photos', () => {
    fc.assert(
      fc.property(
        fc.array(galleryAssetArbitrary()),
        (photos) => {
          const filtered = filterByFavorites(photos);
          return filtered.every(p => p.is_favorited === true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

## File Structure

```
frontend/src/
├── components/
│   └── gallery/                    # NEW: Gallery components
│       ├── GalleryList/
│       ├── GalleryDetail/
│       ├── PhotoGrid/
│       ├── PhotoList/
│       ├── Lightbox/
│       ├── Upload/
│       ├── Settings/
│       └── shared/
├── pages/
│   └── workspace/
│       ├── GalleryListPage.tsx     # NEW
│       ├── GalleryDetailPage.tsx   # NEW
│       └── GalleryCreatePage.tsx   # NEW
├── services/
│   ├── galleryService.ts           # NEW: Gallery API client
│   └── uploadService.ts            # NEW: Upload handling
├── hooks/
│   ├── useGallery.ts               # NEW: Gallery state hook
│   ├── useGalleryAssets.ts         # NEW: Assets with pagination
│   └── useUpload.ts                # NEW: Upload queue hook
└── types/
    └── gallery.ts                  # NEW: Gallery types
```

## Performance Considerations

### Virtualized Scrolling

```typescript
// Use react-window for large photo grids
import { VariableSizeGrid } from 'react-window';

const VirtualizedPhotoGrid = ({ photos, columnCount }) => {
  return (
    <VariableSizeGrid
      columnCount={columnCount}
      rowCount={Math.ceil(photos.length / columnCount)}
      columnWidth={() => containerWidth / columnCount}
      rowHeight={getRowHeight}
    >
      {PhotoCell}
    </VariableSizeGrid>
  );
};
```

### Image Optimization

```typescript
// CDN URL builder with sizing
const getCDNUrl = (assetId: string, variant: 'thumb_sm' | 'thumb_md' | 'preview') => {
  const sizes = { thumb_sm: 256, thumb_md: 512, preview: 2048 };
  return `${CDN_BASE}/${assetId}/${variant}?w=${sizes[variant]}&f=webp`;
};
```

### Upload Queue Management

```typescript
// Concurrent upload manager
class UploadManager {
  private queue: UploadFile[] = [];
  private active: Map<string, Promise<void>> = new Map();
  private maxConcurrent = 3;

  async addFiles(files: File[]) {
    for (const file of files) {
      this.queue.push(createUploadFile(file));
    }
    this.processQueue();
  }

  private async processQueue() {
    while (this.queue.length > 0 && this.active.size < this.maxConcurrent) {
      const file = this.queue.shift()!;
      const promise = this.uploadFile(file);
      this.active.set(file.id, promise);
      promise.finally(() => this.active.delete(file.id));
    }
  }
}
```

