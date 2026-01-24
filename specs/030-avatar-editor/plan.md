# Implementation Plan: Shared Avatar Editor Component

**Branch**: `030-avatar-editor` | **Date**: 2026-01-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/030-avatar-editor/spec.md`

## Summary

Rebuild the avatar upload/crop functionality as a modern, reusable component with glassmorphism design. The new `AvatarEditor` component will replace the existing `AvatarCropModal` and be integrated into all avatar upload points (user profile, client profiles, company profile). The component will leverage existing dependencies (`react-easy-crop`, `@use-gesture/react`) and add rotation, flip, and filter capabilities.

## Technical Context

**Language/Version**: TypeScript 5.3, React 18.3
**Primary Dependencies**: react-easy-crop (existing), @use-gesture/react (existing), framer-motion (existing), lucide-react (existing)
**Storage**: N/A (component outputs File/Blob to parent)
**Testing**: Vitest with @testing-library/react
**Target Platform**: Web (modern browsers supporting canvas, backdrop-filter)
**Project Type**: Web application - frontend component
**Performance Goals**: Preview updates <100ms, smooth 60fps animations
**Constraints**: Must work on mobile (touch gestures), support light/dark themes, WCAG 2.1 AA compliant
**Scale/Scope**: Single reusable component, ~5-7 files, integration with 4+ existing pages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Compliance | Notes |
|-----------|------------|-------|
| Component Reusability | ✅ Pass | Building as shared component in `frontend/src/components/ui/AvatarEditor/` |
| Test-First | ✅ Pass | Will write unit tests for hooks and integration tests for component |
| Design System Integration | ✅ Pass | Using existing CSS variables, glass utilities, Modal patterns |
| Accessibility | ✅ Pass | Keyboard navigation, ARIA labels, focus management planned |
| Performance | ✅ Pass | Canvas optimization, requestAnimationFrame, debounced filters |

## Project Structure

### Documentation (this feature)

```text
specs/030-avatar-editor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (component API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   └── ui/
│   │       ├── AvatarEditor/              # New component directory
│   │       │   ├── index.ts               # Public exports
│   │       │   ├── AvatarEditor.tsx       # Main editor component
│   │       │   ├── AvatarEditorModal.tsx  # Modal wrapper with glassmorphism
│   │       │   ├── AvatarEditorCanvas.tsx # Canvas with crop overlay
│   │       │   ├── AvatarEditorControls.tsx # Control panel
│   │       │   └── types.ts               # TypeScript interfaces
│   │       ├── AvatarCropModal.tsx        # TO BE REMOVED after migration
│   │       └── ...
│   ├── hooks/
│   │   ├── useAvatarEditor.ts             # Core editor state/logic
│   │   ├── useImageTransform.ts           # Transform calculations
│   │   └── useTouchGestures.ts            # Mobile touch support
│   ├── components/settings/
│   │   └── AvatarUploader.tsx             # TO BE UPDATED to use new component
│   └── pages/workspace/
│       ├── ClientFormPage.tsx             # TO BE UPDATED
│       └── ClientDetailPage.tsx           # TO BE UPDATED
└── tests/
    ├── components/
    │   └── ui/
    │       └── AvatarEditor/
    │           ├── AvatarEditor.test.tsx
    │           ├── AvatarEditorControls.test.tsx
    │           └── AvatarEditorCanvas.test.tsx
    └── hooks/
        ├── useAvatarEditor.test.ts
        ├── useImageTransform.test.ts
        └── useTouchGestures.test.ts
```

**Structure Decision**: Web application frontend structure, adding new component in existing `frontend/src/components/ui/` directory following established patterns. Hooks in `frontend/src/hooks/`.

## Complexity Tracking

> No violations to justify - design follows existing patterns.

## Migration Strategy

### Files to Remove (after migration complete)

- `frontend/src/components/ui/AvatarCropModal.tsx` (replaced by AvatarEditor)

### Files to Update

1. `frontend/src/components/settings/AvatarUploader.tsx` - Switch to AvatarEditor
2. `frontend/src/pages/workspace/ClientFormPage.tsx` - Switch to AvatarEditor
3. `frontend/src/pages/workspace/ClientDetailPage.tsx` - Switch to AvatarEditor
4. `frontend/src/components/features/settings/CompanyProfileForm.tsx` - Switch to AvatarEditor (if applicable)

### Backward Compatibility

- New component will match existing `onSave(file: File)` callback pattern
- Support existing `CropData` output format for backend compatibility
- Gradual migration: can coexist with old component during transition

## Implementation Phases

### Phase 1: Core Hooks (P1 - Basic Upload/Crop)

1. Create `useAvatarEditor` hook - state management for zoom, pan, rotation
2. Create `useImageTransform` hook - transform matrix calculations
3. Unit tests for hooks

### Phase 2: Base Component (P1 - Basic Upload/Crop)

1. Create `AvatarEditorCanvas` - display with crop overlay
2. Create `AvatarEditorControls` - zoom slider, reset button
3. Create `AvatarEditor` - orchestrates canvas + controls
4. Create `AvatarEditorModal` - glassmorphism modal wrapper
5. Integration tests

### Phase 3: Rotation & Flip (P2)

1. Add rotation buttons (90° increments) to controls
2. Add free rotation slider (-180° to 180°)
3. Add horizontal/vertical flip toggles
4. Update transform calculations

### Phase 4: Touch Gestures (P2)

1. Create `useTouchGestures` hook
2. Integrate pinch-to-zoom
3. Integrate two-finger rotation
4. Test on mobile devices

### Phase 5: Filters (P3)

1. Add filter controls (brightness, contrast, saturation)
2. Apply CSS filters to canvas preview
3. Apply canvas filters on export

### Phase 6: Integration & Migration

1. Update `AvatarUploader` component
2. Update `ClientFormPage`
3. Update `ClientDetailPage`
4. Update `CompanyProfileForm`
5. Remove old `AvatarCropModal`
6. End-to-end testing

## Dependencies

### Existing (No Changes)

- `react-easy-crop` ^5.5.6 - Core crop functionality
- `@use-gesture/react` ^10.3.1 - Touch gesture handling
- `framer-motion` ^11.0.0 - Animations
- `lucide-react` ^0.294.0 - Icons

### New Dependencies

None required - existing dependencies cover all needs.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Touch gesture conflicts with react-easy-crop | Medium | Medium | Test on real devices early, use @use-gesture for custom gestures only |
| Canvas performance on large images | Low | Medium | Downsample for preview, full quality on export |
| Browser compatibility (backdrop-filter) | Low | Low | Graceful degradation with fallback background |
| Breaking existing avatar uploads | Medium | High | Maintain same callback interface, thorough testing |

## Success Metrics

- [ ] Component passes all unit tests (>90% coverage)
- [ ] Works on Chrome, Firefox, Safari, Edge (latest 2 versions)
- [ ] Works on iOS Safari and Android Chrome
- [ ] Keyboard-only navigation possible
- [ ] All existing avatar upload points migrated
- [ ] No regressions in existing functionality
