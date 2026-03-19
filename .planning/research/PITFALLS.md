# Pitfalls Research

**Domain:** Profile & public page modernization in existing SaaS (photography platform)
**Researched:** 2026-03-19
**Confidence:** HIGH (derived from direct codebase analysis of 30+ existing components, theme engine, preview service, and public profile views)

## Critical Pitfalls

### Pitfall 1: Avatar/Image Loading Broken by R2 Presigned URL Expiration and CORS

**What goes wrong:**
Avatar and logo images load in the editor (same origin) but break on public pages (`/u/:slug`, `/p/:slug`). The `PublicProfileView` already has a workaround pattern — checking `logo_url.startsWith('http')` and falling back to `companyProfileService.getPublicLogoUrl(slug)` — indicating this is a known, partially-patched issue. Images display as broken on first load, flash correctly on retry, or fail silently with no fallback UI.

**Why it happens:**
Three compounding issues: (1) R2 presigned URLs expire (typically 1-7 days) but profile data is cached longer, so stored URLs go stale. (2) R2 CORS configuration does not include the public page origins (`rawdrive.in/u/*`, `rawdrive.in/p/*`) — the existing `PublicProfileView` already works around this by proxying through a backend endpoint. (3) The `ProfileHeader` component has a fallback (initial letter avatar with `brandColor`) but no error handler on the `<img>` tag — if the image request fails after rendering starts, the user sees a broken image icon, not the fallback.

**How to avoid:**
- Never store presigned URLs in the database. Store the R2 object key and generate presigned URLs at request time in the API response, or use a permanent public URL pattern via Cloudflare R2 custom domain.
- Add `onError` handler to every `<img>` that renders user-uploaded content: `onError={() => setImageFailed(true)}` with graceful fallback to initials/placeholder.
- Create a shared `<ProfileAvatar>` component that encapsulates: loading state (skeleton), error handling (fallback to initials), size variants, and theme-aware ring/border styling. Both `/u/:slug` and `/p/:slug` pages use this one component.
- Test image loading with expired URLs, CORS errors, 404s, and slow networks (throttled DevTools) before marking avatar work as done.

**Warning signs:**
Avatar works in editor preview but not on the public page. Console shows CORS errors or 403 from R2. Users report "my photo disappeared" after a few days.

**Phase to address:**
Phase 1 (Fix Broken Functionality) — this is the first thing users see and the first thing that looks unprofessional.

---

### Pitfall 2: Theme Engine Dual-System Inconsistency — Legacy vs PREBUILT_THEMES Divergence

**What goes wrong:**
The `ProfileThemeEngine.ts` maintains TWO separate theme systems: `LEGACY_PROFILE_THEMES` (5 themes with hardcoded Tailwind classes like `bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50`) and `PREBUILT_THEMES` in `constants/themes.ts` (20 themes using CSS custom properties via `var(--theme-*)`). The `getTheme()` function checks legacy first, then PREBUILT, then falls back to `theme-clean-slate`. The `convertBuiltInThemeToProfileTheme()` function lossy-converts the rich PREBUILT_THEMES structure (variants, gradients, multiple neutrals) into the simpler `ProfileTheme` shape, discarding variant support and gradient definitions.

**Why it happens:**
The original profile system used 5 hardcoded themes with direct Tailwind classes. The new editor system introduced 20 richer themes with CSS variables. Rather than migrating, a conversion layer was added. Now the two systems coexist with different rendering approaches — legacy themes use Tailwind arbitrary values mixed with CSS vars, new themes use pure CSS vars. The `pastel` legacy theme still uses `bg-gradient-to-br from-rose-50 via-purple-50 to-sky-50` which cannot be dynamically customized.

**How to avoid:**
- Migrate ALL themes to the PREBUILT_THEMES format. Remove `LEGACY_PROFILE_THEMES` entirely. Map old theme IDs (`minimal`, `dark`, `pastel`, `bold`, `cinematic`) to their closest PREBUILT equivalents with a one-time migration.
- Standardize on CSS custom properties for ALL dynamic values. No Tailwind arbitrary values for theme colors — only for structural styling (spacing, layout).
- The `ProfileTheme` interface needs to match `Theme` from `profileEditor.ts`, not be a separate shape. One type, one source of truth.
- Test every theme (all 20+) in both light and dark variants on the actual public page, not just in a Storybook-style preview. The `convertBuiltInThemeToProfileTheme` function currently only reads the first variant — dark mode is silently broken for all PREBUILT themes.

**Warning signs:**
Theme looks correct in editor preview but wrong on public page. Dark mode toggle does nothing for most themes. Some themes show raw CSS variable names instead of colors. Gradient themes render as solid colors on public pages.

**Phase to address:**
Phase 2 (Theme Engine Consolidation) — must happen before any visual modernization work, as all component styling depends on reliable theme data.

---

### Pitfall 3: Live Preview Desynchronization — Editor State Drift from Preview Render

**What goes wrong:**
The `PreviewService` is a singleton with a 300ms debounce and 60-second cache. When users make rapid edits (typing bio text, dragging links, switching themes), the preview falls behind, shows stale data, or displays a state that was never saved. Users see their changes in the editor form but not in the preview panel, lose trust in the editor, and either over-save or abandon editing.

**Why it happens:**
The debounce is 300ms which is reasonable for typing but too slow for discrete actions (toggle visibility, reorder links, switch theme). The cache key includes `customizationId` which is undefined for new customizations, causing cache misses that trigger unnecessary recomputations. The `processUpdates()` method clears pending updates before generating the preview — if the preview generation is slow (font loading), new updates that arrive during generation are lost. Font loading (`fontService.loadFont`) is async but the preview is generated synchronously — theme changes that require new fonts show old fonts until the next update cycle.

**How to avoid:**
- Use different debounce strategies for different update types: 0ms for discrete actions (theme switch, visibility toggle, link reorder), 300ms for continuous input (text fields, color pickers).
- Replace the singleton pattern with React state management (useReducer + context or Zustand store). The singleton with manual listener management is fighting React's rendering model — components should re-render naturally when preview state changes, not via imperative listener callbacks.
- For font loading: show the preview immediately with system font fallbacks, then swap to custom fonts when loaded (use `font-display: swap` pattern). Never block preview rendering on font loading.
- Add an optimistic update path: update the preview DOM immediately from editor state, then reconcile with the debounced computed preview. This eliminates perceived lag.

**Warning signs:**
Users report "preview doesn't update" or "preview shows old data." Preview flashes incorrect content then corrects itself. Theme changes don't reflect until the user clicks elsewhere.

**Phase to address:**
Phase 3 (Editor Redesign) — the preview architecture must be solid before adding more editor complexity.

---

### Pitfall 4: SEO Regression When Adding Client-Side Effects to Public Pages

**What goes wrong:**
Public profile pages (`/u/:slug`, `/p/:slug`) are the photographer's public-facing identity. Adding Framer Motion animations, glassmorphism effects, dynamic font loading, and client-side theme rendering means search engine crawlers see a loading spinner or empty shell instead of profile content. Largest Contentful Paint (LCP) degrades from <1s to 3-5s. Google de-indexes profiles or shows them with generic metadata.

**Why it happens:**
The current `PublicProfileView` already uses `react-helmet-async` for SEO and has JSON-LD structured data. But the entire profile content is client-rendered — the `useEffect` fetches profile data, then another `useEffect` loads fonts, and only then is content shown. Crawlers that don't execute JavaScript (or have a timeout) see only the loading state. Framer Motion `initial={{ opacity: 0 }}` means content is invisible for the first 100-400ms even after data loads.

**How to avoid:**
- Implement server-side rendering (SSR) or static generation (SSG) for public profile pages. Since RawDrive uses React SPA with client-side routing, the most practical approach is: (a) Add a lightweight server-rendered HTML shell at `/u/:slug` and `/p/:slug` that includes critical meta tags, Open Graph data, and above-the-fold content pre-rendered by the backend API, OR (b) Use a prerendering service (prerender.io pattern) that serves cached HTML to crawlers.
- Never put above-the-fold content behind `initial={{ opacity: 0 }}`. The hero (name, avatar, title) should be visible immediately. Animations should only apply to below-the-fold or supplementary content.
- Move critical CSS inline (theme colors, font-face declarations) into the HTML head so the first paint is themed, not a flash of unstyled content.
- Set performance budgets: LCP < 2.5s, FID < 100ms, CLS < 0.1. Test with Lighthouse on throttled 3G.

**Warning signs:**
Google Search Console shows "Page is not indexed." Lighthouse Performance score drops below 50. Social media link previews show generic text instead of profile info. `view-source:` on the public page shows only a `<div id="root">` with no content.

**Phase to address:**
Phase 2 or 3 — must be considered from the start of any public page redesign, not bolted on after visual work is done.

---

### Pitfall 5: Component Restructuring Breaks 25+ Existing Components Without Catching It

**What goes wrong:**
The profile feature directory has 25+ components with complex import chains. Renaming, moving, or consolidating components (e.g., merging personal and company profile views) breaks imports across the codebase. The `index.ts` barrel file only exports `PublicProfileView` — the other 24 components are imported directly by path, making refactoring fragile. A renamed file breaks a page that isn't tested, and the bug ships silently.

**Why it happens:**
No comprehensive test coverage for all 25+ profile components. The existing tests (`themeWorkflow.integration.test.tsx`, `coordinateWorkflow.integration.test.tsx`, `visibilityWorkflow.integration.test.tsx`) test specific workflows but not rendering. TypeScript catches import errors at build time, but only if all pages are statically imported — lazy-loaded pages (`lazy(() => import('../pages/public/PublicProfilePage'))`) fail at runtime, not build time.

**How to avoid:**
- Before restructuring ANY component, run the full frontend build (`pnpm build`) and verify it succeeds with zero errors. Lazy imports that fail at runtime will NOT be caught by TypeScript alone.
- Create a component inventory spreadsheet: list every profile component, where it's imported, and what it renders. Use this as a checklist during restructuring.
- Add smoke tests for EVERY page route that renders profile components: mount the page component, verify it renders without throwing. This catches broken lazy imports.
- Restructure incrementally: one component at a time, with a build + test after each move. Never batch-rename 10 files in one commit.
- Use the barrel export pattern (`index.ts`) for all profile components. Change imports from `'./ProfileHeader'` to `'./profile'` (barrel). Future restructuring only needs to update the barrel file.

**Warning signs:**
`pnpm build` succeeds but pages crash at runtime. Navigation to a profile page shows a blank screen or React error boundary. Console shows "Cannot find module" errors.

**Phase to address:**
Phase 1 (before any visual changes) — establish the component inventory and smoke tests as a safety net.

---

### Pitfall 6: Animation Performance on Low-End Devices Destroys Mobile Experience

**What goes wrong:**
Profile pages use Framer Motion for entrance animations (`initial`, `animate`, `transition`), glassmorphism effects (`backdrop-blur-xl`, `backdrop-blur-md`), and CSS gradients as backgrounds. On low-end Android devices (which represent a significant portion of Indian market photographers), these effects cause: janky scrolling (sub-30fps), battery drain, visible layout shifts as animations complete, and 2-3 second delays before content is interactive.

**Why it happens:**
`backdrop-filter: blur()` triggers GPU compositing on every frame during scroll. Multiple `motion.div` elements with staggered animations create layout thrashing. The `ProfileHeader` animates scale and opacity simultaneously. Gradient backgrounds with transparency (`bg-white/60`, `bg-[var(--theme-accent)]/10`) force alpha blending on every paint. These effects are imperceptible on a MacBook Pro but catastrophic on a Redmi Note.

**How to avoid:**
- Use `prefers-reduced-motion` media query to disable ALL animations for users who request it. Framer Motion supports this with `<LazyMotion features={domAnimation}>` and `useReducedMotion()`.
- Replace `backdrop-blur` with a solid semi-transparent background on mobile. The visual difference is minimal but the performance difference is massive. Use a CSS media query: `@media (max-width: 768px) { .glass { backdrop-filter: none; background: rgba(255,255,255,0.95); } }`.
- Limit animated elements to 3-5 per page. The current `ProfileHeader` alone has 3 `motion.div` elements — each additional animated component multiplies frame budget pressure.
- Use `will-change: transform` sparingly and only on elements that actually animate. Remove it after animation completes.
- Test on a real low-end device or Chrome DevTools with CPU 6x slowdown + Fast 3G throttling. Never approve visual changes tested only on desktop.

**Warning signs:**
Lighthouse Performance score < 50 on mobile. FPS counter shows < 30 during scroll on public pages. Users on mobile report "slow" or "laggy" profiles. Battery usage complaints.

**Phase to address:**
Phase 4 (Polish & Performance) — but the architecture must support graceful degradation from Phase 1. Never add an animation without a reduced-motion fallback.

---

### Pitfall 7: Two Profile Systems (/u/ and /p/) Diverge During Modernization

**What goes wrong:**
Personal profiles (`/u/:slug` via `PublicPersonalProfilePage`) and company profiles (`/p/:slug` via `PublicProfileView`) are modernized independently. One gets the new design first, the other is left behind. They develop different component hierarchies, different theme application logic, different mobile layouts. Eventually, maintaining both is 2x the work, and users who have both a personal and company profile see inconsistent quality.

**Why it happens:**
The two systems were built at different times with different component trees. Personal profiles use `ProfileHeader`, `ProfileBio`, `ProfileSocials`, `ProfileBentoGrid`, etc. Company profiles use `PublicProfileLayout` with `HeroGlassCard`, `ContactMethodsCard`, `ServicesGlassGrid`, etc. They share almost no components despite rendering conceptually identical content (name, avatar, bio, links, contact info, social links).

**How to avoid:**
- Define a shared component library BEFORE modernizing either system. The shared components are: `ProfileAvatar`, `ProfileHero` (name + title + location + badges), `ProfileLinks` (social + custom), `ProfileContact` (email, phone, address), `ProfileActions` (vCard, QR, share), `ProfileThemeProvider` (CSS vars + font loading).
- Both `/u/:slug` and `/p/:slug` should compose from the same component library, differing only in: data source (personal API vs company API), available sections (personal has galleries, company has services), and default themes.
- Create a shared `useProfilePageData(type, slug)` hook that normalizes both API responses into a common `ProfilePageData` shape. Components consume this normalized shape, never raw API responses.
- Modernize both systems simultaneously, not sequentially. If a design change is made to the hero section, it applies to both systems in the same PR.

**Warning signs:**
PRs that touch only personal OR only company profile components. Duplicated component names with slight variations (e.g., `ProfileHeader` vs `HeroGlassCard` doing the same thing). Bug fixes applied to one system but not the other.

**Phase to address:**
Phase 1 (Architecture) — the shared component library must be designed before any visual modernization begins.

---

### Pitfall 8: Accessibility Regression with Fancy UI Effects

**What goes wrong:**
Glassmorphism, gradient text, low-contrast "elegant" themes, and animated transitions all degrade accessibility. The `Champagne` theme has gold text (#A16207) on cream background (#FEFCE8) with a contrast ratio of ~3.2:1, failing WCAG AA (requires 4.5:1). Glass surfaces with `backdrop-blur` make text unreadable when background content varies. Screen readers announce nothing useful because decorative `motion.div` wrappers break semantic HTML structure.

**Why it happens:**
Visual design prioritizes aesthetics over readability. Theme color pairs are defined independently without contrast checking. The theme system has `text_primary` and `background` colors but no validation that they meet contrast requirements. Glassmorphism looks great on solid backgrounds but fails on varied backgrounds because readability depends on what's behind the glass.

**How to avoid:**
- Add a contrast ratio validator to the theme system. Every `text_primary`/`background` and `text_secondary`/`surface` pair must meet WCAG AA (4.5:1 for body text, 3:1 for large text). Run this validation at build time on all 20 themes.
- For glassmorphism: always include a solid-enough background opacity. `rgba(255,255,255,0.6)` with blur is not enough — use `0.85` minimum for text-containing surfaces.
- Use semantic HTML elements: `<header>`, `<main>`, `<section>`, `<nav>`, `<footer>`. Wrap Framer Motion in semantic elements, not the other way around. Current `ProfileHeader` uses generic `<div>` for everything.
- All interactive elements (links, buttons, share actions) must have minimum 44x44px touch targets (the current `ProfileActions` uses small icons).
- Add `aria-label` to icon-only buttons (social links, share button, QR download).
- Test with VoiceOver/NVDA on every public page template.

**Warning signs:**
Lighthouse Accessibility score < 90. axe DevTools reports contrast failures. Users complain they "can't read the text" on certain themes. Social link icons have no accessible names.

**Phase to address:**
Phase 2 (Theme Consolidation) for contrast validation, Phase 4 (Polish) for comprehensive accessibility audit. But semantic HTML should be enforced from Phase 1.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keeping LEGACY_PROFILE_THEMES alongside PREBUILT_THEMES | Avoids migration risk | Two rendering paths to maintain, bugs in one but not the other | Never — migrate in Phase 2 |
| Using singleton PreviewService instead of React state | Works without refactoring existing code | Fights React rendering model, causes stale state bugs, untestable | Only during Phase 1 (fix broken things); must replace in Phase 3 |
| Storing presigned R2 URLs in database | Simpler initial implementation | URLs expire, breaking avatars/logos after days | Never — store object keys only |
| Hardcoding fallback gradients in PublicProfileView | Prevents blank pages when theme is null | Default appearance diverges from any actual theme | Only as ultimate fallback; ensure it matches the actual default theme |
| Lazy-loading public profile pages | Smaller initial bundle | SEO crawlers may not execute JS, public pages need fast LCP | Acceptable with prerendering strategy in place |
| Skipping animation on server/crawler via user-agent sniffing | Quick SEO fix | Fragile, breaks with new crawlers, creates divergent render paths | Never — use progressive enhancement instead |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| R2 Storage (avatars/logos) | Storing presigned URLs that expire | Store object keys, generate URLs at API response time or use R2 public bucket with custom domain |
| Google Fonts (theme typography) | Loading fonts synchronously blocking render | Use `font-display: swap`, preconnect hints, and render with system fallbacks while fonts load |
| Framer Motion (animations) | Wrapping everything in `motion.div` | Use `motion` only on key elements (3-5 per page), respect `prefers-reduced-motion`, use `LazyMotion` for code splitting |
| react-helmet-async (SEO) | Setting meta tags after client-side data fetch | Pre-render critical meta tags server-side or use a prerendering service for crawlers |
| Cloudflare R2 CORS | Configuring CORS for the app domain only | Include all origins: main app, public pages, preview iframe (if used), and localhost for dev |
| CSS Custom Properties (themes) | Setting vars on component root | Set CSS vars on `<html>` or page-level wrapper so all children inherit, including portals and modals |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| backdrop-filter: blur() on mobile | Janky scrolling, GPU memory spikes | Disable on mobile via media query, use solid backgrounds | Any device with < 4GB RAM |
| 20+ Google Font families across themes | Slow font loading, FOUT on every theme switch | Load only the active theme's fonts, preload during theme selection, cache loaded fonts | When user has slow connection or switches themes rapidly |
| Framer Motion bundle size (40KB+ gzipped) | Increased initial load for public pages | Use `LazyMotion` with `domAnimation` feature set (15KB), code-split heavy animations | Affects all users on first load |
| CSS-in-JS theme computation on every render | Preview becomes sluggish during rapid edits | Memoize theme CSS vars with useMemo, only recompute when theme ID or customization changes | When editor has 10+ sections/links |
| Large avatar images (2MB+ uploads) | Slow public page load, high bandwidth | Resize avatars to max 512x512 on upload, serve WebP format, use responsive `srcset` | Any profile page visit on mobile |
| JSON.stringify for cache keys in PreviewService | Expensive serialization on every update | Use a simple hash of IDs instead of full JSON serialization | When preview state grows (many custom links, rich bio) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Public profile page exposes workspace_id in API response | Information disclosure, workspace enumeration | Strip workspace_id from public API responses; public endpoints should only accept slug, never expose internal IDs |
| Custom links rendered as `<a href={userInput}>` without validation | XSS via `javascript:` URLs, phishing via lookalike domains | Validate URLs server-side (must start with `https://`), sanitize on render with allowlist of protocols |
| QR code download endpoint without rate limiting | QR code generation is CPU-intensive, enables DoS | Rate-limit QR generation to 10/min per IP, cache generated QR codes |
| Profile slug allows special characters | Path traversal, URL injection | Validate slugs: `^[a-z0-9-]{3,30}$` only, reject on creation |
| vCard download includes all contact info regardless of visibility settings | Privacy violation — hidden fields exposed via vCard | vCard endpoint must respect the same visibility config as the public page render |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Theme preview thumbnail doesn't match actual render | User picks a theme based on misleading preview, publishes, sees different result | Generate theme previews from the actual rendering engine, not static images |
| Live preview only shows desktop view in editor | User publishes, visits on phone, layout is broken | Default preview to mobile view (most visitors are mobile), add device toggle that persists preference |
| No undo/redo in profile editor | User makes accidental changes, can't recover | Implement undo stack (5-10 states) using useReducer history pattern |
| Save button with no autosave | User edits for 10 minutes, browser crashes, work is lost | Autosave drafts to localStorage every 30s, restore on page load with "resume editing?" prompt |
| Theme switch resets custom colors | User customizes colors, tries a different theme to compare, loses customizations | Store customizations per-theme, or confirm before switching: "This will reset your custom colors" |
| Editor shows all 20 themes in a flat list | Overwhelming choice, users pick the first one | Group by category (already in data), show 4-6 popular themes first, expandable "See all" |

## "Looks Done But Isn't" Checklist

- [ ] **Avatar loading:** Verify with expired presigned URL, CORS error, 404, and slow network (3G throttled)
- [ ] **Theme rendering:** Test ALL 20 themes (not just 3-4 popular ones) in BOTH light and dark variants on the actual public page
- [ ] **Mobile layout:** Test on a real Android device (not just Chrome responsive mode) with 360px width
- [ ] **SEO metadata:** Run `curl -s https://rawdrive.in/u/testslug | head -50` and verify title, description, and OG tags are present in raw HTML (not just after JS executes)
- [ ] **Accessibility:** Run axe DevTools on every theme variant — contrast failures are per-theme, not global
- [ ] **Preview sync:** Make 10 rapid edits in the editor (type fast, switch themes, toggle visibility) and verify preview matches final state
- [ ] **vCard export:** Download vCard with visibility settings hiding some fields — verify hidden fields are NOT in the vCard file
- [ ] **QR code:** Scan the generated QR code with 3 different scanner apps — some QR libraries generate codes that only work with specific readers
- [ ] **Font loading:** Test with fonts.googleapis.com blocked (corporate firewall) — verify fallback fonts render correctly
- [ ] **Social links:** Verify all social platform URLs open correctly (some need `https://` prefix, others work without it)
- [ ] **Share functionality:** Test Web Share API on mobile AND clipboard fallback on desktop — both paths must work
- [ ] **Animation performance:** Run Lighthouse on mobile with CPU 4x slowdown — Performance score must stay above 70

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Expired R2 presigned URLs in DB | LOW | Run migration to replace URLs with object keys, add API-time URL generation |
| Theme engine divergence (legacy vs new) | MEDIUM | Create mapping from legacy theme IDs to PREBUILT equivalents, run DB migration, remove legacy code |
| Preview desync bugs | LOW | Replace singleton with React state management (Zustand), debounce per-field-type |
| SEO regression on public pages | HIGH | Implement prerendering service or SSR — significant architecture change, requires server infrastructure |
| Component restructuring breakage | MEDIUM | Add route-level smoke tests, run full build + E2E smoke before each merge |
| Performance regression on mobile | MEDIUM | Add performance budget CI check (Lighthouse CI), disable heavy effects on mobile via media queries |
| Accessibility failures | MEDIUM | Run automated axe-core scan in CI on all 20 theme variants, fix contrast ratios in theme definitions |
| Dual profile system divergence | HIGH | Requires retroactive extraction of shared components, re-testing both systems — much cheaper to prevent than fix |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| R2 avatar/logo loading (#1) | Phase 1: Fix Broken | Avatar renders on public page after 7+ days without re-uploading |
| Theme dual-system (#2) | Phase 2: Theme Consolidation | LEGACY_PROFILE_THEMES deleted, all 20 themes render identically on editor preview and public page |
| Preview desync (#3) | Phase 3: Editor Redesign | 10 rapid edits in editor result in correct final preview state within 500ms |
| SEO regression (#4) | Phase 2-3: Public Page Redesign | `curl` on public page URL returns complete meta tags and structured data in raw HTML |
| Component breakage (#5) | Phase 1: Before Restructuring | Route-level smoke tests exist for all profile pages, full build passes after each component move |
| Mobile animation perf (#6) | Phase 4: Polish | Lighthouse mobile Performance > 70 on all theme variants |
| Dual profile divergence (#7) | Phase 1: Architecture | Shared component library defined, both systems use same base components |
| Accessibility (#8) | Phase 2 + Phase 4 | axe-core reports zero critical/serious issues on all 20 theme variants in both light/dark modes |

## Sources

- Direct codebase analysis of `ProfileThemeEngine.ts`, `themes.ts` (20 PREBUILT + 5 LEGACY themes), `PublicProfileView.tsx`, `PreviewService.ts`, `ProfileHeader.tsx`, and 25+ profile components
- [Cloudflare R2 presigned URL documentation](https://developers.cloudflare.com/r2/api/s3/presigned-urls/) — presigned URLs have configurable expiration, default varies
- [Web Vitals thresholds](https://web.dev/articles/vitals) — LCP < 2.5s, FID < 100ms, CLS < 0.1 for "good" rating
- [WCAG 2.1 AA contrast requirements](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html) — 4.5:1 for normal text, 3:1 for large text
- [Framer Motion LazyMotion](https://www.framer.com/motion/lazy-motion/) — reduces bundle from ~40KB to ~15KB gzipped
- [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) — respect user animation preferences
- [backdrop-filter performance](https://web.dev/articles/css-compositing) — GPU-intensive, avoid on low-end mobile

---
*Pitfalls research for: Profile & Public Page Modernization (v1.1)*
*Researched: 2026-03-19*
