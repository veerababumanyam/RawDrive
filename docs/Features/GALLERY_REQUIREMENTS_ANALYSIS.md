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
| Password reset capability | NOT CONFIGURED | Would need email flow |
| **Email Registration** | CONFIGURED | email_registration_required field |
| Email verification | PARTIAL | Capture only, no verification flow |
| **Access Codes (Per-Photo)** | CONFIGURED | is_private field on gallery_asset |
| Unique codes per photo | NOT CONFIGURED | Would need access_code field |
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
| **Ratings (Star System)** | NOT CONFIGURED | Would need rating field |
| **Photo Card Metadata** | PARTIAL | EXIF visible, no captions |
| **Photo Captions** | NOT CONFIGURED | Would need caption field |

### 7.4 Media Viewing

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Lightbox (Full-screen)** | IMPLEMENTED | Lightbox component (947 lines) |
| Keyboard shortcuts | IMPLEMENTED | Arrow keys, Escape, +/- |
| **Deep Zoom** | IMPLEMENTED | Pinch-zoom, wheel zoom |
| **Slideshow** | IMPLEMENTED | Auto-advance feature |
| Configurable interval | NOT CONFIGURED | Would need slideshow_interval |
| Background music | NOT CONFIGURED | Would need audio_url |
| **Video Playback** | IMPLEMENTED | HTML5 video player |
| Playback speed control | PARTIAL | Standard controls |
| Captions/subtitles | NOT CONFIGURED | Would need vtt_url |

### 7.5 Collections & Organization

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Sub-galleries / Folders** | CONFIGURED | sub_galleries table |
| Nested folders | NOT CONFIGURED | Single level only |
| Breadcrumb navigation | NOT IMPLEMENTED | Component needed |
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
| Daily download limit | NOT CONFIGURED | Would need daily_download_limit |

### 7.8 Sharing

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Share Links (Magic Links)** | CONFIGURED | Full implementation |
| **QR Code Generation** | CONFIGURED | qr_config in magic_links |
| Download QR as image | IMPLEMENTED | PNG/SVG/PDF export |
| **Social Sharing** | PARTIAL | Copy/native share only |
| Platform buttons | NOT IMPLEMENTED | WhatsApp, Facebook, etc. |
| UTM tracking | NOT CONFIGURED | Would need utm_params |
| Share analytics | PARTIAL | access_count only |

### 7.9 Branding & Customization

| Requirement | Status | Notes |
|-------------|--------|-------|
| **Photographer Branding** | CONFIGURED | branding_profile_id references Company Profile |
| **Header Branding** | IMPLEMENTED | Logo, name, title from Company Profile |
| **Footer Branding** | PARTIAL | Basic footer exists |
| Social media links | NOT CONFIGURED | Would need social_links in Company Profile |
| **Watermarking** | CONFIGURED | download_policy = watermarked_only triggers watermark |
| Watermark position config | UI TYPE ONLY | WatermarkSettings type exists but not persisted |
| Watermark image | WORKSPACE LEVEL | Uses Company Profile logo |
| **Theme Support** | CONFIGURED | theme field (light/dark/system) |
| Force theme option | IMPLEMENTED | Photographer sets per gallery |
| **Custom Navigation Links** | CONFIGURED | custom_links JSONB array

### 7.10 Accessibility

| Requirement | Status | Notes |
|-------------|--------|-------|
| **WCAG 2.1 AA Compliance** | PARTIAL | Some ARIA, needs audit |
| Keyboard navigation | IMPLEMENTED | Tab, Arrow keys, Escape |
| Screen reader support | PARTIAL | Some ARIA labels |
| High contrast mode | NOT IMPLEMENTED | Would need preference |
| Skip links | NOT IMPLEMENTED | SkipLinks component needed |
| 44x44px touch targets | PARTIAL | Needs audit |

### 7.11 Multi-Language Support

| Requirement | Status | Notes |
|-------------|--------|-------|
| **i18n Infrastructure** | CONFIGURED | 13 locales defined |
| Gallery strings translated | PARTIAL | Common strings only |
| RTL support (Urdu) | NOT IMPLEMENTED | CSS RTL needed |
| Language selector | PARTIAL | In workspace settings |
| Per-gallery language | CONFIGURED | portal_language field |

---

## 8. Gaps Summary (What Needs Configuration/Development)

### 8.1 New Fields Needed

| Field | Table | Type | Purpose |
|-------|-------|------|---------|
| `caption` | gallery_assets | text | Photo caption visible to clients |
| `caption_visible` | gallery_assets | boolean | Toggle caption display |
| `rating` | client_asset_interactions | int (1-5) | Star rating |
| `selection_limit` | galleries | int | Max selections per client |
| `slideshow_interval` | galleries | int | Slideshow speed (seconds) |
| `watermark_settings` | galleries | JSONB | Position, opacity, scale |
| `findme_settings` | galleries | JSONB | Confidence threshold, enabled |
| `social_links` | company_profiles | JSONB | Social media URLs |

### 8.2 New Features Needed

| Feature | Priority | Scope |
|---------|----------|-------|
| Mobile swipe navigation | CRITICAL | Lightbox enhancement |
| Single photo download modal | CRITICAL | New component |
| Platform social sharing buttons | HIGH | ShareMenu enhancement |
| Photo captions | HIGH | New field + UI |
| Star ratings | HIGH | New field + UI |
| WCAG 2.1 AA audit | MEDIUM | Accessibility fixes |
| Gallery string i18n | MEDIUM | Translation extraction |
| Long-press context menu | LOW | Touch UX enhancement |
| Album preview/proofing | FUTURE | New feature area |

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

### 8.4 UI-Only Types (Not Persisted)

These TypeScript types exist in the frontend but are **not stored in the database**:

| Type | Location | Purpose | Persistence |
|------|----------|---------|-------------|
| `WatermarkSettings` | canvas.ts | Watermark display options | Passed as props only |
| `ViewMode` | gallery.ts | grid/masonry/list | User preference (localStorage) |
| `FilterType` | gallery.ts | all/picks/favorites/selections | URL query param |
| `GalleryAssetSortOption` | gallery.ts | position/favorites/newest | URL query param |

---

## 9. UI Settings Panel Organization

The GallerySettingsPanel component organizes settings into these sections:

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

### Section: Branding (BrandingSettings + VisualIdentitySettings + CustomLinksEditor)
- Company Profile reference
- Layout style (tabs / continuous)
- Theme (light / dark / system)
- Gradient configuration (preset or custom)
- Font family selector
- EXIF visibility toggle
- Custom navigation links editor

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
- [gallery.ts](../../frontend/src/types/gallery.ts) - Frontend types
- [schemas.py](../../backend/src/app/api/schemas.py) - Backend schemas
- [shared-types/gallery.ts](../../packages/shared-types/src/gallery.ts) - Shared enums
- [GallerySettingsPanel.tsx](../../frontend/src/components/features/gallery/GallerySettingsPanel.tsx) - Settings UI

---

## 11. Version History

| Date | Change |
|------|--------|
| 2026-01-09 | Initial comprehensive analysis |
