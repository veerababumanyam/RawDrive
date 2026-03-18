---
phase: 4
slug: rate-limiting
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-18
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 7.x (inside Docker) |
| **Config file** | `backend/pyproject.toml` |
| **Quick run command** | `docker exec rawdrive-backend pytest tests/security/test_a2a_rate_limit.py -x -v --timeout=30` |
| **Full suite command** | `docker exec rawdrive-backend pytest tests/security/ -x -v --timeout=60` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 01 | 1 | RATE-01..04 | unit | `pytest tests/security/test_a2a_rate_limit.py --collect-only` | ❌ W0 | ⬜ pending |
| 04-01-T2 | 01 | 1 | RATE-01..04 | integration | `pytest tests/security/test_a2a_rate_limit.py -x -v` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/security/test_a2a_rate_limit.py` — stubs for RATE-01, RATE-02, RATE-03, RATE-04
- [ ] `backend/tests/security/conftest.py` — shared fixtures (already exists from Phase 1)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Log-only mode produces structured log entries | RATE-04 | Log output inspection | Set A2A_RATE_LIMIT_MODE=log_only, send requests, check structured logs |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
