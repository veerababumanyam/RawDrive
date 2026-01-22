# Feature Specification: Cover Photo Template System Enhancement

**Feature Branch**: `001-fix-cover-templates`
**Created**: 2026-01-22
**Status**: Draft
**Input**: User description: "the templates are broke, reconfigure the template. do not change the UI elements, use the existing UI elements and re-configure the templates docs\CoverPhotoSystem.md"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Photographer Views Cover Style Options (Priority: P1)

A wedding photographer opens the Gallery Design Studio to customize their client gallery's cover page. They click on the "Cover" tab and see a grid of cover style options with visual thumbnails showing exactly what each style looks like.

**Why this priority**: This is the entry point to the entire cover design system. Without visual thumbnails, users cannot make informed style choices and must guess based only on names and descriptions.

**Independent Test**: Can be fully tested by navigating to `/workspace/galleries/:id/design`, clicking the Cover tab, and verifying that all 28 style thumbnails load and display correctly with category filtering working.

**Acceptance Scenarios**:

1. **Given** photographer is on Gallery Design Studio page, **When** they click the "Cover" tab, **Then** they see a grid of 28 cover style options with visual SVG thumbnails
2. **Given** cover styles are displayed, **When** photographer clicks category tabs (Basic, Text, Advanced, Premium), **Then** the grid filters to show only styles in that category
3. **Given** photographer hovers over a style thumbnail, **When** mouse enters the card, **Then** the thumbnail scales up slightly with smooth animation and shows style name clearly
4. **Given** photographer is a free-tier user, **When** they view premium styles, **Then** those styles show a lock icon and "Upgrade" badge but thumbnails are still visible

---

### User Story 2 - Photographer Previews Rich Premium Styles (Priority: P2)

A professional photographer with a premium subscription browses the 12 premium cover styles. Each premium style shows a unique, polished design that matches its description (e.g., "Surf" shows fluid wave patterns, "Anchor" displays nautical elements).

**Why this priority**: Premium styles are a key differentiator and revenue driver. They must deliver on their promise of unique, high-quality designs to justify the subscription cost.

**Independent Test**: Can be tested by selecting each of the 9 enhanced premium styles (cliff, cedar, breeze, aero, surf, cosmos, reef, bondi, west) in the preview canvas and verifying they display unique visual elements matching their catalog descriptions.

**Acceptance Scenarios**:

1. **Given** photographer selects "Surf" premium style, **When** preview renders, **Then** they see fluid wave patterns with layered text and oceanic gradient
2. **Given** photographer selects "Anchor" premium style, **When** preview renders, **Then** they see nautical rope borders, compass rose elements, and maritime color palette
3. **Given** photographer selects "Cosmos" premium style, **When** preview renders, **Then** they see celestial gradient with star field effects and ethereal glow
4. **Given** photographer switches between premium styles, **When** each style loads, **Then** transition is smooth with cross-fade animation under 100ms

---

### User Story 3 - Client Views Gallery with Selected Cover Style (Priority: P3)

A bride visits her wedding gallery link and sees the cover page rendered in the photographer's chosen style. The cover displays the gallery title, subtitle (optional), and cover photo with the exact layout and visual treatment shown in the Design Studio preview.

**Why this priority**: This validates that the cover system works end-to-end from design to client viewing experience. Essential for production readiness.

**Independent Test**: Can be tested by publishing a gallery with each cover style, visiting the public gallery URL, and verifying the cover renders identically to the Design Studio preview.

**Acceptance Scenarios**:

1. **Given** photographer publishes gallery with "Vintage" cover style, **When** client opens gallery link, **Then** cover displays with decorative retro border and film grain texture matching preview
2. **Given** photographer sets focal point to top-right (80, 20), **When** client views cover on mobile, **Then** cover photo crops to show focal point area prominently
3. **Given** photographer selects "None" cover style, **When** client opens gallery, **Then** gallery loads directly to photo grid without cover page

---

### Edge Cases

- What happens when thumbnail SVG fails to load (network error)?
  - Show fallback category icon (Layout, Type, Layers, Star) with style name label
  - Log error to console for debugging
  - Allow user to still select the style despite missing thumbnail

- How does system handle premium styles for users who downgrade subscription?
  - Gallery continues displaying premium style until next edit
  - Design Studio shows lock icon and "Upgrade" message when trying to change
  - Provide warning modal: "Your current style is premium. Changing will require resubscribing."

- What happens when cover photo is not set?
  - Display style preview with placeholder gradient background
  - Show "Upload Cover Photo" CTA in preview canvas
  - Disable "Publish" button until cover photo is selected

- How does focal point adjustment work with extreme aspect ratios?
  - Preserve focal point percentage (x, y) regardless of container dimensions
  - Show preview for mobile (9:16), tablet (4:3), and desktop (16:9) simultaneously
  - Warn user if focal point results in important content being cropped on mobile

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide 28 unique SVG thumbnail assets showing visual preview of each cover style layout and design treatment
- **FR-002**: Thumbnails MUST be stored in `/frontend/public/assets/cover-previews/` directory with naming pattern `{styleId}.svg` (e.g., `center.svg`, `vintage.svg`)
- **FR-003**: Each thumbnail SVG MUST use consistent artboard size of 400x300px to maintain aspect ratio in grid layout
- **FR-004**: Premium cover styles (cliff, cedar, breeze, aero, surf, cosmos, reef, bondi, west) MUST implement unique visual features matching their catalog descriptions
- **FR-005**: System MUST render cover styles with performance under 100ms for layout swaps and under 16ms for CSS-only changes
- **FR-006**: CoverStyleGrid component MUST display thumbnails with lazy loading (load 12 initially, then 6 more on scroll)
- **FR-007**: Cover style selection MUST update preview canvas in real-time without requiring save or API call
- **FR-008**: System MUST preserve existing UI components (CoverStyleGrid, DesignControlsPanel, CoverRenderer) without structural changes
- **FR-009**: Premium styles MUST show lock icon and upgrade badge for free-tier users while still displaying thumbnail preview
- **FR-010**: System MUST provide fallback rendering when thumbnail asset fails to load (show category icon with style name)

### Key Entities *(include if feature involves data)*

- **Cover Style Thumbnail**: SVG asset representing visual preview of a cover layout template
  - Attributes: styleId, filePath (e.g., `/assets/cover-previews/vintage.svg`), category, dimensions (400x300px)
  - Relationships: Referenced by CoverStyleMetadata in catalog

- **Cover Style Implementation**: React component rendering the actual cover layout for client galleries
  - Attributes: styleId, component file, implementation depth (minimal vs. full), visual features
  - Relationships: Dynamically loaded by CoverRenderer factory, defined in coverStyleCatalog

- **Gallery Design Config**: JSON configuration object storing user's design choices
  - Attributes: cover.style (CoverStyleId), cover.focalPoint, typography, theme, grid
  - Relationships: Stored in PostgreSQL gallery.design_config JSONB field, consumed by preview canvas

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 28 cover styles display visual thumbnail previews in Design Studio with 100% success rate (no broken images)
- **SC-002**: Style selection interaction completes in under 100ms from click to preview update (measured via React DevTools profiler)
- **SC-003**: 95% of users successfully select and preview a cover style on first attempt without confusion (measured via session recordings and user testing)
- **SC-004**: Premium style conversion rate increases by 20% after enhanced implementations are deployed (measured via subscription analytics)
- **SC-005**: Thumbnail assets load in under 500ms on 3G connection (measured via Lighthouse mobile audit)
- **SC-006**: Zero console errors or warnings when browsing all 28 cover styles in Design Studio (measured via automated browser testing)
- **SC-007**: Cover style rendering maintains 60fps during hover animations and style transitions (measured via Chrome Performance panel)
- **SC-008**: Client-facing gallery cover displays identically to Design Studio preview with 100% visual parity (measured via automated screenshot comparison)

## Assumptions *(optional)*

- Existing CoverStyleGrid, DesignControlsPanel, and CoverRenderer components are working correctly and do not require refactoring
- All 28 cover style React components in `frontend/src/components/features/gallery/covers/styles/` are functional and can render without errors
- Backend gallery-service endpoints for fetching and updating gallery design config are operational
- SVG thumbnail generation can be done using design tools (Figma, Illustrator) or programmatically
- Premium subscription check logic is already implemented in useSubscription hook
- Thumbnail assets will be committed to version control (git) as part of the frontend public assets
- No backend changes are required since cover style metadata already exists in coverStyleCatalog.ts
- Thumbnail file size should be optimized (target: <50KB per SVG, total <1.5MB for all 28)

## Dependencies *(optional)*

- Requires access to design tools (Figma, Adobe Illustrator, or Inkscape) for creating SVG thumbnails
- Depends on existing TypeScript types in `frontend/src/types/gallery-design.ts` (CoverStyleId union type)
- Depends on existing catalog in `frontend/src/constants/coverStyleCatalog.ts` for style metadata
- Requires React 18.3+ for lazy loading and Suspense boundaries in CoverRenderer
- Requires existing CSS variable system (--bg-primary, --accent-primary, etc.) for theme integration in cover styles
- May require consultation with design team to ensure thumbnail visuals match brand aesthetic guidelines

## Out of Scope *(optional)*

- Creating new cover styles beyond the existing 28 defined in the catalog
- Modifying the CoverStyleGrid UI layout or interaction patterns (preserve existing design)
- Changing the data structure of GalleryDesignConfig (already well-defined)
- Implementing video cover support or animated cover photos (listed as future enhancements in reference doc)
- Adding custom CSS editor or custom font upload features (advanced customization for future versions)
- Refactoring the backend gallery-service API endpoints or database schema
- Implementing undo/redo functionality for design changes (listed separately in reference doc as UX requirement)
- Mobile-specific gesture controls for style browsing (existing touch-friendly controls are sufficient)
- Automated thumbnail generation pipeline (thumbnails will be manually created and committed)

## Technical Notes *(optional)*

### Thumbnail Asset Creation Guidelines

**SVG Structure Best Practices:**
- Use semantic layer names (e.g., "background", "photo-area", "title-text", "decorative-elements")
- Embed fonts as paths to avoid font loading dependencies
- Use optimized paths (remove unnecessary points, merge overlapping shapes)
- Include `viewBox="0 0 400 300"` attribute for responsive scaling
- Compress using SVGO or similar tool before committing

**Visual Design Consistency:**
- Use placeholder image area with subtle gradient (no actual photos)
- Show "Gallery Title" text using the style's typical font/placement
- Include category-appropriate color palette preview
- Add subtle shadow/depth to indicate 3D nature of actual implementation
- Use 2px border radius on outer container for modern aesthetic

**Example SVG Structure:**
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <defs>
    <linearGradient id="bg">...</linearGradient>
  </defs>
  <rect class="background" width="400" height="300" fill="url(#bg)"/>
  <rect class="photo-area" x="50" y="50" width="300" height="150"/>
  <text class="title" x="200" y="240">Gallery Title</text>
</svg>
```

### Premium Style Enhancement Specifications

**Cliff (cliff.tsx):**
- Add angular overlapping image panels (simulate parallax depth)
- Include diagonal gradient overlays at 15-degree angle
- Position text on staggered horizontal bands
- Use sharp geometric shapes for modern aesthetic

**Cedar (cedar.tsx):**
- Add organic wood grain texture overlay (SVG pattern)
- Use earthy color palette (browns, greens, tans)
- Include leaf or branch decorative elements
- Apply subtle vignette for natural framing

**Breeze (breeze.tsx):**
- Implement soft cloud-like shapes floating across cover
- Use light pastel color transitions (blues, whites, soft grays)
- Add gentle motion blur effect on decorative elements
- Position text on translucent floating panels

**Aero (aero.tsx):**
- Add dynamic motion lines suggesting speed/movement
- Use bold angular shapes with sharp edges
- Include chevron patterns pointing directionally
- Apply sleek monochromatic color scheme

**Surf (surf.tsx):**
- Implement layered wave SVG patterns (3-4 waves)
- Use oceanic gradient (deep blue to aqua to seafoam)
- Add subtle foam/splash texture on wave crests
- Position text on stable horizontal band above/below waves

**Cosmos (cosmos.tsx):**
- Add star field SVG pattern (random positioned circles)
- Use deep space gradient (navy to purple to pink)
- Include subtle nebula cloud effects (low-opacity blurs)
- Apply ethereal glow to text (text-shadow with color)

**Reef (reef.tsx):**
- Implement coral-inspired layered shapes (organic curves)
- Use vibrant tropical color palette (corals, teals, oranges)
- Add textured overlay suggesting underwater depth
- Position text on clear "water" band

**Bondi (bondi.tsx):**
- Add sunburst ray pattern emanating from corner
- Use beach-inspired gradient (sand to ocean blue)
- Include horizon line dividing composition
- Apply warm golden lighting effect on text

**West (west.tsx):**
- Implement western-style geometric border (diamond patterns)
- Use rustic color palette (burnt oranges, desert tans, sage)
- Add distressed texture overlay (subtle noise)
- Position text with strong horizontal orientation

### Performance Optimization Requirements

- Lazy load premium style implementations only when user has premium subscription
- Use `React.lazy()` with Suspense for code splitting (already implemented)
- Preload thumbnails for visible category only (defer loading other categories)
- Implement Intersection Observer for thumbnail lazy loading (load on scroll)
- Cache thumbnail SVGs in browser with long TTL (1 year)
- Minimize SVG file sizes (target: <50KB each, use SVGO compression)
- Use CSS `will-change` property on hover animations for GPU acceleration
- Debounce style selection to avoid rapid re-renders (100ms delay)

### Verification Checklist

**Before Completion:**
1. All 28 SVG thumbnails exist in `/frontend/public/assets/cover-previews/`
2. Each thumbnail displays correctly in CoverStyleGrid component
3. All 9 premium styles render unique visual features in preview canvas
4. Style selection updates preview in under 100ms (measure with DevTools)
5. Thumbnails load progressively on scroll (test with throttled network)
6. Premium lock icons display correctly for free-tier users
7. Fallback rendering works when thumbnail fails to load (test by renaming file)
8. Cover styles render identically in client-facing gallery view
9. No console errors or warnings when browsing all styles
10. Lighthouse audit shows no performance regressions

**Testing Strategy:**
- **Unit Tests**: Verify coverStyleCatalog metadata matches thumbnail file paths
- **Visual Tests**: Automated screenshot comparison of all 28 styles in preview canvas
- **Integration Tests**: Test style selection → preview update → save → publish flow
- **Performance Tests**: Measure render time for each premium style (target: <100ms)
- **Accessibility Tests**: Verify keyboard navigation and screen reader labels
- **Mobile Tests**: Test responsive thumbnail grid on 375px, 768px, 1024px viewports
