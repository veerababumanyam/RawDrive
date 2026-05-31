# RawDrive Integration Audit — Remediation Summary

**Date:** 2026-05-31
**Branch:** `fix/integration-gaps-2026-05-31` (worktree `rawdrive-integration-fixes`, branched off the `security/oauth-viewer-stabilization` HEAD — **not** `main`)
**Scope:** OAuth/auth · customer/user/tenant data · uploader · gallery + the seams between them
**Method:** read-only multi-agent audit (58 agents, 4 area + 5 seam + adversarial verify) → TDD remediation in sequenced waves.

---

## 1. What the audit found

48 confirmed integration gaps (9 CRITICAL · 18 HIGH · 15 MEDIUM · 6 LOW), 1 refuted. The dominant theme: **systemic missing `workspace_id` ownership checks** (cross-tenant IDOR) across nearly every gallery-adjacent handler, compounded by the API connecting to Postgres as the **table-owner role**, which makes RLS inert (no DB backstop). Plus discrete CRITICALs: OAuth account-takeover via unverified-email linking, anonymous image-byte serving, advisory-only share-link PIN/expiry, and a non-functional impersonation "read-only" guarantee.

Full findings: [`report.md`](./report.md) · raw run: [`raw-audit-result.json`](./raw-audit-result.json).

---

## 2. What was fixed (cluster → resolution → commit)

| Cluster | Audit IDs | Resolution | Commit |
|---|---|---|---|
| **Foundation** | — | Shared `guardGalleryWorkspace`/`guardAssetWorkspace`; source-level **census test** enumerating every owner endpoint (RED→GREEN) | `8bc8a18` |
| **A — owner IDOR** | S2-G2..G5, S3-G3, AREA-GALLERY-1/4/5/6/7/8 | Workspace-ownership guard on **32 gallery/asset-id owner methods** (access, share, proofing, session, analytics, download, favorites, cover, design, asset, edge) — enforced after input validation, 404 on mismatch | `e397e23` |
| **A — child-id IDOR** | S2-G2(revoke), S2-G3, S2-G7, AREA-GALLERY-5/9 | **Atomic** workspace-scoped queries (`RevokeInWorkspace`, `UpdateStatusInWorkspace`, star/label/session/job/banner) — TOCTOU-free, 0 rows ⇒ 404 | `9a74324` |
| **B — asset linkage** | S2-G6, S3-G1/G2, AREA-UPLOADER-4 | DB-layer `INSERT…SELECT` joining galleries+assets on `workspace_id`; cross-tenant linkage rejected | `30162cc` |
| **F — OAuth takeover** | S1-G1 (CRIT), S1-G2/G3, S5-G2 | Reject Google `email_verified=false`; refuse auto-linking to **unverified** local accounts (defeats pre-registration takeover); migration 133 `UNIQUE(provider,provider_subject)` + subject-first resolution; state nonce bound to HttpOnly cookie (replay-proof); MFA token moved off the URL | `30162cc` |
| **J — API-key claims** | S5-G3 | `APIKeyAuth` now populates JWT claims (sub, workspace_id, role) | `30162cc` |
| **D — public delivery** | S4-G1 (CRIT), S4-G2 (CRIT), S4-G3, S4-G5/G6 | Storage proxy no longer serves bytes by key-shape (`authorizeThumbnailByte`); share-link verify binds a session that gates delivery (PIN/expiry/access-count enforced); `access_mode` enforced; metadata/face/guest-favorites gated | `3bcfac7` |
| **E — session durability** | S4-G4 | Gallery sessions are **stateless HMAC tokens** (KEK-managed key) valid on any node — replaces the per-process in-memory map | `3bcfac7` |
| **G — impersonation** | S5-G1 | `Impersonation` claim threaded mint→parse→context; `RejectImpersonationWrites` mounted after `JWTAuth` on tenant surfaces (403 on writes) | `893f50a` |
| **H — upload lifecycle** | S3-G4, S3-G5, AREA-UPLOADER-1/2/5/6 | Server-side gallery binding at finalize (migration 134, no orphans); reserved-bytes release; credit `ExpireAbandoned` worker; `completed_at` durability; derivative retry/dead-letter (migration 135) | `98934d9` |
| **I — workspace lifecycle** | AREA-CUSTOMER-1/2/3 | Atomic `CreateWithBootstrap` (workspace+members+quota in one tx); single canonical creation path; `state_id` sentinel/non-numeric rejected; `RequireState` hardened | `0603001` |
| **C — RLS backstop** | S2-G1 | **Safe, default-OFF** scaffolding (manual `ops/rls/` FORCE-RLS file outside auto-run migrations; `RLS_ENFORCED` flag; live-DB proof) + [ADR/runbook](./ADR-rls-backstop.md). Full enforcement deferred (needs connection-scoping refactor — see §4) | `a47518e` |
| **UX/frontend** | (D/G/H follow-ups) | Upload `gallery_id` binding; `?gs=` session token on protected images; SharePinGate; locked-shell states; impersonation banner; wireframes | `7cceac6` |

The refuted finding (S1-G4, "OAuth users diverge from registration invariant") was correctly dismissed — both premises were false in the actual code.

---

## 3. Verification

- **Backend:** `go build ./...` + `go vet ./...` clean; `go test ./...` green across all packages at every wave checkpoint (incl. live-DB testcontainer tests for workspace bootstrap and the RLS backstop). New tests added per cluster (IDOR census, OAuth hardening, migration 133/134/135, delivery gating, impersonation, upload lifecycle, atomic co-creation).
- **Frontend:** `pnpm build` PASS; eslint 0 errors on touched files; **+5 new tests pass, 24 failed == inherited pre-existing baseline (zero net-new regressions)**.
- **Discipline:** every wave was test-first (the RED census preceded the IDOR fixes), independently re-verified by the orchestrator, and committed only when green.

---

## 4. Residual follow-ups (tracked, not regressions)

1. **RLS full enforcement (C):** requires a connection-scoping refactor so `app.workspace_id` is bound to each repo's query connection (tx-scoped `SET LOCAL` or pool acquire/release with RESET) + a non-owner DB role. Gated behind `RLS_ENFORCED` (default off). Staged rollout in [ADR-rls-backstop.md](./ADR-rls-backstop.md). App-layer checks (Clusters A/B) are the **primary** control and are now comprehensive.
2. **Tables with no RLS at all:** `gallery_access_log` (the S2-G1 repro table), `burst_groups`, `download_events`, `duplicate_group_members`, `gallery_analytics_daily`, `gallery_carts`, `stream_chats` — need `workspace_id` denormalization or joined policies before enabling RLS.
3. **Pre-existing frontend test failures (24):** env/mock issues in revenue/users/ai/crm/gallery-sharing/workspace pages + a dealer-nav layout test — predate this work; out of scope.
4. **`pending-onboarding` sentinel** is duplicated as a string literal across ~10 files — consider a single shared constant.
5. **POST `/workspace`** is now correct + safe but appears unused; candidate for removal if multi-workspace self-serve is unsupported.

---

## 5. Production rollout notes

- Fixes live on `fix/integration-gaps-2026-05-31` (isolated worktree), **not** `main`.
- New env/secrets: gallery-session signing key auto-provisions into `platform_settings` (KEK-encrypted); `RLS_ENFORCED` defaults off.
- Migrations **133/134/135** are additive and auto-apply on deploy; `ops/rls/*.sql` is **manual** (never auto-applied).
- The `?gs=` image-token change matters because `/storage/*` is served cross-origin from the API; confirm CORS/origin config in the target environment.
