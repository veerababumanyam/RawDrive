# Feature Specification: Tailwind v4 Upgrade & Gallery Design Studio

**Feature Branch**: `028-tailwind-v4-design-studio`
**Created**: 2026-01-22
**Status**: Draft
**Input**: User description: "Upgrade frontend to Tailwind CSS v4 with native Container Queries and CSS-first configuration, then implement Gallery Design Studio split-screen visual builder for client galleries with real-time theme switching"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Existing Application Visual Parity After Migration (Priority: P1)

As a photographer using RawDrive, I expect the application to look and function exactly as before after the styling framework upgrade, with no visual regressions or broken layouts.

**Why this priority**: This is foundational - any styling upgrade must not break existing functionality or user experience. All current users depend on the existing visual design working correctly. This must be completed and verified before any new features can be built.

**Independent Test**: Can be fully tested by comparing screenshots of key pages before and after the migration. Delivers confidence that the upgrade is safe to deploy.

**Acceptance Scenarios**:

1. **Given** the application is running on the current styling framework, **When** I navigate to the dashboard, gallery list, upload page, and settings, **Then** I capture reference screenshots
2. **Given** the migration to the new framework is complete, **When** I navigate to the same pages, **Then** all pages match the reference screenshots with no visual differences
3. **Given** the migration is complete, **When** I interact with buttons, forms, modals, and dropdowns, **Then** all interactive elements function correctly with proper hover, focus, and active states
4. **Given** the migration is complete, **When** I toggle between light and dark mode, **Then** both themes display correctly with proper color contrast
5. **Given** the migration is complete, **When** I resize my browser window, **Then** responsive breakpoints behave identically to the previous version

---

### User Story 2 - Design Studio Split-Screen Layout (Priority: P2)

As a photographer, I want to access a visual design editor for my client galleries that shows my changes in real-time, so I can customize the look without guessing how it will appear to clients.

**Why this priority**: The split-screen layout is the core architectural shell that enables all subsequent design features. Without this foundation, theme selection, cover customization, and other controls cannot be visually previewed.

**Independent Test**: Can be tested by navigating to the Design Studio and verifying the two-panel layout displays correctly with a controls panel and preview area.

**Acceptance Scenarios**:

1. **Given** I am viewing a gallery I own, **When** I click the "Design" button, **Then** the Design Studio opens with a split-screen layout showing controls on the left and a live preview on the right
2. **Given** I am in the Design Studio, **When** I view the left panel, **Then** I see organized control sections for Cover, Theme, Typography, and Grid options
3. **Given** I am in the Design Studio, **When** I view the right panel, **Then** I see a live preview of my gallery that reflects the current design configuration
4. **Given** I am in the Design Studio on a tablet or small laptop, **When** the viewport is narrower than the optimal width, **Then** the preview panel adjusts its size while keeping controls accessible

---

### User Story 3 - Real-Time Theme Switching (Priority: P3)

As a photographer, I want to instantly see how different color themes look on my gallery, so I can choose the perfect palette that matches my brand or event style.

**Why this priority**: Theme switching is the most impactful visual customization - it transforms the entire gallery appearance. Real-time preview reduces the design iteration cycle from minutes to seconds.

**Independent Test**: Can be tested by selecting different themes in the Theme Selector and observing immediate color changes in the preview canvas without page reload.

**Acceptance Scenarios**:

1. **Given** I am in the Design Studio, **When** I view the Theme Selector, **Then** I see a visual grid of 9 curated theme options with preview swatches (Brand, Gold, Neutral, Cyan, Midnight, Rose, Terracotta, Olive, Sea)
2. **Given** I am in the Design Studio, **When** I click on a different theme (e.g., "Gold"), **Then** the preview canvas immediately updates to show the new color scheme without any page reload
3. **Given** I have selected a theme, **When** I toggle between light and dark mode, **Then** the preview immediately reflects the mode change using that theme's light/dark color tokens
4. **Given** I am in the Design Studio, **When** I select a theme, **Then** all elements in the preview update: background colors, text colors, accent colors, and borders

---

### User Story 4 - Container-Query Responsive Preview (Priority: P4)

As a photographer, I want to see how my gallery will look on different screen sizes within the Design Studio, so I can ensure my design looks great on mobile and desktop without leaving the editor.

**Why this priority**: Professional photographers need their galleries to look stunning on all devices. Container queries enable responsive simulation within the preview canvas without changing the entire browser window.

**Independent Test**: Can be tested by resizing the preview canvas container and observing layout adaptations (e.g., gallery grid columns changing, cover text repositioning).

**Acceptance Scenarios**:

1. **Given** I am in the Design Studio, **When** I use device preview controls to simulate a mobile viewport, **Then** the preview canvas content adapts its layout (e.g., single-column grid, adjusted typography)
2. **Given** I am in the Design Studio, **When** I use device preview controls to simulate a tablet viewport, **Then** the preview shows appropriate intermediate layouts
3. **Given** I am in the Design Studio, **When** I drag to resize the preview panel, **Then** the preview content responds fluidly to the container size, not the browser window size

---

### User Story 5 - Cover Style Selection (Priority: P5)

As a photographer, I want to choose from multiple cover styles for my gallery, so I can create a distinctive first impression that matches my photography style.

**Why this priority**: The cover is the first thing clients see. Having diverse style options (28+ styles across basic, text, advanced, and premium categories) differentiates RawDrive from competitors.

**Independent Test**: Can be tested by selecting different cover styles and observing the preview update with the chosen layout variant.

**Acceptance Scenarios**:

1. **Given** I am in the Design Studio, **When** I view the Cover Style selector, **Then** I see a visual grid of cover style options organized by category (Basic, Text, Advanced, Premium)
2. **Given** I am viewing cover styles, **When** I click on a style thumbnail (e.g., "Vintage"), **Then** the preview canvas immediately shows my cover with that style applied
3. **Given** I have a cover image set, **When** I select different cover styles, **Then** the image positioning and overlay treatment updates according to each style's design
4. **Given** I am on a free plan, **When** I view premium cover styles, **Then** they are visually indicated as premium and selecting them prompts an upgrade message

---

### Edge Cases

- What happens when the preview canvas is resized to an extremely narrow width (< 200px)?
  - The preview should show a minimum useful size or display a "Preview too small" message
- How does the system handle if custom CSS variables from the old configuration conflict with new framework syntax?
  - The migration must ensure all CSS variables are properly converted; build process should fail with clear errors if conflicts exist
- What happens if a user's browser doesn't support container queries?
  - Graceful degradation to standard responsive behavior; feature detection should enable fallback styling
- How does the system handle rapid theme switching (clicking multiple themes quickly)?
  - Theme changes should be debounced or the latest selection should always win; no visual flickering or race conditions
- What happens if the Design Studio loads for a gallery with corrupted or invalid design configuration?
  - System should fall back to default design configuration and notify the user that defaults were applied

---

## Requirements *(mandatory)*

### Functional Requirements

**Phase 1: Styling Framework Migration**

- **FR-001**: System MUST maintain complete visual parity with the current application after the styling framework upgrade
- **FR-002**: System MUST support all existing custom CSS variables (colors, spacing, shadows, radii) after migration
- **FR-003**: System MUST support all existing custom utilities (glass effects, scrollbar hiding, text gradients, touch targets) after migration
- **FR-004**: System MUST support dark mode theme switching using the same selector mechanism (`[data-theme="dark"]`)
- **FR-005**: System MUST pass the existing build process without errors or warnings after migration
- **FR-006**: System MUST pass all existing automated tests after migration

**Phase 2: Design Studio Layout**

- **FR-007**: System MUST provide a split-screen Design Studio interface accessible from gallery management
- **FR-008**: System MUST display design controls in a left sidebar panel with organized sections
- **FR-009**: System MUST display a live preview canvas in the right panel that reflects the current design configuration
- **FR-010**: System MUST support container-query-based responsive behavior within the preview canvas
- **FR-011**: System MUST allow the preview canvas to be resized to simulate different viewport sizes
- **FR-012**: System MUST preserve the Design Studio state when navigating between control sections

**Phase 3: Theme Engine & Real-Time Updates**

- **FR-013**: System MUST map theme identifiers to complete CSS variable sets for both light and dark modes
- **FR-014**: System MUST apply theme CSS variables to the preview canvas container without affecting the Studio chrome
- **FR-015**: System MUST update the preview canvas immediately (< 100ms perceived) when a new theme is selected
- **FR-016**: System MUST support all 9 curated themes: Brand, Gold, Neutral, Cyan, Midnight, Rose, Terracotta, Olive, Sea
- **FR-017**: System MUST support theme mode switching (light, dark, system) with immediate preview updates

**Phase 4: Cover Style Rendering**

- **FR-018**: System MUST render cover previews based on the selected cover style identifier
- **FR-019**: System MUST support all 28 cover style variants across Basic, Text, Advanced, and Premium categories
- **FR-020**: System MUST respect focal point settings when rendering cover images
- **FR-021**: System MUST indicate premium cover styles and handle selection by non-premium users appropriately

**Phase 5: Theme Selector Component**

- **FR-022**: System MUST display theme options in a visual grid format showing color swatches
- **FR-023**: System MUST indicate the currently selected theme with clear visual feedback
- **FR-024**: System MUST support keyboard navigation for theme selection (accessibility)
- **FR-025**: System MUST provide theme names and brief descriptions for each option

---

### Key Entities

- **GalleryDesignConfig**: Complete design configuration for a gallery, containing cover, typography, theme, and grid settings. Persisted per gallery and applied when rendering client-facing gallery views.

- **ThemeId**: Identifier for one of 9 curated color themes (brand, gold, neutral, cyan, midnight, rose, terracotta, olive, sea). Maps to a complete set of color tokens for both light and dark modes.

- **CoverStyleId**: Identifier for one of 28 cover layout variants. Determines text positioning, overlay treatment, and compositional structure of the gallery cover.

- **DesignDraftState**: Transient frontend state tracking unsaved changes, save status, and edit history. Enables undo/redo and dirty state detection.

- **GalleryTheme**: Complete theme definition including light mode tokens, dark mode tokens, accent swatches, and preview assets.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

**Migration Success**

- **SC-001**: Zero visual regressions detected when comparing application screenshots before and after migration across all major pages (dashboard, galleries, upload, settings, public gallery view)
- **SC-002**: Existing automated test suite passes with 100% success rate after migration
- **SC-003**: Production build completes successfully with no new errors or warnings
- **SC-004**: Application loads and becomes interactive within the same time threshold as before migration (< 3 seconds on standard connection)

**Design Studio Usability**

- **SC-005**: Users can access the Design Studio and see a live preview within 2 seconds of clicking the Design button
- **SC-006**: Theme changes are reflected in the preview within 100 milliseconds of selection (perceived as instant)
- **SC-007**: 90% of users can successfully change their gallery theme without assistance (first-time task completion)
- **SC-008**: Design Studio maintains usability on viewport widths from 1024px to 2560px

**Feature Completeness**

- **SC-009**: All 9 curated themes are selectable and render correctly in both light and dark modes
- **SC-010**: All 28 cover styles render correctly with proper layout and overlay treatment
- **SC-011**: Container-query responsive preview accurately simulates mobile, tablet, and desktop layouts
- **SC-012**: Design Studio loads the existing gallery design configuration and allows modifications without data loss

---

## Assumptions

The following assumptions were made during specification creation:

1. **Existing types are accurate**: The `gallery-design.ts` type definitions and existing design components represent the intended feature scope
2. **Container query browser support**: Target browsers support CSS container queries (Chrome 105+, Safari 16+, Firefox 110+) or graceful degradation is acceptable
3. **Theme data exists**: The 9 theme definitions with light/dark tokens are already defined or will be defined as part of implementation
4. **Cover style components exist**: The 28 cover style renderers exist or their creation is within scope
5. **No backend changes required for Phase 1**: The styling framework migration is frontend-only and does not require backend API changes
6. **Design Studio route exists**: A route to access the Design Studio (`/workspace/galleries/:id/design` or similar) will be created or already exists

---

## Out of Scope

The following items are explicitly NOT part of this feature:

1. **Typography customization UI**: While the infrastructure supports typography pairings, the full font picker UI is separate scope
2. **Grid layout customization UI**: Grid configuration controls are separate scope
3. **Cover image upload/selection**: The cover photo picker component is separate scope (exists at `CoverPhotoUploader.tsx`)
4. **Template save/load functionality**: Gallery design templates are separate scope (exists at `TemplateLibrary.tsx`)
5. **Collaboration features**: Real-time multi-user editing is separate scope (exists at `CollaboratorPresence.tsx`)
6. **Mobile Design Studio**: The Design Studio targets desktop/tablet viewports; mobile-optimized editor is separate scope
7. **Animation/transition customization**: Theme includes static colors only; animation preferences are separate scope

---

## Dependencies

- **Existing Design Components**: Feature builds upon existing components in `frontend/src/components/features/gallery/design/`
- **Type Definitions**: Uses existing types from `frontend/src/types/gallery-design.ts`
- **Theme Constants**: Requires theme definitions (may exist at `frontend/src/constants/galleryThemes.ts`)
- **Cover Style Catalog**: Requires cover style definitions (may exist at `frontend/src/constants/coverStyleCatalog.ts`)
- **Gallery Service API**: Design configuration persistence relies on gallery-service endpoints

---

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Styling framework migration breaks existing styles | High - User-facing visual bugs | Comprehensive screenshot comparison testing before and after migration |
| Container queries not supported in all target browsers | Medium - Degraded experience for some users | Feature detection with fallback to standard responsive behavior |
| Custom plugin utilities don't translate cleanly | Medium - Build failures or missing styles | Manual testing of all custom utilities; conversion documentation |
| Performance regression from live preview updates | Low - Sluggish editor feel | Debounce rapid changes; optimize CSS variable injection |
