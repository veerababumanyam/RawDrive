# Research: Public Gallery Branding & Album Title

**Feature Branch**: `013-public-gallery-branding`
**Date**: 2025-12-29
**Status**: Complete

## Executive Summary

This research documents the technical findings for implementing enhanced public gallery branding features. The implementation requires:
1. **Database change**: Add `album_title` column to `magic_links` table
2. **Frontend changes**: Update ShareDialog, PublicGalleryPage, and type definitions
3. **Backend changes**: Update API schemas, service, and repository

## Existing Infrastructure Analysis

### 1. Magic Links System

**Current Database Schema** (`0031_magic_links_and_qr.py`):
```sql
CREATE TABLE magic_links (
    link_id UUID PRIMARY KEY,
    workspace_id UUID NOT NULL,
    gallery_id UUID NOT NULL,
    token_hash VARCHAR(64) NOT NULL,      -- SHA-256 hash (security)
    target_type magic_link_target_type NOT NULL DEFAULT 'gallery',
    target_id UUID,
    label VARCHAR(100),                    -- Internal management label
    expires_at TIMESTAMPTZ,
    max_accesses INTEGER,
    access_count INTEGER DEFAULT 0,
    status magic_link_status DEFAULT 'active',
    qr_config JSONB,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    created_by_user_id UUID
);
```

**Gap Identified**: No `album_title` field exists. The `label` field is for internal management, not client-facing display.

**Frontend Type** (`frontend/src/types/gallery.ts:377-395`):
```typescript
export interface MagicLink {
  link_id: string;
  gallery_id: string;
  label?: string;           // Internal label
  target_type: MagicLinkTargetType;
  target_id?: string;
  status: MagicLinkStatus;
  expires_at?: string;
  max_accesses?: number;
  access_count: number;
  qr_config?: QRConfig;
  created_at: string;
  updated_at: string;
  token?: string;           // Only on creation
  url?: string;             // Only on creation
  public_url?: string;      // Stored in DB
}
```

**Gap Identified**: No `album_title` field in MagicLink interface.

### 2. Company Profile System

**Already Available** - Company profile data is returned from the backend and accessible in the frontend:

**Backend Response** (`ValidateMagicLinkResponse` in `schemas.py:853-861`):
```python
class ValidateMagicLinkResponse(BaseModel):
    link_id: UUID
    gallery_id: UUID
    target_type: str
    target_id: Optional[UUID] = None
    gallery: dict
    company_profile: Optional[dict] = None  # Already included!
```

**Frontend Access** (`PublicGalleryPage.tsx:672`):
```typescript
const { company_profile } = gallery;
```

**Company Profile Fields Available**:
- `name` - Company name (what we need to display)
- `logo_url` - Logo image URL
- `brand_color` - Primary brand color
- `website` - Company website URL

### 3. Cover Photo System

**Already Implemented** - Gallery has `cover_asset_id` field and PublicGalleryPage constructs cover URL:

**Location** (`PublicGalleryPage.tsx:678-680`):
```typescript
const coverUrl = gallery.cover_asset_id
    ? `/api/v1/public/galleries/${gallery.gallery_id}/assets/${gallery.cover_asset_id}/preview`
    : null;
```

**Gap Identified**: When `cover_asset_id` is null, the page shows gradient background. Need to auto-select first available photo.

### 4. Hero Section Current State

**Location** (`PublicGalleryPage.tsx:1062-1094`):
- Lines 1063-1080: Cover photo or gradient background (working)
- Lines 1082-1094: Overlay content with title, description, date badge, photo count badge

**Elements to Modify**:
- Line 1084: Shows `gallery.title` - should show album_title (from magic link) with fallback to gallery.title
- Line 1089: Date badge - to be removed per spec
- Line 1090: Photo count badge - to be removed per spec

### 5. Header Section Current State

**Location** (`PublicGalleryPage.tsx:984-1060`):
```typescript
<div className="flex items-center gap-4">
    {company_profile?.logo_url ? (
        <img src={company_profile.logo_url} alt={company_profile.name} className="h-10 w-auto" />
    ) : (
        company_profile?.name && <span className="text-lg font-bold">{company_profile.name}</span>
    )}
    <div className="w-px h-8 bg-gray-200 mx-2 hidden sm:block"></div>
    <h1 className="text-lg font-medium hidden sm:block">{gallery.title}</h1>
</div>
```

**Gap Identified**: Shows logo OR company name, then gallery title. Should show logo + company name together.

### 6. Share Dialog

**Location** (`frontend/src/components/features/gallery/ShareDialog.tsx`):

**Current Form State** (lines 73-78):
```typescript
const [formData, setFormData] = useState<CreateMagicLinkRequest>({
    label: '',           // Internal label
    expires_at: undefined,
    max_accesses: undefined,
});
```

**Gap Identified**: No `album_title` field in form. Need to add required input for client-facing album title.

## Technical Clarifications Resolved

### Q1: Backward Compatibility for Existing Magic Links
**Resolution**: Use fallback strategy - if `album_title` is null (old links), display `gallery.title` instead. This requires no migration of existing data.

### Q2: Company Name Source
**Resolution**: Use `company_profile.name` from the workspace's company profile. This is already returned in the `ValidateMagicLinkResponse`.

### Q3: Cover Photo Auto-Selection Logic
**Resolution**: When `gallery.cover_asset_id` is null:
1. Use first available asset from `assets` array
2. If no assets, fall back to gradient background

## Files Requiring Modification

### Backend (Python/FastAPI)
| File | Change |
|------|--------|
| `backend/migrations/versions/0056_add_album_title_to_magic_links.py` | Add `album_title VARCHAR(200)` column |
| `backend/src/app/api/schemas.py` | Add `album_title` to MagicLink schemas |
| `backend/src/app/models/magic_link.py` | Add `album_title` field |
| `backend/src/app/repositories/magic_link_repository.py` | Include album_title in queries |
| `backend/src/app/services/magic_link_service.py` | Handle album_title in create/validate |

### Frontend (TypeScript/React)
| File | Change |
|------|--------|
| `frontend/src/types/gallery.ts` | Add `album_title` to MagicLink and CreateMagicLinkRequest |
| `frontend/src/components/features/gallery/ShareDialog.tsx` | Add required album title input field |
| `frontend/src/pages/public/PublicGalleryPage.tsx` | Update header, hero section, cover fallback |

## Implementation Notes

### Album Title Field Constraints
- **Max Length**: 200 characters (allow longer titles than internal labels)
- **Required**: Yes, when creating new magic links
- **Validation**: Trim whitespace, allow special characters and emojis
- **Display**: Support text truncation with ellipsis after 2 lines

### Cover Photo Fallback Logic
```typescript
// Pseudocode for cover URL with fallback
const coverUrl = useMemo(() => {
    // Priority 1: Explicit cover photo
    if (gallery.cover_asset_id) {
        return `/api/v1/public/galleries/${gallery.gallery_id}/assets/${gallery.cover_asset_id}/preview`;
    }
    // Priority 2: First available asset
    if (assets.length > 0) {
        return `/api/v1/public/galleries/${gallery.gallery_id}/assets/${assets[0].asset_id}/preview`;
    }
    // Priority 3: No cover (gradient fallback)
    return null;
}, [gallery.cover_asset_id, gallery.gallery_id, assets]);
```

### Header Branding Logic
```typescript
// Pseudocode for header display
<header>
    {company_profile?.logo_url && (
        <img src={company_profile.logo_url} alt={company_profile.name} />
    )}
    {company_profile?.name && (
        <span className="company-name">{company_profile.name}</span>
    )}
</header>
```

## Database Migration Preview

```python
# 0056_add_album_title_to_magic_links.py
def upgrade():
    op.execute("""
        ALTER TABLE magic_links
        ADD COLUMN IF NOT EXISTS album_title VARCHAR(200);

        COMMENT ON COLUMN magic_links.album_title IS
        'Client-facing album title displayed on public gallery page. Falls back to gallery title if NULL.';
    """)

def downgrade():
    op.execute("ALTER TABLE magic_links DROP COLUMN IF EXISTS album_title;")
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing magic links | Low | High | Fallback to gallery.title when album_title is NULL |
| Long company names breaking layout | Medium | Low | CSS truncation with ellipsis |
| Cover photo load failure | Low | Medium | Graceful fallback to gradient |
| Missing company profile | Low | Low | Conditional rendering - show nothing if not configured |

## Next Steps

1. Create `data-model.md` with entity definitions
2. Create `contracts/` with API schemas
3. Create `quickstart.md` for implementation
4. Generate tasks via `/speckit.tasks`
