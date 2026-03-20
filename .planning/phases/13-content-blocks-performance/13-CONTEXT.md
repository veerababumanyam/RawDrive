# Phase 13: Content Blocks & Performance - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Add rich content blocks to public profiles (gallery preview, booking CTA, testimonials, social links with platform icons) and enforce the performance budget (LCP < 2s on throttled 4G). Final phase of v1.1 milestone.

Requirements: CNTNT-01, CNTNT-02, CNTNT-03, CNTNT-04, PUBPG-05

</domain>

<decisions>
## Implementation Decisions

### Content Block Design
- Gallery preview: 2x2 grid of cover images + "View Gallery" link — compact, visual, links to full gallery
- Booking CTA: full-width accent-colored button with calendar icon — prominent, above fold on mobile
- Testimonials: quote cards with client name + star rating — max 3 visible, fits Bento grid
- Social links: icon-only row with platform colors on hover + scale animation — compact, recognizable

### Performance Budget
- LCP enforcement: Lighthouse CI assertion in tests, LCP < 2000ms on throttled 4G — measurable, CI-ready
- Image optimization: LQIP blur-up + lazy loading with Intersection Observer — progressive reveal, deferred loading
- Animation code splitting: LazyMotion from framer-motion + dynamic import of animated backgrounds — only load when theme uses them
- Embed loading: lazy load TikTok/Spotify embeds on scroll into view — don't block initial render

### Claude's Discretion
- Exact gallery preview image sizes and aspect ratios
- Testimonial card layout within Bento grid (span configuration)
- Social icon library choices for newer platforms (Threads, Bluesky)
- LQIP thumbnail dimensions and blur radius
- Lighthouse CI threshold configuration details

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets (from Phase 10/11/12)
- `PublicProfileRenderer.tsx` — shared renderer with section registry (add new sections here)
- `SectionRegistry.ts` — register new content block sections
- `ProfileGalleryPreview.tsx` — existing gallery preview component (needs modernization)
- `ProfileMediaEmbed.tsx` — existing TikTok/Spotify embed component (needs lazy loading)
- `ProfileSocials.tsx` — existing social links component (needs platform icons + hover animations)
- `ProfileContactGrid.tsx` — existing contact grid (booking CTA integrates here or as separate section)
- `AnimatedBackgroundRenderer.tsx` — uses dynamic import pattern already

### Integration Points
- Section registry: add GalleryPreviewSection, BookingCTASection, TestimonialsSection to SectionRegistry
- Backend: gallery-service API for featured gallery cover images
- Backend: existing booking_calendar_url field on PersonalProfile model
- Backend: need new testimonials model/API or use existing client reviews

</code_context>

<specifics>
## Specific Ideas

- Photography-native gallery preview is the moat vs generic link-in-bio tools
- Booking CTA should be the most prominent actionable element on the page
- Performance must be measured AFTER all content blocks are added (not before)
- Social links should include newer platforms (Threads, Bluesky) alongside standard ones

</specifics>

<deferred>
## Deferred Ideas

- Newsletter/email signup blocks (out of scope — v2+)
- Commerce/store features (out of scope)
- Custom CSS injection (v2)

</deferred>
