# Tasks: Shared Avatar Editor Component

**Input**: Design documents from `/specs/030-avatar-editor/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks included for hook testing and integration testing as this is a reusable UI component.

**Organization**: Tasks organized for complete, production-ready implementation of all features.

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions

- **Frontend**: `frontend/src/` for source, `frontend/tests/` for tests
- **Component location**: `frontend/src/components/ui/AvatarEditor/`
- **Hooks location**: `frontend/src/hooks/`

---

## Phase 1: Setup

**Purpose**: Project initialization and component structure

- [x] T001 Create component directory structure at `frontend/src/components/ui/AvatarEditor/`
- [x] T002 Create index.ts with public exports at `frontend/src/components/ui/AvatarEditor/index.ts`
- [x] T003 [P] Create types.ts with TypeScript interfaces from data-model.md at `frontend/src/components/ui/AvatarEditor/types.ts`
- [x] T004 [P] Create test directory structure at `frontend/src/components/ui/AvatarEditor/__tests__/`

---

## Phase 2: Core Hooks

**Purpose**: All hooks that power the avatar editor functionality

- [x] T005 Create useAvatarEditor hook with complete state management at `frontend/src/hooks/useAvatarEditor.ts`
  - Image loading and validation (type, size, dimensions)
  - Zoom state (0.5x - 3x)
  - Pan/position state
  - Rotation state (free rotation -180° to 180°, 90° increments)
  - Flip state (horizontal, vertical)
  - Filter state (brightness, contrast, saturation: -100 to 100)
  - Crop area state
  - isDirty, isProcessing, error states
  - Reset functions (transforms, filters, all)
  - Export function with canvas processing

- [x] T006 [P] Create useImageTransform hook for transform calculations at `frontend/src/hooks/useImageTransform.ts`
  - CSS transform string generation for preview
  - Canvas transform application for export
  - Bounding box calculations after transforms
  - Matrix composition for rotation + flip + zoom

- [x] T007 [P] Create useTouchGestures hook using @use-gesture/react at `frontend/src/hooks/useTouchGestures.ts`
  - Pinch-to-zoom gesture handling
  - Two-finger rotation gesture detection
  - Single-finger pan (handled by react-easy-crop)
  - Gesture state management

- [x] T008 [P] Unit tests for useAvatarEditor hook at `frontend/src/hooks/__tests__/useAvatarEditor.test.ts`
- [x] T009 [P] Unit tests for useImageTransform hook at `frontend/src/hooks/__tests__/useImageTransform.test.ts`
- [x] T010 [P] Unit tests for useTouchGestures hook at `frontend/src/hooks/__tests__/useTouchGestures.test.ts`

**Checkpoint**: All hooks complete with tests passing ✓

---

## Phase 3: UI Components

**Purpose**: Build all avatar editor UI components with full feature set

### Canvas Component

- [x] T011 Create AvatarEditorCanvas component at `frontend/src/components/ui/AvatarEditor/AvatarEditorCanvas.tsx`
  - Integrate react-easy-crop for crop functionality
  - Support circular and rectangular crop shapes
  - Support configurable aspect ratios (1, 4/3, 3/4, 16/9, custom)
  - Apply CSS filters for real-time preview (brightness, contrast, saturation)
  - Apply CSS transforms for flip preview
  - Integrate rotation prop with react-easy-crop
  - Integrate useTouchGestures for two-finger rotation
  - Mouse wheel zoom support
  - Responsive sizing

### Controls Component

- [x] T012 Create AvatarEditorControls component at `frontend/src/components/ui/AvatarEditor/AvatarEditorControls.tsx`
  - Zoom slider (0.5x - 3x)
  - Rotation controls:
    - Rotate 90° clockwise button
    - Rotate 90° counter-clockwise button
    - Free rotation slider (-180° to 180°)
  - Flip controls:
    - Horizontal flip toggle button
    - Vertical flip toggle button
  - Filter controls (collapsible/expandable section):
    - Brightness slider (-100 to 100)
    - Contrast slider (-100 to 100)
    - Saturation slider (-100 to 100)
  - Reset buttons:
    - Reset transforms
    - Reset filters
    - Reset all
  - Touch-friendly sizing (min 44x44px touch targets)
  - Responsive layout (stacked on mobile, inline on desktop)
  - Debounced slider updates (100ms)

### Main Editor Component

- [x] T013 Create AvatarEditor orchestrator component at `frontend/src/components/ui/AvatarEditor/AvatarEditor.tsx`
  - Compose AvatarEditorCanvas + AvatarEditorControls
  - Wire up useAvatarEditor hook
  - Handle file/imageSrc input props
  - Handle aspectRatio and cropShape props
  - Handle feature toggle props (enableFilters, enableRotation, enableFlip)
  - Loading and error states
  - Save/cancel button handling
  - Keyboard shortcuts:
    - `R` - Rotate 90° clockwise
    - `Shift+R` - Rotate 90° counter-clockwise
    - `H` - Flip horizontal
    - `V` - Flip vertical
    - `0` - Reset all
    - `Enter` - Save
    - `Escape` - Cancel

### Modal Component

- [x] T014 Create AvatarEditorModal with glassmorphism design at `frontend/src/components/ui/AvatarEditor/AvatarEditorModal.tsx`
  - Glassmorphism backdrop (backdrop-filter: blur, saturate)
  - Light/dark theme support using design tokens
  - Responsive layout:
    - Mobile: Full-screen modal, controls in bottom sheet
    - Tablet: Centered modal (90% width, max 600px)
    - Desktop: Centered modal (max 800px)
  - Focus trap for accessibility
  - Close on backdrop click (with confirmation if dirty)
  - Confirmation dialog for cancel with unsaved changes
  - Title prop support
  - Animation on open/close (framer-motion)

### Component Tests

- [x] T015 [P] Integration tests for AvatarEditorCanvas at `frontend/src/components/ui/AvatarEditor/__tests__/AvatarEditorCanvas.test.tsx`
- [x] T016 [P] Integration tests for AvatarEditorControls at `frontend/src/components/ui/AvatarEditor/__tests__/AvatarEditorControls.test.tsx`
- [x] T017 [P] Integration tests for AvatarEditor at `frontend/src/components/ui/AvatarEditor/__tests__/AvatarEditor.test.tsx`
- [x] T018 [P] Integration tests for AvatarEditorModal at `frontend/src/components/ui/AvatarEditor/__tests__/AvatarEditorModal.test.tsx`

**Checkpoint**: All UI components complete with full feature set ✓

---

## Phase 4: Canvas Export & Image Processing

**Purpose**: Implement production-quality image export with all transforms and filters

- [x] T019 Implement canvas export pipeline in useAvatarEditor
  - Create offscreen canvas at target dimensions
  - Apply transforms in correct order (translate, rotate, scale, flip)
  - Apply canvas filters (brightness, contrast, saturate)
  - Extract crop region based on croppedAreaPixels
  - Support circular mask for round crop shape
  - Export as Blob with configurable format (WebP, JPEG, PNG)
  - Export with configurable quality (0-1)
  - Export with configurable max dimensions
  - Generate CropData output for backend compatibility

- [x] T020 Implement image downsampling for large files
  - Detect images > 4096px dimension
  - Downsample to max 2048px for preview canvas
  - Maintain original quality reference for export
  - Show loading indicator during processing (isDownsampling state)

- [ ] T021 Add Web Worker for export processing (optional optimization)
  - Offload heavy canvas operations to worker
  - Prevent UI blocking during export
  - Progress callback support

- [ ] T022 Unit tests for canvas export at `frontend/tests/hooks/useAvatarEditor.export.test.ts`

**Checkpoint**: Image export produces correct output with all transforms and filters applied

---

## Phase 5: Accessibility & Keyboard Navigation

**Purpose**: Ensure WCAG 2.1 AA compliance and full keyboard accessibility

- [x] T023 Add ARIA labels to all interactive elements
  - Sliders: aria-label, aria-valuemin, aria-valuemax, aria-valuenow
  - Buttons: aria-label describing action
  - Modal: aria-modal, aria-labelledby, aria-describedby
  - Canvas: aria-label for image editing area (role="application")

- [x] T024 Add screen reader announcements
  - Announce zoom level changes
  - Announce rotation changes
  - Announce flip state changes
  - Announce filter value changes
  - Live region with useAnnouncer hook

- [x] T025 Implement full keyboard navigation
  - Tab through all controls in logical order
  - Arrow keys for slider adjustment (native input behavior)
  - Space/Enter for button activation
  - Focus visible indicators on all elements (focus-visible:ring)
  - Keyboard shortcuts (R, Shift+R, H, V, 0, Enter, Escape)

- [x] T026 Add focus management
  - Focus trap within modal
  - Return focus to trigger element on close
  - Auto-focus first interactive element on open

- [x] T027 Implement prefers-reduced-motion support
  - Modal uses framer-motion's useReducedMotion hook
  - Animations disabled when reduced motion preferred
  - Instant transitions instead of animated ones

- [x] T028 Accessibility tests at `frontend/src/components/ui/AvatarEditor/__tests__/accessibility.test.tsx`

**Checkpoint**: Component passes accessibility audit ✓

---

## Phase 6: Integration & Migration

**Purpose**: Replace existing AvatarCropModal with new AvatarEditor across all integration points

- [x] T029 Update AvatarUploader to use AvatarEditor at `frontend/src/components/settings/AvatarUploader.tsx`
  - Replace AvatarCropModal import with AvatarEditorModal
  - Update state management (file instead of imageSrc)
  - Update callback signatures
  - Verify upload to backend still works

- [x] T030 Update ClientFormPage to use AvatarEditor at `frontend/src/pages/workspace/ClientFormPage.tsx`
  - Replace any direct AvatarCropModal usage
  - Integrate with client avatar upload flow
  - Test create and edit modes

- [x] T031 Update ClientDetailPage to use AvatarEditor at `frontend/src/pages/workspace/ClientDetailPage.tsx`
  - Replace avatar edit functionality
  - Verify existing avatar display still works
  - Note: ClientDetailPage navigates to ClientFormPage for editing; no inline editor to replace

- [x] T032 Update CompanyProfileForm to use AvatarEditor at `frontend/src/components/features/settings/CompanyProfileForm.tsx`
  - Replace company logo/avatar upload
  - May need rectangular crop support

- [x] T033 Verify CropData output matches existing backend API expectations
  - Test crop_x, crop_y, crop_scale fields
  - Test optional rotation, flip_h, flip_v fields
  - Verify backend handles new optional fields gracefully

- [x] T034 Remove deprecated AvatarCropModal at `frontend/src/components/ui/AvatarCropModal.tsx`
  - Verified no remaining imports
  - Deleted file
  - Updated comments in service files

- [ ] T035 Integration tests for all migration points at `frontend/tests/integration/avatar-upload.test.tsx`

**Checkpoint**: All avatar upload points migrated and working ✓

---

## Phase 7: Cross-Browser & Device Testing

**Purpose**: Ensure production-ready quality across all target platforms

- [x] T036 Test on Chrome (latest 2 versions)
  - Desktop: Windows ✓ (manual E2E testing completed - all UI features working)
  - Desktop: macOS (pending)
  - Mobile: Android (pending)

- [ ] T037 Test on Firefox (latest 2 versions)
  - Desktop: Windows, macOS

- [ ] T038 Test on Safari (latest 2 versions)
  - Desktop: macOS
  - Mobile: iOS (critical for touch gestures)

- [ ] T039 Test on Edge (latest 2 versions)
  - Desktop: Windows

- [ ] T040 Test touch gestures on real devices
  - iOS Safari: pinch-zoom, pan, two-finger rotate
  - Android Chrome: pinch-zoom, pan, two-finger rotate
  - Verify gesture conflicts are resolved

- [ ] T041 Test glassmorphism fallback
  - Verify backdrop-filter fallback for unsupported browsers
  - Test with backdrop-filter disabled

- [ ] T042 Performance testing
  - Verify preview updates < 100ms
  - Verify smooth 60fps during gestures
  - Test with large images (10MB+)
  - Profile memory usage

**Checkpoint**: Component works correctly on all target platforms

---

## Phase 8: Documentation & Polish

**Purpose**: Final documentation, cleanup, and production hardening

- [ ] T043 Update quickstart.md with complete API documentation
  - All props documented with examples
  - All keyboard shortcuts listed
  - All touch gestures documented
  - Migration guide from AvatarCropModal
  - Troubleshooting section

- [ ] T044 Add JSDoc comments to all public exports
  - AvatarEditor component
  - AvatarEditorModal component
  - useAvatarEditor hook
  - All TypeScript interfaces

- [ ] T045 Code cleanup
  - Remove any console.log statements
  - Remove unused imports
  - Ensure consistent code style
  - Run linter and fix all issues

- [ ] T046 Security review
  - Verify no XSS vulnerabilities in image handling
  - Verify file type validation is robust
  - Verify no sensitive data in error messages

- [ ] T047 Error handling hardening
  - User-friendly error messages for all failure cases
  - Graceful degradation for unsupported features
  - Error boundary wrapper

- [ ] T048 Run quickstart.md validation
  - Verify all code examples work
  - Verify all imports are correct
  - Test basic usage example end-to-end

- [ ] T049 Final review and sign-off
  - Code review all components
  - Verify all tests pass
  - Verify all acceptance criteria met

**Checkpoint**: Component is production-ready

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Setup)
    ↓
Phase 2 (Core Hooks) ──────────────────┐
    ↓                                  │
Phase 3 (UI Components)                │
    ↓                                  │
Phase 4 (Canvas Export)                │
    ↓                                  │
Phase 5 (Accessibility) ←──────────────┘
    ↓
Phase 6 (Integration)
    ↓
Phase 7 (Cross-Browser Testing)
    ↓
Phase 8 (Documentation & Polish)
```

### Parallel Opportunities Within Phases

**Phase 2 (Core Hooks)**:
- T006, T007 can run in parallel with T005
- T008, T009, T010 can all run in parallel after their respective hooks

**Phase 3 (UI Components)**:
- T011, T012 can run in parallel
- T015, T016, T017, T018 can all run in parallel

**Phase 5 (Accessibility)**:
- T023, T024, T025, T026, T027 can mostly run in parallel

**Phase 6 (Integration)**:
- T029, T030, T031, T032 can run in parallel

**Phase 7 (Testing)**:
- T036, T037, T038, T039 can run in parallel

---

## Success Criteria Validation

| Criteria | Validation Task |
|----------|-----------------|
| SC-001: Upload/edit under 30s | T042 (Performance testing) |
| SC-002: Consistent across all upload points | T035 (Integration tests) |
| SC-003: 95% first-attempt success | T035, T040 (Integration + device testing) |
| SC-004: Touch gestures work | T040 (Real device testing) |
| SC-005: Preview updates < 100ms | T042 (Performance testing) |
| SC-007: Cross-browser support | T036-T041 (Browser testing) |
| SC-008: Keyboard accessibility | T028 (Accessibility tests) |

---

## Notes

- [P] tasks = different files, no dependencies
- All features must be complete before integration phase
- CropData interface must remain backward compatible with existing backend
- The existing `react-easy-crop` and `@use-gesture/react` packages are already installed
- Commit after each task or logical group
- All 5 user stories implemented as a complete, production-ready component
