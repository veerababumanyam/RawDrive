# Project Research Summary

**Project:** RawDrive v1.1 — Profile & Public Page Modernization
**Domain:** Link-in-bio / photographer profile pages (photography-native SaaS)
**Researched:** 2026-03-19
**Confidence:** HIGH (architecture from direct codebase analysis; features from broad competitor research)

## Executive Summary

RawDrive v1.1 is a profile modernization effort targeting the link-in-bio space with a photography-native advantage. The research is unambiguous: RawDrive already has most of what it needs (framer-motion, @dnd-kit, TailwindCSS v4, react-easy-crop, QR generation, vCard, analytics) but the existing implementation is fragmented — two divergent profile systems (/u/ and /p/), three competing theme engines, broken avatar upload, no live preview for personal profiles, and images stored in PostgreSQL instead of R2. The work is primarily architectural cleanup and UX polish, not greenfield feature development.

The recommended approach is to unify the rendering layer before touching any visuals. Both profile types share 80% of their display needs (avatar, bio, links, contact, social icons) but use entirely different component trees. Building a shared section-based renderer first makes all subsequent visual work apply once and ship for both profile types simultaneously. The Bento grid layout is RawDrive's strongest competitive differentiator — no major competitor (Linktree, Beacons, Later, Stan Store) offers a true grid layout. This must be polished and made the hero feature.

The critical risks are infrastructure (R2 presigned URL expiration breaks avatars silently), SEO (public pages are fully client-rendered, making crawlers see empty shells), and performance on low-end Android devices (backdrop-blur and Framer Motion stagger animations cause sub-30fps scrolling on devices most likely used by Indian market photographers). All three are solvable with known patterns, but all three must be addressed from the architecture phase — not bolted on in a polish phase.

## Key Findings

### Recommended Stack

The existing stack requires only one net-new package. Everything needed for the modernization — animations (framer-motion v11), drag-and-drop (@dnd-kit/sortable v10), glassmorphism (Tailwind v4 backdrop-blur), avatar cropping (react-easy-crop), QR codes (qrcode.react), form management (react-hook-form + zod) — is already installed. The only addition is `react-best-gradient-color-picker@^3.0.14` (28K weekly downloads, active maintenance) to replace raw hex inputs in the theme editor with a visual gradient picker that outputs CSS gradient strings directly.

**Core technologies:**
- `framer-motion@^11`: All animations including `layoutId` shared-element transitions, `staggerChildren`, spring physics, parallax — already installed
- `@dnd-kit/sortable@^10`: Section reordering in editor, Bento grid repositioning — already installed
- `tailwindcss@^4`: Container queries (`@container`), glassmorphism (`backdrop-blur-*`, `bg-*/opacity`), all without plugins — already installed
- `react-best-gradient-color-picker@^3.0.14`: Visual gradient picker for theme editor — ONE new install required
- Canvas API (client-side): Avatar resize to 3 WebP sizes before R2 upload — no library needed
- `color-mix()`, CSS `has()`, `text-wrap: balance`: Modern CSS, Baseline 2023-2024, zero libraries

**Anti-recommendations (do not add):** motion@12 (same API, churn risk), React ViewTransition (requires React 19), @casoon/tailwindcss-glass (Tailwind v4 covers it), Cloudflare Image Resizing (paid, overkill), GSAP (framer-motion is sufficient), react-beautiful-dnd (deprecated 2022).

### Expected Features

**Must have for v1.1 (table stakes):**
- Fix avatar upload crop/zoom — broken P0, first thing users see
- Theme engine consolidation into 8-12 coherent themes (background + fonts + buttons as a unit)
- Mobile-first public page redesign with sub-2s load target
- Live preview fix with real-time updates and mobile/desktop toggle
- Bento grid editor polish (snap-to-grid, resize handles, responsive preview)
- Animated themes (3-4) using CSS + Framer Motion
- Featured gallery preview block — unique to photography platforms, the key differentiator
- Per-link click tracking for analytics
- Dark mode for public pages (system preference detection)
- Social links updated for Threads, Bluesky

**Should have for v1.x (after core is stable):**
- Booking/CTA block (Calendly/HoneyBook integration or inline contact form)
- Testimonial block (client reviews inline)
- YouTube/Vimeo embed blocks
- Custom domain support (DNS verification + SSL provisioning — significant infrastructure work)

**Defer to v2+:**
- Multi-language profile pages
- A/B testing for profiles
- AI-generated theme suggestions from portfolio colors
- Team/multi-photographer profiles under studio brand

**Explicit anti-features (do not build):** Full e-commerce on profile, email marketing/newsletters, multi-page site builder, real-time collaboration on profile editor, custom CSS injection, Instagram feed auto-sync, heatmap analytics, video backgrounds.

**Competitive position:** The Bento grid is unique — no competitor offers it. AI bio/SEO generation (Gemini-powered) is also unique — only Beacons has comparable AI. The dual profile system (/u/ personal + /p/ company) is unique to RawDrive. These three are the moat; everything else is table stakes.

### Architecture Approach

The core architecture decision is: **shared rendering layer, separate data models**. Personal and company profiles have legitimately different data shapes and business logic, so do not force them into one model. But the visual rendering pipeline — sections, themes, device preview, analytics tracking — must be unified into components that both profile types share. The current state (two completely divergent component trees, three theme engines, no live preview for personal profiles) is the root cause of most bugs and maintenance debt.

**Major components:**
1. `UnifiedThemeEngine` — Single source of truth replacing three current systems (LEGACY_PROFILE_THEMES, PREBUILT_THEMES, themeTransformer). Resolves theme ID + customizations to CSS custom properties. All child components use `var(--theme-*)` references, never hardcoded colors.
2. `PublicProfileRenderer` + `SectionRegistry` — Unified renderer iterating a `section_order` array. Replaces both `PublicPersonalProfilePage` and `PublicProfileView`. Section components (HeroSection, BioSection, ContactSection, SocialLinksSection, CustomLinksSection, GalleryPreviewSection) are shared across both profile types.
3. `ProfileEditorShell` — Split-pane editor (form panels left, device-framed preview right). Uses `useReducer` for state, 500ms debounced TanStack Query mutation for auto-save, per-field-type debounce (0ms for discrete actions, 300ms for text input).
4. `ImageOptimizationPipeline` — Migrate avatar/logo from PostgreSQL binary blobs to R2 object keys. Canvas API resizes to 64/200/400px WebP before upload. Store object key prefix in DB, generate CDN URLs at API response time. Backward-compatible lazy migration.
5. `ProfileAPIHooks` (TanStack Query) — Replace raw `useEffect`/`useState` fetching in both public pages with proper caching, background refetch, and deduplication.

**Suggested build order (critical path):** UnifiedThemeEngine -> Section components -> PublicProfileRenderer/SectionRegistry -> TanStack Query hooks -> DeviceFrame extraction -> ProfileEditorShell -> DnD section reordering -> R2 image migration -> Premium theme gating -> Auto-save.

### Critical Pitfalls

1. **R2 presigned URL expiration breaks avatars silently** — Never store presigned URLs in the database. Store R2 object keys and generate URLs at API response time. Add `onError` handler to every `<img>` with graceful fallback to initials/placeholder. Create a shared `<ProfileAvatar>` component encapsulating loading state, error handling, and size variants. Test with expired URLs before marking avatar work done.

2. **Theme engine dual-system inconsistency** — LEGACY_PROFILE_THEMES (5 themes, Tailwind classes) and PREBUILT_THEMES (20 themes, CSS vars) coexist with a lossy converter between them. Dark mode is silently broken for all PREBUILT themes because `convertBuiltInThemeToProfileTheme` only reads the first variant. Solution: migrate ALL themes to PREBUILT_THEMES format, delete LEGACY_PROFILE_THEMES entirely, standardize on CSS custom properties.

3. **Live preview desynchronization** — PreviewService singleton with 300ms debounce across all update types causes stale state. Replace with React state management (useReducer + context). Use 0ms debounce for discrete actions (theme switch, reorder), 300ms for text input. Never block preview on font loading — show system font fallbacks immediately, swap when custom fonts arrive.

4. **SEO regression from client-side rendering** — Public pages are fully client-rendered; crawlers see an empty shell. Above-the-fold content must never be behind `initial={{ opacity: 0 }}`. Practical fix: lightweight server-rendered HTML shell with critical meta tags and OG data from FastAPI, or a prerendering service. Test with `curl` on the public URL — if meta tags are absent from raw HTML, SEO is broken.

5. **Dual profile systems diverging during modernization** — /u/ and /p/ built at different times with no shared components. Modernizing sequentially creates 2x maintenance burden and inconsistent quality. Prevent by defining the shared component library before any visual changes, then modernizing both systems simultaneously in the same PRs.

## Implications for Roadmap

Based on the dependency graph from FEATURES.md and the build order from ARCHITECTURE.md, a 4-phase structure is the right approach:

### Phase 1: Foundation & Fixes
**Rationale:** Broken functionality (avatar upload) and structural safety nets must come first. Component restructuring without smoke tests causes silent regressions in lazy-loaded routes. The shared component library must be scaffolded before any visual work begins, or both profile systems diverge.
**Delivers:** Working avatar upload, component inventory + route-level smoke tests, shared component scaffolding (ProfileAvatar, ProfileHero, ProfileLinks), R2 image pipeline, TanStack Query hooks replacing manual fetching, per-link click tracking instrumentation.
**Addresses:** Fix avatar upload (P0 from FEATURES.md), per-link click tracking groundwork.
**Avoids:** Pitfall 1 (R2 URL expiration), Pitfall 5 (component restructuring breakage), Pitfall 7 (dual profile divergence from first commit).
**Research flag:** Standard patterns — no deeper research needed. R2 integration already proven in rawdrive-upload-service.

### Phase 2: Theme Engine & Public Page Redesign
**Rationale:** UnifiedThemeEngine is the dependency for all visual work — live preview, animated themes, dark mode all require it. Public page redesign must happen simultaneously for both /u/ and /p/ using the shared renderer. SEO must be addressed here, not later, because bolting on prerendering after animations are added is much harder.
**Delivers:** UnifiedThemeEngine replacing 3 legacy systems, PublicProfileRenderer + SectionRegistry (both profile types unified), 8-12 coherent themes with 3-4 animated variants, dark mode, sub-2s mobile load, SEO/OG meta pre-rendering strategy, accessibility contrast validation in theme definitions.
**Uses:** framer-motion `layoutId`, Tailwind v4 container queries, glassmorphism utilities, react-best-gradient-color-picker.
**Implements:** UnifiedThemeEngine, SectionRegistry, PublicProfileRenderer, cssVarInjector, section_order backend migration.
**Avoids:** Pitfall 2 (theme dual-system), Pitfall 4 (SEO regression), Pitfall 8 (accessibility — contrast validation built into theme engine at creation time).
**Research flag:** SSR/prerendering strategy needs a concrete decision before coding starts — server-rendered shell from FastAPI vs. prerender.io. Approximately 30 minutes of planning, not deep research.

### Phase 3: Editor Redesign
**Rationale:** Editor depends on a working theme engine and public renderer (preview must show the same render as the public page). Split-pane editor with live preview replaces the broken singleton PreviewService. DnD section reordering requires the section registry from Phase 2.
**Delivers:** ProfileEditorShell with split-pane layout, working live preview for both profile types, drag-and-drop section reordering, Bento grid editor polish (snap-to-grid, resize handles), theme picker with animated previews, auto-save with dirty tracking, undo stack (5-10 states).
**Uses:** @dnd-kit/sortable for section DnD, framer-motion for animated transitions in editor, useReducer for editor state, TanStack Query debounced mutation.
**Implements:** ProfileEditorShell, EditorSidebar, DragDropContext, PreviewFrame (extracted device frames), useProfileEditor hook.
**Avoids:** Pitfall 3 (preview desynchronization — replace singleton with React state, per-field-type debounce).
**Research flag:** Standard patterns. @dnd-kit integration into existing Bento grid needs careful implementation planning — confirm whether @dnd-kit handles resize handles (not just reorder) before committing to this approach.

### Phase 4: Content Blocks, Polish & Performance
**Rationale:** New block types require the section registry (Phase 2) and the editor (Phase 3). Performance and accessibility enforcement must happen with actual animations in place to measure accurately. Mobile performance budgets set in Phase 1 are validated here.
**Delivers:** Featured gallery preview block (lightbox + live gallery pull), booking/CTA block, testimonial block, branded QR codes, performance budget enforcement (Lighthouse mobile > 70 on all themes), accessibility audit (axe-core on all 20 themes in CI), animation reduced-motion support, LazyMotion code splitting.
**Avoids:** Pitfall 6 (mobile animation performance — backdrop-filter disabled on mobile via media query, LazyMotion reduces bundle from 40KB to 15KB), Pitfall 8 (final comprehensive accessibility audit).
**Research flag:** Gallery preview block integration — which galleries to surface (featured flag? latest N covers?), and lightbox UX within a profile page. Brief research on Calendly/HoneyBook embed patterns for booking CTA block.

### Phase Ordering Rationale

- UnifiedThemeEngine is the true dependency root — all visual components, live preview, and dark mode require it. It comes before editor or public page visual work.
- Public page redesign (Phase 2) must precede editor redesign (Phase 3) because the editor preview renders the same public page components — the preview cannot be validated until the public renderer is correct.
- R2 image migration (Phase 1) is decoupled from frontend work and can run in parallel with Phase 2-3, but must be complete before Phase 4 ships publicly.
- New block types (Phase 4) are blocked on both the section registry (Phase 2) and the editor (Phase 3) — they cannot be parallelized with earlier phases.
- SEO is in Phase 2, not Phase 5. Adding it last after animations and effects are layered in is the most expensive recovery path.

### Research Flags

Needs closer planning attention:
- **Phase 2:** SSR/prerendering strategy for public pages — concrete approach needed (server-rendered shell via FastAPI vs. prerender.io service). Architectural decision before coding starts.
- **Phase 3:** @dnd-kit resize handle capability — confirm whether sortable handles drag-to-resize for Bento grid blocks, or if a different approach is needed.
- **Phase 4:** Gallery preview block integration — how the section pulls from gallery service (featured flag? latest N covers?) and lightbox UX within a profile page context.
- **Phase 4:** Booking/CTA block — brief research on Calendly, HoneyBook, Acuity embed patterns.

Standard patterns (no research phase needed):
- **Phase 1:** R2 upload integration (already proven in upload-service), TanStack Query migration (well-documented, used elsewhere in app).
- **Phase 2:** UnifiedThemeEngine and CSS custom property injection (standard pattern), section-based architecture.
- **Phase 3:** useReducer editor state, debounced auto-save, device frame preview.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack verified in codebase. One new package (react-best-gradient-color-picker) has MEDIUM confidence — npm-verified, active, but no Context7 entry. Risk is low because it is non-critical UI. |
| Features | HIGH | Competitor landscape thoroughly researched across 20+ sources. Table stakes and differentiators are clear. Photography-native features (gallery block, dual profile) are well-reasoned. |
| Architecture | HIGH | Based on direct codebase analysis of 30+ files. Component boundaries, data flows, and migration paths are concrete, not speculative. Build order validated by dependency graph. |
| Pitfalls | HIGH | 8 critical pitfalls derived from actual code inspection — real bugs in PreviewService singleton, real R2 URL handling code, real theme conversion lossiness. Not hypothetical. |

**Overall confidence:** HIGH

### Gaps to Address

- **Prerendering strategy:** Research identified the problem (client-rendered public pages hurt SEO) and outlined two solutions (server-rendered shell vs. prerender service) but did not choose one. Decision must happen at the start of Phase 2 planning. FastAPI infrastructure favors a server-rendered shell; prerender.io has operational cost.
- **section_order migration:** Backend needs `section_order` and `section_config` columns on both `personal_profiles` and `company_profiles` tables. Migration is straightforward but requires a safe default order for existing profiles and coordination during deployment.
- **Gradient string format compatibility:** `react-best-gradient-color-picker` outputs CSS gradient strings (`linear-gradient(...)`). The theme engine must accept these as background values. Verify format compatibility before Phase 2 theme editor ships.
- **Premium theme gating business logic:** `is_premium: boolean` exists on the Theme type and the billing service is live, but which plan tier unlocks premium themes is undefined. Needs a product decision before Phase 2 theme picker is built.
- **lucide-react icon coverage:** Version ^0.294.0 may lack icons for Threads and Bluesky. Needs a quick audit before Phase 2 social links update ships.

## Sources

### Primary (HIGH confidence — direct codebase analysis)
- `ProfileThemeEngine.ts`, `constants/themes.ts` — 5 legacy + 20 PREBUILT themes, dual-system divergence confirmed
- `PublicProfileView.tsx`, `PublicPersonalProfilePage.tsx` — two divergent rendering pipelines confirmed
- `CompanyProfilePreview.tsx` — working device frame preview pattern to replicate
- `PreviewService.ts` — singleton with 300ms debounce, desync source confirmed
- `personal_profile_service.py`, `company_profile_service.py` — PostgreSQL binary blob storage confirmed
- `router/routes.tsx` — lazy-loaded profile routes confirmed
- `profileEditor.ts` type definitions — Theme, ThemeCustomization, LayoutPreferences shapes

### Secondary (HIGH confidence — official documentation)
- [Tailwind CSS v4 blog](https://tailwindcss.com/blog/tailwindcss-v4) — container queries built-in, confirmed
- [Motion official site](https://motion.dev/) — framer-motion v11/v12 API compatibility confirmed
- [react-best-gradient-color-picker npm](https://www.npmjs.com/package/react-best-gradient-color-picker) — v3.0.14, 28K weekly downloads
- [Cloudflare R2 presigned URL docs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) — expiration behavior confirmed
- [Web Vitals thresholds](https://web.dev/articles/vitals) — LCP < 2.5s, FID < 100ms, CLS < 0.1
- [WCAG 2.1 AA contrast requirements](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) — 4.5:1 normal text, 3:1 large text
- [Framer Motion LazyMotion](https://www.framer.com/motion/lazy-motion/) — 40KB to 15KB bundle size reduction
- [@dnd-kit/sortable npm](https://www.npmjs.com/package/@dnd-kit/sortable) — v10.0.0 confirmed

### Secondary (MEDIUM confidence — competitor research, 20+ sources cross-referenced)
- Linktree, Beacons, Carrd, Later Linkin.bio, Stan Store, Pixieset feature analysis
- [Bento Grid Design Trend 2026](https://desinance.com/design/bento-grid-web-design/) — trend confirmation
- [Beacons vs Linktree 2026](https://stackinfluence.com/blog/beacons-vs-linktree-2026-link-bio-tool-is-best) — competitor positioning

---
*Research completed: 2026-03-19*
*Ready for roadmap: yes*
