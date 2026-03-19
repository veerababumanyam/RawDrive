# Phase 11: Public Page Redesign - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Redesign both public profile pages (`/u/:slug` personal, `/p/:slug` company) to be modern, responsive, visually premium (Linktree-level), and SEO-discoverable. Uses the shared PublicProfileRenderer and UnifiedThemeEngine from Phase 10.

Requirements: PUBPG-01, PUBPG-02, PUBPG-03, PUBPG-04, PUBPG-06, SEO-01, SEO-02, SEO-03, SEO-04

</domain>

<decisions>
## Implementation Decisions

### Visual Design Language
- Glassmorphism + Bento grid aesthetic — frosted glass cards on animated gradient backgrounds, modular grid layout
- Theme accent + neutral base color strategy — each theme defines accent color + gradient, text stays high-contrast
- System font stack + 1 display font — fast loading, consistent cross-platform rendering
- Subtle micro-interactions — hover lifts, stagger entrance animations, smooth scrolls (60fps, no jank on low-end devices)

### Responsive & Dark Mode
- Mobile-first breakpoints: 375px → 768px → 1024px → 1280px — Bento grid reflows from 1→2→3 columns
- Dark mode via CSS `prefers-color-scheme` + theme variant auto-switch — each theme has light/dark variant selected by system preference
- Mobile layout: single column stack with prioritized sections — header/avatar first, bio, socials, contacts
- Touch: tap targets ≥44px (WCAG compliant), swipe for gallery preview, pull-to-share

### SEO & Crawlability
- Backend HTML shell with meta tags — FastAPI renders `<head>` with OG/meta/JSON-LD from profile data, React hydrates the body
- JSON-LD schema: Person type for personal profiles, Organization type for company profiles
- Auto-generated OG images — server-side image with avatar, name, title on branded background using theme colors
- Canonical URLs: `https://rawdrive.ai/u/{slug}` and `https://rawdrive.ai/p/{slug}`

### Animated Theme Backgrounds
- CSS gradient animations with Framer Motion for particle/motion effects
- Performance budget: animations must not cause jank on mid-range mobile (test with 4x CPU throttle)
- 3-4 animated theme options minimum (gradient shift, subtle particles, wave motion, aurora effect)
- Fallback: reduce motion for `prefers-reduced-motion` users

### Claude's Discretion
- Exact Bento grid column/row span configuration per section per breakpoint
- Animated gradient keyframe timings and easing functions
- OG image generation library choice (Pillow, Satori, or similar)
- Glassmorphism blur/opacity values per theme
- Section entrance animation stagger timing

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 10)
- `PublicProfileRenderer.tsx` — shared renderer accepting profileType prop, section registry
- `UnifiedThemeEngine.ts` — CSS custom property theme resolution with legacy mapping
- `SectionRegistry.ts` — dynamic section selection by profile type
- `AvatarDisplay.tsx` — avatar with initials fallback
- Section components: HeaderSection, BioSection, ContactSection, SocialsSection
- 20 PREBUILT themes in `constants/themes.ts` with light/dark variants

### Established Patterns
- TailwindCSS for responsive utilities, Framer Motion for animations
- TanStack Query for data fetching on public pages
- Backend: FastAPI endpoints for public profile data (cached 60s)

### Integration Points
- `PublicPersonalProfilePage.tsx` — currently wired to PublicProfileRenderer (Phase 10)
- `PublicProfilePage.tsx` — currently wired to PublicProfileRenderer (Phase 10)
- Backend: `personal_profile.py` public endpoints for slug-based profile fetch
- Backend: need new endpoint or middleware for HTML shell with meta tags

</code_context>

<specifics>
## Specific Ideas

- User explicitly wants "Linktree-level premium" for public pages
- Bento.me shut down Feb 2026 — Bento grid is unique differentiator, polish it
- Both personal and company profiles must feel equally polished
- Research identified animated themes as table stakes for premium feel (Linktree Pro has Confetti, Starry Night, Rainbow)
- Photography-native gallery preview is the moat vs generic link-in-bio tools

</specifics>

<deferred>
## Deferred Ideas

- Drag-and-drop section reordering (Phase 12)
- Gallery preview blocks and booking CTA (Phase 13)
- Custom CSS injection (v2)
- Profile A/B testing (v2)

</deferred>
