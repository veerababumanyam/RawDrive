# Phase 10: Foundation & Fixes - Research

**Researched:** 2026-03-19
**Domain:** Profile infrastructure (avatar storage, theme engine, shared renderer)
**Confidence:** HIGH

## Summary

Phase 10 addresses three broken/fragmented systems: avatar upload/display (currently stored as PostgreSQL blobs via `personal_profile_repository.save_avatar_images()`, not CDN-ready), theme engine (3 separate files with 5 orphaned legacy themes), and public profile rendering (two completely divergent component trees for `/u/:slug` and `/p/:slug`). The codebase already has strong foundations to build on -- an `R2StorageService` with circuit breaker and `upload_bytes()` method in `backend/src/app/services/r2_storage_service.py`, 20 PREBUILT themes with light/dark variants in `constants/themes.ts`, a Bento grid system with modular section components, and an `AvatarUploader` component with working initials fallback.

The primary challenge is consolidation without regression. The backend avatar pipeline stores thumbnails as PostgreSQL binary columns at 4 sizes (64/128/256/512px). Migration to R2 requires adding R2 upload alongside the existing DB save, then updating the public avatar endpoint to serve from R2 when available, falling back to DB. The frontend `useAvatarUrl` hook already handles both absolute URLs and relative API paths, so switching to R2 URLs requires minimal frontend changes. The API contract (`/api/v1/public/personal-profiles/{slug}/avatar`) is preserved.

**Primary recommendation:** Execute in dependency order -- R2 avatar pipeline first (backend-only, preserves API contract), then UnifiedThemeEngine (pure frontend refactor using CSS custom properties), then shared PublicProfileRenderer (depends on both), then smoke tests last.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Store avatars in Cloudflare R2 with public URLs, consistent with gallery image storage and CDN-ready
- Lazy migration strategy: serve from PostgreSQL if R2 URL missing, migrate to R2 on next upload -- avoids batch migration complexity
- Preserve existing API contract: `/api/v1/public/personal-profiles/{slug}/avatar` proxies R2 -- no frontend URL changes needed
- Fallback: initials badge (first letters of display_name) when avatar fails to load -- already exists in AvatarUploader component
- Single UnifiedThemeEngine replacing 3 fragmented files (ProfileThemeEngine.ts, themeTransformer.ts, themeService.ts) -- CSS custom properties applied to root
- Delete 5 legacy themes (minimal, dark, pastel, bold, cinematic), map to nearest PREBUILT equivalent -- legacy themes are subsets of PREBUILT ones
- Apply themes via CSS custom properties on `:root` -- all components read `var(--theme-*)`, no prop drilling needed
- Dark mode: respect system `prefers-color-scheme` + use theme light/dark variants -- each PREBUILT theme already has both variants
- Shared PublicProfileRenderer component -- accepts profile data + type prop, renders appropriate sections for personal or company profiles
- Base on Bento Grid system (from `/u/` route) -- more modern, modular, already section-based
- Section registry pattern -- each section registers which profile types it supports, renderer picks applicable ones dynamically
- Shared components colocated at `frontend/src/components/features/profile/shared/`

### Claude's Discretion
- Smoke test implementation details (Vitest vs Playwright, test granularity)
- R2 bucket path structure for avatar files
- CSS custom property naming convention for theme tokens
- Section registry data structure

### Deferred Ideas (OUT OF SCOPE)
- Animated theme backgrounds (Phase 11)
- Drag-and-drop section reordering (Phase 12)
- Gallery preview blocks and booking CTA (Phase 13)
- SSR/prerendering for SEO (Phase 11)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FNDTN-01 | Avatar upload displays correctly on both personal and company profiles with R2 storage pipeline | `r2_storage_service.py` has `upload_bytes(key, data, content_type)` with circuit breaker. `personal_profile_service.py` lines 429-532 handle upload with PIL processing. Need to add R2 upload step after thumbnail generation, store R2 keys in DB, update public endpoint to serve from R2 first. |
| FNDTN-02 | Avatar has proper fallback (initials/placeholder) when image fails to load | `AvatarUploader.tsx` already has `getInitials()` function (handles single/multi-word names). Need shared `AvatarDisplay` component with `onError` handler that switches to initials badge. |
| FNDTN-03 | Theme engine consolidated into single UnifiedThemeEngine with CSS custom properties (legacy themes deleted) | Three files to replace: `ProfileThemeEngine.ts` (291 lines, 5 legacy themes + PREBUILT conversion), `themeTransformer.ts` (420 lines, backend-to-frontend mapping), `themeService.ts` (649 lines, singleton service). New engine resolves theme ID to CSS vars. |
| FNDTN-04 | Personal and company profiles share a unified PublicProfileRenderer component | `/u/:slug` uses `ProfileBentoGrid` + section components (Header, Bio, Socials, Contact, Gallery, MediaEmbed, Actions). `/p/:slug` uses `PublicProfileLayout` with glass card components (HeroGlassCard, ServicesGlassGrid, FooterGlassStrip). Need shared renderer with section registry. |
| FNDTN-05 | Smoke tests verify both profile pages load, avatar displays, and themes render correctly | Vitest 1.6.x configured in `vite.config.ts` with jsdom environment, setup file at `./src/test/setup.ts`. Use Vitest component tests with mocked API responses. |
</phase_requirements>

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 18.x | UI framework | Project standard |
| Vitest | ^1.6.1 | Test runner | Configured in vite.config.ts, jsdom environment |
| @testing-library/react | installed | Component testing | Project standard per testing-patterns skill |
| boto3 | installed | R2/S3 storage | Already used in r2_storage_service.py |
| Pillow (PIL) | installed | Image processing | Already used in personal_profile_service.py |
| react-helmet-async | installed | SEO metadata | Already used in both profile pages |
| TanStack Query | installed | Data fetching | Project standard for server state |

### Supporting (Already Installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| lucide-react | installed | Icons | Loading/error states in profiles |
| framer-motion | installed | Animations | Section transitions |
| tailwindcss | installed | Styling | All component styling |
| zod | installed | Validation | Avatar upload param validation |

### No New Packages Required
This phase requires zero new npm or pip packages. All functionality builds on existing dependencies.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/components/features/profile/
  shared/                          # NEW - shared between /u/ and /p/
    PublicProfileRenderer.tsx       # NEW - unified renderer
    UnifiedThemeEngine.ts           # NEW - replaces 3 files
    SectionRegistry.ts             # NEW - section type registry
    AvatarDisplay.tsx              # NEW - avatar with fallback
    useProfileTheme.ts             # NEW - hook wrapping UnifiedThemeEngine
    sections/                      # NEW - adapter wrappers
      HeaderSection.tsx
      BioSection.tsx
      ContactSection.tsx
      SocialsSection.tsx
      index.ts
  ProfileBentoGrid.tsx             # EXISTING - reused by shared renderer
  ProfileGridItem.tsx              # EXISTING - reused
  ProfileHeader.tsx                # EXISTING - wrapped by HeaderSection
  ProfileBio.tsx                   # EXISTING - wrapped by BioSection
  ProfileContactGrid.tsx           # EXISTING - wrapped by ContactSection
  ProfileSocials.tsx               # EXISTING - wrapped by SocialsSection
  ProfileThemeEngine.ts            # DELETE after migration
  public/
    PublicProfileLayout.tsx        # DEPRECATED - font loading logic extracted first

frontend/src/
  utils/themeTransformer.ts        # DELETE after migration
  services/themeService.ts         # DELETE after migration

backend/src/app/
  services/
    personal_profile_service.py    # MODIFY - add R2 upload to upload_avatar
    company_profile_service.py     # MODIFY - add R2 avatar support
    r2_storage_service.py          # EXISTING - use upload_bytes()
  repositories/
    personal_profile_repository.py # MODIFY - add r2_key column support
```

### Pattern 1: Lazy Avatar Migration (Backend)
**What:** Upload new avatars to both R2 and PostgreSQL; serve from R2 if key exists, else DB.
**When to use:** All avatar upload and retrieval operations.

```python
# In personal_profile_service.py upload_avatar():
# After generating thumbnails (existing code lines 485-487)...

# NEW: Upload all sizes to R2
from app.services.r2_storage_service import R2StorageService

r2 = R2StorageService.get_instance()
for size in AVATAR_THUMBNAIL_SIZES:
    r2_key = f"{workspace_id}/avatars/{profile_id}/{size}.webp"
    await r2.upload_bytes(r2_key, thumbnails[size], "image/webp")

# EXISTING: Save to PostgreSQL (keep for fallback)
await self.repository.save_avatar_images(...)

# NEW: Store R2 key prefix for retrieval
await self.repository.update(
    profile_id, workspace_id,
    avatar_r2_prefix=f"{workspace_id}/avatars/{profile_id}",
)

# In get_avatar_image_by_slug():
# 1. Check if avatar_r2_prefix exists in profile data
# 2. If yes -> fetch from R2 via presigned URL or proxy
# 3. If no -> fall back to PG blob (legacy data)
```

**R2 bucket path structure (recommendation):**
```
{workspace_id}/avatars/{profile_id}/
  64.webp
  128.webp
  256.webp
  512.webp
```

### Pattern 2: UnifiedThemeEngine with CSS Custom Properties
**What:** Single file resolving theme ID to CSS custom properties, applied to a scoped container.
**When to use:** Every public profile page render.

```typescript
// shared/UnifiedThemeEngine.ts

// CSS custom property naming convention (recommendation):
// Matches existing pattern in ProfileThemeEngine.ts colors object
const THEME_VAR_NAMES = [
  '--theme-bg',
  '--theme-surface',
  '--theme-text',
  '--theme-text-secondary',
  '--theme-accent',
  '--theme-primary',
  '--theme-border',
  '--theme-font-heading',
  '--theme-font-body',
  '--theme-gradient',
] as const;

// Legacy theme ID -> PREBUILT theme ID mapping
export const LEGACY_TO_PREBUILT_MAP: Record<string, string> = {
  'minimal': 'theme-clean-slate',
  'dark': 'theme-midnight-studio',
  'pastel': 'theme-soft-focus',
  'bold': 'theme-neon-nights',
  'cinematic': 'theme-film-noir',
};

export function resolveThemeId(rawId: string | undefined): string {
  if (!rawId) return 'theme-clean-slate';
  if (rawId in LEGACY_TO_PREBUILT_MAP) return LEGACY_TO_PREBUILT_MAP[rawId];
  return rawId;
}

export function resolveThemeTokens(
  themeId: string,
  prefersDark: boolean
): Record<string, string> {
  const resolved = resolveThemeId(themeId);
  const theme = getThemeById(resolved) ?? getDefaultTheme();
  // Pick light or dark variant
  const variant = prefersDark
    ? theme.variants?.find(v => v.name === 'Dark') ?? theme.variants?.[0]
    : theme.variants?.[0];
  return {
    '--theme-bg': variant?.colors.background ?? '#FFFFFF',
    '--theme-text': variant?.colors.text_primary ?? '#1A1A1A',
    '--theme-text-secondary': variant?.colors.text_secondary ?? '#6B7280',
    '--theme-accent': theme.base_colors.accent,
    '--theme-primary': theme.base_colors.primary,
    '--theme-surface': variant?.colors.surface ?? '#FAFAFA',
    '--theme-border': variant?.colors.glass_border ?? '#E5E5E5',
    '--theme-font-heading': buildFontFamily(theme.default_typography.heading_font),
    '--theme-font-body': buildFontFamily(theme.default_typography.body_font),
  };
}

// Apply to a scoped container, NOT document.documentElement
export function applyThemeToContainer(
  container: HTMLElement,
  tokens: Record<string, string>
): () => void {
  Object.entries(tokens).forEach(([key, value]) => {
    container.style.setProperty(key, value);
  });
  return () => {
    Object.keys(tokens).forEach(key => container.style.removeProperty(key));
  };
}
```

### Pattern 3: Section Registry
**What:** Each profile section declares which profile types it supports; renderer picks applicable ones.
**When to use:** PublicProfileRenderer dynamically assembles layout.

```typescript
// shared/SectionRegistry.ts
export type ProfileType = 'personal' | 'company';

export interface SectionRegistryEntry {
  id: string;
  component: React.ComponentType<SectionProps>;
  supportedTypes: ProfileType[];
  requiredData: string[];  // profile keys that must be non-null to render
  gridSpan: { cols: 1 | 2 | 3 | 4; rows?: number };
  order: number;
}

export interface SectionProps {
  profileData: NormalizedProfileData;
  className?: string;
}

// Normalized shape that both personal and company profiles map to
export interface NormalizedProfileData {
  type: ProfileType;
  displayName: string;       // personal: display_name, company: company_name
  title?: string;            // personal: profile_title, company: tagline
  imageUrl?: string;         // personal: avatar_url, company: logo_url
  bio?: string;              // personal: bio, company: description
  location?: string;
  email?: string;
  phone?: string;
  website?: string;
  socialLinks?: Record<string, string>;
  // ... extend as needed
}

const SECTION_REGISTRY: SectionRegistryEntry[] = [
  {
    id: 'header',
    component: HeaderSection,
    supportedTypes: ['personal', 'company'],
    requiredData: ['displayName'],
    gridSpan: { cols: 4 },
    order: 0,
  },
  {
    id: 'bio',
    component: BioSection,
    supportedTypes: ['personal', 'company'],
    requiredData: ['bio'],
    gridSpan: { cols: 2 },
    order: 1,
  },
  {
    id: 'socials',
    component: SocialsSection,
    supportedTypes: ['personal', 'company'],
    requiredData: ['socialLinks'],
    gridSpan: { cols: 2 },
    order: 2,
  },
  {
    id: 'contact',
    component: ContactSection,
    supportedTypes: ['personal', 'company'],
    requiredData: [],  // always show if profile has any contact field
    gridSpan: { cols: 2 },
    order: 3,
  },
];

export function getSectionsForProfile(
  type: ProfileType,
  data: NormalizedProfileData
): SectionRegistryEntry[] {
  return SECTION_REGISTRY
    .filter(s => s.supportedTypes.includes(type))
    .filter(s => s.requiredData.length === 0 ||
                 s.requiredData.every(key => data[key as keyof NormalizedProfileData] != null))
    .sort((a, b) => a.order - b.order);
}
```

### Pattern 4: Avatar Display with Fallback
**What:** Shared avatar component with `onError` fallback to initials badge.
**When to use:** Both public profile pages, anywhere an avatar/logo is shown.

```typescript
// shared/AvatarDisplay.tsx
interface AvatarDisplayProps {
  imageUrl?: string | null;
  displayName: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

// Reuse getInitials from AvatarUploader.tsx
const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

export const AvatarDisplay: React.FC<AvatarDisplayProps> = ({
  imageUrl, displayName, size = 'lg', className
}) => {
  const [imgError, setImgError] = useState(false);

  if (imageUrl && !imgError) {
    return (
      <img
        src={imageUrl}
        alt={`${displayName}'s avatar`}
        onError={() => setImgError(true)}
        className={cn(sizeClasses[size], 'object-cover rounded-full', className)}
      />
    );
  }

  return (
    <div className={cn(sizeClasses[size], 'bg-primary/10 flex items-center justify-center rounded-full', className)}>
      <span className="font-semibold text-primary">{getInitials(displayName)}</span>
    </div>
  );
};
```

### Anti-Patterns to Avoid
- **Theme prop drilling:** Current `/u/` route passes `theme` object to every component. Use CSS custom properties on a scoped container instead -- components read `var(--theme-*)` directly via Tailwind arbitrary values like `text-[var(--theme-text)]`.
- **Applying CSS vars to `:root`:** The gallery `ThemeEngine` applies to specific containers. Profile theme engine should do the same to avoid leaking theme variables into the dashboard when navigating away.
- **Mixing gallery ThemeEngine with profile ThemeEngine:** `utils/ThemeEngine.ts` is for gallery design studio (different CSS var names like `--bg-primary`, `--text-primary`). Profile theme engine uses `--theme-*` prefix. Keep them separate.
- **Storing Tailwind class names in theme data:** `ProfileThemeEngine.ts` stores strings like `'bg-[var(--theme-bg)]'` in the theme object. Components should own their class names; the theme engine only sets CSS variable values.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| R2 S3 client | Custom HTTP/S3 client | `r2_storage_service.upload_bytes()` | Circuit breaker, error handling, executor threadpool already implemented |
| Image processing | Manual PIL pipeline | Existing `_generate_thumbnail()` and `_apply_crop()` in `personal_profile_service.py` | Handles EXIF transpose, format detection, size validation |
| Initials generation | New function | `getInitials()` from `AvatarUploader.tsx` | Already handles single/multi-word names correctly |
| Dark/light mode detection | Custom media query listener | `usePublicProfileTheme` hook | Handles system preference, localStorage persistence, toggle, real-time updates |
| Font loading | Manual `<link>` injection | `fontService` + `extractFontsToLoad()` from `themeTransformer.ts` | Already handles Google Fonts loading with status tracking |
| Grid layout | Custom CSS grid | `ProfileBentoGrid` + `ProfileGridItem` | Already responsive with proper breakpoints |

**Key insight:** The codebase has all the building blocks -- this phase is primarily wiring, consolidation, and cleanup rather than greenfield development.

## Common Pitfalls

### Pitfall 1: Avatar URL Not Updating After Upload
**What goes wrong:** Frontend caches old avatar URL via TanStack Query. New avatar shows on reload but not immediately.
**Why it happens:** Avatar URL path doesn't change (`/api/v1/public/personal-profiles/{slug}/avatar/256`), both browser and TanStack Query cache the response.
**How to avoid:** Append cache-busting query param after upload (e.g., `?t=${Date.now()}`). Invalidate TanStack Query cache for profile data after avatar mutation succeeds.
**Warning signs:** Avatar appears unchanged after successful upload until hard refresh.

### Pitfall 2: Breaking Existing Profiles During Lazy Migration
**What goes wrong:** Changing `get_avatar_image_by_slug` to read from R2 breaks profiles that haven't re-uploaded.
**Why it happens:** Lazy migration means old profiles only have avatar in PostgreSQL.
**How to avoid:** Public endpoint must check R2 first (if `avatar_r2_prefix` exists), fall back to DB. Never remove DB read path in this phase.
**Warning signs:** Old profiles show broken avatars after deployment.

### Pitfall 3: Legacy Theme IDs in Database
**What goes wrong:** Existing profiles have `background_theme = 'minimal'` or `'dark'` saved in PostgreSQL. Deleting legacy themes from frontend code makes those profiles render with default theme.
**Why it happens:** Direct deletion without mapping.
**How to avoid:** `LEGACY_TO_PREBUILT_MAP` in UnifiedThemeEngine resolves old IDs to PREBUILT equivalents. Engine checks this map before falling back to default.
**Warning signs:** Profiles using old themes suddenly look different (default theme instead of closest match).

### Pitfall 4: CSS Variables Leaking Outside Profile Page
**What goes wrong:** Theme CSS variables set during public profile visit persist when navigating to dashboard.
**Why it happens:** Setting vars on `document.documentElement` is global and persists.
**How to avoid:** Apply CSS variables to a scoped container element (the profile page wrapper div), not `:root`. Clean up on component unmount via useEffect cleanup. The gallery `ThemeEngine` already demonstrates this pattern with `applyTheme(container, config)` returning a cleanup function.
**Warning signs:** Dashboard styles change after visiting a public profile.

### Pitfall 5: Company Profile Field Name Mismatch
**What goes wrong:** Shared renderer assumes personal profile field names (`display_name`, `bio`, `avatar_url`), crashes or shows empty on company profiles.
**Why it happens:** Company profiles use `company_name`, `description`, `logo_url` -- different field names for the same concepts.
**How to avoid:** Create a `NormalizedProfileData` interface and adapter functions that map both profile types to the common shape before passing to the renderer.
**Warning signs:** Company profile page shows "undefined" or blank sections.

### Pitfall 6: Font Loading Flash (FOUT)
**What goes wrong:** Profile renders with system font, then flashes when Google Font loads.
**Why it happens:** Font loading is async, components render before fonts arrive.
**How to avoid:** Use the `fontsLoaded` state pattern from existing `PublicProfileView.tsx`: show skeleton/loader until `document.fonts.load()` resolves for theme fonts.
**Warning signs:** Visible text reflow on public profile load.

## Code Examples

### Existing Avatar Upload Flow (Backend - personal_profile_service.py)
```python
# Lines 429-532 - Current flow:
# 1. Validate profile exists via repository.get_by_workspace_and_user()
# 2. Validate file size (MAX_AVATAR_SIZE_BYTES) and format via _detect_image_format()
# 3. Open with PIL, apply EXIF transpose via ImageOps.exif_transpose()
# 4. Apply crop if crop_data provided via _apply_crop()
# 5. Generate 4 thumbnails (64, 128, 256, 512) via _generate_thumbnail()
# 6. Save all thumbnails to PostgreSQL via repository.save_avatar_images()
# 7. Set avatar_url = "/api/v1/public/personal-profiles/{slug}/avatar/256"
# 8. Invalidate Redis cache: redis.delete(f"personal_profile:{slug}")
```

### Existing R2 Upload Pattern (r2_storage_service.py)
```python
# upload_bytes(key, data, content_type) - Lines 745-791
# - Wraps boto3 put_object in asyncio executor
# - Protected by circuit breaker (5 failures -> 30s open)
# - Returns the R2 key on success
# - Raises StorageError or StorageUnavailableError
```

### Existing Theme Resolution (ProfileThemeEngine.ts)
```typescript
// getTheme(themeId) resolution order:
// 1. Check LEGACY_PROFILE_THEMES map (minimal, dark, pastel, bold, cinematic)
// 2. Find in PREBUILT_THEMES array by theme_id
// 3. Convert via convertBuiltInThemeToProfileTheme() - extracts first variant colors
// 4. Fallback to 'theme-clean-slate' then ultimate fallback to LEGACY minimal
```

### Existing Public Profile Page Differences
```typescript
// /u/:slug (PublicPersonalProfilePage.tsx):
// - Fetches via personalProfileService.getPublicProfile(slug)
// - Theme via ProfileThemeEngine.getTheme(profile.background_theme)
// - Layout: ProfileContainer > ProfileBentoGrid > ProfileGridItem > section components
// - Sections: ProfileHeader, ProfileBio, ProfileSocials, ProfileContactGrid,
//   ProfileGalleryPreview, ProfileMediaEmbed, ProfileActions

// /p/:slug (PublicProfileView.tsx):
// - Fetches via companyProfileService.getPublicProfile(slug)
// - Theme via themeTransformer.transformThemeForProfileCard()
// - Font loading via fontService + extractFontsToLoad()
// - Layout: PublicProfileLayout > GlassContainer > HeroGlassCard, ProfileBody,
//   ServicesGlassGrid, FooterGlassStrip
// - Completely different component tree
```

### Database Migration Pattern
```python
# Alembic migration for R2 avatar keys
def upgrade():
    op.add_column('personal_profile_avatars',
        sa.Column('r2_key_prefix', sa.String(512), nullable=True))
    # Single prefix column: "{workspace_id}/avatars/{profile_id}"
    # Size appended at read time: f"{prefix}/{size}.webp"

def downgrade():
    op.drop_column('personal_profile_avatars', 'r2_key_prefix')
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Avatar blobs in PostgreSQL | R2 object storage with DB fallback | This phase | CDN-ready, reduced DB load, faster loading |
| 3 separate theme files + 5 legacy themes | Single UnifiedThemeEngine with CSS vars | This phase | Single source of truth, no prop drilling |
| Two divergent profile renderers | Shared PublicProfileRenderer + section registry | This phase | DRY, consistent UX, easier feature additions |
| ThemeService singleton with mutable state | Pure functional theme resolution + React hook | This phase | No side effects, testable, no leaked state |

**Deprecated/outdated after this phase:**
- `ProfileThemeEngine.ts`: Replaced by `shared/UnifiedThemeEngine.ts`
- `themeTransformer.ts`: Merge font/color extraction into UnifiedThemeEngine
- `themeService.ts`: Replace singleton with functional approach
- `PublicProfileLayout.tsx` + glass card components: Replace with Bento grid for company profiles
- `LEGACY_PROFILE_THEMES` object: Replaced by `LEGACY_TO_PREBUILT_MAP` lookup

## Open Questions

1. **Exact PREBUILT theme IDs for legacy mappings**
   - What we know: Legacy themes are `minimal`, `dark`, `pastel`, `bold`, `cinematic`. 20 PREBUILT themes exist in `constants/themes.ts`.
   - What's unclear: Exact best visual match requires comparing color values side by side.
   - Recommendation: Implementer should compare `colorValues` from LEGACY_PROFILE_THEMES against PREBUILT variant colors. Suggested starting map: minimal->theme-clean-slate, dark->closest dark PREBUILT, pastel->closest soft PREBUILT, bold->closest gradient PREBUILT, cinematic->closest dark warm PREBUILT.

2. **Company profile avatar/logo storage**
   - What we know: Company profiles use `logo_url` field. `company_profile_service.py` exists but needs inspection for avatar handling.
   - What's unclear: Whether company profiles have a separate avatar table or store logos differently.
   - Recommendation: Inspect `company_profile_service.py` during implementation; apply same R2 migration pattern.

3. **R2 storage service instantiation in main backend**
   - What we know: `R2StorageService` exists at `backend/src/app/services/r2_storage_service.py` with full circuit breaker. R2 credentials are in settings.
   - What's unclear: Whether the main backend can import and use this service directly or needs a lighter wrapper.
   - Recommendation: The service is in the main backend codebase (not a separate microservice), so import directly. It already reads credentials from `get_settings()`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^1.6.1 with jsdom environment |
| Config file | `frontend/vite.config.ts` (test section lines 370-376) |
| Setup file | `frontend/src/test/setup.ts` |
| Quick run command | `cd frontend && pnpm test src/path/file.test.ts` |
| Full suite command | `cd frontend && pnpm test` |
| Backend tests | `docker exec rawdrive-backend pytest tests/path/test_file.py -x` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FNDTN-01 | Avatar uploads to R2 and displays via public endpoint | unit (backend) | `docker exec rawdrive-backend pytest tests/services/test_avatar_r2_upload.py -x` | No - Wave 0 |
| FNDTN-02 | Avatar shows initials fallback on image load error | unit (frontend) | `cd frontend && pnpm test src/components/features/profile/shared/__tests__/AvatarDisplay.test.tsx` | No - Wave 0 |
| FNDTN-03 | UnifiedThemeEngine resolves IDs to CSS vars, maps legacy IDs | unit (frontend) | `cd frontend && pnpm test src/components/features/profile/shared/__tests__/UnifiedThemeEngine.test.ts` | No - Wave 0 |
| FNDTN-04 | PublicProfileRenderer renders correct sections for both types | unit (frontend) | `cd frontend && pnpm test src/components/features/profile/shared/__tests__/PublicProfileRenderer.test.tsx` | No - Wave 0 |
| FNDTN-05 | Smoke tests: both pages load, avatar displays, themes render | smoke (frontend) | `cd frontend && pnpm test src/pages/public/__tests__/profile-smoke.test.tsx` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && pnpm test src/components/features/profile/shared/__tests__/ --run`
- **Per wave merge:** `cd frontend && pnpm test --run`
- **Phase gate:** Full frontend suite + backend profile tests green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/components/features/profile/shared/__tests__/AvatarDisplay.test.tsx` -- covers FNDTN-02
- [ ] `frontend/src/components/features/profile/shared/__tests__/UnifiedThemeEngine.test.ts` -- covers FNDTN-03
- [ ] `frontend/src/components/features/profile/shared/__tests__/SectionRegistry.test.ts` -- covers FNDTN-04
- [ ] `frontend/src/components/features/profile/shared/__tests__/PublicProfileRenderer.test.tsx` -- covers FNDTN-04
- [ ] `frontend/src/pages/public/__tests__/profile-smoke.test.tsx` -- covers FNDTN-05
- [ ] `backend/tests/services/test_avatar_r2_upload.py` -- covers FNDTN-01 (backend)
- [ ] No new framework install needed -- Vitest and pytest both already configured

## Sources

### Primary (HIGH confidence)
- Codebase: `backend/src/app/services/personal_profile_service.py` lines 429-572 -- avatar upload/get implementation storing blobs in PG
- Codebase: `backend/src/app/repositories/personal_profile_repository.py` lines 485-608 -- avatar DB schema with 4 size columns
- Codebase: `backend/src/app/services/r2_storage_service.py` lines 745-791 -- `upload_bytes()` with circuit breaker
- Codebase: `frontend/src/components/features/profile/ProfileThemeEngine.ts` -- 5 legacy themes + PREBUILT conversion (291 lines)
- Codebase: `frontend/src/utils/themeTransformer.ts` -- theme data transformation (420 lines)
- Codebase: `frontend/src/services/themeService.ts` -- singleton theme service (649 lines)
- Codebase: `frontend/src/constants/themes.ts` -- 20 PREBUILT themes
- Codebase: `frontend/src/pages/public/PublicPersonalProfilePage.tsx` -- Bento Grid personal profile page
- Codebase: `frontend/src/components/features/profile/PublicProfileView.tsx` -- company profile with font loading
- Codebase: `frontend/src/components/features/profile/public/PublicProfileLayout.tsx` -- company glass card layout
- Codebase: `frontend/src/components/settings/AvatarUploader.tsx` -- avatar with initials fallback
- Codebase: `frontend/src/hooks/useAvatarUrl.ts` -- avatar URL resolution (handles relative + absolute)
- Codebase: `frontend/src/hooks/usePublicProfileTheme.ts` -- dark/light mode detection with localStorage
- Codebase: `frontend/vite.config.ts` lines 370-376 -- Vitest config (jsdom, setup file)

### Secondary (MEDIUM confidence)
- Skill: `.claude/skills/storage-uploads/SKILL.md` -- R2 key convention `{workspace_id}/...`, presigned URL patterns
- Skill: `.claude/skills/react-frontend/SKILL.md` -- component patterns, file placement
- Skill: `.claude/skills/testing-patterns/SKILL.md` -- Vitest and pytest patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed, zero new dependencies
- Architecture: HIGH - patterns directly observed in codebase with specific line references
- Pitfalls: HIGH - identified from actual code analysis (cache busting, legacy theme IDs, field name mismatches, CSS scope leakage)

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain, no external dependency changes expected)
