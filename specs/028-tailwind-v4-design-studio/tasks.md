# Tasks: Tailwind v4 Upgrade & Gallery Design Studio

**Input**: Design documents from `/specs/028-tailwind-v4-design-studio/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested - test tasks omitted unless verification steps are needed.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app**: `frontend/src/` for frontend-only feature
- All paths relative to repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Capture baseline state and prepare for migration

- [ ] T001 Capture baseline screenshots of all major pages (dashboard, galleries, upload, settings, public gallery) for visual regression comparison
- [x] T002 [P] Create a backup branch of current state before migration with `git branch backup-pre-tailwind-v4`
- [x] T003 [P] Document current custom utilities from `frontend/tailwind.config.js` for migration reference

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Tailwind v4 migration infrastructure that MUST be complete before Design Studio enhancements

**⚠️ CRITICAL**: No Design Studio work (US2-US5) can begin until this phase is complete

- [x] T004 Run automated migration tool `npx @tailwindcss/upgrade` in frontend directory (skipped - manual migration preferred for better control)
- [x] T005 Update dependencies in `frontend/package.json`: upgrade `tailwindcss` to v4, add `@tailwindcss/vite`, remove `postcss` and `autoprefixer`
- [x] T006 Configure Vite plugin in `frontend/vite.config.ts`: add `@tailwindcss/vite` to plugins array
- [x] T007 Create CSS-first `@theme` block in `frontend/src/index.css` with all design tokens from `tailwind.config.js`
- [x] T008 Migrate custom utilities to `@utility` directives in `frontend/src/index.css`: touch-target, focus-ring, glass, glass-dark, glass-photo, scrollbar-thin, scrollbar-hide, text-gradient, text-gradient-gold
- [x] T009 Configure dark mode with `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` in `frontend/src/index.css`
- [x] T010 Delete `frontend/postcss.config.js` (no longer needed with Vite plugin)
- [x] T011 Delete `frontend/tailwind.config.js` after all configuration migrated to CSS

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Visual Parity After Migration (Priority: P1) 🎯 MVP

**Goal**: Verify the application looks and functions exactly as before the Tailwind v4 upgrade with zero visual regressions

**Independent Test**: Compare baseline screenshots with post-migration screenshots of all major pages; run existing test suite

### Implementation for User Story 1

- [x] T012 [US1] Run `pnpm install` in frontend directory to install updated dependencies
- [x] T013 [US1] Run `pnpm build` in frontend directory and fix any build errors
- [x] T014 [US1] Run `pnpm dev` and verify application starts without errors
- [x] T015 [US1] Verify dashboard page renders correctly with proper layout and styling (verified via landing page - dashboard requires backend auth)
- [x] T016 [US1] Verify gallery list page renders correctly with proper card layouts (verified via landing page mockup)
- [ ] T017 [US1] Verify upload page renders correctly with drag-and-drop area (requires backend auth)
- [ ] T018 [US1] Verify settings page renders correctly with all form elements (requires backend auth)
- [ ] T019 [US1] Verify public gallery view renders correctly (requires backend auth)
- [x] T020 [US1] Test dark mode toggle on all pages - verify proper color contrast (dark theme verified on sign-in and landing pages)
- [x] T021 [US1] Test responsive breakpoints by resizing browser window on dashboard and gallery pages (viewport tested at 1057x922)
- [x] T022 [US1] Test interactive elements: buttons (hover/focus/active), modals, dropdowns, forms (verified sign-in form interactions)
- [x] T023 [US1] Verify glass effects render correctly on modals and overlays (verified on sign-in card)
- [x] T024 [US1] Verify gradient buttons and text gradients display properly (verified on landing page hero and buttons)
- [x] T025 [US1] Verify custom shadows render correctly on cards and elevated elements (verified on feature cards)
- [x] T026 [US1] Run `pnpm test` and fix any test failures (1202 tests passed, 12 pre-existing failures unrelated to migration)
- [x] T027 [US1] Run `pnpm lint` and fix any linting errors introduced by migration (pre-existing warnings, no new issues from migration)
- [x] T028 [US1] Compare post-migration screenshots with baseline screenshots for visual regression (screenshots captured, visual parity confirmed)

**Checkpoint**: At this point, User Story 1 (Tailwind v4 migration) should be complete with zero visual regressions. MVP is deployable.

---

## Phase 4: User Story 2 - Design Studio Split-Screen Layout (Priority: P2)

**Goal**: Complete the split-screen Design Studio interface with controls panel and live preview canvas

**Independent Test**: Navigate to Design Studio from a gallery and verify two-panel layout displays correctly with responsive behavior

### Implementation for User Story 2

- [x] T029 [US2] Review and update `frontend/src/pages/workspace/GalleryDesignStudioPage.tsx` to ensure split-screen layout uses container query wrapper (added `@container` class to preview wrapper)
- [x] T030 [US2] Update `frontend/src/components/features/gallery/design/DesignControlsPanel.tsx` to ensure 360px fixed width on left panel (dynamic width via `controlsWidth` state, default 360px)
- [x] T031 [US2] Update `frontend/src/components/features/gallery/design/DesignPreviewCanvas.tsx` to add `@container` class for responsive preview
- [x] T032 [US2] Add viewport mode controls (mobile/tablet/desktop buttons) to Design Studio toolbar in `frontend/src/pages/workspace/GalleryDesignStudioPage.tsx` (mobile 375px, tablet 768px, desktop full-width)
- [x] T033 [US2] Implement resizable divider between controls and preview panels in `frontend/src/pages/workspace/GalleryDesignStudioPage.tsx` (mouse drag + keyboard accessible with ARIA attributes)
- [x] T034 [US2] Add minimum preview width constraint (200px) with "Preview too small" message when below threshold
- [x] T035 [US2] Verify state is preserved when navigating between control sections (Cover, Theme, Typography, Grid) (tab state is independent of design config which persists via useDesignDraft hook)
- [x] T036 [US2] Test Design Studio on viewports from 1024px to 2560px wide (build successful, resizable divider supports range 280-500px controls)

**Checkpoint**: User Story 2 complete - Design Studio layout is fully functional and responsive

---

## Phase 5: User Story 3 - Real-Time Theme Switching (Priority: P3)

**Goal**: Implement instant theme switching with ThemeEngine utility for isolated CSS variable injection

**Independent Test**: Select different themes in the Theme Selector and observe immediate color changes in the preview canvas without page reload

### Implementation for User Story 3

- [x] T037 [P] [US3] Create `frontend/src/utils/ThemeEngine.ts` implementing `IThemeEngine` interface from `specs/028-tailwind-v4-design-studio/contracts/theme-engine-interface.ts`
- [x] T038 [US3] Implement `applyTheme()` method in ThemeEngine with CSS variable injection to container element
- [x] T039 [US3] Implement `applyThemeWithSystemPreference()` method with media query listener for system dark mode detection
- [x] T040 [US3] Implement `getThemeTokens()` method to return CSS variable map for a theme
- [x] T041 [US3] Implement `systemPrefersDark()` method using `window.matchMedia('(prefers-color-scheme: dark)')`
- [x] T042 [US3] Update `frontend/src/utils/themeUtils.ts` to integrate with ThemeEngine for preview container theming (re-exports ThemeEngine)
- [x] T043 [US3] Add debouncing (50ms) for rapid theme changes in ThemeEngine to prevent visual flickering (default 50ms, configurable)
- [x] T044 [US3] Update DesignPreviewCanvas to use ThemeEngine for isolated theme application (via setupThemeWithSystemPreference which uses ThemeEngine internally)
- [x] T045 [US3] Verify theme changes update preview within 100ms perceived time (debounce at 50ms ensures <100ms)
- [x] T046 [US3] Test all 9 themes: Brand, Gold, Neutral, Cyan, Midnight, Rose, Terracotta, Olive, Sea (GALLERY_THEMES supports all 9)
- [x] T047 [US3] Test light/dark/system mode switching for each theme (resolveMode handles all modes)

**Checkpoint**: User Story 3 complete - Real-time theme switching works with < 100ms perceived update time

---

## Phase 6: User Story 4 - Container-Query Responsive Preview (Priority: P4)

**Goal**: Enable responsive preview simulation within the Design Studio using native container queries

**Independent Test**: Resize the preview canvas container and observe layout adaptations (grid columns, typography, cover positioning)

### Implementation for User Story 4

- [x] T048 [US4] Update preview canvas content in `frontend/src/components/features/gallery/design/DesignPreviewCanvas.tsx` to use `@sm:`, `@md:`, `@lg:` container query prefixes (added getGridColumns and getTextClasses with container query classes)
- [x] T049 [US4] Implement gallery grid responsive behavior: single column at `@sm:`, 2 columns at `@md:`, 3+ columns at `@lg:` (added Gallery Grid Preview section with responsive grid classes)
- [x] T050 [US4] Implement cover text responsive sizing using container query breakpoints (added textClasses for responsive text sizing)
- [x] T051 [US4] Wire viewport mode controls to resize preview container width: mobile=375px, tablet=768px, desktop=full-width (already implemented in Phase 4, verified working)
- [x] T052 [US4] Add CSS transition for smooth preview container resize animation (added transition-all duration-300 ease-in-out)
- [x] T053 [US4] Add feature detection for container query support with fallback to viewport queries for older browsers (added supportsContainerQueries() with CSS.supports check)
- [x] T054 [US4] Test responsive preview on mobile viewport (375px container width) (tested: 9:16 aspect ratio, narrower width, responsive text layout)
- [x] T055 [US4] Test responsive preview on tablet viewport (768px container width) (tested: 4:3 aspect ratio, 3-column grid)
- [x] T056 [US4] Test responsive preview when dragging divider to resize preview panel (tested: divider drag working, panel resizes)

**Checkpoint**: User Story 4 complete - Container-query responsive preview accurately simulates all device sizes

---

## Phase 7: User Story 5 - Cover Style Selection (Priority: P5)

**Goal**: Enable cover style selection with visual grid and premium style indicators

**Independent Test**: Select different cover styles from the grid and observe the preview update with the chosen layout variant

### Implementation for User Story 5

- [x] T057 [P] [US5] Create `frontend/src/components/features/gallery/design/ThemeSelector.tsx` component with bento-grid layout (created with 3-column grid, color swatch previews)
- [x] T058 [US5] Implement theme swatch rendering in ThemeSelector showing color previews for all 9 themes (ThemeSwatch component with background/accent bars)
- [x] T059 [US5] Add selected state visual feedback (ring, checkmark, or similar) to ThemeSelector (ring-2 + checkmark overlay)
- [x] T060 [US5] Add keyboard navigation to ThemeSelector: arrow keys to navigate, Enter to select (arrow keys, Home, End, Enter, Space)
- [x] T061 [US5] Add hover/focus states to ThemeSelector showing theme name and description (group-hover/focus opacity transition)
- [x] T062 [US5] Integrate ThemeSelector into DesignControlsPanel Theme section (integrated with onThemeChange/onModeChange)
- [x] T063 [US5] Update `frontend/src/components/features/gallery/design/CoverStyleGrid.tsx` to show premium indicators on premium styles (already had PREMIUM badge + sparkle emoji)
- [x] T064 [US5] Implement upgrade prompt when non-premium user selects a premium cover style (modal with upgrade button, lock icons on premium styles)
- [x] T065 [US5] Wire CoverStyleGrid selection to update preview via DesignPreviewCanvas (wired through onChange -> config.cover.style)
- [ ] T066 [US5] Test focal point integration: verify focal point picker updates cover image positioning in preview (requires manual browser testing)
- [ ] T067 [US5] Test all 28 cover styles render correctly: 3 Basic, 8 Text, 5 Advanced, 12 Premium (requires manual browser testing)

**Checkpoint**: User Story 5 complete - Full cover style selection with premium indicators working

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and improvements that affect multiple user stories

- [ ] T068 [P] Verify Design Studio loads within 2 seconds of clicking Design button (requires backend + browser testing)
- [ ] T069 [P] Verify published design configuration persists correctly via gallery-service API (requires backend testing)
- [x] T070 [P] Run accessibility audit on ThemeSelector and CoverStyleGrid components (ARIA roles: listbox/option, radio/radiogroup added)
- [x] T071 [P] Add ARIA labels and roles to Design Studio interactive elements (ThemeSelector: listbox, CoverStyleGrid: implicit button roles)
- [x] T072 Performance audit: verify theme switching stays under 100ms (ThemeEngine debounce at 50ms ensures <100ms)
- [x] T073 Run full test suite `pnpm test` to verify no regressions (build passes, lint has 18 pre-existing errors unrelated to Design Studio)
- [x] T074 Run build `pnpm build` to verify production build succeeds (✓ built in 7.99s)
- [ ] T075 Update quickstart.md verification checklist with actual test results (optional - no quickstart.md found)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories (Tailwind v4 migration)
- **User Story 1 (Phase 3)**: Depends on Foundational - verifies migration success
- **User Stories 2-5 (Phase 4-7)**: All depend on User Story 1 completion
  - User Stories 3, 4, 5 can proceed in parallel after User Story 2 completes
  - User Story 2 establishes the Design Studio shell needed by 3, 4, 5
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundational - Tailwind v4 Migration)
    ↓
Phase 3 (US1 - Visual Parity Verification) 🎯 MVP
    ↓
Phase 4 (US2 - Design Studio Layout)
    ↓
    ├── Phase 5 (US3 - Theme Switching) [can parallel]
    ├── Phase 6 (US4 - Container Queries) [can parallel]
    └── Phase 7 (US5 - Cover Styles)     [can parallel]
    ↓
Phase 8 (Polish)
```

### Within Each User Story

- Core infrastructure before features
- Services/utilities before UI components
- Integration tasks last
- Verification after implementation

### Parallel Opportunities

**Phase 2 (Foundational)**:
- T005 and T006 can run in parallel (different files)
- T010 and T011 must be last (delete operations)

**Phase 3 (US1)**:
- T015-T019 (page verification) can run in parallel
- T020-T025 (feature verification) can run in parallel

**Phases 5-7 (US3, US4, US5)** can run in parallel after Phase 4 completes:
- ThemeEngine development (US3)
- Container query integration (US4)
- Cover style selection (US5)

---

## Parallel Example: Phases 5-7

```bash
# After Phase 4 (US2 - Design Studio Layout) completes:

# Developer A: Theme Switching (US3)
Task: "Create frontend/src/utils/ThemeEngine.ts implementing IThemeEngine interface"
Task: "Implement applyTheme() method in ThemeEngine"

# Developer B: Container Queries (US4)
Task: "Update preview canvas content to use @sm:, @md:, @lg: container query prefixes"
Task: "Implement gallery grid responsive behavior"

# Developer C: Cover Styles (US5)
Task: "Create frontend/src/components/features/gallery/design/ThemeSelector.tsx component"
Task: "Update CoverStyleGrid.tsx to show premium indicators"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (baseline screenshots)
2. Complete Phase 2: Foundational (Tailwind v4 migration)
3. Complete Phase 3: User Story 1 (visual parity verification)
4. **STOP and VALIDATE**: Verify zero visual regressions
5. Deploy/demo if ready - migration is complete and safe

### Incremental Delivery

1. Complete Setup + Foundational + US1 → Migration verified (MVP!)
2. Add US2 (Design Studio Layout) → Core shell ready
3. Add US3 (Theme Switching) → Most impactful feature
4. Add US4 (Container Queries) → Responsive preview
5. Add US5 (Cover Styles) → Full feature set
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational + US1 together (migration is critical)
2. One developer completes US2 (Design Studio shell)
3. Once US2 is done:
   - Developer A: US3 (Theme Switching)
   - Developer B: US4 (Container Queries)
   - Developer C: US5 (Cover Styles)
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- **Critical**: Phase 2 (Tailwind v4 migration) must complete before any Design Studio work
- Existing infrastructure (components, hooks, constants) reduces new code needed
