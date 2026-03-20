---
phase: 12-editor-redesign
plan: 01
subsystem: ui, api, database
tags: [react, useReducer, tanstack-query, dnd-kit, alembic, jsonb, auto-save]

# Dependency graph
requires:
  - phase: 10-foundation-fixes
    provides: "Personal/company profile services, SectionRegistry, profileEditor types"
provides:
  - "ProfileEditorContext with useReducer state management"
  - "useProfileAutoSave hook with 2s debounce and TanStack mutation"
  - "section_order JSONB column on personal_profiles and company_profiles"
  - "@dnd-kit/core, @dnd-kit/sortable, react-best-gradient-color-picker installed"
affects: [12-editor-redesign]

# Tech tracking
tech-stack:
  added: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities", "react-best-gradient-color-picker"]
  patterns: ["useReducer+Context for editor state", "ref-based debounce for auto-save"]

key-files:
  created:
    - "frontend/src/contexts/ProfileEditorContext.tsx"
    - "frontend/src/hooks/useProfileAutoSave.ts"
    - "frontend/src/hooks/useProfileAutoSave.test.ts"
    - "backend/migrations/versions/0200_add_section_order.py"
  modified:
    - "frontend/package.json"
    - "backend/src/app/repositories/personal_profile_repository.py"
    - "backend/src/app/services/company_profile_service.py"
    - "backend/src/app/api/company_profile_schemas.py"
    - "backend/src/app/api/personal_profile_schemas.py"
    - "backend/migrations/versions/0101_extend_layout_style_enum.py"

key-decisions:
  - "Migration numbered 0200 (not 0101 as planned) to follow existing chain 0199->0101->0102->0200"
  - "Used separate state/dispatch contexts for ProfileEditor to minimize re-renders"
  - "Auto-save uses ref-based mutate to avoid useEffect dependency churn with TanStack mutations"

patterns-established:
  - "ProfileEditorContext: split state/dispatch contexts pattern for editor features"
  - "useProfileAutoSave: ref-based debounce with serialized data key for change detection"

requirements-completed: [EDITR-01, EDITR-06]

# Metrics
duration: 9min
completed: 2026-03-20
---

# Phase 12 Plan 01: Editor Foundation Summary

**ProfileEditorContext with useReducer state, 2s auto-save hook via TanStack mutation, section_order JSONB migration, and DnD/gradient-picker packages installed**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-20T05:40:26Z
- **Completed:** 2026-03-20T05:49:30Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- ProfileEditorContext provides form state via useReducer with SET_FIELD, SET_THEME, SET_DEVICE_MODE, SET_SECTION_ORDER, RESET, MARK_SAVED, SET_SAVING actions
- useProfileAutoSave hook with 2s debounce, TanStack Query mutation, and 4 passing tests
- section_order JSONB column added to both personal_profiles and company_profiles with default ["header","bio","contact","socials"]
- Backend PATCH endpoints accept and persist section_order for both profile types

## Task Commits

Each task was committed atomically:

1. **Task 1: Install npm packages and create ProfileEditorContext with auto-save** - `e703f051` (feat)
2. **Task 2: Alembic migration for section_order and backend PATCH support** - `a9f6d8b5` (feat)

## Files Created/Modified
- `frontend/src/contexts/ProfileEditorContext.tsx` - Editor state context with useReducer, provider, and hooks
- `frontend/src/hooks/useProfileAutoSave.ts` - Debounced auto-save hook using TanStack Query mutation
- `frontend/src/hooks/useProfileAutoSave.test.ts` - 4 tests for auto-save behavior
- `frontend/package.json` - Added @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, react-best-gradient-color-picker
- `backend/migrations/versions/0200_add_section_order.py` - Alembic migration adding section_order JSONB
- `backend/src/app/repositories/personal_profile_repository.py` - Added section_order to allowed/jsonb fields
- `backend/src/app/services/company_profile_service.py` - Added section_order to update and _map_row
- `backend/src/app/api/company_profile_schemas.py` - Added section_order to Update request and Response
- `backend/src/app/api/personal_profile_schemas.py` - Added section_order to Update request and Response

## Decisions Made
- Migration numbered 0200 instead of 0101 (plan reference) because migration chain had grown to 0199->0101->0102 from later phases
- Used split state/dispatch contexts (EditorStateContext + EditorDispatchContext) to minimize re-renders when only dispatch is needed
- Auto-save hook uses ref-based mutate function and JSON-serialized data key to avoid useEffect dependency issues with TanStack Query

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed broken down_revision in 0101_extend_layout_style_enum migration**
- **Found during:** Task 2 (migration creation)
- **Issue:** Migration 0101_extend_layout_style_enum.py had `down_revision = "0199_add_company_logo_r2_keys"` (filename) instead of `"0199"` (revision ID), breaking the Alembic chain
- **Fix:** Changed down_revision to `"0199"`
- **Files modified:** backend/migrations/versions/0101_extend_layout_style_enum.py
- **Verification:** Alembic heads command resolves correctly
- **Committed in:** a9f6d8b5 (Task 2 commit)

**2. [Rule 3 - Blocking] Applied migration via direct SQL due to pre-existing HNSW index failure**
- **Found during:** Task 2 (migration execution)
- **Issue:** `alembic upgrade head` failed at migration 0198 (HNSW vector index) due to missing pgvector extension -- pre-existing issue unrelated to this plan
- **Fix:** Applied section_order columns via direct SQL, migration file kept for future environments
- **Files modified:** None (database change only)
- **Verification:** Confirmed columns exist via information_schema query

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes necessary to complete migration. No scope creep.

## Issues Encountered
- Auto-save test failures with `vi.useFakeTimers`: synchronous `act(() => vi.advanceTimersByTime())` didn't flush React effects properly. Fixed by using `await act(async () => vi.advanceTimersByTime())` pattern.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Editor foundation complete: context, auto-save, section ordering all in place
- Plan 12-02 can build DnD section reordering on top of ProfileEditorContext and section_order
- Plan 12-03 can build color picker and theme customization using the context's SET_THEME action

## Self-Check: PASSED

All files verified present. All commit hashes verified in git log.

---
*Phase: 12-editor-redesign*
*Completed: 2026-03-20*
