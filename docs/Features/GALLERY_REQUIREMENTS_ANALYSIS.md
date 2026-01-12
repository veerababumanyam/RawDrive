# Gallery Requirements Analysis

> **Purpose**: Comprehensive documentation of gallery terminology, current configuration, and feature requirements. This document serves as the single source of truth for gallery development.

---

## 1. Canonical Terminology (from GLOSSARY.md)

### Core Entities

| Term | Definition | Canonical ID |
|------|------------|--------------|
| **Workspace** | Unit of tenancy, isolation, billing, and policy enforcement | `workspace_id` |
| **Gallery** | Workspace-scoped container for photo/video assets with settings and sharing | `gallery_id` |
| **Sub-gallery / Section** | First-class partition under a gallery for organization and selective sharing | `sub_gallery_id` |
| **Asset** | Photo or video plus derivatives (thumbnails, renditions), metadata (EXIF, tags), and AI annotations | `asset_id` |
| **Album** | Digital/print design project referencing assets, with spreads/pages and proofing/approval | `album_id` |
| **Share Link / Magic Link** | Capability-based access grant scoped to gallery/sub-gallery/asset/album with time-boxing and policies | `link_id` |

### User Types

| Term | Definition |
|------|------------|
| **User** | Authenticated identity in RawDrive (photographer/team member) |
| **Client** | Non-team identity interacting with shared galleries via share link (favorites, comments, downloads) |
| **Workspace Member** | User + role assignment within a specific workspace |

### Access & Storage

| Term | Definition |
|------|------------|
| **Signed URL** | Time-limited URL granting access to an object for uploads/downloads |
| **BYOS** | Bring Your Own Storage - customer-owned storage provider (Google Drive, Dropbox, S3-compatible) |
| **Managed Storage** | RawDrive-hosted object storage (Cloudflare R2) |

---

## 2. Currently Configured Gallery Settings

### 2.1 Gallery Status Lifecycle

```typescript
GalleryStatus = {
  DRAFT: 'draft',      // Not visible to clients
  PUBLISHED: 'published', // Accessible via share links
  ARCHIVED: 'archived',  // Hidden from active lists
}
```

### 2.2 Gallery Core Fields

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `gallery_id` | UUID | Unique identifier | Auto |
| `workspace_id` | UUID | Tenant isolation key | Auto |
| `title` | string (1-255) | Gallery name | Yes |
| `description` | string (0-1000) | Gallery description | No |
| `client_name` | string (0-255) | Associated client name | No |
| `client_id` | UUID | Reference to clients table | No |
| `shoot_date` | datetime | Date of photo shoot | No |
| `status` | enum | draft/published/archived | Yes |
| `cover_asset_id` | UUID | Cover image for gallery | No |
| `created_by_user_id` | UUID | Gallery creator | Auto |
| `created_at` | datetime | Creation timestamp | Auto |
| `updated_at` | datetime | Last update timestamp | Auto |
| `published_at` | datetime | When published | Auto |
| `pinned_at` | datetime | Pin timestamp for sorting | No |
| `last_accessed_at` | datetime | Last client access | Auto |

### 2.3 Access Control Settings

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| `password_protected` | boolean | Whether password is required | false |
| `password` | string (hashed) | Gallery access password | null |
| `pin_protected` | boolean | Whether PIN is required | false |
| `pin` | string (4-6 digits, hashed) | Secondary access code | null |
| `email_registration_required` | boolean | Require email before viewing | false |
| `expires_at` | datetime | Gallery expiration date | null |
| `custom_domain` | string (0-255) | Custom domain (CNAME) | null |

### 2.4 Download Policy Settings

```typescript
DownloadPolicy = {
  VIEW_ONLY: 'view_only',           // No downloads allowed
  WEB_ONLY: 'web_only',             // Optimized web images only
  WATERMARKED_ONLY: 'watermarked_only', // With watermark applied
  ORIGINAL_ALLOWED: 'original_allowed', // Full-resolution files
}
```

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| `download_policy` | enum | Controls download capability | view_only |

### 2.5 Branding & Visual Identity Settings

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| `branding_profile_id` | UUID | Reference to Company Profile | null |
| `layout_style` | enum | tabs / continuous | tabs |
| `theme` | enum | light / dark / system | system |
| `primary_color` | string | DEPRECATED - use gradient_config | null |
| `gradient_config` | JSONB | Gradient branding configuration | null |
| `font_family` | string | Typography override | null |
| `exif_visible` | boolean | Show EXIF metadata to clients | true |
| `custom_links` | JSONB | Array of {label, url} navigation links | [] |
| `portal_language` | string | Default language for client portal | null |

### 2.6 Gradient Configuration Schema

```typescript
interface GradientConfiguration {
  type: 'linear';           // Gradient type
  preset_id?: string;       // Reference to preset or null for custom
  direction: number;        // Angle 0-360 degrees
  colors: ColorStop[];      // Array of color stops
}

interface ColorStop {
  color: string;           // Hex color (#RRGGBB)
  position: number;        // Position 0-100%
}
```

### 2.7 Favorites Settings (Per-Gallery)

| Setting | Type | Description | Default |
|---------|------|-------------|---------|
| `favorites_enabled` | boolean | Allow clients to favorite photos | true |
| `sharing_enabled` | boolean | Allow sharing favorite lists via link | true |
| `download_enabled` | boolean | Allow ZIP download of favorites | true |
| `download_resolution` | enum | web_only / original_allowed | web_only |
| `max_lists_per_client` | int (1-20) | Max favorite lists per client | 5 |
| `download_limit_per_client` | int (1-1000) | Max photos per download | 100 |

---

## 3. Sub-Gallery Configuration

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `sub_gallery_id` | UUID | Unique identifier | Auto |
| `gallery_id` | UUID | Parent gallery reference | Yes |
| `name` | string (1-100) | Sub-gallery name | Yes |
| `sort_order` | int | Display order | Yes |
| `visible` | boolean | Visibility to clients | true |
| `cover_asset_id` | UUID | Cover image | No |
| `photo_count` | int | Denormalized count | Auto |

---

## 4. Magic Link (Share Link) Configuration

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `link_id` | UUID | Unique identifier | Auto |
| `gallery_id` | UUID | Parent gallery | Yes |
| `album_title` | string | Client-facing title override | No |
| `label` | string | Internal label for photographer | No |
| `target_type` | enum | gallery / sub_gallery / photo | gallery |
| `target_id` | UUID | Target entity ID | No |
| `status` | enum | active / expired / revoked | active |
| `expires_at` | datetime | Link expiration | null |
| `max_accesses` | int | Access count limit | null |
| `access_count` | int | Current access count | 0 |
| `qr_config` | JSONB | QR code configuration | null |
| `public_url` | string | Generated public URL | Auto |

### QR Configuration Schema

```typescript
interface QRConfig {
  size?: number;           // QR code size in pixels
  color?: string;          // QR code color (hex)
  logo_enabled?: boolean;  // Include workspace logo
  error_correction?: 'L' | 'M' | 'Q' | 'H';  // Error correction level
}
```

---

## 5. Gallery Asset Configuration

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `gallery_asset_id` | UUID | Unique identifier | Auto |
| `gallery_id` | UUID | Parent gallery | Yes |
| `asset_id` | UUID | Reference to asset | Yes |
| `sub_gallery_id` | UUID | Sub-gallery placement | No |
| `sort_order` | int | Display order | Yes |
| `visible` | boolean | Visibility to clients | true |
| `is_private` | boolean | Requires access code | false |
| `title` | string | Photo title/caption | No |
| `description` | string | Photo description | No |
| `tags` | string[] | Photo tags | [] |

### Asset Metadata (Read-only)

| Field | Type | Description |
|-------|------|-------------|
| `type` | enum | photo / video |
| `status` | enum | uploading / processing / available / failed / deleted |
| `mime_type` | string | File MIME type |
| `width` | int | Image width in pixels |
| `height` | int | Image height in pixels |
| `duration_ms` | int | Video duration (videos only) |
| `file_size` | int | File size in bytes |
| `date_taken` | datetime | EXIF capture date |
| `lqip` | string | Low Quality Image Placeholder (data URI) |

### Asset EXIF Data

| Field | Type | Description |
|-------|------|-------------|
| `make` | string | Camera manufacturer |
| `model` | string | Camera model |
| `lens` | string | Lens model |
| `aperture` | number | F-stop value |
| `shutter_speed` | string | Shutter speed |
| `iso` | int | ISO sensitivity |
| `focal_length` | number | Focal length in mm |
| `flash` | boolean | Flash fired |
| `latitude` | number | GPS latitude |
| `longitude` | number | GPS longitude |

---

## 6. Client Interaction Data

### Favorites (Per Client Per Asset)

| Field | Type | Description |
|-------|------|-------------|
| `is_favorited` | boolean | Client has favorited |
| `favorites_count` | int | Total favorites count |
| `client_favorites_count` | int | Unique clients who favorited |

### Selections/Picks (Per Client Per Asset)

| Field | Type | Description |
|-------|------|-------------|
| `is_selected` | boolean | Client has selected |
| `client_picks_count` | int | Unique clients who picked |

---

## 7. Feature Requirements from CLIENT_FACING_FEATURES.md

### 7.1 Gallery Access & Entry

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Lock Screen (Password Protection)** | CONFIGURED | password_protected, password fields |
| Glass morphism UI | NOT CONFIGURED | Design requirement only |
| "Remember me" option | NOT CONFIGURED | Session management feature |
| Brute-force protection | CONFIGURED | Rate limiting in backend |
| Password reset capability | **IMPLEMENTED** | Email-based reset flow with rate limiting |
| **Email Registration** | CONFIGURED | email_registration_required field |
| Email verification | PARTIAL | Capture only, no verification flow |
| **Access Codes (Per-Photo)** | **IMPLEMENTED** | Bcrypt-hashed access codes per photo |
| Unique codes per photo | **IMPLEMENTED** | access_code_hash field + verification API |
| **Gallery Expiration** | CONFIGURED | expires_at field |
| IP whitelisting (Enterprise) | NOT CONFIGURED | Would need ip_whitelist field |

### 7.2 Gallery Navigation & Layout

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Floating Navigation Header** | IMPLEMENTED | Component exists |
| **Gallery Header Section** | IMPLEMENTED | Title, description, cover, stats |
| **FindMe (Face ID)** | IMPLEMENTED | FaceDiscovery component |
| Confidence threshold config | NOT CONFIGURED | Would need findme_settings |
| **Sub-Gallery Tabs** | CONFIGURED | layout_style = tabs |
| **Continuous Scroll** | CONFIGURED | layout_style = continuous |
| **Grid Layout** | IMPLEMENTED | Default view mode |
| **Masonry Layout** | IMPLEMENTED | Alternative view mode |
| **Text Search** | IMPLEMENTED | Search component |
| AI-generated tags searchable | PARTIAL | Tags exist, search TBD |

### 7.3 Photo Interaction

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Favorites (Heart Icon)** | IMPLEMENTED | is_favorited, favorites_count |
| **Selections/Picks (Checkmark)** | IMPLEMENTED | is_selected, client_picks_count |
| **Ratings (Star System)** | CONFIGURED | rating in client_interactions, average_rating on assets (Migration 0159) |
| **Photo Card Metadata** | PARTIAL | EXIF visible, captions now configured |
| **Photo Captions** | CONFIGURED | caption, caption_visible fields (Migration 0158) |

### 7.4 Media Viewing

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Lightbox (Full-screen)** | IMPLEMENTED | Lightbox component (947 lines) |
| Keyboard shortcuts | IMPLEMENTED | Arrow keys, Escape, +/- |
| **Deep Zoom** | IMPLEMENTED | Pinch-zoom, wheel zoom |
| **Slideshow** | IMPLEMENTED | Auto-advance feature |
| Configurable interval | **IMPLEMENTED** | slideshow_config.interval_seconds (3-30s) |
| Background music | **IMPLEMENTED** | Audio upload + volume/loop/crossfade controls |
| **Video Playback** | IMPLEMENTED | HTML5 video player |
| Playback speed control | PARTIAL | Standard controls |
| Captions/subtitles | NOT CONFIGURED | Would need vtt_url |

### 7.5 Collections & Organization

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Sub-galleries / Folders** | CONFIGURED | sub_galleries table |
| Nested folders | **IMPLEMENTED** | Up to 3 levels deep with parent_sub_gallery_id |
| Breadcrumb navigation | **IMPLEMENTED** | Breadcrumbs component + recursive CTE API |
| **Tab/Category System** | IMPLEMENTED | All/Favorites/Selections tabs |
| Guest Favorites tab | PARTIAL | Shows counts, not tab |

### 7.6 Selection & Proofing

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Client Proofing View** | IMPLEMENTED | Proofing mode |
| Selection counter | IMPLEMENTED | Shows count |
| Selection limit | NOT CONFIGURED | Would need selection_limit |
| **Bulk Selection** | IMPLEMENTED | Select All, Shift+Click |
| **Comments/Feedback** | IMPLEMENTED | CommentSection component |
| Pin positioning | PARTIAL | Comments on photo, not positioned |
| Comment threads | PARTIAL | Replies exist |

### 7.7 Downloads

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Single Download** | PARTIAL | Button exists, no format modal |
| Format selection modal | NOT IMPLEMENTED | DownloadPhotoModal needed |
| **Bulk Download (ZIP)** | IMPLEMENTED | favoritesService.ts |
| Progress tracking | IMPLEMENTED | Polling mechanism |
| Daily download limit | **IMPLEMENTED** | Redis-based quota tracking per visitor |

### 7.8 Sharing

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Share Links (Magic Links)** | CONFIGURED | Full implementation |
| **QR Code Generation** | CONFIGURED | qr_config in magic_links |
| Download QR as image | IMPLEMENTED | PNG/SVG/PDF export |
| **Social Sharing** | PARTIAL | Copy/native share only |
| Platform buttons | NOT IMPLEMENTED | WhatsApp, Facebook, etc. |
| UTM tracking | **IMPLEMENTED** | useUtmTracking hook + visitor API integration |
| Share analytics | PARTIAL | access_count only |

### 7.9 Branding & Customization

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Photographer Branding** | CONFIGURED | branding_profile_id references Company Profile |
| **Header Branding** | IMPLEMENTED | Logo, name, title from Company Profile |
| **Footer Branding** | PARTIAL | Basic footer exists |
| Social media links | CONFIGURED | `socials` field in Company Profile (gallery-service returns it) |
| **Watermarking** | CONFIGURED | download_policy = watermarked_only triggers watermark |
| Watermark position config | UI TYPE ONLY | WatermarkSettings type exists but not persisted |
| Watermark image | WORKSPACE LEVEL | Uses Company Profile logo |
| **Theme Support** | CONFIGURED | theme field (light/dark/system) |
| Force theme option | IMPLEMENTED | Photographer sets per gallery |
| **Custom Navigation Links** | CONFIGURED | custom_links JSONB array

### 7.10 Accessibility

| Requirement | Status | Notes |
|-------------|--------|-------|
| **WCAG 2.1 AA Compliance** | **IMPLEMENTED** | High contrast, skip links, keyboard nav |
| Keyboard navigation | IMPLEMENTED | Tab, Arrow keys, Escape |
| Screen reader support | **IMPLEMENTED** | Comprehensive ARIA labels + live regions |
| High contrast mode | **IMPLEMENTED** | useHighContrast hook + CSS variables |
| Skip links | **IMPLEMENTED** | SkipLinks component with target IDs |
| 44x44px touch targets | IMPLEMENTED | Verified in PhotoCard, HoverOverlay |

### 7.11 Multi-Language Support

| Requirement | Status | Notes |
|-------------|--------|-------|
| **i18n Infrastructure** | CONFIGURED | 13 locales defined |
| Gallery strings translated | PARTIAL | Common strings only |
| RTL support (Urdu) | **IMPLEMENTED** | useRTL hook + RTL CSS utilities |
| Language selector | PARTIAL | In workspace settings |
| Per-gallery language | CONFIGURED | portal_language field |

---

## 8. Gaps Summary (What Needs Configuration/Development)

### 8.1 New Fields - Implementation Status

| Field | Table | Type | Purpose | Status |
|-------|-------|------|---------|--------|
| `caption` | gallery_assets | text | Photo caption visible to clients | **IMPLEMENTED** (Migration 0158) |
| `caption_visible` | gallery_assets | boolean | Toggle caption display | **IMPLEMENTED** (Migration 0158) |
| `rating` | client_interactions | int (1-5) | Star rating | **IMPLEMENTED** (Migration 0159, API `/rate` endpoint) |
| `average_rating` | gallery_assets | float | Average rating aggregation | **IMPLEMENTED** (Migration 0158) |
| `selection_limit` | galleries | int | Max selections per client | **IMPLEMENTED** (Migration 0157) |
| `slideshow_config` | galleries | JSONB | Interval, transition, autoplay | **IMPLEMENTED** (Migration 0157) |
| `watermark_config` | galleries | JSONB | Position, opacity, scale | **IMPLEMENTED** (Migration 0157) |
| `findme_config` | galleries | JSONB | Confidence threshold, enabled | **IMPLEMENTED** (Migration 0157) |
| `ratings_enabled` | galleries | boolean | Enable star ratings | **IMPLEMENTED** (Migration 0157) |
| `activity_tracking` | galleries | JSONB | View/download/share tracking | **IMPLEMENTED** (Migration 0157) |
| `social_links` | company_profiles | JSONB | Social media URLs | **IMPLEMENTED** (column exists as `socials`) |

> **Note**: Fields marked "IMPLEMENTED" have backend Alembic migrations, gallery-service schemas, and service layer support. Run `alembic upgrade head` to apply.

### 8.2 New Features Needed

| Feature | Priority | Scope | Status |
|---------|----------|-------|--------|
| Mobile swipe navigation | CRITICAL | Lightbox enhancement | **IMPLEMENTED** |
| Single photo download modal | CRITICAL | New component | **IMPLEMENTED** |
| Platform social sharing buttons | HIGH | ShareMenu enhancement | **IMPLEMENTED** |
| Photo captions | HIGH | New field + UI | **IMPLEMENTED** (Migration 0158) |
| Star ratings | HIGH | New field + UI | **IMPLEMENTED** (ratings_enabled in 0157) |
| Gallery settings persistence | HIGH | Backend integration | **IMPLEMENTED** (13 fields in 0157) |
| WCAG 2.1 AA audit | MEDIUM | Accessibility fixes | **IMPLEMENTED** (keyboard nav, focus mgmt, aria-pressed) |
| Gallery string i18n | MEDIUM | Translation extraction | **IMPLEMENTED** (280+ strings in gallery.json) |
| Long-press context menu | LOW | Touch UX enhancement | **IMPLEMENTED** (useLongPress hook + PhotoContextMenu) |
| Album preview/proofing | FUTURE | New feature area | NOT STARTED |

### 8.3 Configuration vs Implementation Status Legend

```
CONFIGURED      = Setting exists in database schema, can be set via API/UI
IMPLEMENTED     = Feature fully functional in UI components
PARTIAL         = Partially implemented, needs enhancement
UI TYPE ONLY    = TypeScript type exists but NOT persisted to database
NOT CONFIGURED  = Needs database schema changes (new migration)
NOT IMPLEMENTED = Needs new component/feature development
WORKSPACE LEVEL = Setting is at workspace level, not per-gallery
```

### 8.4 Config Types Implementation Status

| Type | Frontend | Backend Schema | Database | Status |
|------|----------|----------------|----------|--------|
| `WatermarkConfig` | gallery.ts | common.py | ✅ JSONB (0157) | **IMPLEMENTED** |
| `FindMeConfig` | gallery.ts | common.py | ✅ JSONB (0157) | **IMPLEMENTED** |
| `SlideshowConfig` | gallery.ts | common.py | ✅ JSONB (0157) | **IMPLEMENTED** |
| `ActivityTrackingConfig` | gallery.ts | common.py | ✅ JSONB (0157) | **IMPLEMENTED** |
| `ViewMode` | gallery.ts | - | - | User preference (localStorage) |
| `FilterType` | gallery.ts | - | - | URL query param |
| `GalleryAssetSortOption` | gallery.ts | - | - | URL query param |

---

## 9. UI Settings Panel Organization

The GallerySettingsPanel component organizes settings into **10 sections** (tabs):

### Section: General
- Gallery title
- Description
- Client name / Client ID
- Shoot date

### Section: Access (AccessSettings + PinSettings)
- Password protection toggle + password input
- PIN protection toggle + PIN input (4-6 digits)
- Email registration required toggle
- Expiration date picker
- Custom domain input

### Section: Downloads (DownloadSettings)
- Download policy selector (view_only / web_only / watermarked_only / original_allowed)
- Bulk download options (allow bulk, full gallery, selection download)
- ZIP packaging options (folder structure, metadata file)
- Web quality settings (resolution, JPEG quality) - for web_only policy

### Section: Branding (BrandingSettings + VisualIdentitySettings + CustomLinksEditor)
- Company Profile reference
- Layout style (tabs / continuous)
- Theme (light / dark / system)
- Gradient configuration (preset or custom)
- Font family selector
- EXIF visibility toggle
- Custom navigation links editor

### Section: Interactions (ClientInteractionSettings) - NEW
- Comments enabled toggle
- Favorites enabled toggle
- Selections enabled toggle
- Selection limit (max photos per client)
- Star ratings enabled toggle

### Section: Watermark (WatermarkSettings) - NEW
- Watermark enabled toggle
- Position selector (top-left, top-right, bottom-left, bottom-right, center, tiled)
- Opacity slider (10-100%)
- Scale slider (10-50% of image)
- Custom watermark upload
- Preview visualization

### Section: FindMe (FindMeSettings) - NEW
- FindMe enabled toggle
- Guest access toggle
- Match sensitivity slider (confidence threshold 0.5-0.95)
- Maximum results input (10-500)
- Privacy notice and tips

### Section: Slideshow (SlideshowSettings) - NEW
- Slideshow enabled toggle
- Autoplay on open toggle
- Slide duration selector (3-30 seconds)
- Transition effect selector (fade, slide, zoom, none)
- Loop toggle
- Show captions toggle
- Preview visualization

### Section: Alerts (GalleryNotificationSettings) - NEW
- Comment notification toggle
- Favorite notification toggle
- Selection update notification toggle
- Download notification toggle
- Activity tracking settings (views, downloads, shares, anonymous mode)

### Section: AI (AISettings)
- Tagging health dashboard (read-only status)
- Queue unanalyzed photos action
- Re-analyze all photos action

### Separate Panel: Favorites Settings (FavoritesSettingsPanel)
- Favorites enabled toggle
- Sharing enabled toggle
- Download enabled toggle
- Download resolution selector
- Max lists per client (1-20)
- Download limit per client (1-1000)

---

## 10. Related Documentation

- [GLOSSARY.md](./GLOSSARY.md) - Canonical terminology
- [CLIENT_FACING_FEATURES.md](./CLIENT_FACING_FEATURES.md) - Full feature requirements
- [gallery.ts](../../frontend/src/types/gallery.ts) - Frontend types (includes new config types)
- [schemas.py](../../backend/src/app/api/schemas.py) - Backend schemas
- [shared-types/gallery.ts](../../packages/shared-types/src/gallery.ts) - Shared enums
- [GallerySettingsPanel.tsx](../../frontend/src/components/features/gallery/GallerySettingsPanel.tsx) - Settings UI (10 tabs)

### New Settings Components (2026-01-09)
- [ClientInteractionSettings.tsx](../../frontend/src/components/features/gallery/ClientInteractionSettings.tsx) - Comments, Favorites, Selections, Ratings
- [WatermarkSettings.tsx](../../frontend/src/components/features/gallery/WatermarkSettings.tsx) - Watermark configuration
- [FindMeSettings.tsx](../../frontend/src/components/features/gallery/FindMeSettings.tsx) - Face recognition settings
- [SlideshowSettings.tsx](../../frontend/src/components/features/gallery/SlideshowSettings.tsx) - Slideshow configuration
- [GalleryNotificationSettings.tsx](../../frontend/src/components/features/gallery/GalleryNotificationSettings.tsx) - Notifications & activity tracking
- [SinglePhotoDownloadModal.tsx](../../frontend/src/components/features/gallery/SinglePhotoDownloadModal.tsx) - Individual photo download with format selection

---

## 11. Gallery Microservice Implementation Gap Analysis

### 11.1 Overview

The gallery-service microservice (`services/gallery-service/`) handles high-performance gallery operations for 50K concurrent users. However, several frontend settings types are **NOT YET implemented** in the backend.

**Frontend Types Exist In:** `frontend/src/types/gallery.ts`
**Backend Schemas In:** `services/gallery-service/src/schemas/gallery.py`
**Backend Service In:** `services/gallery-service/src/services/gallery_service.py`

### 11.2 Gallery Microservice Fields - IMPLEMENTED

| Field | Type | Frontend Type | Backend Schema | Database | Status |
|-------|------|---------------|----------------|----------|--------|
| `comments_enabled` | boolean | GalleryDetailData | ✅ GalleryResponse | ✅ Migration 0157 | DONE |
| `favorites_enabled` | boolean | GalleryDetailData | ✅ GalleryResponse | ✅ Migration 0157 | DONE |
| `selections_enabled` | boolean | GalleryDetailData | ✅ GalleryResponse | ✅ Migration 0157 | DONE |
| `selection_limit` | int | GalleryDetailData | ✅ GalleryResponse | ✅ Migration 0157 | DONE |
| `ratings_enabled` | boolean | GalleryDetailData | ✅ GalleryResponse | ✅ Migration 0157 | DONE |
| `watermark_config` | JSONB | WatermarkConfig | ✅ GalleryResponse | ✅ Migration 0157 | DONE |
| `findme_config` | JSONB | FindMeConfig | ✅ GalleryResponse | ✅ Migration 0157 | DONE |
| `slideshow_config` | JSONB | SlideshowConfig | ✅ GalleryResponse | ✅ Migration 0157 | DONE |
| `activity_tracking` | JSONB | ActivityTrackingConfig | ✅ GalleryResponse | ✅ Migration 0157 | DONE |
| `notify_on_comment` | boolean | GalleryDetailData | ✅ GalleryResponse | ✅ Migration 0157 | DONE |
| `notify_on_favorite` | boolean | GalleryDetailData | ✅ GalleryResponse | ✅ Migration 0157 | DONE |
| `notify_on_selection` | boolean | GalleryDetailData | ✅ GalleryResponse | ✅ Migration 0157 | DONE |
| `notify_on_download` | boolean | GalleryDetailData | ✅ GalleryResponse | ✅ Migration 0157 | DONE |

### 11.3 Gallery Asset Fields - IMPLEMENTED

| Field | Type | Frontend Type | Backend Schema | Database | Status |
|-------|------|---------------|----------------|----------|--------|
| `caption` | text | GalleryAssetItem | ✅ GalleryAssetResponse | ✅ Migration 0158 | DONE |
| `caption_visible` | boolean | GalleryAssetItem | ✅ GalleryAssetResponse | ✅ Migration 0158 | DONE |
| `average_rating` | float | GalleryAssetItem | ✅ GalleryAssetResponse | ✅ Migration 0158 | DONE |

### 11.4 Completed Implementation Files

**1. Database Migrations (CREATED)**
```
backend/migrations/versions/0157_gallery_client_interaction_settings.py ✅
backend/migrations/versions/0158_gallery_asset_caption_fields.py ✅
```

**2. Gallery Service Schemas (UPDATED)**
```
services/gallery-service/src/schemas/common.py ✅
  - Added: WatermarkConfig, FindMeConfig, SlideshowConfig, ActivityTrackingConfig

services/gallery-service/src/schemas/gallery.py ✅
  - Updated: GalleryResponse (13 new fields)
  - Updated: GalleryUpdateRequest (13 new fields)
  - Updated: GalleryAssetResponse (caption, caption_visible, average_rating)
  - Updated: UpdateAssetRequest (caption, caption_visible)
```

**3. Gallery Service (UPDATED)**
```
services/gallery-service/src/services/gallery_service.py ✅
  - Updated: row_to_gallery_dict() - 13 new fields
  - Updated: update_gallery() valid_fields - 13 new fields
  - Added: JSONB serialization handling for config fields
```

### 11.5 Existing Fields Already in Microservice

These fields are **correctly implemented** in the gallery microservice:

| Field | Schema | Service | API |
|-------|--------|---------|-----|
| `title` | ✅ | ✅ | ✅ |
| `description` | ✅ | ✅ | ✅ |
| `client_name` | ✅ | ✅ | ✅ |
| `download_policy` | ✅ | ✅ | ✅ |
| `password_protected` | ✅ | ✅ | ✅ |
| `pin_protected` | ✅ | ✅ | ✅ |
| `email_registration_required` | ✅ | ✅ | ✅ |
| `expires_at` | ✅ | ✅ | ✅ |
| `layout_style` | ✅ | ✅ | ✅ |
| `theme` | ✅ | ✅ | ✅ |
| `exif_visible` | ✅ | ✅ | ✅ |
| `gradient_config` | ✅ | ✅ | ✅ |
| `custom_links` | ✅ | ✅ | ✅ |
| `branding_profile_id` | ✅ | ✅ | ✅ |
| `portal_language` | ✅ | ✅ | ✅ |

### 11.6 Implementation Priority Order

**Phase 1 (Critical - Required for Settings UI)**
1. Create Alembic migration 0157
2. Update `GalleryResponse` schema
3. Update `GalleryUpdateRequest` schema
4. Update `row_to_gallery_dict()`
5. Update `update_gallery()` valid_fields

**Phase 2 (High - Client Interaction)**
1. Add caption fields to gallery_assets
2. Update `GalleryAssetResponse` schema
3. Update asset listing queries

**Phase 3 (Medium - Advanced Features)**
1. Implement rating aggregation
2. Implement activity tracking storage
3. Implement notification triggers

---

## 12. Version History

| Date | Change |
|------|--------|
| 2026-01-09 | Initial comprehensive analysis |
| 2026-01-09 | Added 5 new settings components (Interactions, Watermark, FindMe, Slideshow, Alerts) |
| 2026-01-09 | Created SinglePhotoDownloadModal component |
| 2026-01-09 | Enhanced ShareMenu with Pinterest, Telegram, native share |
| 2026-01-09 | Added selection_limit and ratings_enabled to gallery types |
| 2026-01-09 | Expanded GallerySettingsPanel to 10 tabs |
| 2026-01-09 | Added Section 11: Gallery Microservice Implementation Gap Analysis |
| 2026-01-09 | Completed: Added 13 new fields to gallery-service schemas |
| 2026-01-09 | Completed: Added config types (Watermark, FindMe, Slideshow, ActivityTracking) |
| 2026-01-09 | Completed: Created migrations 0157 (gallery settings) and 0158 (asset captions) |
| 2026-01-09 | Completed: Updated gallery_service.py with new fields in row_to_gallery_dict and update_gallery |
| 2026-01-09 | Completed: Added `socials` field to gallery-service CompanyProfileResponse |
| 2026-01-09 | Completed: Gallery i18n extraction - 280+ strings added to gallery.json |
| 2026-01-09 | Completed: Updated get_gallery and get_public_gallery to fetch and return company profile with social links |
| 2026-01-09 | Completed: Created migration 0159 for rating support in client_interactions |
| 2026-01-09 | Completed: Added `/rate` API endpoint to gallery-service public API |
| 2026-01-09 | Completed: Rating aggregation updates average_rating on gallery_assets |
| 2026-01-09 | Completed: WCAG 2.1 AA - HoverOverlay keyboard accessibility and focus-within tracking |
| 2026-01-09 | Completed: WCAG 2.1 AA - ShareMenu modal focus management and keyboard navigation |
| 2026-01-09 | Completed: WCAG 2.1 AA - Added touch-target class to all action buttons (44x44px min) |
| 2026-01-09 | Completed: WCAG 2.1 AA - Added aria-pressed to toggle buttons, aria-hidden to decorative icons |
| 2026-01-09 | Completed: Long-press context menu - Created useLongPress hook with haptic feedback |
| 2026-01-09 | Completed: Long-press context menu - Created PhotoContextMenu component with animated portal |
| 2026-01-09 | Completed: Long-press context menu - Integrated into PhotoCard with createPhotoContextActions |
| 2026-01-10 | 027-gallery-feature-completion: US1 - Per-Photo Access Codes with bcrypt hashing |
| 2026-01-10 | 027-gallery-feature-completion: US2 - Daily Download Limits with Redis quota tracking |
| 2026-01-10 | 027-gallery-feature-completion: US3 - WCAG 2.1 AAA High Contrast Mode |
| 2026-01-10 | 027-gallery-feature-completion: US4 - Skip Links for screen reader navigation |
| 2026-01-10 | 027-gallery-feature-completion: US5 - RTL Layout support for Urdu |
| 2026-01-10 | 027-gallery-feature-completion: US6 - Breadcrumb Navigation with recursive CTE |
| 2026-01-10 | 027-gallery-feature-completion: US7 - Nested Sub-Galleries up to 3 levels |
| 2026-01-10 | 027-gallery-feature-completion: US8 - UTM Tracking with visitor analytics |
| 2026-01-10 | 027-gallery-feature-completion: US9 - Password Reset via email flow |
| 2026-01-10 | 027-gallery-feature-completion: US10 - Slideshow Background Music with audio controls |
