# Phase 10: Foundation & Fixes - Research

**Researched:** 2026-03-19
**Domain:** Profile infrastructure (avatar storage, theme engine, shared renderer)
**Confidence:** HIGH

## Summary

Phase 10 addresses three interconnected problems: (1) broken avatar upload/display caused by storing binary blobs in PostgreSQL instead of R2, (2) fragmented theme engine spread across 3+ files with 5 orphaned legacy themes, and (3) two completely divergent public profile pages (`/u/:slug` using Bento Grid components, `/p/:slug` using a separate `PublicProfileView` component) that need a shared renderer.

The codebase already has strong foundations to build on. The upload-service has a production-ready `R2StorageService` with `upload_bytes()` method, circuit breaker, and boto3 integration. The `constants/themes.ts` has 20 well-structured PREBUILT themes with light/dark variants, typography, and layout configs. The personal profile's Bento Grid system (`ProfileBentoGrid`, `ProfileHeader`, `ProfileBio`, `ProfileSocials`, `ProfileContactGrid`) is modular and section-based, making it the right base for a shared renderer.

**Primary recommendation:** Migrate avatar storage to R2 with lazy migration (serve from PG if no R2 key, upload to R2 on next save), consolidate theme engine into a single `UnifiedThemeEngine` that applies CSS custom properties to `:root`, and build a `PublicProfileRenderer` with a section registry that selects sections based on profile type.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Store avatars in Cloudflare R2 with public URLs, consistent with gallery image storage and CDN-ready
- Lazy migration strategy: serve from PostgreSQL if R2 URL missing, migrate to R2 on next upload
- Preserve existing API contract: `/api/v1/public/personal-profiles/{slug}/avatar` proxies R2
- Fallback: initials badge (first letters of display_name) when avatar fails to load
- Single UnifiedThemeEngine replacing 3 fragmented files (ProfileThemeEngine.ts, themeTransformer.ts, themeService.ts)
- Delete 5 legacy themes (minimal, dark, pastel, bold, cinematic), map to nearest PREBUILT equivalent
- Apply themes via CSS custom properties on `:root`
- Dark mode: respect system `prefers-color-scheme` + use theme light/dark variants
- Shared PublicProfileRenderer component with type prop for personal or company profiles
- Base on Bento Grid system (from `/u/` route)
- Section registry pattern for dynamic section selection
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
| FNDTN-01 | Avatar upload displays correctly on both personal and company profiles with R2 storage pipeline | R2 upload_bytes pattern from upload-service, lazy migration from PG blobs, avatar_url field on both profile types |
| FNDTN-02 | Avatar has proper fallback (initials/placeholder) when image fails to load | ProfileHeader already has single-initial fallback; enhance to multi-initial with onError handler |
| FNDTN-03 | Theme engine consolidated into single UnifiedThemeEngine with CSS custom properties (legacy themes deleted) | Three files identified for replacement, 5 legacy themes mapped to PREBUILT equivalents, CSS var naming convention defined |
| FNDTN-04 | Personal and company profiles share a unified PublicProfileRenderer component | Two divergent pages identified, Bento Grid as base, section registry pattern for type-aware rendering |
| FNDTN-05 | Smoke tests verify both profile pages load, avatar displays, and themes render correctly | Vitest + React Testing Library for component smoke tests, existing test patterns available |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| boto3 | existing | R2/S3 uploads from backend | Already used in upload-service R2StorageService |
| Pillow | existing | Image processing (crop, resize, WebP) | Already used in personal_profile_service.py |
| TanStack Query | existing | Frontend data fetching for profiles | Project standard for server state |
| Framer Motion | existing | Profile section animations | Already used in ProfileHeader |
| Vitest | ^4.0.16 | Frontend test runner | Already configured in frontend/package.json |
| @testing-library/react | existing | Component testing | Already used in existing profile tests |

### Supporting (already in project)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-helmet-async | existing | SEO meta tags on public pages | Both profile pages already use it |
| lucide-react | existing | Icons in profile sections | Used in ProfileHeader for MapPin, CheckCircle |
| zod | existing | Validation for avatar upload params | Project standard for schema validation |

### No New Dependencies Needed
This phase requires zero new npm or pip packages. All functionality can be built with existing dependencies.

## Architecture Patterns

### Recommended Project Structure
```
frontend/src/components/features/profile/
├── shared/                         # NEW - shared between /u/ and /p/
│   ├── PublicProfileRenderer.tsx    # Main shared renderer
│   ├── UnifiedThemeEngine.ts       # Single theme engine (replaces 3 files)
│   ├── SectionRegistry.ts          # Section type registry
│   ├── AvatarDisplay.tsx           # Avatar with R2 URL + initials fallback
│   └── sections/                   # Reusable section components
│       ├── HeaderSection.tsx        # Wraps existing ProfileHeader logic
│       ├── BioSection.tsx           # Wraps ProfileBio
│       ├── ContactSection.tsx       # Wraps ProfileContactGrid
│       ├── SocialsSection.tsx       # Wraps ProfileSocials
│       └── index.ts                # Section exports + registry entries
├── ProfileBentoGrid.tsx            # Existing - reused by shared renderer
├── ProfileGridItem.tsx             # Existing - reused
├── ProfileHeader.tsx               # Existing - refactored to use shared Avatar
├── ProfileBio.tsx                  # Existing - kept
├── ProfileContactGrid.tsx          # Existing - kept
├── ProfileSocials.tsx              # Existing - kept
└── public/                         # Existing company profile layout (deprecated)
    └── PublicProfileLayout.tsx      # Font loading logic extracted, then deprecated

backend/src/app/
├── services/
│   ├── personal_profile_service.py  # Modified: upload_avatar saves to R2
│   └── r2_storage.py               # NEW: R2 client for main backend (simple)
├── repositories/
│   └── personal_profile_repository.py  # Modified: add r2_key column support
└── migrations/versions/
    └── XXXX_add_avatar_r2_keys.py   # NEW: add r2_key columns to avatar table
```

### Pattern 1: Lazy Avatar Migration (Backend)
**What:** Upload new avatars to R2 + store in PG; serve from R2 if key exists, else PG
**When to use:** During migration period (this phase onward)
```python
# In personal_profile_service.py upload_avatar():
# 1. Process image as before (crop, resize, thumbnails)
# 2. Upload all sizes to R2
r2_key = f"avatars/{workspace_id}/{profile_id}/{size}.webp"
await r2_client.upload_bytes(r2_key, thumbnail_bytes, "image/webp")
# 3. Store R2 keys in DB alongside PG blobs (backwards compat)
await self.repository.save_avatar_images(
    ...,
    r2_key_64=f"avatars/{workspace_id}/{profile_id}/64.webp",
    r2_key_128=f"avatars/{workspace_id}/{profile_id}/128.webp",
    # ...
)

# In get_avatar_image_by_slug():
# 1. Check if r2_key exists → redirect/proxy from R2
# 2. Else fall back to PG blob (legacy data)
```

### Pattern 2: UnifiedThemeEngine with CSS Custom Properties
**What:** Single file that reads a PREBUILT theme, generates CSS variables, applies to `:root`
**When to use:** Every public profile page render
```typescript
// shared/UnifiedThemeEngine.ts
export interface ThemeTokens {
  '--theme-bg': string;
  '--theme-surface': string;
  '--theme-text': string;
  '--theme-text-secondary': string;
  '--theme-accent': string;
  '--theme-primary': string;
  '--theme-border': string;
  '--theme-font-heading': string;
  '--theme-font-body': string;
  '--theme-radius': string;
  '--theme-shadow': string;
  '--theme-gradient': string;
}

export function resolveThemeTokens(
  themeId: string,
  prefersDark: boolean
): ThemeTokens {
  const theme = getThemeById(themeId) ?? getDefaultTheme();
  const variant = prefersDark
    ? theme.variants?.find(v => v.name === 'Dark') ?? theme.variants?.[0]
    : theme.variants?.[0];

  return {
    '--theme-bg': variant?.colors.background ?? '#FFFFFF',
    '--theme-surface': variant?.colors.surface ?? '#FAFAFA',
    '--theme-text': variant?.colors.text_primary ?? '#1A1A1A',
    '--theme-text-secondary': variant?.colors.text_secondary ?? '#6B7280',
    '--theme-accent': theme.base_colors.accent,
    '--theme-primary': theme.base_colors.primary,
    '--theme-border': variant?.colors.glass_border ?? '#E5E5E5',
    '--theme-font-heading': buildFontFamily(theme.default_typography.heading_font),
    '--theme-font-body': buildFontFamily(theme.default_typography.body_font),
    // ... effects
  };
}

export function applyThemeToRoot(tokens: ThemeTokens): void {
  const root = document.documentElement;
  Object.entries(tokens).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}
```

### Pattern 3: Section Registry
**What:** Each section declares which profile types it supports; renderer picks applicable ones
**When to use:** PublicProfileRenderer dynamically assembles sections
```typescript
// shared/SectionRegistry.ts
export type ProfileType = 'personal' | 'company';

export interface SectionRegistryEntry {
  id: string;
  component: React.ComponentType<SectionProps>;
  supportedTypes: ProfileType[];
  requiredData: string[];  // keys from profile data that must be non-null
  gridSpan?: { cols: number; rows: number };
  order: number;
}

const SECTION_REGISTRY: SectionRegistryEntry[] = [
  { id: 'header', component: HeaderSection, supportedTypes: ['personal', 'company'], requiredData: ['display_name'], gridSpan: { cols: 4, rows: 1 }, order: 0 },
  { id: 'bio', component: BioSection, supportedTypes: ['personal', 'company'], requiredData: ['bio'], gridSpan: { cols: 4, rows: 1 }, order: 1 },
  { id: 'contact', component: ContactSection, supportedTypes: ['personal', 'company'], requiredData: [], gridSpan: { cols: 2, rows: 1 }, order: 2 },
  { id: 'socials', component: SocialsSection, supportedTypes: ['personal', 'company'], requiredData: ['social_links'], gridSpan: { cols: 2, rows: 1 }, order: 3 },
  // Company-only sections can be added later
];

export function getSectionsForProfile(
  type: ProfileType,
  profileData: Record<string, unknown>
): SectionRegistryEntry[] {
  return SECTION_REGISTRY
    .filter(s => s.supportedTypes.includes(type))
    .filter(s => s.requiredData.every(key => profileData[key] != null))
    .sort((a, b) => a.order - b.order);
}
```

### Pattern 4: Avatar Display Component with Fallback
**What:** Shared avatar component with R2 URL, initials fallback, and error handling
```typescript
// shared/AvatarDisplay.tsx
interface AvatarDisplayProps {
  avatarUrl?: string;
  displayName: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const AvatarDisplay: React.FC<AvatarDisplayProps> = ({
  avatarUrl, displayName, size = 'lg', className
}) => {
  const [imgError, setImgError] = useState(false);
  const initials = displayName
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  if (avatarUrl && !imgError) {
    return <img src={avatarUrl} alt={displayName} onError={() => setImgError(true)} ... />;
  }
  return <div className="initials-badge">{initials}</div>;
};
```

### Anti-Patterns to Avoid
- **Storing theme state in singleton service:** ThemeService is a singleton with mutable state. The UnifiedThemeEngine should be purely functional (input theme ID + dark pref, output CSS tokens). No listener pattern needed.
- **Duplicating profile fetch logic:** Both pages currently have their own useEffect + setState for fetching. Extract to a shared `usePublicProfile(slug, type)` hook.
- **Mixing Tailwind arbitrary values with CSS variables:** The legacy themes have `bg-[var(--theme-bg)]` which causes Tailwind JIT bloat. Use CSS variables directly via `style` prop for dynamic values, Tailwind for static structure.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| R2 S3-compatible client | Custom HTTP client for R2 | boto3 with S3 API | Already proven in upload-service, handles retries, multipart |
| Image processing pipeline | Manual pixel manipulation | Pillow (PIL) | Already used, handles EXIF, crop, resize, WebP conversion |
| CSS variable injection | Manual DOM manipulation | `style` attribute on root container | React-friendly, no side effects, SSR-compatible |
| Font loading | Manual `<link>` injection | `document.fonts.load()` + Google Fonts API | Already patterned in PublicProfileView font loading logic |
| Avatar initials | Complex name parsing | Simple split + map + slice | Edge cases (empty name, single word) are trivial |

## Common Pitfalls

### Pitfall 1: Avatar URL Not Updating After Upload
**What goes wrong:** Frontend caches the old avatar URL via TanStack Query, new avatar appears on reload but not immediately
**Why it happens:** Avatar URL path doesn't change (`/api/v1/public/personal-profiles/{slug}/avatar/256`), browser and TanStack Query both cache
**How to avoid:** Append cache-busting query param after upload (e.g., `?t=${Date.now()}`), invalidate TanStack Query cache for profile data after avatar mutation
**Warning signs:** Avatar appears unchanged after successful upload until hard refresh

### Pitfall 2: R2 Upload Without Workspace Isolation
**What goes wrong:** Avatar R2 keys don't include workspace_id, creating potential overwrites
**Why it happens:** Temptation to use simpler key like `avatars/{profile_id}/256.webp`
**How to avoid:** Always namespace: `avatars/{workspace_id}/{profile_id}/{size}.webp`
**Warning signs:** Multi-tenant security hook will flag this

### Pitfall 3: Legacy Theme IDs in Database
**What goes wrong:** Existing profiles stored `minimal`, `dark`, `pastel`, `bold`, `cinematic` as theme_id in PostgreSQL. Deleting legacy themes breaks those profiles.
**Why it happens:** Direct deletion without migration mapping
**How to avoid:** Create a `LEGACY_TO_PREBUILT_MAP` that maps each legacy ID to its nearest PREBUILT equivalent. The UnifiedThemeEngine must check this map before defaulting.
**Warning signs:** Public profiles with old themes render with default theme instead of closest match

### Pitfall 4: CSS Custom Properties Not Scoped
**What goes wrong:** Theme CSS variables applied to `:root` leak into the rest of the app when navigating away from public profile
**Why it happens:** Setting vars on `document.documentElement` is global
**How to avoid:** Apply CSS variables to a scoped container div (e.g., `.profile-theme-scope`) and clean up on unmount. Or use a dedicated wrapper div with `style` attribute.
**Warning signs:** Dashboard styles change after visiting a public profile

### Pitfall 5: Company Profile Missing Avatar Field
**What goes wrong:** Company profiles use `logo_url` not `avatar_url`. Shared renderer tries to read `avatar_url` and gets undefined.
**Why it happens:** Personal and company profiles have different field names for the visual identity
**How to avoid:** Normalize in PublicProfileRenderer: map `logo_url` to a generic `imageUrl` prop before passing to AvatarDisplay
**Warning signs:** Company profile avatar always shows initials fallback

### Pitfall 6: Font Loading Flash (FOUT)
**What goes wrong:** Profile renders with system font, then flashes when Google Font loads
**Why it happens:** Font loading is async, components render before fonts are available
**How to avoid:** Use the `fontsLoaded` state pattern from existing PublicProfileView: show skeleton/loader until `document.fonts.load()` resolves
**Warning signs:** Visible text reflow on public profile load

## Code Examples

### R2 Client for Main Backend
```python
# backend/src/app/services/r2_storage.py
import boto3
from app.config.settings import get_settings

class R2Client:
    """Lightweight R2 client for avatar uploads in main backend."""

    def __init__(self):
        settings = get_settings()
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint_url,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key.get_secret_value(),
            region_name="auto",
        )
        self._bucket = settings.r2_bucket_name

    async def upload_bytes(self, key: str, data: bytes, content_type: str) -> str:
        """Upload bytes to R2. Returns the key."""
        import asyncio
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: self._client.put_object(
                Bucket=self._bucket, Key=key, Body=data, ContentType=content_type
            ),
        )
        return key

    def get_public_url(self, key: str) -> str:
        """Generate presigned URL for reading."""
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=3600,
        )
```

### Legacy Theme Mapping
```typescript
// shared/UnifiedThemeEngine.ts
export const LEGACY_TO_PREBUILT_MAP: Record<string, string> = {
  'minimal': 'theme-clean-slate',
  'dark': 'theme-midnight-studio',    // or nearest dark PREBUILT
  'pastel': 'theme-soft-focus',       // or nearest pastel PREBUILT
  'bold': 'theme-neon-nights',        // or nearest bold PREBUILT
  'cinematic': 'theme-film-noir',     // or nearest cinematic PREBUILT
};

export function resolveThemeId(rawId: string | undefined): string {
  if (!rawId) return 'theme-clean-slate';
  if (rawId in LEGACY_TO_PREBUILT_MAP) return LEGACY_TO_PREBUILT_MAP[rawId];
  return rawId;
}
```

### Database Migration for R2 Keys
```python
# backend/migrations/versions/XXXX_add_avatar_r2_keys.py
def upgrade():
    op.add_column('personal_profile_avatars',
        sa.Column('r2_key_64', sa.String(512), nullable=True))
    op.add_column('personal_profile_avatars',
        sa.Column('r2_key_128', sa.String(512), nullable=True))
    op.add_column('personal_profile_avatars',
        sa.Column('r2_key_256', sa.String(512), nullable=True))
    op.add_column('personal_profile_avatars',
        sa.Column('r2_key_512', sa.String(512), nullable=True))

def downgrade():
    op.drop_column('personal_profile_avatars', 'r2_key_512')
    op.drop_column('personal_profile_avatars', 'r2_key_256')
    op.drop_column('personal_profile_avatars', 'r2_key_128')
    op.drop_column('personal_profile_avatars', 'r2_key_64')
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Avatar blobs in PostgreSQL | R2 object storage + presigned URLs | This phase | Eliminates DB bloat, enables CDN, fixes display bugs |
| 3 separate theme files + 5 legacy themes | Single UnifiedThemeEngine with CSS vars | This phase | Single source of truth, no prop drilling |
| Two separate profile pages with divergent code | Shared PublicProfileRenderer + section registry | This phase | DRY, consistent UX, easier to add features |
| ThemeService singleton with mutable state | Pure functional theme resolution | This phase | No side effects, testable, no leaked state |

## Open Questions

1. **Exact PREBUILT theme IDs for legacy mappings**
   - What we know: Legacy themes are `minimal`, `dark`, `pastel`, `bold`, `cinematic`. PREBUILT themes include 20 entries like `theme-clean-slate`, etc.
   - What's unclear: Exact best visual match for each legacy theme to a PREBUILT
   - Recommendation: Implementer should visually compare and pick closest match from the 20 PREBUILT themes in `constants/themes.ts`

2. **Company profile avatar storage location**
   - What we know: Company profiles use `logo_url` field, not `avatar_url`. No `company_profile_avatars` table found.
   - What's unclear: Where company logos are currently stored and how they're uploaded
   - Recommendation: Research company profile service during implementation; may need separate migration or unified approach

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.16 + @testing-library/react |
| Config file | frontend/package.json (script: "test": "vitest") |
| Quick run command | `cd frontend && pnpm test src/path/file.test.ts` |
| Full suite command | `cd frontend && pnpm test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FNDTN-01 | Avatar upload stores to R2, displays on both profiles | unit + integration | `cd frontend && pnpm test src/components/features/profile/shared/__tests__/AvatarDisplay.test.tsx` | No - Wave 0 |
| FNDTN-02 | Avatar fallback shows initials when image fails | unit | `cd frontend && pnpm test src/components/features/profile/shared/__tests__/AvatarDisplay.test.tsx` | No - Wave 0 |
| FNDTN-03 | UnifiedThemeEngine generates correct CSS vars, legacy mapping works | unit | `cd frontend && pnpm test src/components/features/profile/shared/__tests__/UnifiedThemeEngine.test.ts` | No - Wave 0 |
| FNDTN-04 | PublicProfileRenderer renders correct sections for personal + company | unit | `cd frontend && pnpm test src/components/features/profile/shared/__tests__/PublicProfileRenderer.test.tsx` | No - Wave 0 |
| FNDTN-05 | Smoke tests for both profile pages | smoke | `cd frontend && pnpm test src/pages/public/__tests__/profile-smoke.test.tsx` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `cd frontend && pnpm test src/components/features/profile/shared/__tests__/`
- **Per wave merge:** `cd frontend && pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `frontend/src/components/features/profile/shared/__tests__/AvatarDisplay.test.tsx` -- covers FNDTN-01, FNDTN-02
- [ ] `frontend/src/components/features/profile/shared/__tests__/UnifiedThemeEngine.test.ts` -- covers FNDTN-03
- [ ] `frontend/src/components/features/profile/shared/__tests__/SectionRegistry.test.ts` -- covers FNDTN-04
- [ ] `frontend/src/components/features/profile/shared/__tests__/PublicProfileRenderer.test.tsx` -- covers FNDTN-04
- [ ] `frontend/src/pages/public/__tests__/profile-smoke.test.tsx` -- covers FNDTN-05
- [ ] Backend avatar R2 upload test: `docker exec rawdrive-backend pytest tests/services/test_personal_profile_avatar_r2.py` -- covers FNDTN-01

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `backend/src/app/services/personal_profile_service.py` lines 429-572 -- current avatar upload/get implementation storing blobs in PG
- Codebase analysis: `backend/src/app/repositories/personal_profile_repository.py` lines 482-650 -- avatar DB schema with `personal_profile_avatars` table, 4 size columns (image_64/128/256/512)
- Codebase analysis: `services/upload-service/src/app/services/r2_storage_service.py` -- production R2 client with `upload_bytes()`, circuit breaker, boto3
- Codebase analysis: `frontend/src/components/features/profile/ProfileThemeEngine.ts` -- legacy themes + PREBUILT theme conversion
- Codebase analysis: `frontend/src/utils/themeTransformer.ts` -- theme data transformation for ProfileCard
- Codebase analysis: `frontend/src/services/themeService.ts` -- singleton theme service with CSS variable generation
- Codebase analysis: `frontend/src/constants/themes.ts` -- 20 PREBUILT themes with full variant support
- Codebase analysis: `frontend/src/pages/public/PublicPersonalProfilePage.tsx` -- Bento Grid based personal profile page
- Codebase analysis: `frontend/src/pages/public/PublicProfilePage.tsx` -- thin wrapper using PublicProfileView for company profiles
- Codebase analysis: `frontend/src/components/features/profile/PublicProfileView.tsx` -- company profile view with font loading
- Codebase analysis: `backend/src/app/config/settings.py` -- R2 credentials (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT)

### Secondary (MEDIUM confidence)
- Storage skill: `.claude/skills/storage-uploads/SKILL.md` -- R2 key convention `{workspace_id}/...`, presigned URL patterns, security rules
- Design system skill: `.claude/skills/design-system/SKILL.md` -- Tailwind tokens, accessibility requirements, Framer Motion patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, no new deps needed
- Architecture: HIGH - patterns directly observed in codebase, clear path forward
- Pitfalls: HIGH - identified from actual code analysis (cache busting, legacy theme IDs, field name mismatches, CSS scope leakage)

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable domain, no external dependency changes expected)
