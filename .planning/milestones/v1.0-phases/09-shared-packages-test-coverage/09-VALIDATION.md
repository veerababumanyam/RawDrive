---
phase: 9
slug: shared-packages-test-coverage
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-19
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Backend Framework** | pytest 7.x (inside Docker) |
| **Frontend Framework** | Vitest 1.x + React Testing Library |
| **Backend quick run** | `docker exec rawdrive-backend pytest tests/ -x -v --timeout=30` |
| **Frontend quick run** | `cd frontend && pnpm test --run` |
| **Package build** | `pnpm build:packages` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run relevant test suite
- **After every plan wave:** Run full backend + frontend test suites
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 09-01-T1 | 01 | 1 | PKG-01 | build | `cd packages/api-types && pnpm build` | ⬜ pending |
| 09-01-T2 | 01 | 1 | PKG-02 | build | `cd packages/database-utils && pnpm build` | ⬜ pending |
| 09-02-T1 | 02 | 1 | TEST-01..03 | integration | `docker exec rawdrive-backend pytest tests/integration/ -x -v` | ⬜ pending |
| 09-02-T2 | 02 | 1 | TEST-01..03 | integration | same | ⬜ pending |
| 09-03-T1 | 03 | 1 | TEST-05..06 | component | `cd frontend && pnpm test --run` | ⬜ pending |
| 09-03-T2 | 03 | 1 | TEST-05..06 | component | same | ⬜ pending |
| 09-04-T1 | 04 | 1 | TEST-04,07 | unit/integ | `docker exec rawdrive-backend pytest tests/ -x -v` | ⬜ pending |
| 09-04-T2 | 04 | 1 | TEST-04,07 | unit/integ | same | ⬜ pending |

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements (pytest, vitest, tsup, tsc already configured)

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Notes

- TEST-05 gallery-viewing portion is already covered by 19 existing test files in `frontend/src/components/features/gallery/__tests__/`. Plan 09-03 focuses on the missing upload and auth page tests.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
