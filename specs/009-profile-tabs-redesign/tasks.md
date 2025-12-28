# Tasks: User Profile Tabbed Navigation Redesign

**Input**: Design documents from `/specs/009-profile-tabs-redesign/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tech Stack**: TypeScript 5.2+, React 18.3, React Router DOM 6.21, TailwindCSS 3.3, Lucide React
**Tests**: Not explicitly requested - tests are optional (no TDD requirement in spec)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Frontend**: `frontend/src/` (React application)
- **Components**: `frontend/src/components/`
- **Pages**: `frontend/src/pages/`
- **Types**: `frontend/src/types/`
- **Router**: `frontend/src/router/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create new directory structure and type definitions required by all user stories

- [ ] T001 Create settings types file with SettingsTabId, SettingsTabConfig, and validation in `frontend/src/types/settings.ts`
- [ ] T002 [P] Create settings components directory structure: `frontend/src/components/settings/`
- [ ] T003 [P] Create barrel export file in `frontend/src/components/settings/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core reusable components that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Create reusable Tabs component with WAI-ARIA accessibility in `frontend/src/components/ui/Tabs.tsx`
- [ ] T005 [P] Create TabPanel component with accessibility attributes in `frontend/src/components/ui/TabPanel.tsx`
- [ ] T006 Create SettingsTabs component using Tabs with tab configuration in `frontend/src/components/settings/SettingsTabs.tsx`

**Checkpoint**: Foundation ready - Reusable tabs and settings tab navigation components are complete

---

## Phase 3: User Story 1 - Navigate Profile Settings via Tabs (Priority: P1) 🎯 MVP

**Goal**: Enable tabbed navigation within a single page for all profile settings sections

**Independent Test**: Navigate to `/settings`, click tabs (Profile, Security, etc.), verify instant switching without page reload, verify active tab indicator

### Implementation for User Story 1

- [ ] T007 [P] [US1] Extract ProfileTabContent from existing ProfileSettingsPage in `frontend/src/components/settings/ProfileTabContent.tsx`
- [ ] T008 [P] [US1] Extract SecurityTabContent from existing SecuritySettingsPage in `frontend/src/components/settings/SecurityTabContent.tsx`
- [ ] T009 [P] [US1] Extract NotificationsTabContent from existing NotificationSettingsPage in `frontend/src/components/settings/NotificationsTabContent.tsx`
- [ ] T010 [P] [US1] Extract PrivacyTabContent from existing PrivacySettingsPage in `frontend/src/components/settings/PrivacyTabContent.tsx`
- [ ] T011 [P] [US1] Extract AITabContent from existing AISettingsPage (Gemini settings) in `frontend/src/components/settings/AITabContent.tsx`
- [ ] T012 [P] [US1] Extract SubscriptionTabContent from existing SubscriptionSettingsPage in `frontend/src/components/settings/SubscriptionTabContent.tsx`
- [ ] T013 [P] [US1] Extract AccountTabContent from existing AccountSettingsPage with danger zone styling in `frontend/src/components/settings/AccountTabContent.tsx`
- [ ] T014 [US1] Update barrel export with all tab content components in `frontend/src/components/settings/index.ts`
- [ ] T015 [US1] Create UserSettingsPage container with useSearchParams for tab state in `frontend/src/pages/settings/UserSettingsPage.tsx`
- [ ] T016 [US1] Update router to use single `/settings` route under WorkspaceLayout in `frontend/src/router/routes.tsx`
- [ ] T017 [US1] Update WorkspaceSidebar "My Profile" link to point to `/settings` in `frontend/src/components/workspace/WorkspaceSidebar.tsx`

**Checkpoint**: At this point, User Story 1 should be fully functional - users can navigate between all settings sections via tabs

---

## Phase 4: User Story 2 - Mobile-First Responsive Navigation (Priority: P1)

**Goal**: Ensure tabs adapt seamlessly to mobile, tablet, and desktop viewports

**Independent Test**: Resize browser to 375px (mobile), 768px (tablet), 1024px (desktop) and verify tabs layout correctly with appropriate spacing and touch targets

### Implementation for User Story 2

- [ ] T018 [P] [US2] Add responsive classes to Tabs component for mobile/tablet/desktop breakpoints in `frontend/src/components/ui/Tabs.tsx`
- [ ] T019 [P] [US2] Add horizontal scroll and scrollbar-hide to SettingsTabs container in `frontend/src/components/settings/SettingsTabs.tsx`
- [ ] T020 [US2] Ensure minimum 44x44px touch targets on all tab buttons in `frontend/src/components/ui/Tabs.tsx`
- [ ] T021 [US2] Add responsive padding (px-4 py-3 on mobile, px-6 py-4 on desktop) to tab buttons in `frontend/src/components/ui/Tabs.tsx`

**Checkpoint**: At this point, tabs should work correctly on all device sizes with proper touch targets

---

## Phase 5: User Story 3 - Consistent Visual Design (Priority: P2)

**Goal**: Match the visual style of GallerySettingsPanel tabs (border-b-2, primary color active state)

**Independent Test**: Compare tab styling visually against GallerySettingsPanel.tsx, verify buttons use same variants, cards use glassmorphism

### Implementation for User Story 3

- [ ] T022 [US3] Apply GallerySettingsPanel tab styling (border-b-2 border-primary text-primary) to Tabs component in `frontend/src/components/ui/Tabs.tsx`
- [ ] T023 [P] [US3] Add hover states (text-text-primary on hover) to inactive tabs in `frontend/src/components/ui/Tabs.tsx`
- [ ] T024 [P] [US3] Add danger styling (border-error text-error) for Account tab in `frontend/src/components/ui/Tabs.tsx`
- [ ] T025 [US3] Verify all tab content components use AppButton, AppCard, AppInput from design system in all `frontend/src/components/settings/*TabContent.tsx` files

**Checkpoint**: At this point, visual design should match GallerySettingsPanel exactly

---

## Phase 6: User Story 4 - Preserve Workspace Context (Priority: P2)

**Goal**: Keep workspace sidebar and header visible while on profile settings

**Independent Test**: Navigate to settings, verify workspace sidebar and header remain visible, verify sidebar navigation works from settings page

### Implementation for User Story 4

- [ ] T026 [US4] Verify UserSettingsPage renders within WorkspaceLayout (done in T016 - router update)
- [ ] T027 [US4] Test workspace sidebar navigation from settings page works correctly
- [ ] T028 [US4] Ensure collapsed sidebar state is preserved when navigating to settings in `frontend/src/pages/settings/UserSettingsPage.tsx`

**Checkpoint**: At this point, workspace context should be fully preserved

---

## Phase 7: User Story 5 - Keyboard Navigation & Accessibility (Priority: P2)

**Goal**: Full keyboard navigation support for tabs (Tab, Arrow keys, Enter/Space)

**Independent Test**: Navigate settings using only keyboard (Tab into tabs, Arrow Left/Right between tabs, Enter/Space to activate), verify screen reader announces tab changes

### Implementation for User Story 5

- [ ] T029 [US5] Implement keyboard navigation (Arrow Left/Right, Home, End) in Tabs component in `frontend/src/components/ui/Tabs.tsx`
- [ ] T030 [US5] Add tabIndex management (only active tab has tabIndex=0) in `frontend/src/components/ui/Tabs.tsx`
- [ ] T031 [US5] Add aria-selected, aria-controls, aria-labelledby attributes in `frontend/src/components/ui/Tabs.tsx` and `frontend/src/components/ui/TabPanel.tsx`
- [ ] T032 [US5] Ensure focus ring visible on all interactive elements using focus-visible:ring-2 in `frontend/src/components/ui/Tabs.tsx`

**Checkpoint**: At this point, keyboard-only users should be able to fully navigate settings

---

## Phase 8: User Story 6 - Direct Tab URL Access (Priority: P3)

**Goal**: Support deep-linking to specific tabs via URL query parameters

**Independent Test**: Navigate directly to `/settings?tab=security`, verify Security tab is active on load; navigate to `/settings?tab=invalid`, verify Profile tab (default) is shown

### Implementation for User Story 6

- [ ] T033 [US6] Implement validateTabId function for URL parameter validation in `frontend/src/types/settings.ts`
- [ ] T034 [US6] Update URL when tab changes using setSearchParams with replace:true in `frontend/src/pages/settings/UserSettingsPage.tsx`
- [ ] T035 [US6] Handle invalid tab parameter by defaulting to 'profile' in `frontend/src/pages/settings/UserSettingsPage.tsx`

**Checkpoint**: At this point, direct URL access and deep-linking should work correctly

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories and cleanup

- [ ] T036 [P] Add deprecation comment to SettingsLayout component in `frontend/src/components/layout/SettingsLayout.tsx`
- [ ] T037 [P] Remove unused settings page imports from routes (keep files for potential rollback) in `frontend/src/router/routes.tsx`
- [ ] T038 Verify all 7 tabs work with their respective hooks (useUserProfile, useUserSecurity, etc.)
- [ ] T039 [P] Manual accessibility test: Use VoiceOver/NVDA to verify tab announcements
- [ ] T040 [P] Visual regression test: Compare at 375px, 768px, 1024px, 1440px breakpoints
- [ ] T041 Run quickstart.md validation steps to verify implementation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup (T001-T003) - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - User stories can proceed in priority order (P1 → P2 → P3)
  - US1 and US2 are both P1, can run in parallel
  - US3, US4, US5 are P2, can run in parallel after US1
  - US6 is P3, can start after US1
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

| Story | Priority | Dependencies | Can Start After |
|-------|----------|--------------|-----------------|
| US1 (Tab Navigation) | P1 | None | Phase 2 complete |
| US2 (Mobile Responsive) | P1 | None (parallel with US1) | Phase 2 complete |
| US3 (Visual Design) | P2 | US1 (needs tabs to style) | US1 complete |
| US4 (Workspace Context) | P2 | US1 (needs page structure) | US1 complete |
| US5 (Keyboard Nav) | P2 | US1 (needs tabs to enhance) | US1 complete |
| US6 (URL Deep-link) | P3 | US1 (needs page container) | US1 complete |

### Within Each User Story

- Tab content extraction (T007-T013) can all run in parallel
- Page container (T015) depends on all tab content being available
- Router update (T016) depends on page container
- Sidebar update (T017) depends on router update

### Parallel Opportunities

**Phase 1 (Setup):**
```bash
# T001 (types), T002 (directory), T003 (barrel) can run in parallel
```

**Phase 2 (Foundational):**
```bash
# T004 (Tabs) must complete before T005 (TabPanel) can start
# T006 (SettingsTabs) depends on T004 (Tabs)
```

**Phase 3 (US1 - Tab Navigation):**
```bash
# All 7 tab content extractions can run in parallel:
# T007, T008, T009, T010, T011, T012, T013 [P]
```

**Phase 4 (US2 - Mobile):**
```bash
# T018, T019 can run in parallel (different files)
```

**Phase 5 (US3 - Visual Design):**
```bash
# T023, T024 can run in parallel
```

---

## Parallel Example: User Story 1 Tab Extractions

```bash
# Launch all 7 tab content extractions together:
Task: "Extract ProfileTabContent in frontend/src/components/settings/ProfileTabContent.tsx"
Task: "Extract SecurityTabContent in frontend/src/components/settings/SecurityTabContent.tsx"
Task: "Extract NotificationsTabContent in frontend/src/components/settings/NotificationsTabContent.tsx"
Task: "Extract PrivacyTabContent in frontend/src/components/settings/PrivacyTabContent.tsx"
Task: "Extract AITabContent in frontend/src/components/settings/AITabContent.tsx"
Task: "Extract SubscriptionTabContent in frontend/src/components/settings/SubscriptionTabContent.tsx"
Task: "Extract AccountTabContent in frontend/src/components/settings/AccountTabContent.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T006)
3. Complete Phase 3: User Story 1 - Tab Navigation (T007-T017)
4. **STOP and VALIDATE**: Test tab navigation independently
5. Deploy/demo if ready - Core tabbed settings now works!

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add US1 (Tab Navigation) + US2 (Mobile) → Test → Deploy (MVP!)
3. Add US3 (Visual Design) → Test → Deploy (Polished)
4. Add US4 (Workspace Context) + US5 (Keyboard) → Test → Deploy (Accessible)
5. Add US6 (URL Deep-link) → Test → Deploy (Feature complete)
6. Polish phase → Final validation

### Suggested MVP Scope

**MVP = Phase 1 + Phase 2 + Phase 3 (US1)**

Total MVP tasks: 17 tasks (T001-T017)
- Setup: 3 tasks
- Foundational: 3 tasks
- US1: 11 tasks

This delivers the core value: users can navigate settings via tabs instead of separate pages.

---

## Summary

| Metric | Value |
|--------|-------|
| Total Tasks | 41 |
| Setup Tasks | 3 |
| Foundational Tasks | 3 |
| US1 Tasks | 11 |
| US2 Tasks | 4 |
| US3 Tasks | 4 |
| US4 Tasks | 3 |
| US5 Tasks | 4 |
| US6 Tasks | 3 |
| Polish Tasks | 6 |
| Parallel Opportunities | 20 tasks marked [P] |
| New Files | 14 files |
| Modified Files | 3 files |
| Deprecated Files | 1 file |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- This is a **frontend-only** refactor - no backend changes required
