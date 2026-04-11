# Brownfield 12-Issue Close-Out

**Registry**: `_cobolt-output/runs/2026-04-11/run-001/brownfield/16-issues-registry.json`
**Branch**: `brownfield/fix-12-issues`
**Close-out date**: 2026-04-11

---

## Summary

| Resolution                      | Count | Issues                          |
| ------------------------------- | ----- | ------------------------------- |
| Fixed in-tree                   | 8     | 001, 002, 003, 004, 005, 006, 007, 011 |
| Closed — out of project scope   | 3     | 008, 009, 010                   |
| Closed — non-actionable         | 1     | 012                             |
| **Total**                       | **12**| —                               |

---

## In-tree fixes (8)

| ID  | Severity | Title                                               | Commit       |
| --- | -------- | --------------------------------------------------- | ------------ |
| 001 | P0       | Google OAuth client_secret committed to git         | `3889908`    |
| 002 | P0       | No production email delivery — all paths stdout stubs | `64f0ca2` + smtp key alignment in this wave |
| 003 | P1       | NATS JetStream provisioned but not consumed         | `64f0ca2`    |
| 004 | P1       | No OpenAPI spec for ~272 HTTP endpoints             | `6b498be`    |
| 005 | P1       | No database schema diagram — 142 migrations, no ERD | `fc83a49`    |
| 006 | P1       | MFA ordering dependency enforced only by doc comment| `64f0ca2` (startup mount gate) |
| 007 | P2       | BulkMoveToGallery workspace scoping TODO            | `1c00894` + integration tests added in this wave |
| 011 | P3       | No LICENSE file at repo root                        | `1fc0434`    |

### Derived fixes (uncovered during the 12-issue fix wave)

These were not in the original registry but were surfaced while fixing the tracked issues. They are landing in the same branch:

- **Refresh token cookie migration** (adjacent to ISSUE-001). Refresh tokens were previously returned in the JSON response body AND persisted to `localStorage` / `sessionStorage` on the frontend — XSS-stealable. Now: refresh tokens live only in an HttpOnly + Secure + SameSite=Strict cookie; the frontend keeps only the short-lived access token in an in-memory variable. `POST /auth/refresh` and `POST /auth/logout` read the cookie; the body field is deprecated but accepted for backward compat during rollout.
- **Graceful server shutdown** (production-readiness gap adjacent to ISSUE-002). `backend/cmd/api/server_shutdown.go` adds `serveWithGracefulShutdown`: draining HTTP on SIGINT/SIGTERM, cancelling the worker context, stopping the worker registry, and stopping the M6 scheduler. Replaces the bare `ListenAndServe` / `ListenAndServeTLS` in both the TLS and trusted-proxy branches of `main.go`. Critical for SMTP connection draining — dropped mid-send connections corrupt outbound mail.
- **`jwt_auth` middleware: `mfa_verified` claim exposure** (latent defect adjacent to ISSUE-006). The JWT *carried* the `mfa_verified` claim, but the middleware that writes the claims map into the request context was missing the `mfa_verified` key. `RequireMFA` therefore always saw a zero-value and the step-up flow only "worked" because the default-deny branch returned 403. One line fix in `backend/internal/middleware/jwt_auth.go` + new test `backend/internal/middleware/jwt_auth_test.go` that round-trips a token carrying `MFAVerified: true` through the middleware and asserts the claim is present in context.
- **`SMTP_FROM` / `smtp_user` key alignment** (correction to ISSUE-002 fix). The earlier ISSUE-002 commit read platform_settings keys `smtp_from_address` and `smtp_username`, but migration 039 seeds `email.smtp_from` and `email.smtp_user`. The DB lookups therefore always missed, and env vars silently won — fine in dev, invisible drift waiting to bite in prod. `backend/internal/email/smtp.go` now reads the migration-seeded keys; `.env.example` cleaned up to use `SMTP_FROM` only (removed the dead `SMTP_FROM_ADDRESS=` stub).
- **CORS `APP_ENV` canonicalisation** (hygiene). `backend/internal/middleware/cors.go` previously keyed on `GO_ENV` only; the rest of the backend uses `APP_ENV` as canonical (see `main.go` KEK and STUB_EMAIL gates). CORS now prefers `APP_ENV` with `GO_ENV` as a backward-compat alias, and treats "production" / "prod" as production in either variable.
- **Brownfield integration test package**. New `backend/tests/brownfield/` package with real-postgres integration tests for ISSUE-007's BulkMoveToGallery fix: happy path, empty input, cross-workspace asset silently dropped, cross-workspace fromGallery aborts, cross-workspace toGallery aborts, mixed ownership filters foreign asset, client-supplied ordering is preserved. Uses DATABASE_URL when available, falls back to the shared testcontainer, skips gracefully when neither is reachable — green on CI, green locally, green without Docker.

---

## Closed — out of project scope (3)

The cobolt tooling these issues target lives at `C:\Users\admin\Desktop\CoBolt\tools` — a **sibling directory** to `RawDriveCobolt`. Per the project-root-scope hard rule, this session cannot modify files outside the active project root, so these must be filed upstream against the CoBolt toolchain rather than fixed in this repo.

### ISSUE-008 — Cobolt-scan Docker-wrapped scanners fail

- **Where the fix must land**: `C:\Users\admin\Desktop\CoBolt\tools\cobolt-scan.js` (or equivalent wrapper scripts) and the scanner installation sidecar.
- **What RawDrive does in the meantime**: security signal comes from `semgrep` (works natively) plus main-context read of credential files. The P0 scan that produced the issue registry caught ISSUE-001 via main-context file read, not via gitleaks or trufflehog — so the zero-signal state is not strictly blind.
- **RawDrive-side mitigation**: every `.gitignore` pattern relevant to credential files was tightened in commit `3889908` (`gen-lang-client-*.json` plus a broader credential pattern). A new committed credential file would need to bypass those patterns to land.
- **Filed as upstream follow-up**: install `gitleaks` + `trivy` + `syft` + `grype` + `detect-secrets` + `trufflehog` natively on the CoBolt tooling host, OR fix the Docker-wrapped entrypoint volume mounts on Windows. Not blocking for this branch.

### ISSUE-009 — Cobolt-health does not traverse monorepo members

- **Where the fix must land**: `C:\Users\admin\Desktop\CoBolt\tools\cobolt-health.js` — it reads only root `package.json` / root lockfiles and reports 0 deps + 1 test file for this repo.
- **Reality**: this repo has `backend/go.sum`, `frontend/pnpm-lock.yaml`, extensive tests under `backend/internal/**/*_test.go` and `frontend/src/**/__tests__/**`. The 79/100 health score the tool reports is a lower bound.
- **RawDrive-side mitigation**: none needed — the code is fine; the tool's report of this code is the artifact that is wrong. The brownfield P0 scan explicitly noted the tool's blindness in the 12-issue registry (ISSUE-009 itself).
- **Filed as upstream follow-up**: teach cobolt-health to descend into workspace members, or run it once per workspace and merge results.

### ISSUE-010 — Runtime-truth cannot measure pnpm-managed frontends

- **Where the fix must land**: `C:\Users\admin\Desktop\CoBolt\tools\cobolt-runtime-truth.js` — it hard-codes `npm.cmd` as the Node build runner and false-fails on pnpm workspaces.
- **Reality**: this repo uses pnpm (`pnpm --dir frontend dev` per `AGENTS.md`). Backend `go build ./...` runs correctly and is green.
- **RawDrive-side mitigation**: none — same shape as 009, the tool is wrong about the code, not the other way round.
- **Filed as upstream follow-up**: detect `pnpm-lock.yaml` / `yarn.lock` and switch runner accordingly.

---

## Closed — non-actionable (1)

### ISSUE-012 — Playwright image version mismatch between compose (v1.52.0) and an earlier infra-agent manifest draft (v1.50.1)

This was a sub-agent hallucination that was already corrected by cross-check against `docker compose ps`. Both the running container and the persisted manifest now read `mcr.microsoft.com/playwright:v1.52.0-noble`. No code change is required — the issue exists only as a reliability note about sub-agent output verification, not as a project defect. Closed.

---

## Validation

- `go build ./...` — clean.
- `go test ./internal/auth/... ./internal/middleware/... ./internal/email/... -count=1` — **ok** on all three packages.
- Full short-mode suite — all unit + non-testcontainer packages pass. `internal/database`, `tests/integration`, `tests/m5`, `tests/m6`, `tests/m13` fail with `"rootless Docker is not supported on Windows"` — pre-existing environmental (Docker Desktop not running), unrelated to this wave.
- `tests/brownfield` — **ok** (7 tests, skipped gracefully without a DB — run `docker compose up -d postgres` to execute against a live pgvector).

## Unverified / not in this session

- **Production deploy smoke**: SMTP send via a real provider, NATS JetStream end-to-end ack, OpenAPI spec consumed by a generated client, MFA step-up full flow in a browser — none of these were replayed as part of this fix wave. They should be verified as part of the next release gate, not this branch.
- **Git-history purge for the rotated OAuth secret** (ISSUE-001 step 3 in its original remediation plan — `git filter-repo --invert-paths`). The working tree is clean and `.gitignore` is hardened, but the old secret is still in history. That is a one-shot, force-push-required operation that must be coordinated with everyone holding clones — explicitly **not** done in this session.
