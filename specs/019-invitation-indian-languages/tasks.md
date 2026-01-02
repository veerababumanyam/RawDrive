# Tasks: Indian Language Support for Invitations

**Input**: Design documents from `/specs/019-invitation-indian-languages/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ai-content-generation.yaml

**Tests**: Optional - not explicitly requested in specification

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Frontend**: `frontend/src/`
- **Backend**: `backend/src/app/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Foundational CSS and configuration that all user stories depend on

- [ ] T001 [P] Add Google Fonts import for all Indic scripts in frontend/src/index.css
- [ ] T002 [P] Add font-lang-* CSS classes for all 12 languages in frontend/src/index.css
- [ ] T003 [P] Add RTL-specific styles for Urdu (.font-lang-ur) in frontend/src/index.css

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Create InvitationLanguageSelect reusable component in frontend/src/components/features/invitations/InvitationLanguageSelect.tsx
- [ ] T005 Add LANGUAGE_RENDER_CONFIG type and constant to frontend/src/i18n/config.ts
- [ ] T006 [P] Add SupportedLanguage enum to backend/src/app/schemas/invitation_schemas.py (if not exists)
- [ ] T007 [P] Add LANGUAGE_DIRECTION mapping to backend/src/app/schemas/invitation_schemas.py

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Create Invitation in Regional Language (Priority: P1)

**Goal**: Enable users to select any of 12 Indian languages when creating invitations, independent of their UI language

**Independent Test**: Create an invitation, select Hindi from the language dropdown, verify all 12 languages appear with native script names (e.g., "हिन्दी"), save the invitation, and confirm the language is persisted

### Implementation for User Story 1

- [ ] T008 [US1] Update AITextGenerator.tsx to import SUPPORTED_LANGUAGES and replace hardcoded languageOptions (lines 89-97) in frontend/src/components/features/invitations/AITextGenerator.tsx
- [ ] T009 [US1] Update AITextGenerator.tsx to show native script names in dropdown labels (format: "తెలుగు (Telugu)")
- [ ] T010 [US1] Update InvitationWizard.tsx to import SUPPORTED_LANGUAGES and replace hardcoded LANGUAGES constant (lines 137-144) in frontend/src/components/features/invitations/InvitationWizard.tsx
- [ ] T011 [US1] Update InvitationWizard.tsx to show native script names alongside English names in language dropdown
- [ ] T012 [US1] Verify language selection persists when saving invitation (uses existing primary_language field)

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - View Public Invitation in Regional Language (Priority: P1)

**Goal**: Guests can view invitations rendered correctly in any regional language, including proper font rendering and RTL support for Urdu

**Independent Test**: Create an invitation in Bengali, open the public link, verify Bengali script renders with correct Noto Sans Bengali font. Create an invitation in Urdu, verify RTL text direction and layout

### Implementation for User Story 2

- [ ] T013 [P] [US2] Update PublicInvitationPage.tsx to import SUPPORTED_LANGUAGES from @/i18n/config in frontend/src/pages/public/PublicInvitationPage.tsx
- [ ] T014 [US2] Replace hardcoded LANGUAGE_CONFIG (lines 56-66) with dynamically generated config from SUPPORTED_LANGUAGES in frontend/src/pages/public/PublicInvitationPage.tsx
- [ ] T015 [US2] Add RTL layout support by setting dir="rtl" attribute when invitation language is Urdu in frontend/src/pages/public/PublicInvitationPage.tsx
- [ ] T016 [US2] Apply correct font-lang-* CSS class based on invitation primary_language in frontend/src/pages/public/PublicInvitationPage.tsx
- [ ] T017 [US2] Handle bilingual invitations (primary + secondary language display) if both are set

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - AI Content Generation in Regional Languages (Priority: P2)

**Goal**: AI generates culturally appropriate invitation content in all 12 Indian languages

**Independent Test**: Open AI generator modal, select Kannada, generate content, verify title and description are in Kannada script with culturally appropriate phrasing

### Implementation for User Story 3

- [ ] T018 [P] [US3] Update invitation_ai_service.py to add cultural context to prompts for regional languages in backend/src/app/services/invitation_ai_service.py
- [ ] T019 [US3] Add language-specific cultural guidelines to _build_prompt method (formal honorifics, native phrasing style) in backend/src/app/services/invitation_ai_service.py
- [ ] T020 [US3] Validate language parameter against SupportedLanguage enum in backend/src/app/api/v1/invitation_ai.py
- [ ] T021 [US3] Add error handling for unsupported language codes with user-friendly message

**Checkpoint**: All core user stories (1, 2, 3) should now be independently functional

---

## Phase 6: User Story 4 - Language Selection in Invitation Templates (Priority: P3)

**Goal**: Users can filter templates by language compatibility and see which languages each template supports

**Independent Test**: Browse templates with Telugu filter applied, verify only templates with Telugu in supported_languages appear

### Implementation for User Story 4

- [ ] T022 [P] [US4] Add language filter dropdown to template selector component (location TBD based on existing template UI)
- [ ] T023 [US4] Filter templates by supported_languages array when language filter is applied
- [ ] T024 [US4] Show warning when selected language is not in template's supported_languages array
- [ ] T025 [US4] Pre-populate template content in user's selected invitation language when available

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T026 [P] Run quickstart.md validation - test all 12 languages in AI generator
- [ ] T027 [P] Test RTL layout thoroughly with Urdu invitations (preview and public pages)
- [ ] T028 [P] Verify font loading performance (< 500ms target)
- [ ] T029 Code cleanup and remove any duplicate language definitions
- [ ] T030 Update any hardcoded "English" or "en" defaults to use SUPPORTED_LANGUAGES[0]

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 and US2 are both P1 priority - can proceed in parallel
  - US3 depends on US1 (needs language selection working)
  - US4 can proceed independently once Foundational is complete
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Independent of US1
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Works better if US1 is complete for testing
- **User Story 4 (P3)**: Can start after Foundational (Phase 2) - Independent of other stories

### Within Each User Story

- Frontend changes before integration testing
- Backend changes can run in parallel with frontend
- Core implementation before edge case handling

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (Phase 1)
- Foundational tasks T006 and T007 can run in parallel
- Once Foundational phase completes:
  - US1 and US2 can start in parallel (both P1)
  - T013, T018, T022 are marked [P] - can run in parallel across stories

---

## Parallel Example: Setup Phase

```bash
# Launch all font-related tasks together:
Task: "Add Google Fonts import for all Indic scripts in frontend/src/index.css"
Task: "Add font-lang-* CSS classes for all 12 languages in frontend/src/index.css"
Task: "Add RTL-specific styles for Urdu (.font-lang-ur) in frontend/src/index.css"
```

## Parallel Example: User Stories 1 & 2

```bash
# After Foundational phase, launch both P1 stories together:

# Developer A - User Story 1:
Task: "Update AITextGenerator.tsx to import SUPPORTED_LANGUAGES..."
Task: "Update InvitationWizard.tsx to import SUPPORTED_LANGUAGES..."

# Developer B - User Story 2:
Task: "Update PublicInvitationPage.tsx to import SUPPORTED_LANGUAGES..."
Task: "Add RTL layout support..."
```

---

## Implementation Strategy

### MVP First (User Story 1 + 2)

1. Complete Phase 1: Setup (fonts)
2. Complete Phase 2: Foundational (InvitationLanguageSelect, configs)
3. Complete Phase 3: User Story 1 (language selection during creation)
4. Complete Phase 4: User Story 2 (public page rendering)
5. **STOP and VALIDATE**: Test both stories independently
6. Deploy/demo if ready - users can create and view invitations in all languages

### Incremental Delivery

1. Complete Setup + Foundational -> Foundation ready
2. Add User Story 1 -> Test independently -> Demo: "Create invitation in Telugu"
3. Add User Story 2 -> Test independently -> Demo: "View Telugu invitation with proper fonts"
4. Add User Story 3 -> Test independently -> Demo: "AI generates Telugu content"
5. Add User Story 4 -> Test independently -> Demo: "Filter templates by language"

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Stories 1 & 3 (creation workflow)
   - Developer B: User Stories 2 & 4 (viewing and templates)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- No database changes required - existing schema supports feature
- All 12 languages already defined in SUPPORTED_LANGUAGES constant
- Key files to update: AITextGenerator.tsx, InvitationWizard.tsx, PublicInvitationPage.tsx, index.css, invitation_ai_service.py
