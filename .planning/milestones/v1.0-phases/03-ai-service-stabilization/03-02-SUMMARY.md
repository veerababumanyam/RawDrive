---
phase: 03-ai-service-stabilization
plan: 02
subsystem: api
tags: [lazy-imports, cv2, numpy, pil, fastapi, tdd]

requires:
  - phase: 03-01
    provides: "Lazy imports for model/service layer files (clip_embedder, real_esrgan, face_detection_service, face_embedding_service)"
provides:
  - "Lazy cv2/numpy/PIL imports in api/v1/faces.py — API layer no longer triggers heavy ML imports at startup"
  - "Regression tests covering full api.v1 import chain (TestApiLayerLazyImports)"
affects: [ai-ml-integration, microservice-development]

tech-stack:
  added: []
  patterns: [lazy-import-in-function-body, future-annotations-for-type-hints, type-checking-guard]

key-files:
  created: []
  modified:
    - services/ai-processing-service/src/api/v1/faces.py
    - services/ai-processing-service/tests/test_lazy_imports.py

key-decisions:
  - "Used from __future__ import annotations (PEP 563) to keep np.ndarray type hints without importing numpy at module level"
  - "Added TYPE_CHECKING guard for numpy import used only in type annotations"

patterns-established:
  - "Lazy import pattern: heavy ML libs (cv2, numpy, PIL) imported inside function bodies, not at module top level"
  - "TYPE_CHECKING guard pattern for type-hint-only imports in API layer files"

requirements-completed: [AIS-03]

duration: 2min
completed: 2026-03-18
---

# Phase 03 Plan 02: API Layer Lazy Imports Summary

**Closed AIS-03 gap: moved eager cv2/numpy/PIL imports in faces.py to function bodies with TDD regression tests**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T21:13:36Z
- **Completed:** 2026-03-18T21:15:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added 3 regression tests (TestApiLayerLazyImports) proving the api.v1 import chain does not trigger cv2/numpy/PIL
- Moved all 3 top-level heavy imports (cv2, numpy, PIL) into the 5 function bodies that use them
- Added `from __future__ import annotations` and `TYPE_CHECKING` guard for type-safe lazy imports
- All 14 tests pass (7 lazy import + 4 health + 3 database)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add API-layer lazy import regression tests (TDD RED)** - `0f93ab2d` (test)
2. **Task 2: Make cv2/numpy/PIL imports lazy in faces.py (TDD GREEN)** - `f6ef27ed` (feat)

## Files Created/Modified
- `services/ai-processing-service/tests/test_lazy_imports.py` - Added TestApiLayerLazyImports with 3 tests covering cv2, numpy, PIL import isolation
- `services/ai-processing-service/src/api/v1/faces.py` - Moved cv2/numpy/PIL from top-level to function bodies; added future annotations and TYPE_CHECKING guard

## Decisions Made
- Used `from __future__ import annotations` (PEP 563) so `np.ndarray` return type hints remain as strings without requiring numpy at import time
- Added `TYPE_CHECKING` guard for numpy used only in type annotations, consistent with pattern from 03-01 (clip_embedder.py)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- AIS-03 fully satisfied: importing api.v1 (and main.py) no longer triggers cv2, numpy, or PIL loads
- Phase 03 (ai-service-stabilization) is complete with all 5/5 truths verified
- Ready for Phase 04 (rate-limiting-and-abuse-prevention) or Phase 06 (AI wiring)

## Self-Check: PASSED

- FOUND: services/ai-processing-service/src/api/v1/faces.py
- FOUND: services/ai-processing-service/tests/test_lazy_imports.py
- FOUND: .planning/phases/03-ai-service-stabilization/03-02-SUMMARY.md
- FOUND: commit 0f93ab2d
- FOUND: commit f6ef27ed

---
*Phase: 03-ai-service-stabilization*
*Completed: 2026-03-18*
