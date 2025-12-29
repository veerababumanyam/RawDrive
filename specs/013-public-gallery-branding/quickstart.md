# Quickstart: Public Gallery Branding Implementation

**Feature Branch**: `013-public-gallery-branding`
**Date**: 2025-12-29

## Overview

This guide provides step-by-step implementation instructions for the Public Gallery Branding feature. Follow tasks in order as they have dependencies.

## Prerequisites

- [ ] Development environment running (`npm run docker:dev:up`)
- [ ] Backend server running (`npm run dev:backend`)
- [ ] Frontend dev server running (`npm run dev`)
- [ ] Database migrations up to date

## Implementation Order

### Phase 1: Database Migration

**File**: `backend/migrations/versions/0056_add_album_title_to_magic_links.py`

```python
"""Add album_title column to magic_links table."""

from alembic import op

revision = "0056"
down_revision = "0055"

def upgrade() -> None:
    op.execute("""
        ALTER TABLE magic_links
        ADD COLUMN IF NOT EXISTS album_title VARCHAR(200);

        COMMENT ON COLUMN magic_links.album_title IS
        'Client-facing album title displayed on public gallery page.';
    """)

def downgrade() -> None:
    op.execute("ALTER TABLE magic_links DROP COLUMN IF EXISTS album_title;")
```

**Run migration**:
```bash
cd backend
DATABASE_URL="postgresql://rawdrive:rawdrive@localhost:5432/rawdrive" PYTHONPATH=src alembic upgrade head
```

### Phase 2: Backend Schema Updates

**File**: `backend/src/app/api/schemas.py`

Add `album_title` to the magic link schemas:

```python
# In CreateMagicLinkRequest class
album_title: Optional[str] = Field(
    None,
    max_length=200,
    description="Client-facing album title for public display"
)

# In MagicLinkResponse class
album_title: Optional[str] = None

# In ValidateMagicLinkResponse class
album_title: Optional[str] = None
```

### Phase 3: Backend Service Updates

**File**: `backend/src/app/services/magic_link_service.py`

Update `create_link` method to accept and store `album_title`:

```python
async def create_link(
    self,
    workspace_id: UUID,
    gallery_id: UUID,
    target_type: str = "gallery",
    target_id: Optional[UUID] = None,
    label: Optional[str] = None,
    album_title: Optional[str] = None,  # Add this
    expires_at: Optional[datetime] = None,
    max_accesses: Optional[int] = None,
    qr_config: Optional[dict] = None,
    created_by_user_id: Optional[UUID] = None,
    base_url: str = "",
) -> dict:
    # ... existing code ...

    # Include album_title in link_data dict
    link_data = {
        # ... existing fields ...
        "album_title": album_title,
    }
```

Update `validate_token` to return `album_title`:

```python
async def validate_token(self, token: str, ...) -> dict:
    # ... existing validation ...

    return {
        "link_id": str(link["link_id"]),
        "gallery_id": str(link["gallery_id"]),
        "target_type": link["target_type"],
        "target_id": str(link["target_id"]) if link.get("target_id") else None,
        "album_title": link.get("album_title"),  # Add this
        "gallery": gallery_data,
        "company_profile": company_profile,
    }
```

### Phase 4: Backend API Updates

**File**: `backend/src/app/api/v1/magic_links.py`

Update `create_magic_link` endpoint to pass `album_title`:

```python
result = await service.create_link(
    workspace_id=workspace_id,
    gallery_id=gallery_id,
    target_type=request.target_type,
    target_id=request.target_id,
    label=request.label,
    album_title=request.album_title,  # Add this
    expires_at=request.expires_at,
    max_accesses=request.max_accesses,
    qr_config=request.qr_config.model_dump() if request.qr_config else None,
    created_by_user_id=current_user.user_id,
    base_url=base_url,
)
```

### Phase 5: Frontend Type Updates

**File**: `frontend/src/types/gallery.ts`

```typescript
// Update MagicLink interface
export interface MagicLink {
  // ... existing fields ...
  album_title?: string;  // Add this
}

// Update CreateMagicLinkRequest interface
export interface CreateMagicLinkRequest {
  label?: string;
  album_title?: string;  // Add this - will be required in form validation
  // ... rest of fields ...
}
```

### Phase 6: ShareDialog Updates

**File**: `frontend/src/components/features/gallery/ShareDialog.tsx`

Add album title input field:

```typescript
// Update form state (around line 74)
const [formData, setFormData] = useState<CreateMagicLinkRequest>({
  album_title: '',  // Add this - required
  label: '',
  expires_at: undefined,
  max_accesses: undefined,
});

// Add validation (before handleCreateLink)
const isValid = formData.album_title && formData.album_title.trim().length > 0;

// Add input field in create view (around line 262)
<AppInput
  label="Album Title"
  value={formData.album_title || ''}
  onChange={(e) => setFormData({ ...formData, album_title: e.target.value })}
  placeholder="e.g., Sarah & John's Wedding - June 2025"
  required
  maxLength={200}
  helperText="This title will be shown to clients viewing the gallery"
/>

<AppInput
  label="Link Label (Optional)"
  value={formData.label || ''}
  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
  placeholder="Internal label for your reference"
/>

// Update create button to check validation
<AppButton
  variant="primary"
  onClick={handleCreateLink}
  isLoading={isCreating}
  disabled={!isValid || isCreating}
  fullWidth
>
  Create Shareable Link
</AppButton>
```

### Phase 7: PublicGalleryPage Header Updates

**File**: `frontend/src/pages/public/PublicGalleryPage.tsx`

Update header section (around line 986-994):

```typescript
<div className="flex items-center gap-3">
    {/* Logo */}
    {company_profile?.logo_url && (
        <img
            src={company_profile.logo_url}
            alt={company_profile.name || 'Logo'}
            className="h-10 w-auto object-contain"
        />
    )}
    {/* Company Name - always show next to logo */}
    {company_profile?.name && (
        <span className="text-lg font-semibold text-gray-900 dark:text-white truncate max-w-[200px]">
            {company_profile.name}
        </span>
    )}
</div>
```

### Phase 8: PublicGalleryPage Hero Updates

**File**: `frontend/src/pages/public/PublicGalleryPage.tsx`

1. Add state for album_title (get from magic link validation response):

```typescript
// After gallery state declaration
const [albumTitle, setAlbumTitle] = useState<string | null>(null);

// In fetchGalleryData, extract album_title from response
const galleryData = await galleryService.getPublicGallery(galleryIdOrToken);
setGallery(galleryData);
// If response includes album_title from magic link validation
if (galleryData.album_title) {
    setAlbumTitle(galleryData.album_title);
}
```

2. Update cover URL computation to include fallback (around line 678):

```typescript
const coverUrl = useMemo(() => {
    // Priority 1: Explicit cover photo
    if (gallery?.cover_asset_id) {
        return `/api/v1/public/galleries/${gallery.gallery_id}/assets/${gallery.cover_asset_id}/preview`;
    }
    // Priority 2: First available asset (auto-select)
    if (assets.length > 0) {
        return `/api/v1/public/galleries/${gallery?.gallery_id}/assets/${assets[0].asset_id}/preview`;
    }
    // Priority 3: No cover (gradient fallback)
    return null;
}, [gallery?.cover_asset_id, gallery?.gallery_id, assets]);
```

3. Update hero section (around line 1082-1094):

```typescript
<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end justify-center pb-12 p-4 text-center">
    <div className="max-w-3xl">
        {/* Album title with fallback to gallery title */}
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4 drop-shadow-lg font-heading line-clamp-2">
            {albumTitle || gallery.title}
        </h2>
        {gallery.description && (
            <p className="text-white/90 text-lg md:text-xl drop-shadow-md max-w-2xl mx-auto">
                {gallery.description}
            </p>
        )}
        {/* REMOVED: Date and photo count badges */}
    </div>
</div>
```

### Phase 9: Update galleryService

**File**: `frontend/src/services/galleryService.ts`

Ensure `getPublicGallery` returns `album_title` from the validation response:

```typescript
async getPublicGallery(galleryIdOrToken: string): Promise<GalleryDetailData & { album_title?: string }> {
    // If it looks like a magic link token (32+ chars, no UUID format)
    if (galleryIdOrToken.length >= 32 && !galleryIdOrToken.includes('-')) {
        const response = await api.get(`/public/magic-links/${galleryIdOrToken}`);
        // Return gallery data with album_title from magic link
        return {
            ...response.gallery,
            album_title: response.album_title,
            company_profile: response.company_profile,
        };
    }
    // Direct gallery access
    return api.get(`/public/galleries/${galleryIdOrToken}`);
}
```

## Testing Checklist

### Unit Tests
- [ ] Schema validation for album_title field
- [ ] Magic link creation with album_title
- [ ] Magic link validation returns album_title
- [ ] Backward compatibility with null album_title

### Integration Tests
- [ ] Create magic link with album_title via API
- [ ] Validate magic link returns album_title
- [ ] Existing links (no album_title) still work

### Manual Testing
1. **Share Dialog**
   - [ ] Album title field is visible and required
   - [ ] Cannot create link without album title
   - [ ] Link creates successfully with album title

2. **Public Gallery Page**
   - [ ] Company name appears next to logo in header
   - [ ] Album title appears in hero (not gallery name)
   - [ ] Cover photo fills hero section
   - [ ] Date and photo count badges are removed
   - [ ] Old links show gallery title (fallback)

3. **Edge Cases**
   - [ ] Long album titles truncate properly
   - [ ] Special characters display correctly
   - [ ] Emojis display correctly
   - [ ] Missing company profile doesn't break layout

## Verification Commands

```bash
# Run backend tests
cd backend && npm test

# Run frontend tests
cd frontend && npm test

# Check TypeScript types
cd frontend && npx tsc --noEmit

# Check for linting issues
npm run lint
```
