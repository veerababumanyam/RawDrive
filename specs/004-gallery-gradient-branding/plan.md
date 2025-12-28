# Implementation Plan: Gallery Gradient Branding

**Branch**: `004-gallery-gradient-branding` | **Date**: 2025-12-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-gallery-gradient-branding/spec.md`

## Summary

Replace the existing solid color picker in gallery branding settings with a modern gradient selection interface. The feature provides ~20 predefined gradient presets and custom gradient editing with live preview, fixing the original UX issue of no confirmation before saving color changes. Gradients are stored as JSONB in the galleries table and rendered via CSS for responsive display across all devices.

## Technical Context

**Language/Version**: Python 3.11 (Backend), TypeScript 5.2+ (Frontend)
**Primary Dependencies**: FastAPI 0.115+, React 18.3, Pydantic 2.7+, TailwindCSS
**Storage**: PostgreSQL 16 (JSONB column for gradient_config)
**Testing**: pytest (Backend), Vitest (Frontend)
**Target Platform**: Web (Desktop, Tablet, Mobile browsers)
**Project Type**: Web application (frontend + backend)
**Performance Goals**: Gradient selection < 10s, gallery load time +<100ms overhead
**Constraints**: WCAG 2.1 AA contrast compliance, 320px to 4K viewport support
**Scale/Scope**: Applies to all galleries, ~20 predefined presets, custom gradients

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Simplicity | ✅ PASS | Single JSONB column, no new tables or services |
| Library-First | ✅ PASS | Gradient utilities as reusable module |
| Test-First | ✅ PASS | Unit tests for gradient utils, integration for API |
| Observability | ✅ PASS | Existing gallery logging covers updates |
| WCAG Accessibility | ✅ PASS | Contrast checker included in design |

**All gates passed. No violations requiring justification.**

## Project Structure

### Documentation (this feature)

```text
specs/004-gallery-gradient-branding/
├── plan.md              # This file
├── research.md          # Research decisions
├── data-model.md        # Entity definitions and schema
├── quickstart.md        # Developer getting started guide
├── contracts/           # API specifications
│   └── gallery-gradient-api.yaml
└── tasks.md             # Implementation tasks (created by /speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── migrations/versions/
│   └── 00XX_add_gradient_config.py    # NEW: Migration
├── src/app/api/
│   └── schemas.py                      # MODIFY: Add gradient schemas
└── src/app/services/
    └── gallery_service.py              # MODIFY: Handle gradient_config

frontend/
├── src/types/
│   ├── gallery.ts                      # MODIFY: Add gradient_config
│   └── gradient.ts                     # NEW: Gradient types
├── src/constants/
│   └── gradientPresets.ts              # NEW: 20 preset definitions
├── src/components/features/gallery/
│   ├── VisualIdentitySettings.tsx      # MODIFY: Replace color picker
│   ├── GradientPicker.tsx              # NEW: Preset grid component
│   └── GradientEditor.tsx              # NEW: Custom editor component
├── src/utils/
│   └── gradientUtils.ts                # NEW: CSS generation, contrast
└── src/components/features/gallery/__tests__/
    └── GradientPicker.test.tsx         # NEW: Component tests
```

**Structure Decision**: Web application pattern (Option 2). Frontend and backend are separate workspaces with shared types conceptually aligned via API contract.

## Implementation Phases

### Phase 1: Backend Schema & API

1. Create database migration adding `gradient_config` JSONB column
2. Add Pydantic schemas for `GradientConfiguration` and `ColorStop`
3. Update `GalleryUpdateRequest` and `GalleryDetailResponse` schemas
4. Modify `gallery_service.py` to handle `gradient_config` in CRUD operations
5. Add validation for gradient structure (color format, direction range)
6. Write unit tests for gradient validation

### Phase 2: Frontend Types & Constants

1. Create `gradient.ts` type definitions
2. Define 20 gradient presets in `gradientPresets.ts`
3. Update `gallery.ts` types with `gradient_config`
4. Create `gradientUtils.ts` with CSS generation and contrast checking

### Phase 3: UI Components

1. Build `GradientPicker` component (preset grid with selection)
2. Build `GradientEditor` component (custom color/direction editing)
3. Replace color picker in `VisualIdentitySettings.tsx` with gradient picker
4. Add live preview panel
5. Implement contrast warning display

### Phase 4: Integration & Polish

1. Connect gradient picker to gallery update API
2. Implement gradient rendering on public gallery page
3. Add responsive testing across viewports
4. Write component tests
5. Accessibility audit (keyboard navigation, ARIA)

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Storage | JSONB column | Flexible, no joins, PostgreSQL native |
| Presets | Static constants | No DB queries, instant rendering |
| Custom gradients | 2-5 color stops | Balances flexibility and complexity |
| Direction | Degrees (0-359) | More flexible than CSS keywords |
| Contrast check | Client-side | Real-time feedback while editing |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Migration breaks existing galleries | `gradient_config` is nullable; `primary_color` kept for migration |
| Preset colors too similar | Design review with varied categories (warm/cool/pro/vibrant) |
| Low contrast gradients | Contrast checker warns before save |
| Performance on mobile | CSS gradients are hardware accelerated |

## Artifacts Generated

- [x] `research.md` - Technical decisions and alternatives
- [x] `data-model.md` - Entity schemas and types
- [x] `contracts/gallery-gradient-api.yaml` - OpenAPI specification
- [x] `quickstart.md` - Developer getting started guide

## Next Steps

Run `/speckit.tasks` to generate implementation task list based on this plan.
