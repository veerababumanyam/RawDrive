# Data Model: Fix Magic Link Photo Grid

**Feature Branch**: `014-fix-magic-link-grid`
**Date**: 2025-12-30

---

## Overview

This feature primarily involves bug fixes to existing functionality. No new database tables or schema changes are required. The key entities involved are documented below for reference.

---

## Existing Entities (No Changes Required)

### Visitor

Represents a client accessing a gallery via Magic Link.

```typescript
interface Visitor {
  visitor_id: string;           // UUID
  gallery_id: string;           // UUID - which gallery they're accessing
  email?: string;               // Optional - if registration required
  name?: string;                // Optional - if registration required
  phone?: string;               // Optional - if registration required
  registered_at: Date;
  last_seen_at: Date;
}
```

**Storage**: PostgreSQL table `visitors`

---

### VisitorFavorite

Junction table tracking which photos a visitor has favorited.

```typescript
interface VisitorFavorite {
  id: string;                   // UUID
  visitor_id: string;           // UUID FK -> visitors
  asset_id: string;             // UUID FK -> gallery_assets
  gallery_id: string;           // UUID FK -> galleries
  created_at: Date;
}
```

**Storage**: PostgreSQL table `visitor_favorites`
**Constraint**: UNIQUE(visitor_id, asset_id)

---

### VisitorSelection (Client Pick)

Junction table tracking which photos a visitor has "picked" (client selection for delivery workflow).

```typescript
interface VisitorSelection {
  id: string;                   // UUID
  visitor_id: string;           // UUID FK -> visitors
  asset_id: string;             // UUID FK -> gallery_assets
  gallery_id: string;           // UUID FK -> galleries
  created_at: Date;
}
```

**Storage**: PostgreSQL table `visitor_selections`
**Constraint**: UNIQUE(visitor_id, asset_id)

---

### GalleryAsset

Represents a photo/video in a gallery (existing model used by PhotoGrid).

```typescript
interface GalleryAsset {
  asset_id: string;
  gallery_id: string;
  workspace_id: string;
  title?: string;
  description?: string;
  is_private: boolean;
  is_favorited: boolean;        // Computed for current user/visitor
  is_selected: boolean;         // Computed for current visitor (pick status)
  favorites_count: number;      // Count of favorites for this visitor
  position: number;
  asset: Asset;                 // Nested asset details
}
```

---

### PublicGalleryAsset

API response model for assets in public gallery view.

```typescript
interface PublicGalleryAsset {
  asset_id: string;
  gallery_id: string;
  title?: string;
  description?: string;
  is_private: boolean;
  favorites_count: number;      // BUG: Currently hardcoded to 0
  is_selected: boolean;         // Client pick status for visitor
  position: number;
  asset: {
    asset_id: string;
    type: 'photo' | 'video';
    filename: string;
    width?: number;
    height?: number;
    duration_ms?: number;
    status: 'uploading' | 'available' | 'processing' | 'failed';
    thumbnail_url?: string;
  };
}
```

---

### Gallery

Gallery configuration affecting public view behavior.

```typescript
interface Gallery {
  gallery_id: string;
  workspace_id: string;
  name: string;
  slug: string;
  download_policy: 'view_only' | 'watermarked_only' | 'original_allowed';
  sharing_enabled: boolean;
  pin_required: boolean;
  password_required: boolean;
  visitor_registration: 'none' | 'optional' | 'required';
  // ... other fields
}
```

**Relevant Fields for This Feature**:
- `download_policy`: Controls whether download button appears
- `sharing_enabled`: Controls whether share button appears
- `visitor_registration`: Affects how favorites/picks are persisted

---

## Frontend State Models

### LocalFavorites Map

Tracks favorite status in memory for optimistic UI updates.

```typescript
// PublicGalleryPage.tsx
const [localFavorites, setLocalFavorites] = useState<Map<string, number>>(new Map());

// Key: asset_id
// Value: favorites_count (1 = favorited, 0 = not favorited)
```

---

### LocalSelections Set

Tracks pick status in memory for optimistic UI updates.

```typescript
// PublicGalleryPage.tsx
const [localSelections, setLocalSelections] = useState<Set<string>>(new Set());

// Contains asset_ids that are marked as picks
```

---

### GalleryAssetItem (PhotoGrid/PhotoCard)

Transformed asset passed to grid components.

```typescript
interface GalleryAssetItem {
  asset_id: string;
  title?: string;
  description?: string;
  is_private: boolean;
  is_favorited: boolean;        // Derived from localFavorites
  is_selected: boolean;         // Derived from localSelections
  asset: {
    asset_id: string;
    type: 'photo' | 'video';
    filename: string;
    width?: number;
    height?: number;
    duration_ms?: number;
    status: string;
    thumbnail_url?: string;
  };
}
```

---

## API Response Models

### GET /v1/public/galleries/{token}/assets/filtered

```typescript
interface GetPublicAssetsResponse {
  items: PublicGalleryAsset[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}
```

**Bug Location**: Backend `gallery_service.py:2035` returns `favorites_count: 0` always.

---

### POST /v1/public/galleries/{token}/assets/{id}/favorite

```typescript
// Request: Empty body (toggle)
// Response:
interface ToggleFavoriteResponse {
  is_favorited: boolean;
  favorites_count: number;
}
```

---

### POST /v1/public/galleries/{token}/assets/{id}/selection

```typescript
// Request: Empty body (toggle)
// Response:
interface ToggleSelectionResponse {
  is_selected: boolean;
}
```

---

## Entity Relationships

```
┌─────────────┐       ┌─────────────────────┐
│   Visitor   │──────<│  visitor_favorites  │
└─────────────┘       └─────────────────────┘
      │                        │
      │                        ▼
      │               ┌───────────────┐
      │               │ gallery_asset │
      │               └───────────────┘
      │                        ▲
      ▼                        │
┌─────────────────────┐       │
│ visitor_selections  │───────┘
└─────────────────────┘

┌─────────────┐
│   Gallery   │────< download_policy, sharing_enabled
└─────────────┘
```

---

## No Schema Migrations Required

This feature is a bug fix that does not require database changes. The existing schema correctly supports:
- Visitor favorite persistence (visitor_favorites table)
- Visitor pick persistence (visitor_selections table)
- Gallery download/sharing policies

The bug is in the **query logic** that fails to return the correct `favorites_count` for the current visitor.
