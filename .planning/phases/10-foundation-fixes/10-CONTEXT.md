# Phase 10: Foundation & Fixes - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix broken profile functionality (avatar upload/display, theme rendering) and establish shared infrastructure (unified theme engine, shared PublicProfileRenderer) that both personal (`/u/:slug`) and company (`/p/:slug`) profile pages will build on in subsequent phases.

</domain>

<decisions>
## Implementation Decisions

### Avatar Storage Migration
- Store avatars in Cloudflare R2 with public URLs, consistent with gallery image storage and CDN-ready
- Lazy migration strategy: serve from PostgreSQL if R2 URL missing, migrate to R2 on next upload — avoids batch migration complexity
- Preserve existing API contract: `/api/v1/public/personal-profiles/{slug}/avatar` proxies R2 — no frontend URL changes needed
- Fallback: initials badge (first letters of display_name) when avatar fails to load — already exists in AvatarUploader component

### Theme Engine Consolidation
- Single UnifiedThemeEngine replacing 3 fragmented files (ProfileThemeEngine.ts, themeTransformer.ts, themeService.ts) — CSS custom properties applied to root
- Delete 5 legacy themes (minimal, dark, pastel, bold, cinematic), map to nearest PREBUILT equivalent — legacy themes are subsets of PREBUILT ones
- Apply themes via CSS custom properties on `:root` — all components read `var(--theme-*)`, no prop drilling needed
- Dark mode: respect system `prefers-color-scheme` + use theme light/dark variants — each PREBUILT theme already has both variants

### Shared Component Architecture
- Shared `PublicProfileRenderer` component — accepts profile data + type prop, renders appropriate sections for personal or company profiles
- Base on Bento Grid system (from `/u/` route) — more modern, modular, already section-based
- Section registry pattern — each section registers which profile types it supports, renderer picks applicable ones dynamically
- Shared components colocated at `frontend/src/components/features/profile/shared/`

### Claude's Discretion
- Smoke test implementation details (Vitest vs Playwright, test granularity)
- R2 bucket path structure for avatar files
- CSS custom property naming convention for theme tokens
- Section registry data structure

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AvatarUploader.tsx` — crop/zoom modal, file validation (JPEG/PNG/WebP, 5MB max), already has initials fallback
- `ProfileBentoGrid.tsx` + `ProfileGridItem.tsx` — Bento layout system ready for reuse
- `ProfileHeader.tsx`, `ProfileBio.tsx`, `ProfileSocials.tsx`, `ProfileContactGrid.tsx` — section components from `/u/`
- `PublicProfileLayout.tsx`, `PublicProfileView.tsx` — layout from `/p/` (will be replaced but has font loading logic worth extracting)
- 20 PREBUILT themes in `constants/themes.ts` (1630 lines) with light/dark variants, gradients, typography

### Established Patterns
- Backend 3-layer: API → Service → Repository with workspace_id isolation
- Frontend: TanStack Query for data fetching, TailwindCSS for styling, Framer Motion for animations
- R2 storage: upload patterns exist in upload-service, credentials configured in .env
- Profile API: `personalProfileService.ts` (80+ methods), `companyProfileService.ts`

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

</specifics>

<deferred>
## Deferred Ideas

- Animated theme backgrounds (Phase 11)
- Drag-and-drop section reordering (Phase 12)
- Gallery preview blocks and booking CTA (Phase 13)
- SSR/prerendering for SEO (Phase 11)

</deferred>
