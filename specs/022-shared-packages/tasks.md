# Tasks: Shared Packages Infrastructure

**Input**: Design documents from `/specs/022-shared-packages/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: This feature includes test tasks (>90% coverage required per FR-034, cross-platform parity tests per FR-035).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**⚠️ ALL 94 TASKS ARE MANDATORY**: Every task is production-ready and required for feature completion. No shortcuts or MVP scope - complete all phases before merging.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **packages/**: Shared npm packages (new)
- **frontend/**: React TypeScript frontend
- **backend/**: Python FastAPI backend
- **services/invitations-service/**: Python microservice
- **scripts/**: Build and generation scripts

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize pnpm workspace and create package scaffolding

- [X] T001 Create pnpm-workspace.yaml at repository root with packages/, frontend, backend, services/* entries
- [X] T002 Update root package.json with workspaces scripts (build:packages, generate:python, test:packages, test:parity)
- [X] T003 [P] Create packages/ directory structure for all 4 shared packages
- [X] T004 [P] Create packages/shared-types/package.json with @rawdrive/shared-types name and workspace protocol
- [X] T005 [P] Create packages/shared-constants/package.json with @rawdrive/shared-constants name
- [X] T006 [P] Create packages/shared-validation/package.json with @rawdrive/shared-validation name and zod dependency
- [X] T007 [P] Create packages/shared-utils/package.json with @rawdrive/shared-utils name
- [X] T008 [P] Create packages/shared-types/tsconfig.json extending root TypeScript config
- [X] T009 [P] Create packages/shared-constants/tsconfig.json extending root TypeScript config
- [X] T010 [P] Create packages/shared-validation/tsconfig.json extending root TypeScript config
- [X] T011 [P] Create packages/shared-utils/tsconfig.json extending root TypeScript config
- [X] T012 Run pnpm install to link workspace packages

**Checkpoint**: Workspace configured, empty packages ready for implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Python generation infrastructure that ALL user stories with Python support depend on

**CRITICAL**: No Python generation can work until this phase is complete

- [X] T013 Create scripts/generate-python-types.ts for TypeScript to Python generation pipeline
- [X] T014 Install ts-json-schema-generator as dev dependency for JSON Schema generation
- [X] T015 Install datamodel-code-generator as Python dev dependency for Pydantic generation
- [X] T016 [P] Create backend/src/app/shared/__init__.py for generated Python module imports
- [X] T017 [P] Create services/invitations-service/src/shared/__init__.py for generated Python module imports
- [X] T018 Add generate:python script to root package.json calling scripts/generate-python-types.ts

**Checkpoint**: Python generation pipeline ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Developer Uses Shared Types (Priority: P1)

**Goal**: Create `@rawdrive/shared-types` package with all domain type definitions

**Independent Test**: Import `InvitationStatus` from `@rawdrive/shared-types`, verify TypeScript IntelliSense shows correct enum values and type checking works

### Tests for User Story 1

- [X] T019 [P] [US1] Create unit test for invitation types in packages/shared-types/tests/invitations.test.ts
- [X] T020 [P] [US1] Create unit test for gallery types in packages/shared-types/tests/gallery.test.ts
- [X] T021 [P] [US1] Create unit test for gradient types in packages/shared-types/tests/gradient.test.ts
- [X] T022 [P] [US1] Create unit test for common types in packages/shared-types/tests/common.test.ts

### Implementation for User Story 1

- [X] T023 [P] [US1] Implement invitation types (InvitationStatus, RSVPStatus, EventType, TemplateCategory, GuestStatus) in packages/shared-types/src/invitations.ts
- [X] T024 [P] [US1] Implement gallery types (GalleryStatus, DownloadPolicy, ThemeMode, LayoutStyle, AssetStatus) in packages/shared-types/src/gallery.ts
- [X] T025 [P] [US1] Implement gradient types (ColorStop, GradientType, GradientConfiguration) in packages/shared-types/src/gradient.ts
- [X] T026 [P] [US1] Implement common types (PaginationMeta, PaginatedResponse, ErrorResponse, SuccessResponse) in packages/shared-types/src/common.ts
- [X] T027 [US1] Create barrel export in packages/shared-types/src/index.ts exporting all types
- [X] T028 [US1] Configure package build with TypeScript declarations in packages/shared-types/package.json
- [X] T029 [US1] Verify package builds and exports work with pnpm build --filter @rawdrive/shared-types

**Checkpoint**: @rawdrive/shared-types package complete and independently testable

---

## Phase 4: User Story 2 - Developer Uses Shared Constants (Priority: P1)

**Goal**: Create `@rawdrive/shared-constants` package with all configuration constants

**Independent Test**: Import `API_BASE` and `STORAGE.GB` from `@rawdrive/shared-constants`, verify values match expected `/api/v1` and `1073741824`

### Tests for User Story 2

- [X] T030 [P] [US2] Create unit test for API constants in packages/shared-constants/tests/api.test.ts
- [X] T031 [P] [US2] Create unit test for storage constants in packages/shared-constants/tests/storage.test.ts
- [X] T032 [P] [US2] Create unit test for threshold constants in packages/shared-constants/tests/thresholds.test.ts

### Implementation for User Story 2

- [X] T033 [P] [US2] Implement API constants (API_VERSION, API_BASE, WORKSPACE_PATHS, PUBLIC_PATHS) in packages/shared-constants/src/api.ts
- [X] T034 [P] [US2] Implement storage constants (STORAGE, FILE_LIMITS, STORAGE_KEYS) in packages/shared-constants/src/storage.ts
- [X] T035 [P] [US2] Implement threshold constants (AI_THRESHOLDS, PAGINATION, RATE_LIMITS) in packages/shared-constants/src/thresholds.ts
- [X] T036 [US2] Create barrel export in packages/shared-constants/src/index.ts exporting all constants
- [X] T037 [US2] Configure package build in packages/shared-constants/package.json
- [X] T038 [US2] Verify package builds with pnpm build --filter @rawdrive/shared-constants

**Checkpoint**: @rawdrive/shared-constants package complete and independently testable

---

## Phase 5: User Story 3 - Developer Uses Shared Validation (Priority: P2)

**Goal**: Create `@rawdrive/shared-validation` package with regex patterns, Zod schemas, and sanitizers

**Independent Test**: Import `isValidHexColor` and test with valid `#FF5733` (true) and invalid `#GGGGGG` (false)

### Tests for User Story 3

- [X] T039 [P] [US3] Create unit test for patterns in packages/shared-validation/tests/patterns.test.ts
- [X] T040 [P] [US3] Create unit test for Zod schemas in packages/shared-validation/tests/schemas.test.ts
- [X] T041 [P] [US3] Create unit test for sanitizers in packages/shared-validation/tests/sanitizers.test.ts

### Implementation for User Story 3

- [X] T042 [P] [US3] Implement regex patterns (HEX_COLOR, UUID_V4, EMAIL, PHONE, URL, SLUG) and validators in packages/shared-validation/src/patterns.ts
- [X] T043 [P] [US3] Implement Zod schemas (hexColorSchema, uuidSchema, emailSchema, colorStopSchema, gradientConfigSchema, paginationSchema) in packages/shared-validation/src/schemas.ts
- [X] T044 [P] [US3] Implement sanitizers (sanitizeHtml, sanitizeFilename, sanitizeSlug) in packages/shared-validation/src/sanitizers.ts
- [X] T045 [US3] Create barrel export in packages/shared-validation/src/index.ts
- [X] T046 [US3] Configure package build with Zod peer dependency in packages/shared-validation/package.json
- [X] T047 [US3] Verify package builds with pnpm build --filter @rawdrive/shared-validation

**Checkpoint**: @rawdrive/shared-validation package complete with XSS sanitization

---

## Phase 6: User Story 4 - Developer Uses Shared Utilities (Priority: P2)

**Goal**: Create `@rawdrive/shared-utils` package with date and format utilities

**Independent Test**: Call `formatRelativeDate(Date.now() - 7200000)` and verify output is "2 hours ago"

### Tests for User Story 4

- [X] T048 [P] [US4] Create unit test for date utilities in packages/shared-utils/tests/date.test.ts
- [X] T049 [P] [US4] Create unit test for format utilities in packages/shared-utils/tests/format.test.ts

### Implementation for User Story 4

- [X] T050 [P] [US4] Implement date utilities (formatRelativeDate, formatDateISO, formatDateTime) in packages/shared-utils/src/date.ts
- [X] T051 [P] [US4] Implement format utilities (formatFileSize, formatNumber, formatPercentage, truncate) in packages/shared-utils/src/format.ts
- [X] T052 [US4] Add dependency on @rawdrive/shared-constants in packages/shared-utils/package.json for STORAGE constants
- [X] T053 [US4] Create barrel export in packages/shared-utils/src/index.ts
- [X] T054 [US4] Verify package builds with pnpm build --filter @rawdrive/shared-utils

**Checkpoint**: @rawdrive/shared-utils package complete with cross-platform utilities

---

## Phase 7: User Story 6 - Python Backend Consumes Shared Types (Priority: P2)

**Goal**: Generate Python Pydantic models from TypeScript types, integrate with backend and microservice

**Independent Test**: Import `InvitationStatus` from `app.shared.types` in Python, verify enum values match TypeScript exactly

### Tests for User Story 6

- [X] T055 [P] [US6] Create parity test fixture generator in packages/shared-types/tests/generate_fixtures.py
- [X] T056 [P] [US6] Create TypeScript parity test in packages/shared-types/tests/parity.test.ts reading fixtures
- [X] T057 [P] [US6] Create Python parity test in backend/tests/test_shared_types_parity.py

### Implementation for User Story 6

- [X] T058 [US6] Generate JSON Schema from TypeScript types using ts-json-schema-generator in scripts/generate-python-types.ts
- [X] T059 [US6] Generate Pydantic models from JSON Schema using datamodel-codegen in scripts/generate-python-types.ts
- [X] T060 [US6] Copy generated Python modules to packages/shared-types/generated/python/types.py
- [X] T061 [US6] Copy generated constants to packages/shared-constants/generated/python/constants.py
- [X] T062 [US6] Copy generated validation to packages/shared-validation/generated/python/validation.py
- [X] T063 [US6] Symlink/copy generated modules to backend/src/app/shared/ directory
- [X] T064 [US6] Symlink/copy generated modules to services/invitations-service/src/shared/ directory
- [X] T065 [US6] Run pnpm generate:python and verify all Python modules generated correctly
- [X] T066 [US6] Run Python import tests to verify generated modules work

**Checkpoint**: Python Pydantic models generated and importable in all Python services

---

## Phase 8: User Story 5 - Zero Downtime Migration (Priority: P1)

**Goal**: Migrate frontend, backend, and microservice to use shared packages with zero breaking changes

**Independent Test**: Run existing test suites (pnpm test, pytest) and verify all pass without modification

### Tests for User Story 5

- [X] T067 [US5] Verify frontend test suite passes before migration with pnpm --filter rawdrive-frontend test
- [X] T068 [US5] Verify backend test suite passes before migration with cd backend && pytest
- [X] T069 [US5] Verify invitations-service test suite passes before migration

### Implementation for User Story 5 - Frontend

- [X] T070 [P] [US5] Add shared packages as workspace dependencies to frontend/package.json
- [X] T071 [US5] Update frontend/src/types/invitations.ts to re-export from @rawdrive/shared-types with deprecation notice
- [X] T072 [US5] Update frontend/src/types/gallery.ts to re-export from @rawdrive/shared-types with deprecation notice
- [X] T073 [US5] Update frontend/src/types/gradient.ts to re-export from @rawdrive/shared-types with deprecation notice
- [X] T074 [US5] Update frontend/src/constants/api.ts to re-export from @rawdrive/shared-constants
- [X] T075 [US5] Update frontend/src/constants/gallery.ts to re-export from @rawdrive/shared-constants
- [X] T076 [US5] Update frontend/src/validation/profileEditor.ts to import hexColorSchema from @rawdrive/shared-validation
- [X] T077 [US5] Update frontend/src/utils/date.ts to re-export from @rawdrive/shared-utils
- [X] T078 [US5] Verify frontend builds with pnpm --filter rawdrive-frontend build
- [ ] T079 [US5] Verify frontend tests pass with pnpm --filter rawdrive-frontend test

### Implementation for User Story 5 - Backend

- [X] T080 [US5] Update backend/src/app/api/schemas.py to import from app.shared.types instead of local definitions
- [X] T081 [US5] Update backend/src/app/api/invitation_schemas.py to import enums from app.shared.types
- [X] T082 [US5] Update backend/src/app/utils/client_token.py to import UUID validation from app.shared.validation
- [ ] T083 [US5] Verify backend tests pass with cd backend && pytest

### Implementation for User Story 5 - Microservice

- [X] T084 [US5] Update services/invitations-service/src/schemas/guest.py to import from shared module
- [X] T085 [US5] Update services/invitations-service/src/schemas/rsvp.py to import from shared module
- [ ] T086 [US5] Verify invitations-service tests pass

**Checkpoint**: All services migrated with zero breaking changes, all tests pass

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: CI/CD integration, documentation, and cleanup

- [ ] T087 [P] Create .github/workflows/shared-packages.yml for CI build and test of packages
- [ ] T088 [P] Add bundle size check to CI (fail if >5KB gzipped per package)
- [ ] T089 [P] Update CLAUDE.md with shared packages documentation section
- [ ] T090 [P] Update frontend/package.json to depend on @rawdrive/shared-* packages via workspace protocol
- [ ] T091 Create codemod script in scripts/codemods/update-imports.ts for automated import migration
- [ ] T092 Update .gitignore to exclude generated Python files if desired
- [ ] T093 Run full test suite (pnpm test:packages && pnpm test:parity && pnpm test) to verify everything works
- [ ] T094 Run quickstart.md validation steps to verify setup instructions work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS Python generation
- **User Stories 1-4 (Phases 3-6)**: All depend on Setup only (TypeScript packages)
- **User Story 6 (Phase 7)**: Depends on Foundational (Phase 2) AND User Stories 1-4 (needs types to generate)
- **User Story 5 (Phase 8)**: Depends on ALL packages being complete (Phases 3-7)
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Setup - Core types package
- **User Story 2 (P1)**: Can start after Setup - Constants package (no deps on US1)
- **User Story 3 (P2)**: Can start after Setup - Validation package (no deps on US1/US2)
- **User Story 4 (P2)**: Depends on US2 (uses STORAGE constants from shared-constants)
- **User Story 5 (P1)**: Depends on US1, US2, US3, US4, US6 - Migration requires all packages
- **User Story 6 (P2)**: Depends on US1-US4 being complete (generates Python from TypeScript)

### Within Each User Story

- Tests written FIRST, verify they fail before implementation
- Implementation tasks with [P] can run in parallel
- Non-[P] tasks depend on prior tasks in sequence
- Verify build succeeds at checkpoint

### Parallel Opportunities

**Setup Phase (12 parallel tasks possible)**:
- T003-T011 can all run in parallel (creating package scaffolding)

**Foundational Phase (2 parallel tasks)**:
- T016, T017 can run in parallel (creating __init__.py files)

**User Stories 1-3 (Fully Parallel)**:
- US1, US2, US3 can all proceed in parallel (different packages)
- Within each story, test tasks are parallel, type implementation tasks are parallel

**User Story 4**:
- Depends on US2 completion (needs shared-constants)
- Can run in parallel with US3 if US2 is done

---

## Parallel Example: User Story 1 & 2 Simultaneously

```bash
# Developer A: User Story 1 (Types)
Task: T019-T022 # All test files in parallel
Task: T023-T026 # All type files in parallel
Task: T027-T029 # Sequential barrel export and build

# Developer B: User Story 2 (Constants) - Simultaneously
Task: T030-T032 # All test files in parallel
Task: T033-T035 # All constant files in parallel
Task: T036-T038 # Sequential barrel export and build
```

---

## Implementation Strategy

### Required Execution Order (All Phases Mandatory)

1. **Phase 1: Setup** → **Phase 2: Foundational** (sequential - blocks all Python work)
2. **Phases 3-5: User Stories 1-3** can run in parallel (independent TypeScript packages)
3. **Phase 6: User Story 4** depends on US2 completion (uses STORAGE constants)
4. **Phase 7: User Story 6** (Python generation) after all TS packages complete
5. **Phase 8: User Story 5** (Migration) after Python generation complete
6. **Phase 9: Polish** - CI/CD, documentation, final validation

**⚠️ NO PHASE CAN BE SKIPPED** - All 9 phases must complete before feature merge.

### Task Counts (All Mandatory)

| Phase | Tasks | Parallelizable |
|-------|-------|----------------|
| Setup | 12 | 10 |
| Foundational | 6 | 2 |
| US1: Types | 11 | 8 |
| US2: Constants | 9 | 6 |
| US3: Validation | 9 | 6 |
| US4: Utilities | 7 | 4 |
| US6: Python Gen | 12 | 3 |
| US5: Migration | 20 | 1 |
| Polish | 8 | 4 |
| **Total** | **94** | **44** |

---

## Notes

- [P] tasks = different files, no dependencies (can be parallelized)
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD approach)
- Commit after each task or logical group
- Validate at each checkpoint before proceeding
- Migration (US5) is last because it requires all packages to be ready
- **ALL 94 TASKS MUST COMPLETE** before feature branch can be merged to main
