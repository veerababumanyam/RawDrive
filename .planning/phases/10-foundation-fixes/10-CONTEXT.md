# Phase 10: Foundation & Fixes - Context

**Gathered:** 2026-03-19
**Updated:** 2026-03-19 (auto-mode update with canonical refs and BA review alignment)
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix broken profile functionality (avatar upload/display, theme rendering) and establish shared infrastructure (unified theme engine, shared PublicProfileRenderer) that both personal (`/u/:slug`) and company (`/p/:slug`) profile pages will build on in subsequent phases.

Requirements: FNDTN-01, FNDTN-02, FNDTN-03, FNDTN-04, FNDTN-05

</domain>

<decisions>
## Implementation Decisions

### Avatar Storage Migration
- Store avatars in Cloudflare R2 with public URLs, consistent with gallery image storage and CDN-ready
- Lazy migration strategy: serve from PostgreSQL if R2 URL missing, migrate to R2 on next upload — avoids batch migration complexity
- Preserve existing API contract: `/api/v1/public/personal-profiles/{slug}/avatar` proxies R2 — no frontend URL changes needed
- Fallback: initials badge (first letters of display_name) when avatar fails to load — already exists in AvatarUploader component
- Company profile avatars follow same R2 pipeline as personal profiles

### Theme Engine Consolidation
- Single UnifiedThemeEngine replacing 3 fragmented files (ProfileThemeEngine.ts, themeTransformer.ts, themeService.ts) — CSS custom properties applied to root
- Delete 5 legacy themes (minimal, dark, pastel, bold, cinematic), map to nearest PREBUILT equivalent — legacy themes are subsets of PREBUILT ones
- Existing users with legacy theme selections: map to nearest PREBUILT equivalent during theme engine load, log unmapped themes for review
- Apply themes via CSS custom properties on a **scoped container div** wrapping the profile renderer (NOT `:root`) — prevents theme CSS leaking to non-profile pages. All profile components read `var(--theme-*)` within the scoped container. (Updated from `:root` per research Pitfall 4: scoped approach prevents CSS leaking between profile and app pages)
- Dark mode: respect system `prefers-color-scheme` + use theme light/dark variants — each PREBUILT theme already has both variants

### Shared Component Architecture
- Shared `PublicProfileRenderer` component — accepts profile data + type prop, renders appropriate sections for personal or company profiles
- Unified `ProfileData` interface that normalizes both personal and company profile backend responses into a common shape
- Base on Bento Grid system (from `/u/` route) — more modern, modular, already section-based
- Section registry pattern — each section registers which profile types it supports, renderer picks applicable ones dynamically
- Shared components colocated at `frontend/src/components/features/profile/shared/`

### Smoke Tests
- Vitest with jsdom for component-level smoke tests
- Test scope: both profile pages load, avatar renders (or fallback displays), theme CSS custom properties applied, no console errors
- Backend: pytest integration tests for avatar R2 upload/retrieval pipeline
- Test both personal (`/u/:slug`) and company (`/p/:slug`) routes with mock data

### Claude's Discretion
- R2 bucket path structure for avatar files (e.g., `avatars/{workspace_id}/{profile_id}.{ext}`)
- CSS custom property naming convention for theme tokens (e.g., `--theme-primary`, `--theme-bg`)
- Section registry data structure (array vs map vs decorator pattern)
- Exact Vitest test file organization and naming

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Profile Infrastructure
- `.planning/REQUIREMENTS.md` §Foundation — FNDTN-01 through FNDTN-05 define acceptance criteria
- `.planning/ROADMAP.md` §Phase 10 — Success criteria (5 items) that must be TRUE
- `.planning/phases/10-foundation-fixes/10-RESEARCH.md` — Prior research on implementation approach (if exists)

### Avatar & Storage
- `frontend/src/services/personalProfileService.ts` — Frontend avatar API integration (80+ methods)
- `frontend/src/services/companyProfileService.ts` — Company profile API for avatar parity
- `backend/src/app/services/personal_profile_service.py` lines 429-572 — Backend avatar upload/retrieval
- `specs/030-avatar-editor/contracts/avatar-editor-api.ts` — Avatar editor API contract

### Theme System
- `frontend/src/constants/themes.ts` — 20 PREBUILT themes (1630 lines) with light/dark variants
- `frontend/src/utils/themeTransformer.ts` — Legacy theme transformer (to be replaced)

### Public Profile Pages
- `frontend/src/pages/public/PublicPersonalProfilePage.tsx` — Current `/u/:slug` implementation
- `frontend/src/pages/workspace/BrandingPage.tsx` — Company branding/profile editor
- `frontend/src/router/routes.tsx` lines 258-264 — Route configuration for `/u/` and `/p/`

### Component Patterns
- `frontend/src/components/features/settings/CompanyProfileForm.tsx` — Company profile form patterns
- `frontend/src/components/settings/PersonalProfileTabContent.tsx` — Personal profile editor

### BA Review Context
- `.planning/research/BA-GALLERY-REVIEW.md` — Gallery BA review (8.5/10 score, competitive positioning, gap analysis)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AvatarUploader.tsx` — crop/zoom modal, file validation (JPEG/PNG/WebP, 5MB max), already has initials fallback
- `ProfileBentoGrid.tsx` + `ProfileGridItem.tsx` — Bento layout system ready for reuse as base for shared renderer
- `ProfileHeader.tsx`, `ProfileBio.tsx`, `ProfileSocials.tsx`, `ProfileContactGrid.tsx` — section components from `/u/`
- `PublicProfileLayout.tsx`, `PublicProfileView.tsx` — layout from `/p/` (will be replaced but has font loading logic worth extracting)
- 20 PREBUILT themes in `constants/themes.ts` (1630 lines) with light/dark variants, gradients, typography
- `profileCompleteness.ts` + test file — profile completeness scoring utility

### Established Patterns
- Backend 3-layer: API → Service → Repository with workspace_id isolation
- Frontend: TanStack Query for data fetching, TailwindCSS for styling, Framer Motion for animations
- R2 storage: upload patterns exist in upload-service, credentials configured in .env
- Profile API: `personalProfileService.ts` (80+ methods), `companyProfileService.ts`
- ThemeProvider in `App.tsx` — existing theme context wrapping the app

### Integration Points
- Backend avatar endpoint: `personal_profile_service.py` lines 429-572 (upload_avatar, get_avatar_image)
- R2 config: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT_URL` in settings
- Theme files: `constants/themes.ts`, `ProfileThemeEngine.ts`, `themeTransformer.ts`, `themeService.ts`, `themeCustomizationService.ts`
- Route config: `routes.tsx` lines 258-264 for `/u/` and `/p/` public routes
- Company profile: separate `companyProfileService.ts` and `PublicProfileView.tsx`

</code_context>

<specifics>
## Specific Ideas

- User wants public pages to feel like Linktree — premium, modern, attractive
- Internal editors must be consistent with existing RawDrive application design patterns
- Both personal and company profiles have similar broken issues (avatar, themes)
- Bento.me shut down Feb 2026 — Bento grid is a unique differentiator worth polishing
- BA review confirmed gallery module is 8.5/10 — profile/public pages are the weak link to address first
- Competitive edge is AI + CRM + gallery integration — profile pages need to showcase this

</specifics>

<deferred>
## Deferred Ideas

- Animated theme backgrounds (Phase 11)
- Drag-and-drop section reordering (Phase 12)
- Gallery preview blocks and booking CTA (Phase 13)
- SSR/prerendering for SEO (Phase 11)
- Gallery AI tool tooltips (Phase 18 — from BA review)
- Gallery settings presets (Phase 17 — from BA review)
- Gallery templates (v2+ — from BA review)

</deferred>

---

*Phase: 10-foundation-fixes*
*Context gathered: 2026-03-19*
*Updated: 2026-03-19 (auto-mode with canonical refs)*
