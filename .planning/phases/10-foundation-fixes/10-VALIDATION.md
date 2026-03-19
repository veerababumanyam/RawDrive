---
phase: 10
slug: foundation-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (frontend), pytest (backend) |
| **Config file** | `frontend/vitest.config.ts`, `backend/pytest.ini` |
| **Quick run command** | `cd frontend && pnpm test --run src/components/features/profile` |
| **Full suite command** | `cd frontend && pnpm test --run && docker exec rawdrive-backend pytest tests/` |
| **Estimated runtime** | ~30 seconds (frontend), ~60 seconds (backend) |

---

## Sampling Rate

- **After every task commit:** Run quick run command (profile-related tests)
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | FNDTN-01 | integration | `docker exec rawdrive-backend pytest tests/test_avatar_upload.py` | W0 | pending |
| 10-01-02 | 01 | 1 | FNDTN-02 | component | `cd frontend && pnpm test --run src/components/features/profile/Avatar.test.tsx` | W0 | pending |
| 10-02-01 | 02 | 1 | FNDTN-03 | component | `cd frontend && pnpm test --run src/components/features/profile/UnifiedThemeEngine.test.ts` | W0 | pending |
| 10-03-01 | 03 | 2 | FNDTN-04 | component | `cd frontend && pnpm test --run src/components/features/profile/PublicProfileRenderer.test.tsx` | W0 | pending |
| 10-04-01 | 04 | 2 | FNDTN-05 | smoke | `cd frontend && pnpm test --run src/tests/smoke/profile.smoke.test.tsx` | W0 | pending |

---

## Wave 0 Requirements

- [ ] `frontend/src/components/features/profile/__tests__/Avatar.test.tsx` -- stubs for FNDTN-01, FNDTN-02
- [ ] `frontend/src/components/features/profile/__tests__/UnifiedThemeEngine.test.ts` -- stubs for FNDTN-03
- [ ] `frontend/src/components/features/profile/__tests__/PublicProfileRenderer.test.tsx` -- stubs for FNDTN-04
- [ ] `frontend/src/tests/smoke/profile.smoke.test.tsx` -- stubs for FNDTN-05
- [ ] `backend/tests/test_avatar_upload.py` -- stubs for FNDTN-01 backend

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Avatar displays after upload | FNDTN-01 | R2 storage pipeline requires live service | Upload avatar via UI, refresh page, verify image loads from R2 URL |
| Theme visual consistency | FNDTN-03 | CSS custom property rendering requires visual inspection | Apply each theme preset, verify colors match design tokens |
| Public page renders correctly | FNDTN-04 | Full page rendering with theme + avatar requires browser | Visit /u/:slug and /p/:slug, verify shared renderer output |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
