# Architecture Patterns

**Domain:** Profile & Public Page Modernization (v1.1)
**Researched:** 2026-03-19
**Confidence:** HIGH (based on direct codebase analysis)

## Current State Analysis

### Two Divergent Profile Systems

The codebase has two parallel profile systems that evolved independently:

| Aspect | Personal Profile (`/u/:slug`) | Company Profile (`/p/:slug`) |
|--------|-------------------------------|------------------------------|
| Editor page | `ProfileSettingsPage.tsx` (settings) | `BrandingPage.tsx` (workspace) |
| Public page | `PublicPersonalProfilePage.tsx` | `PublicProfileView.tsx` |
| Rendering | `ProfileContainer` + Bento grid components | `PublicProfileLayout` + Glass components |
| Theme engine | `ProfileThemeEngine.ts` (legacy + PREBUILT_THEMES) | `themeTransformer.ts` (backend theme data) |
| Backend service | `personal_profile_service.py` | `company_profile_service.py` |
| API service (FE) | `personalProfileService.ts` | `companyProfileService.ts` |
| Image handling | Avatar stored in DB as WebP thumbnails (64/128/256/512) | Logo stored in DB as WebP thumbnails (same sizes) |
| Preview | None (no live preview in editor) | `CompanyProfilePreview.tsx` with device frames |
| Data fetching | `useEffect` + `useState` (manual) | `useEffect` + `useState` (manual) |

**Key problems:**
1. Personal profile editor has NO live preview; company profile editor does
2. Two completely different rendering pipelines for similar data
3. Theme engine split: legacy themes in `ProfileThemeEngine.ts` vs. new `PREBUILT_THEMES` in `constants/themes.ts` vs. backend theme transformer
4. Avatar/logo stored in PostgreSQL (not R2) -- works but does not scale
5. No shared section abstraction -- cannot reorder sections

---

## Recommended Architecture

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `ProfileEditorShell` | Editor layout with sidebar panels + preview area | Form panels, Preview, Profile API hooks |
| `ProfileFormPanels` | Tabbed form sections (Identity, Contact, Links, Theme, SEO) | Editor state (useReducer) |
| `ProfilePreview` | Device-framed live preview rendering | Shared render components, editor state |
| `ProfileSection` | Abstract section wrapper (draggable, collapsible) | Section registry, DnD context |
| `PublicProfileRenderer` | Renders public page from profile data + theme | Section registry, theme engine |
| `UnifiedThemeEngine` | Single theme resolution: preset -> customization -> CSS vars | Theme constants, font service |
| `ProfileAPIHooks` | TanStack Query hooks for both profile types | Backend API services |
| `ImageOptimizationPipeline` | Avatar/logo upload -> R2 -> CDN URL | R2 storage, backend image service |

### Data Flow

```
EDITOR FLOW:
  EditorShell
    -> FormPanels (user edits)
    -> editorState (useReducer)
    -> ProfilePreview (same-component rendering, not iframe)
    -> PublicProfileRenderer (shared with public page)
    -> Auto-save via debounced mutation

PUBLIC PAGE FLOW:
  /u/:slug or /p/:slug route
    -> TanStack Query: usePublicProfile(slug, type)
    -> PublicProfileRenderer
    -> ThemeEngine resolves theme -> CSS custom properties
    -> Section registry renders ordered sections
    -> View tracking (existing analytics)
```

---

## Decision 1: Unify or Keep Separate Profile Systems

**Recommendation: Shared rendering layer, separate data models.**

The personal and company profiles have genuinely different data shapes (personal has bio, categories, service_areas, booking_calendar; company has tagline, logo, brand identity). Forcing them into one model creates awkward optionality. But the **rendering** should be unified.

**Architecture:**

```
types/
  profileBase.ts          # Shared: slug, socials, custom_links, visibility, theme
  personalProfile.ts      # Extends base: bio, categories, avatar, service_areas
  companyProfile.ts       # Extends base: tagline, logo, brand_color

components/features/profile/
  sections/               # Shared section components
    HeroSection.tsx        # Avatar/logo + name + title/tagline
    ContactSection.tsx     # Email, phone, address, secondary contacts
    SocialLinksSection.tsx  # Social media icons
    CustomLinksSection.tsx  # Custom link cards (Linktree-style)
    GalleryPreviewSection.tsx  # Featured gallery embed
    MediaEmbedSection.tsx     # TikTok, Spotify embeds
    ServicesSection.tsx        # Service areas (personal only)
    BioSection.tsx             # Bio/about text
    BookingSection.tsx         # Booking calendar embed

  renderer/
    PublicProfileRenderer.tsx  # Unified public page renderer
    SectionRegistry.ts         # Maps section types to components
    SectionWrapper.tsx          # Themed section container

  editor/
    ProfileEditorShell.tsx     # Split-pane: form left, preview right
    EditorSidebar.tsx          # Tabbed form panels
    PreviewFrame.tsx           # Device-framed preview (reuse existing frames)
    DragDropContext.tsx         # Section reordering DnD

  theme/
    UnifiedThemeEngine.ts      # Single source of truth for theme resolution
    ThemePicker.tsx            # Theme selection UI with preview cards
    ThemeCustomizer.tsx        # Color/typography/layout overrides
    cssVarInjector.ts          # Converts theme to CSS custom properties
```

**Why not merge data models:**
- Backend already has separate tables, repositories, and API endpoints
- Different business logic (personal profile is per-user, company profile is per-workspace)
- Merging would require a complex migration for zero user benefit

**Why merge rendering:**
- Eliminates 2x maintenance burden for visual components
- Ensures both profile types get the same quality of design
- Makes theme engine work consistently across both
- Section-based architecture enables drag-and-drop for both

---

## Decision 2: Live Preview -- Same-Component vs. Iframe

**Recommendation: Same-component rendering (NOT iframe).**

**Why same-component:**
1. **Already proven** -- `CompanyProfilePreview.tsx` already renders `PublicProfileLayout` directly with device frame wrappers. This works.
2. **Performance** -- No iframe overhead, shared React context, instant re-renders on state change
3. **Theme consistency** -- CSS custom properties propagate naturally through React tree
4. **Simpler DX** -- One component tree to debug, no postMessage complexity

**Why NOT iframe:**
- Iframe requires message-passing protocol for every state change
- Font loading must happen twice (parent + iframe)
- Theme CSS must be duplicated or injected
- More complex testing setup
- Only benefit (CSS isolation) is already handled by scoped CSS vars

**Implementation pattern:**

```tsx
// PreviewFrame wraps the renderer in a scaled container with device chrome
<PreviewFrame device={selectedDevice}>
  <div style={{ transform: `scale(${scaleFactor})`, transformOrigin: 'top center' }}>
    <PublicProfileRenderer
      profile={editorState}
      theme={resolvedTheme}
      sections={sectionOrder}
      mode="preview"  // Disables analytics tracking, click handlers
    />
  </div>
</PreviewFrame>
```

The existing `CompanyProfilePreview.tsx` already has iPhone, iPad, and MacBook frame components -- these should be extracted to shared `components/ui/DeviceFrame/` and reused.

---

## Decision 3: Theme Engine Restructuring

**Recommendation: Single `UnifiedThemeEngine` that replaces all three current systems.**

**Current mess (3 theme paths):**
1. `ProfileThemeEngine.ts` -- Legacy themes (`minimal`, `dark`, `pastel`, `bold`, `cinematic`) + conversion from `PREBUILT_THEMES`
2. `constants/themes.ts` -- 20+ `PREBUILT_THEMES` with full color/typography/layout config
3. `themeTransformer.ts` -- Transforms backend API theme data to `ProfileCard` props

**New unified flow:**

```
Theme Selection (theme_id)
  -> UnifiedThemeEngine.resolve(themeId, customizations?)
  -> Returns: ThemeConfig {
       colors: Record<string, string>     // CSS custom property values
       typography: { heading, body }       // Font family + weights
       effects: { glass, blur, shadow }    // Visual effects
       layout: { spacing, heroStyle }      // Layout preferences
     }
  -> cssVarInjector(themeConfig)
  -> Sets CSS custom properties on container element
  -> All child components use var(--theme-*) references
```

**Premium themes:**
- `is_premium: boolean` flag already exists on `Theme` type in `profileEditor.ts`
- Gate in the theme picker UI, not the engine -- the engine renders any theme
- Store premium unlock status on workspace (billing service already exists)
- Premium themes = richer gradient configs, more font choices, animated backgrounds

**Migration path:**
1. Keep `LEGACY_PROFILE_THEMES` as a compatibility map in `UnifiedThemeEngine`
2. All new themes use `PREBUILT_THEMES` format from `constants/themes.ts`
3. `getTheme()` function becomes `UnifiedThemeEngine.resolve()` -- same lookup logic, cleaner interface
4. Delete `themeTransformer.ts` -- the unified engine handles backend data directly

---

## Decision 4: Section-Based Architecture for Drag-and-Drop

**Recommendation: Section registry pattern with ordered section config stored in profile data.**

**Data model addition (both profile types):**

```python
# Backend: add to personal_profiles and company_profiles tables
section_order: list[str] = [
    "hero", "bio", "contact", "social_links",
    "custom_links", "gallery_preview", "media_embed", "booking"
]
section_config: dict[str, dict] = {
    "hero": { "variant": "centered", "show_badge": true },
    "bio": { "collapsed": false },
    # per-section display options
}
```

**Frontend section registry:**

```typescript
// SectionRegistry.ts
const SECTION_REGISTRY: Record<string, SectionDefinition> = {
  hero: {
    component: HeroSection,
    label: 'Header',
    icon: UserCircle,
    required: true,        // Cannot remove, always first
    draggable: false,
  },
  bio: {
    component: BioSection,
    label: 'About',
    icon: FileText,
    required: false,
    draggable: true,
    profileTypes: ['personal'],  // Only for personal profiles
  },
  contact: {
    component: ContactSection,
    label: 'Contact Info',
    icon: Mail,
    required: false,
    draggable: true,
  },
  // ...etc
};
```

**Drag-and-drop library: @dnd-kit/core + @dnd-kit/sortable**

Use `@dnd-kit` because:
- Standard for React DnD in 2026 (replaces unmaintained react-beautiful-dnd)
- Accessible by default (keyboard DnD built-in)
- Small bundle (~12KB gzipped)
- Works with any layout (vertical list, grid)

```tsx
// In editor sidebar: draggable section list
<DndContext onDragEnd={handleReorder}>
  <SortableContext items={sectionOrder}>
    {sectionOrder.map(sectionId => (
      <SortableSectionItem
        key={sectionId}
        id={sectionId}
        section={SECTION_REGISTRY[sectionId]}
        onToggle={() => toggleSection(sectionId)}
        onConfigure={() => openSectionConfig(sectionId)}
      />
    ))}
  </SortableContext>
</DndContext>
```

---

## Decision 5: Avatar/Image Optimization Pipeline

**Recommendation: Migrate from PostgreSQL blob storage to R2 with CDN URLs.**

**Current state:** Avatars and logos are stored as binary WebP data directly in PostgreSQL rows (`save_avatar_images` stores image_64, image_128, image_256, image_512 columns). This works at small scale but:
- Bloats the database
- No CDN caching
- Every avatar request hits the DB
- Cannot serve responsive images via srcset

**Target architecture:**

```
Upload Flow:
  1. Client uploads image via multipart form
  2. Backend receives, validates (format, size, dimensions)
  3. Backend processes with PIL:
     - EXIF rotation correction (existing logic)
     - Optional crop (existing logic)
     - Generate WebP variants: 64, 128, 256, 512, 1024
  4. Upload all variants to R2: /profiles/{workspace_id}/{profile_id}/avatar/{size}.webp
  5. Store R2 key prefix in profile record (not binary data)
  6. Return CDN URL

Serving Flow:
  1. Public page requests avatar via CDN URL
  2. R2 serves with cache headers (Cache-Control: public, max-age=31536000, immutable)
  3. Use content-hash in filename for cache busting on update
  4. Frontend uses <picture> with srcset for responsive loading
```

**R2 integration already available:**
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT_URL` are in env vars
- Upload service (`rawdrive-upload-service` port 8008) already handles R2 uploads for gallery photos
- Reuse its R2 client configuration for profile images

**Migration strategy:**
1. Add R2 upload path to personal_profile_service and company_profile_service
2. On first access, if avatar_url is a `/api/v1/public/...` path (old format), serve from DB
3. On next upload, store to R2 and update avatar_url to CDN path
4. Background migration job: iterate profiles, upload existing DB blobs to R2
5. After migration, remove binary columns from profiles table

---

## Decision 6: Editor Architecture

**Recommendation: Split-pane editor with form panels on left, device-framed preview on right.**

**State management:**

```typescript
// useProfileEditor.ts -- custom hook managing all editor state
interface ProfileEditorState {
  // Profile data (form fields)
  profile: Partial<PersonalProfile | CompanyProfile>;
  // Dirty tracking
  dirtyFields: Set<string>;
  // Theme
  selectedThemeId: string;
  themeCustomizations: ThemeCustomization | null;
  resolvedTheme: ThemeConfig;
  // Sections
  sectionOrder: string[];
  sectionConfig: Record<string, SectionConfig>;
  // UI
  activePanel: EditorPanel;
  previewDevice: DeviceMode;
  // Status
  isSaving: boolean;
  lastSaved: Date | null;
}

// Use useReducer for complex state transitions
// Auto-save via debounced TanStack Query mutation (500ms debounce)
```

**Editor panel tabs:**

| Tab | Contents |
|-----|----------|
| Identity | Name, title/tagline, avatar/logo, slug |
| Contact | Email, phone, address, secondary contacts |
| Links | Social media URLs, custom links (add/remove/reorder) |
| Sections | Drag-and-drop section ordering, per-section config |
| Theme | Theme picker grid, color customizer, typography, layout |
| SEO | Meta title, description, OG image, indexability toggle |
| Visibility | Per-field toggle switches (existing pattern) |

**Auto-save pattern:**

```typescript
const debouncedSave = useDebouncedCallback(
  async (state: ProfileEditorState) => {
    const updates = buildUpdatePayload(state.dirtyFields, state.profile);
    await mutation.mutateAsync(updates);
    dispatch({ type: 'MARK_SAVED' });
  },
  500
);
// Show save indicator: "Saving..." -> "Saved" -> fade out
```

---

## Component Architecture for New Public Page

**Public page component tree:**

```
PublicProfilePage (route: /u/:slug or /p/:slug)
  -> usePublicProfile(slug, type) -- TanStack Query
  -> Helmet (SEO meta tags, structured data)
  -> ThemeProvider (CSS custom properties)
     -> PublicProfileRenderer
        -> SectionRenderer (iterates section_order)
           -> HeroSection
              -> Avatar/Logo (responsive <picture>)
              -> Name + Title/Tagline
              -> Verification badge
              -> CTA buttons (Book Now, View Portfolio)
           -> BioSection
              -> Rich text bio with theme typography
           -> ContactSection
              -> Glass card grid with email, phone, address
              -> Click-to-copy, click-to-call
           -> SocialLinksSection
              -> Animated icon grid (Framer Motion)
           -> CustomLinksSection
              -> Linktree-style stacked link cards
              -> Animated hover states
           -> GalleryPreviewSection
              -> Image carousel from featured gallery
           -> MediaEmbedSection
              -> TikTok, Spotify embeds (existing components)
           -> BookingSection
              -> Calendar embed iframe
        -> ProfileActions (sticky bottom bar)
           -> vCard download, QR code, Share
        -> ProfileFooter
           -> "Powered by RawDrive" + theme toggle
  -> ViewTracker (analytics, existing)
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Dual Rendering Paths
**What:** Maintaining separate component trees for personal vs. company public pages
**Why bad:** Every design improvement must be applied twice, visual inconsistency creeps in
**Instead:** Single `PublicProfileRenderer` that receives normalized profile data + section config

### Anti-Pattern 2: Iframe Preview
**What:** Using iframe for live editor preview
**Why bad:** Double rendering cost, complex message passing, font loading duplication
**Instead:** Same-component rendering with CSS transform scaling inside device frames

### Anti-Pattern 3: Theme Logic in Components
**What:** Individual components interpreting theme data differently
**Why bad:** Inconsistent theming, hard to add new themes
**Instead:** Theme engine resolves once, injects CSS custom properties, components only use `var(--theme-*)` references

### Anti-Pattern 4: Storing Images in PostgreSQL
**What:** Binary avatar/logo data in database columns
**Why bad:** Database bloat, no CDN, every request hits DB, no responsive images
**Instead:** R2 storage with CDN URLs and content-hash cache busting

### Anti-Pattern 5: Manual useEffect Data Fetching
**What:** Raw `useState` + `useEffect` for API calls (current pattern in both public pages)
**Why bad:** No caching, no deduplication, no background refetch, manual loading/error states
**Instead:** TanStack Query hooks (already used elsewhere in the app)

---

## Integration Points with Existing Code

### Modified Files (Existing)

| File | Change | Risk |
|------|--------|------|
| `frontend/src/router/routes.tsx` | Update `/u/:slug` and `/p/:slug` to use new renderer | LOW |
| `frontend/src/pages/settings/ProfileSettingsPage.tsx` | Replace with redirect to new editor or rebuild | MEDIUM |
| `frontend/src/pages/workspace/BrandingPage.tsx` | Replace with redirect to new editor | MEDIUM |
| `frontend/src/components/features/profile/ProfileThemeEngine.ts` | Replace with `UnifiedThemeEngine` | MEDIUM |
| `frontend/src/constants/themes.ts` | Keep as data source, consumed by new engine | LOW |
| `frontend/src/utils/themeTransformer.ts` | Delete after migration | LOW |
| `backend/src/app/services/personal_profile_service.py` | Add R2 upload, section_order field | MEDIUM |
| `backend/src/app/services/company_profile_service.py` | Add R2 upload, section_order field | MEDIUM |
| `backend/src/app/repositories/personal_profile_repository.py` | Add section_order/section_config columns | LOW |

### New Files

| File | Purpose |
|------|---------|
| `frontend/src/components/features/profile/renderer/PublicProfileRenderer.tsx` | Unified public page renderer |
| `frontend/src/components/features/profile/renderer/SectionRegistry.ts` | Section type -> component map |
| `frontend/src/components/features/profile/renderer/SectionWrapper.tsx` | Themed section container |
| `frontend/src/components/features/profile/sections/*.tsx` | 8-9 shared section components |
| `frontend/src/components/features/profile/editor/ProfileEditorShell.tsx` | Split-pane editor layout |
| `frontend/src/components/features/profile/editor/EditorSidebar.tsx` | Tabbed form panels |
| `frontend/src/components/features/profile/editor/DragDropContext.tsx` | Section reordering |
| `frontend/src/components/features/profile/theme/UnifiedThemeEngine.ts` | Single theme resolution |
| `frontend/src/components/features/profile/theme/ThemePicker.tsx` | Theme selection grid |
| `frontend/src/components/features/profile/theme/cssVarInjector.ts` | Theme -> CSS variables |
| `frontend/src/components/ui/DeviceFrame/*.tsx` | Extracted device frame components |
| `frontend/src/hooks/useProfileEditor.ts` | Editor state management hook |
| `frontend/src/hooks/usePublicProfile.ts` | TanStack Query hook for public profile |
| `backend/alembic/versions/*_add_section_order.py` | Migration for section_order columns |

### Existing Code to Reuse

| Existing | Reuse As |
|----------|----------|
| `CompanyProfilePreview.tsx` device frames | Extract to `components/ui/DeviceFrame/` |
| `PublicProfileLayout` glass components | Migrate to section components |
| `ProfileBentoGrid` + `ProfileGridItem` | Integrate into section wrapper |
| `PREBUILT_THEMES` constant | Data source for unified theme engine |
| `fontService.ts` | Keep as-is, used by theme engine |
| `profileEditorService.ts` API paths | Keep for backend communication |
| Avatar PIL processing in `personal_profile_service.py` | Keep pipeline, change storage to R2 |

---

## Suggested Build Order

Based on dependency analysis:

1. **UnifiedThemeEngine + CSS var injector** -- Foundation everything else depends on
2. **Section components** (HeroSection, BioSection, etc.) -- Portable, testable in isolation
3. **SectionRegistry + PublicProfileRenderer** -- Assembles sections, replaces both public pages
4. **TanStack Query hooks** (`usePublicProfile`) -- Replaces manual fetching
5. **DeviceFrame extraction** -- From CompanyProfilePreview to shared UI
6. **ProfileEditorShell + EditorSidebar** -- Editor layout
7. **DnD section reordering** -- Requires @dnd-kit install + section_order backend migration
8. **R2 image migration** -- Backend changes, can run in parallel with frontend
9. **Premium theme gating** -- UI-only, depends on billing service check
10. **Auto-save + dirty tracking** -- Polish, comes after editor is functional

**Critical path:** Steps 1-3 unblock the new public pages. Steps 4-6 unblock the new editor. Steps 7-10 are enhancements.

---

## Scalability Considerations

| Concern | At 100 users | At 10K users | At 100K users |
|---------|--------------|--------------|---------------|
| Avatar serving | DB blobs OK | DB connection pressure | Must be on R2/CDN |
| Theme resolution | Client-side, instant | Same | Same (no server cost) |
| Public page load | ~800ms acceptable | Redis cache handles it | Add CDN for static assets |
| Font loading | Google Fonts CDN | Same | Consider self-hosting popular fonts |
| Section config | JSON column in PG | Same | Same (small payload) |
| Analytics tracking | One INSERT per view | Batch via queue | Move to ClickHouse/TimescaleDB |

## Sources

- Direct codebase analysis of 30+ files across frontend and backend
- Existing `ProfileThemeEngine.ts`, `PublicProfileView.tsx`, `CompanyProfilePreview.tsx`
- `personal_profile_service.py`, `company_profile_service.py` backend services
- `constants/themes.ts` PREBUILT_THEMES structure (20+ themes with full config)
- `profileEditor.ts` type definitions (Theme, ThemeCustomization, LayoutPreferences)
- Route definitions in `router/routes.tsx`
- @dnd-kit: widely adopted, actively maintained React DnD library (HIGH confidence)
- R2/S3 compatible storage patterns (HIGH confidence -- standard approach)
