# Implementation Plan: Tailwind v4 Upgrade & Gallery Design Studio

**Branch**: `028-tailwind-v4-design-studio` | **Date**: 2026-01-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/028-tailwind-v4-design-studio/spec.md`

---

## Summary

Upgrade the frontend styling framework from Tailwind CSS v3 to v4 to leverage native container queries and CSS-first configuration, then complete the Gallery Design Studio implementation with a split-screen visual builder featuring real-time theme switching.

**Key Technical Approaches**:
1. Use `@tailwindcss/vite` plugin instead of PostCSS for better Vite integration
2. Migrate `tailwind.config.js` to CSS-first `@theme` block in `index.css`
3. Leverage native v4 container queries (`@container`, `@sm:`, `@lg:`) for responsive preview
4. Build ThemeEngine utility for isolated CSS variable injection into preview canvas
5. Create ThemeSelector component with bento-grid visual layout

---

## Technical Context

**Language/Version**: TypeScript 5.3+, React 18.3, CSS3 (Container Queries Level 1)
**Primary Dependencies**: Tailwind CSS 4.x, @tailwindcss/vite, Vite 5.x, React 18.3
**Storage**: N/A (design config persisted via existing gallery-service API)
**Testing**: Vitest, @testing-library/react, Playwright (visual regression)
**Target Platform**: Modern browsers (Chrome 105+, Safari 16+, Firefox 110+)
**Project Type**: Web application (frontend-only for this feature)
**Performance Goals**: < 100ms theme switching, < 2s Design Studio load
**Constraints**: Zero visual regression after migration, graceful degradation for older browsers
**Scale/Scope**: 9 themes, 28 cover styles, 6 font pairings

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The project constitution template has not been customized. Applying RawDrive's CLAUDE.md principles:

| Principle | Status | Notes |
|-----------|--------|-------|
| **Client Experience is the Product** | PASS | Design Studio improves client gallery presentation |
| **AI as a Copilot** | N/A | No AI features in this scope |
| **Trust by Design** | PASS | No security changes; existing auth preserved |
| **Performance at Scale** | PASS | Container queries improve responsive performance |
| **Platform Reliability** | PASS | Migration tested before deployment |

**Gate Status**: PASSED - No violations requiring justification

---

## Project Structure

### Documentation (this feature)

```text
specs/028-tailwind-v4-design-studio/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 research findings
├── data-model.md        # Entity definitions
├── quickstart.md        # Developer onboarding guide
├── contracts/           # API contracts
│   ├── gallery-design-api.yaml    # OpenAPI spec (existing endpoints)
│   └── theme-engine-interface.ts  # ThemeEngine TypeScript interface
└── checklists/
    └── requirements.md  # Spec validation checklist
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── index.css                 # MODIFY: Tailwind v4 @theme block
│   ├── components/
│   │   └── features/
│   │       └── gallery/
│   │           └── design/
│   │               ├── DesignControlsPanel.tsx   # EXISTS
│   │               ├── DesignPreviewCanvas.tsx   # EXISTS
│   │               ├── ThemeSelector.tsx         # NEW
│   │               └── CoverRenderer.tsx         # NEW (optional)
│   ├── constants/
│   │   ├── galleryThemes.ts      # EXISTS (9 themes defined)
│   │   └── coverStyleCatalog.ts  # EXISTS (28 styles defined)
│   ├── pages/
│   │   └── workspace/
│   │       └── GalleryDesignStudioPage.tsx  # EXISTS
│   ├── types/
│   │   └── gallery-design.ts     # EXISTS
│   └── utils/
│       ├── themeUtils.ts         # EXISTS (may need updates)
│       └── ThemeEngine.ts        # NEW
├── vite.config.ts                # MODIFY: Add @tailwindcss/vite
├── package.json                  # MODIFY: Update dependencies
├── tailwind.config.js            # DELETE: Migrate to CSS
└── postcss.config.js             # DELETE: Not needed with Vite plugin
```

**Structure Decision**: Web application structure with frontend-only changes. No backend modifications required as gallery-service API already supports design configuration.

---

## Implementation Phases

### Phase 1: Tailwind v4 Migration (P1 - Highest Priority)

**Objective**: Upgrade to Tailwind v4 with zero visual regressions

**Tasks**:
1. Capture baseline screenshots of all major pages
2. Run `npx @tailwindcss/upgrade` automated migration
3. Install `@tailwindcss/vite` and update `vite.config.ts`
4. Convert `tailwind.config.js` to `@theme` block in `index.css`
5. Migrate custom utilities to `@utility` directives
6. Configure dark mode with `@custom-variant`
7. Delete `postcss.config.js` and `tailwind.config.js`
8. Run visual regression tests comparing screenshots
9. Run full test suite and fix any failures

**Acceptance Criteria**:
- FR-001: Visual parity maintained
- FR-002: All CSS variables working
- FR-003: Custom utilities functional
- FR-004: Dark mode working
- FR-005: Build passes
- FR-006: Tests pass

---

### Phase 2: Design Studio Layout (P2)

**Objective**: Complete split-screen Design Studio interface

**Tasks**:
1. Review and update `GalleryDesignStudioPage.tsx` layout
2. Ensure left panel (360px) and right panel (flexible) responsive behavior
3. Add container query wrapper to preview canvas
4. Implement viewport mode controls (mobile/tablet/desktop simulation)
5. Add resizable divider for preview panel width adjustment

**Acceptance Criteria**:
- FR-007: Split-screen interface accessible
- FR-008: Controls panel displays sections
- FR-009: Preview canvas reflects configuration
- FR-010: Container query responsive behavior
- FR-011: Preview resizable
- FR-012: State preserved between sections

---

### Phase 3: Theme Engine & Real-Time Updates (P3)

**Objective**: Implement instant theme switching with isolated CSS variables

**Tasks**:
1. Create `ThemeEngine.ts` utility implementing `IThemeEngine` interface
2. Implement `applyTheme()` with CSS variable injection
3. Implement `applyThemeWithSystemPreference()` with media query listener
4. Update `themeUtils.ts` to use ThemeEngine
5. Ensure theme changes update preview within 100ms
6. Add debouncing for rapid theme changes

**Acceptance Criteria**:
- FR-013: Theme ID → CSS variable mapping
- FR-014: Theme applied only to preview container
- FR-015: < 100ms perceived update time
- FR-016: All 9 themes supported
- FR-017: Light/dark/system mode switching

---

### Phase 4: Cover Style Rendering (P4)

**Objective**: Render cover previews based on selected style

**Tasks**:
1. Create `CoverRenderer.tsx` component (if not using existing components)
2. Implement style-to-layout mapping for 28 cover styles
3. Integrate focal point settings with image positioning
4. Add premium style indicators and upgrade prompts

**Acceptance Criteria**:
- FR-018: Cover renders based on style ID
- FR-019: All 28 styles supported
- FR-020: Focal point respected
- FR-021: Premium indicators displayed

---

### Phase 5: Theme Selector Component (P5)

**Objective**: Create visual theme selection grid

**Tasks**:
1. Create `ThemeSelector.tsx` component
2. Implement bento-grid layout with theme swatches
3. Add keyboard navigation (arrow keys, Enter to select)
4. Display theme names and descriptions on hover/focus
5. Show selected state with clear visual feedback

**Acceptance Criteria**:
- FR-022: Visual grid with swatches
- FR-023: Selected theme indicated
- FR-024: Keyboard accessible
- FR-025: Names and descriptions shown

---

## Complexity Tracking

No constitution violations requiring justification. Feature uses existing patterns and infrastructure.

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Migration breaks styles | Screenshot comparison before/after; rollback plan |
| Container queries unsupported | Feature detection; fallback to viewport queries |
| Custom utilities fail | Manual testing of each utility post-migration |
| Performance regression | Debounce theme changes; profile rendering |

---

## Generated Artifacts

| Artifact | Path | Status |
|----------|------|--------|
| Specification | `specs/028-tailwind-v4-design-studio/spec.md` | Complete |
| Implementation Plan | `specs/028-tailwind-v4-design-studio/plan.md` | Complete |
| Research | `specs/028-tailwind-v4-design-studio/research.md` | Complete |
| Data Model | `specs/028-tailwind-v4-design-studio/data-model.md` | Complete |
| Quickstart Guide | `specs/028-tailwind-v4-design-studio/quickstart.md` | Complete |
| API Contract | `specs/028-tailwind-v4-design-studio/contracts/gallery-design-api.yaml` | Complete |
| ThemeEngine Interface | `specs/028-tailwind-v4-design-studio/contracts/theme-engine-interface.ts` | Complete |
| Requirements Checklist | `specs/028-tailwind-v4-design-studio/checklists/requirements.md` | Complete |

---

## Next Steps

1. **Run `/speckit.tasks`** to generate detailed task breakdown
2. **Execute Phase 1** (Tailwind v4 migration) first - blocking for other phases
3. **Visual regression testing** after migration before proceeding
4. **Parallel execution** of Phases 3-5 possible after Phase 2 complete
