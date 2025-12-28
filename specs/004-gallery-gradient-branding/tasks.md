# Tasks: Gallery Gradient Branding

**Input**: Design documents from `/specs/004-gallery-gradient-branding/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are NOT explicitly required in the specification. Tasks below focus on implementation only.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Backend**: `backend/src/`, `backend/migrations/`
- **Frontend**: `frontend/src/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database migration and shared type definitions

- [x] T001 Create database migration for `gradient_config` JSONB column in backend/migrations/versions/0040_add_gradient_config.py
- [x] T002 [P] Add ColorStop and GradientConfiguration Pydantic schemas to backend/src/app/api/schemas.py
- [x] T003 [P] Create gradient TypeScript types in frontend/src/types/gradient.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend API support and frontend utility functions that ALL user stories depend on

**CRITICAL**: No UI work can begin until this phase is complete

- [x] T004 Update GalleryUpdateRequest schema to include gradient_config field in backend/src/app/api/schemas.py
- [x] T005 Update GalleryDetailResponse schema to include gradient_config field in backend/src/app/api/schemas.py
- [x] T006 Modify gallery_service.py to handle gradient_config in update operations at backend/src/app/services/gallery_service.py
- [x] T007 Modify gallery_service.py to include gradient_config in get_gallery_detail response at backend/src/app/services/gallery_service.py
- [x] T008 Add legacy primary_color to gradient migration helper function in backend/src/app/services/gallery_service.py
- [x] T009 Update GalleryDetailData type to include gradient_config field in frontend/src/types/gallery.ts
- [x] T010 Update GalleryUpdateRequest type to include gradient_config field in frontend/src/types/gallery.ts
- [x] T011 [P] Create gradientToCss utility function in frontend/src/utils/gradientUtils.ts
- [x] T012 [P] Create contrast checking utility function (checkGradientContrast) in frontend/src/utils/gradientUtils.ts
- [x] T013 Define 20 gradient presets (5 warm, 5 cool, 5 professional, 5 vibrant) in frontend/src/constants/gradientPresets.ts

**Checkpoint**: API can now accept/return gradient_config; presets are defined; utilities ready

---

## Phase 3: User Story 1 - Select Predefined Gradient (Priority: P1)

**Goal**: Users can browse and select from ~20 predefined gradient presets in a visual grid

**Independent Test**: Open gallery settings → Branding → see grid of gradients → click to select → selection is highlighted

### Implementation for User Story 1

- [x] T014 [P] [US1] Create GradientThumbnail component for preset preview in frontend/src/components/features/gallery/GradientThumbnail.tsx
- [x] T015 [US1] Create GradientPicker component with grid layout and category filtering in frontend/src/components/features/gallery/GradientPicker.tsx
- [x] T016 [US1] Add selection state management with visual indicator (checkmark/border) in GradientPicker.tsx
- [x] T017 [US1] Add hover tooltip showing gradient name in GradientPicker.tsx
- [x] T018 [US1] Integrate GradientPicker into VisualIdentitySettings.tsx replacing color picker at frontend/src/components/features/gallery/VisualIdentitySettings.tsx
- [x] T019 [US1] Add "Remove Gradient" / "Reset to Default" option in VisualIdentitySettings.tsx
- [x] T020 [US1] Wire onUpdate handler to pass gradient_config to parent gallery settings panel

**Checkpoint**: User Story 1 complete - users can browse and select gradients from presets

---

## Phase 4: User Story 4 - Preview Before Confirming (Priority: P1)

**Goal**: Users see a live preview of selected gradient before clicking "Save Changes"

**Independent Test**: Select a gradient → preview area updates immediately → click Cancel → original gradient preserved → click Save → gradient saved

### Implementation for User Story 4

- [x] T021 [P] [US4] Create GradientPreviewPanel component showing gradient in gallery context in frontend/src/components/features/gallery/GradientPreviewPanel.tsx
- [x] T022 [US4] Add GradientPreviewPanel to VisualIdentitySettings.tsx showing currently selected gradient
- [x] T023 [US4] Ensure preview updates in real-time when selection changes in VisualIdentitySettings.tsx
- [x] T024 [US4] Verify existing "Save Changes" button in GallerySettingsPanel.tsx correctly persists gradient_config
- [x] T025 [US4] Verify Cancel/close discards unsaved gradient selection

**Checkpoint**: User Story 4 complete - preview shows before confirmation, changes only saved on Save

---

## Phase 5: User Story 2 - Customize Gradient (Priority: P2)

**Goal**: Users can create custom gradients by modifying colors and direction

**Independent Test**: Click "Customize" → editor opens → change colors → adjust direction → save → custom gradient applied

### Implementation for User Story 2

- [x] T026 [P] [US2] Create ColorStopEditor component for adding/editing color stops in frontend/src/components/features/gallery/ColorStopEditor.tsx
- [x] T027 [P] [US2] Create DirectionSlider component for gradient angle (0-359 degrees) in frontend/src/components/features/gallery/DirectionSlider.tsx
- [x] T028 [US2] Create GradientEditor component combining color stops and direction controls in frontend/src/components/features/gallery/GradientEditor.tsx
- [x] T029 [US2] Add live preview within GradientEditor showing gradient as colors/direction change
- [x] T030 [US2] Add "Customize" button to GradientPicker that opens GradientEditor with selected preset as starting point
- [x] T031 [US2] Add "Create Custom" option to start with blank/default gradient
- [x] T032 [US2] Add Reset button to revert to original state in GradientEditor
- [x] T033 [US2] Add Apply button to confirm custom gradient and update parent state

**Checkpoint**: User Story 2 complete - users can create and modify custom gradients

---

## Phase 6: User Story 3 - Responsive Gradient Display (Priority: P2)

**Goal**: Gradients render correctly on public gallery pages across all devices (320px to 4K)

**Independent Test**: View published gallery on desktop, tablet, mobile → gradient displays correctly without clipping or scrolling

### Implementation for User Story 3

- [x] T034 [US3] Identify gallery header/hero element in PublicGalleryPage.tsx where gradient will be applied at frontend/src/pages/public/PublicGalleryPage.tsx
- [x] T035 [US3] Apply gradient_config to gallery header using gradientToCss utility in PublicGalleryPage.tsx
- [x] T036 [US3] Add responsive CSS ensuring gradient fills appropriately on all viewport sizes
- [x] T037 [US3] Handle null/undefined gradient_config gracefully (fallback to no gradient or workspace default)
- [ ] T038 [US3] Test gradient rendering on 320px, 768px, 1024px, 1440px, 2560px viewports

**Checkpoint**: User Story 3 complete - gradients display correctly across all devices

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements affecting multiple user stories

- [x] T039 [P] Add contrast warning display when gradient has poor text readability in VisualIdentitySettings.tsx
- [x] T040 [P] Add keyboard navigation support (arrow keys, Enter to select) to GradientPicker component
- [x] T041 [P] Add ARIA labels and roles for screen reader accessibility to GradientPicker and GradientEditor
- [x] T042 Ensure all 20 preset gradients meet WCAG contrast requirements for white text overlay
- [ ] T043 Run migration on staging environment and verify gradient_config field works
- [ ] T044 Verify quickstart.md test scenarios pass manually
- [x] T045 Update PublicGalleryPage to pass gradient through magic link flow if applicable

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 and US4 are P1 and can proceed together (closely related)
  - US2 and US3 are P2 and can proceed after P1 stories complete
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 4 (P1)**: Can start after Foundational (Phase 2) - Enhances US1 but independent
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Extends US1 functionality
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Uses gradient utilities from Phase 2

### Within Each User Story

- Foundation must be complete before any story begins
- Components before integration
- Core functionality before polish
- Story complete before moving to next priority

### Parallel Opportunities

- T002 + T003 (schemas and types) can run in parallel
- T011 + T012 + T013 (utilities and presets) can run in parallel
- T014 + T021 (thumbnail and preview) can run in parallel after Phase 2
- T026 + T027 (color editor and direction slider) can run in parallel
- T039 + T040 + T041 (polish tasks) can run in parallel

---

## Parallel Example: Foundational Phase

```bash
# After T001 migration is complete, launch schema updates together:
Task: T002 "Add ColorStop and GradientConfiguration Pydantic schemas"
Task: T003 "Create gradient TypeScript types"

# After API schemas updated, launch utilities together:
Task: T011 "Create gradientToCss utility function"
Task: T012 "Create contrast checking utility function"
Task: T013 "Define 20 gradient presets"
```

## Parallel Example: User Story 1 + User Story 4

```bash
# These can be developed in parallel after Foundational:
# Developer A: User Story 1 (selection grid)
Task: T014-T020 "GradientPicker and selection functionality"

# Developer B: User Story 4 (preview panel)
Task: T021-T025 "GradientPreviewPanel and confirmation flow"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 4 Only)

1. Complete Phase 1: Setup (migration, schemas, types)
2. Complete Phase 2: Foundational (API, utilities, presets)
3. Complete Phase 3: User Story 1 (selection grid)
4. Complete Phase 4: User Story 4 (preview confirmation)
5. **STOP and VALIDATE**: User can select and save gradients with preview
6. Deploy/demo if ready - this fixes the original issue!

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 + US4 → Test independently → Deploy/Demo (MVP - fixes original issue!)
3. Add US2 → Test independently → Deploy/Demo (adds customization)
4. Add US3 → Test independently → Deploy/Demo (public gallery rendering)
5. Complete Polish → Final release

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (GradientPicker)
   - Developer B: User Story 4 (GradientPreviewPanel)
3. After P1 stories complete:
   - Developer A: User Story 2 (GradientEditor)
   - Developer B: User Story 3 (Public gallery rendering)

---

## Task Summary

| Phase | Tasks | Parallel Tasks |
|-------|-------|----------------|
| Setup | T001-T003 (3) | 2 |
| Foundational | T004-T013 (10) | 4 |
| User Story 1 | T014-T020 (7) | 1 |
| User Story 4 | T021-T025 (5) | 1 |
| User Story 2 | T026-T033 (8) | 2 |
| User Story 3 | T034-T038 (5) | 0 |
| Polish | T039-T045 (7) | 3 |
| **Total** | **45 tasks** | **13 parallel** |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- MVP is US1 + US4 which directly fixes the original issue (no confirmation button)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
