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
| **Quick run command** | `cd frontend && pnpm test --run src/components/features/profile/` |
| **Full suite command** | `cd frontend && pnpm test --run && docker exec rawdrive-backend pytest tests/` |
| **Estimated runtime** | ~30 seconds (frontend), ~60 seconds (backend) |

---

## Sampling Rate

- **After every task commit:** Run `cd frontend && pnpm test --run src/components/features/profile/`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | FNDTN-01 | integration | `docker exec rawdrive-backend pytest tests/test_avatar_r2.py` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | FNDTN-02 | unit | `cd frontend && pnpm test --run src/components/features/profile/shared/AvatarWithFallback.test.tsx` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 1 | FNDTN-03 | unit | `cd frontend && pnpm test --run src/components/features/profile/shared/UnifiedThemeEngine.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 1 | FNDTN-04 | unit | `cd frontend && pnpm test --run src/components/features/profile/shared/PublicProfileRenderer.test.tsx` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 2 | FNDTN-05 | smoke | `cd frontend && pnpm test --run src/tests/smoke/profile-pages.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_avatar_r2.py` — stubs for FNDTN-01 (avatar R2 upload/serve)
- [ ] `frontend/src/components/features/profile/shared/AvatarWithFallback.test.tsx` — stubs for FNDTN-02 (fallback rendering)
- [ ] `frontend/src/components/features/profile/shared/UnifiedThemeEngine.test.ts` — stubs for FNDTN-03 (theme resolution)
- [ ] `frontend/src/components/features/profile/shared/PublicProfileRenderer.test.tsx` — stubs for FNDTN-04 (shared renderer)
- [ ] `frontend/src/tests/smoke/profile-pages.test.tsx` — stubs for FNDTN-05 (smoke tests)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Avatar displays correctly after upload on live page | FNDTN-01 | R2 integration requires live service | Upload avatar, navigate to /u/:slug, verify image renders |
| Theme visual appearance matches design | FNDTN-03 | Visual correctness not automatable | Select each PREBUILT theme, verify CSS vars apply correctly |
| Both /u/ and /p/ render consistently | FNDTN-04 | Visual layout comparison | Open both routes side-by-side, verify shared sections look identical |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
