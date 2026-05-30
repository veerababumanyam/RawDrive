# RawDrive — Dependency & Library Version Audit / Update Plan

**Date:** 2026-05-30
**App version:** `rawdrive` v0.0.65 (milestone context per `cobolt-state.json`)
**Scope:** Every dependency manifest in the monorepo — Go modules, frontend npm (Next.js app), root + e2e npm, Python sidecar + Robot tests, container base images, and dev-plane Docker images.
**Method:** Read every manifest in-repo, then verified each "latest stable" against live sources on 2026-05-30 (npm registry JSON, `proxy.golang.org` / `pkg.go.dev`, PyPI JSON, Docker Hub tags, official release/EOL pages, `pkg.go.dev/vuln` + NVD/GHSA advisories). No version below is guessed from training data except the four explicitly flagged **VERIFY** items.
**Type:** Documentation-only. No builds run, no upgrades applied. This is a planning artifact.

---

## 0. Executive summary

**The application is already remarkably current.** A previous bump wave moved the repo onto the newest majors: Go 1.26.2, Next.js 16.2.3, React 19.2.4, Tailwind v4, Vitest 4, Node 22 LTS base images, AWS SDK v1.41.x, pgx v5.9.x. For the large majority of packages, the caret ranges already *permit* the latest — a lockfile refresh (`pnpm update` / `go get -u`), not a manifest edit, picks them up.

So this is **not** a "we are years behind" situation. The real work is narrow and falls into four buckets:

| Bucket | Count | Urgency |
|---|---|---|
| **🔴 Security patches** (sitting on a version with a published advisory, or a security patch release available) | 5 | Do this sprint |
| **🟡 Reproducibility / drift** (floating tags, Playwright version sprawl) | 4 | Do this sprint — cheap |
| **🟢 Routine in-range bumps** (caret already allows; lockfile refresh) | ~30 | Batch monthly |
| **🔵 Held-back majors** (real migration effort or unproven — schedule deliberately) | 6 | Plan, don't rush |

**Top 5 actions, in order:**
1. **`jackc/pgx/v5` v5.9.1 → v5.9.2** — fixes CVE-2026-33816 (pgproto3 memory safety) **and** GHSA-j88v-2chj-qfwx (SQL injection via simple-protocol dollar-quoted strings). This is the only *direct* dependency in the repo currently on a version with an open advisory.
2. **Go toolchain + image `go1.26.2 → go1.26.3`** — 2026-05-07 stdlib security release (`net/http`, `crypto/tls`, `html/template`, …). Bump `go.mod` and `backend/Dockerfile`.
3. **Pin the three floating Docker tags** — `axllent/mailpit:latest`, `nats:2-alpine`, `python:3.11-slim` are non-reproducible and silently drift.
4. **Align Playwright to one version (1.60.0)** — runner and Docker image must match or E2E breaks; today there are three different pins.
5. **Patch the base images** — `alpine:3.20.3→3.20.10`, `node:22.11.0→22.22.3`, `golang:1.26.2→1.26.3` are all behind on in-branch security patches; confirm the `pgvector:pg16` image carries **pgvector 0.8.2** (fixes CVE-2026-3172).

---

## 1. 🔴 Security-priority items (do this sprint)

| # | Component | Current | Target | Advisory / reason |
|---|---|---|---|---|
| S1 | `github.com/jackc/pgx/v5` | v5.9.1 | **v5.9.2** | **CVE-2026-33816** (memory-safety in pgproto3) + **GHSA-j88v-2chj-qfwx** (SQLi via simple-protocol dollar-quoted strings). Fixed in 5.9.2. |
| S2 | Go toolchain (`go.mod` + `backend/Dockerfile`) | go1.26.2 | **go1.26.3** | 2026-05-07 stdlib security release. Only Go 1.26.x and 1.25.x receive security fixes; ≤1.24 is EOL. |
| S3 | `alpine` (backend runtime image) | 3.20.3 | **3.20.10** (or move to 3.23.x line) | Several in-branch CVE roll-ups missed. 3.20 branch still supported. |
| S4 | `node` (frontend image, 3 stages) | 22.11.0-bookworm-slim | **22.22.3-bookworm-slim** | In-branch security patches. Node 22 = maintenance LTS (EOL 2027-04-30). |
| S5 | `pgvector/pgvector:pg16` (extension) | pg16 / pgvector 0.8.x | confirm **0.8.2** build | pgvector **0.8.2 fixes CVE-2026-3172** (buffer overflow in parallel HNSW index builds). Tag swap, not a DB migration. |

**Already safe — keep an eye on, no action:**
- `golang-jwt/jwt/v5` is on **v5.3.1** — past CVE-2025-30204 (fixed v5.2.2). ✅
- `golang.org/x/crypto` is on **v0.49.0** — past the 2024–2025 SSH advisories (CVE-2024-45337, -2025-22869, -58181, -47914; all fixed ≤v0.45.0). ✅ (RawDrive runs no in-process SSH server, so runtime exposure was low regardless.)
- `python-multipart` 0.0.20 is past CVE-2024-53981 (fixed 0.0.18). The related Starlette multipart DoS (CVE-2025-54121) is transitive via FastAPI — folds in when FastAPI is bumped (see §6). ✅

---

## 2. 🟡 Reproducibility & version-drift items (do this sprint — low effort)

| # | Issue | Where | Fix |
|---|---|---|---|
| D1 | **Floating `:latest`** | `docker-compose.yml` → `axllent/mailpit:latest` | Pin `axllent/mailpit:v1.30.1`. Dev-only SMTP, but recent releases carry CVE fixes (websocket auth CVE-2026-22689, SSRF CVE-2026-27808). |
| D2 | **Floating major tag** | `docker-compose.yml` → `nats:2-alpine` | Pin `nats:2.14.1-alpine`. Note v2.12+ disabled insecure TLS ciphers by default (validate). |
| D3 | **Floating minor tag** | `services/face-svc/Dockerfile` → `python:3.11-slim` | Pin `python:3.11.x-slim` (e.g. `3.11.15-slim`). This is the *only* base image without a patch pin — contradicts the backend/frontend Dockerfiles, which deliberately pin and document why. |
| D4 | **Playwright version sprawl** | root `playwright ^1.54.0`, `e2e/@playwright/test ^1.52.0`, image `v1.52.0-noble`, `_cobolt-docker/` compose | Align **all** to **1.60.0** (npm) / `mcr.microsoft.com/playwright:v1.60.0-noble`. The image version MUST match the test-runner or browsers aren't found. Base OS `noble` is already correct. Mind the v1.55 breaking change (Chromium MV2 extension support dropped) when crossing it. |

---

## 3. Frontend — `frontend/package.json` (Next.js app, v0.0.65)

Runtime stack is current. Everything below is in-range of its caret unless noted; a `pnpm update` refreshes the lockfile.

### dependencies
| Package | Current | Latest | Type | Notes |
|---|---|---|---|---|
| next | 16.2.3 | **16.2.6** | patch | LTS line. **16.2.6 batched 13 security advisories** — worth the patch even though it's "just" a patch. Bump `eslint-config-next` in lockstep. |
| react | 19.2.4 | **19.2.6** | patch | No v20. |
| react-dom | 19.2.4 | **19.2.6** | patch | Match react. |
| lucide-react | ^1.7.0 | **1.17.0** | minor (in-range) | Library moved from the old `0.xxx` scheme to semver `1.x` (1.0.0 on 2026-03-23). Caret already permits 1.17.0. |
| tailwind-merge | ^3.5.0 | **3.6.0** | minor (in-range) | Correctly on the v3 line for Tailwind v4. |
| clsx | ^2.1.1 | 2.1.1 | — | Current. |
| qrcode | ^1.5.4 | 1.5.4 | — | Current (dormant but stable). |
| react-dropzone | ^15.0.0 | 15.0.0 | — | Current. |
| class-variance-authority | ^0.7.1 | 0.7.1 | — | Current, but **dormant ~2 yrs** (Snyk flags as possibly discontinued). No CVE. Watch for a maintained successor; low risk today. |

### devDependencies
| Package | Current | Latest | Type | Notes |
|---|---|---|---|---|
| eslint-config-next | 16.2.3 | **16.2.6** | patch | Move with `next`. Now defaults to ESLint Flat Config (aligns with upcoming ESLint v10). |
| @vitejs/plugin-react | ^6.0.1 | **6.0.2** | patch (in-range) | v6 uses Oxc (no Babel dep). Requires Node 20.19+/22.12+ — satisfied. |
| jsdom | ^29.0.2 | **29.1.1** | patch (in-range) | — |
| vitest | ^4.1.3 | **4.1.7** | patch (in-range) | ✅ Now correctly declared (was previously missing). v4 line, supports Vite 8. |
| @types/react | ^19 | 19.2.x | in-range | — |
| @types/react-dom | ^19 | 19.2.x | in-range | — |
| @types/node | ^20 | 20.x latest | in-range | Intentionally tracks the Node 20 type line; fine to keep on `^20`. |
| @tailwindcss/postcss | ^4 | 4.1.7 | in-range | — |
| tailwindcss | ^4 | 4.1.7 | in-range | — |
| @testing-library/react | ^16.3.2 | 16.3.2 | — | Current. |
| @testing-library/jest-dom | ^6.9.1 | 6.9.1 | — | Current. |
| @types/qrcode | ^1.5.6 | 1.5.6 | — | Current. |
| sharp | ^0.34.5 | 0.34.5 | — | Current (0.35.0-rc.5 exists as `next`; wait for stable). |
| eslint | ^9 | 9.x | in-range | ESLint v10 looms (will drop legacy `.eslintrc`); plan for it. |
| typescript | ^5 | 5.x | in-range | Next 16 needs TS ≥ 5.1. |

---

## 4. Root + E2E npm

| Manifest | Package | Current | Latest | Type | Notes |
|---|---|---|---|---|---|
| root `package.json` | playwright | ^1.54.0 | **1.60.0** | minor | See D4 — align with image + e2e. |
| `e2e/package.json` | @playwright/test | ^1.52.0 | **1.60.0** | minor | See D4. Keep == `playwright`. |
| `e2e/package.json` | @axe-core/playwright | ^4.11.1 | **4.11.2 / 4.11.3** | patch | Routine. |

Root `engines`: `node >=20.0.0`. **Recommend raising the floor to `>=22`** — Node 20 is maintenance-only (active support ended 2026-04-30); Node 24 is the current Active LTS. Standardize CI/runtime on Node 24 when convenient.

---

## 5. Backend — `backend/go.mod` (Go 1.26.2)

Direct dependencies. Most are one patch/minor behind; a `go get -u ./... && go mod tidy` handles the routine ones.

| Module | Current | Latest | Type | Notes |
|---|---|---|---|---|
| `jackc/pgx/v5` | v5.9.1 | **v5.9.2** | patch | 🔴 **SECURITY — see S1.** |
| `aws/aws-sdk-go-v2` | v1.41.5 | v1.41.9 | patch | — |
| `aws/aws-sdk-go-v2/config` | v1.32.14 | v1.32.20 | patch | — |
| `aws/aws-sdk-go-v2/credentials` | v1.19.14 | v1.19.19 | patch | — |
| `aws/aws-sdk-go-v2/service/s3` | v1.99.0 | v1.102.2 | minor | S3-compatible driver (B2). No advisory. |
| `go-chi/chi/v5` | v5.2.5 | **v5.3.0** | minor | Adds `ClientIP` middleware (security-hardened replacement for `RealIP`). Relevant to the in-progress `internal/middleware/client_ip_test.go`. |
| `nats-io/nats.go` | v1.50.0 | v1.52.0 | minor | — |
| `redis/go-redis/v9` | v9.18.0 | v9.20.0 | minor | — |
| `golang.org/x/crypto` | v0.49.0 | v0.52.0 | minor | Past all known CVEs already; bump is hygiene. |
| `golang.org/x/image` | v0.39.0 | v0.41.0 | minor | — |
| `golang-jwt/jwt/v5` | v5.3.1 | v5.3.1 | — | Current & safe. |
| `google/uuid` | v1.6.0 | v1.6.0 | — | Current. |
| `pquerna/otp` | v1.5.0 | v1.5.0 | — | Current (TOTP). |
| `disintegration/imaging` | v1.6.2 | v1.6.2 | — | 🔵 **Abandoned ~6.5 yrs** (last release 2019-11-16). See §7. |
| `rwcarlsen/goexif` | (pseudo, 2019) | — | — | 🔵 **Confirmed unmaintained** (last commit 2019). Maintained alternatives: `dsoprea/go-exif`, `barasher/go-exiftool`. Plan migration alongside imaging. |
| `pgvector/pgvector-go` | v0.3.0 | v0.3.0 (no newer release surfaced) | — | Thin pgvector client; effectively current. Re-confirm with `go list -m -u github.com/pgvector/pgvector-go` if bumping. |
| `stretchr/testify` | v1.11.1 | v1.11.1 | — | ✅ Current (released 2025-08-27; v1 is API-stable, no v2 planned). Test-only. |
| `testcontainers/testcontainers-go` | v0.42.0 | v0.42.0 | — | ✅ Current (released 2026-04-09). Test-only. |
| `testcontainers/.../modules/postgres` | v0.42.0 | v0.42.0 | — | ✅ Current; keep == testcontainers-go. |

**Go toolchain:** 1.26.2 → **1.26.3** (🔴 S2). **Note:** there is no `stripe/stripe-go` in `go.mod` — payments are not a current Go dependency, so the "stripe v79→v85" concern from older notes is **N/A** here. If/when added, use `github.com/stripe/stripe-go/v85` directly.

---

## 6. Python — `services/face-svc/requirements.txt` (face-detection sidecar, `python:3.11-slim`)

This is the highest-risk surface to bump because the CV/ML stack is tightly coupled. **Do not bump piecemeal — numpy + opencv + onnxruntime + insightface move as one set, then re-run `backend/internal/face/client_test.go` + verify buffalo_l model load.**

| Package | Current | Latest | Type | Notes |
|---|---|---|---|---|
| fastapi | 0.115.6 | 0.136.3 | minor | Pulls newer Starlette → resolves transitive CVE-2025-54121. Safe within 2.x/0.1xx line. |
| uvicorn[standard] | 0.34.0 | 0.48.0 | minor | Routine. |
| python-multipart | 0.0.20 | 0.0.29 | patch | Already past CVE-2024-53981; bump for hardening. |
| pydantic | 2.10.4 | 2.13.4 | minor | v2-internal, no v1→v2 break. |
| opencv-python-headless | 4.10.0.84 | 4.13.0.92 | minor | Pin together with numpy. |
| onnxruntime | 1.20.1 | 1.26.0 | minor | Dropped Python <3.11 — image is fine. Re-test model load. |
| **numpy** | 1.26.4 | **2.4.6** | 🔵 **MAJOR (ABI break)** | 1.x is frozen at 1.26.4. NumPy 2.0 broke the C ABI. **Hold at 1.26.4** until onnxruntime + opencv + insightface all confirm numpy-2 support. The Dockerfile even pre-installs `numpy==1.26.4` for insightface's source build. |
| **insightface** | 0.7.3 | **1.0.1** | 🔵 **MAJOR (brand-new, unproven)** | First release in ~3 yrs (1.0 + 1.0.1 both on 2026-05-23). API/model packaging may have changed; `requires_python` unset. The in-file comment "0.7.3 is the latest stable" is now stale. Pilot in a branch; do not adopt blindly. |

## 6b. Python — `tests/robot/requirements.txt` (Robot Framework E2E)

| Package | Current | Latest | Type |
|---|---|---|---|
| robotframework | 7.4.2 | 7.4.2 | — current |
| robotframework-requests | 0.9.7 | 0.9.7 | — current |
| robotframework-seleniumlibrary | 6.8.0 | 6.9.0 | minor |
| webdriver-manager | 4.0.2 | 4.1.1 | minor |
| selenium | 4.43.0 | 4.44.0 | minor |

All low-risk, test-only. Keep `selenium` and `seleniumlibrary` compatible.

---

## 7. Container base images

| Image | Where | Current | Latest / target | Action |
|---|---|---|---|---|
| `golang` | `backend/Dockerfile` build | 1.26.2-alpine | **1.26.3-alpine** | 🔴 S2 — bump with `go.mod`. |
| `alpine` | `backend/Dockerfile` runtime | 3.20.3 | **3.20.10** (or 3.23.x) | 🔴 S3. |
| `node` | `frontend/Dockerfile` ×3 | 22.11.0-bookworm-slim | **22.22.3-bookworm-slim** | 🔴 S4. Keep the 3 stages identical; keep `pnpm@9.15.9` in sync with `packageManager`. |
| `python` | `services/face-svc/Dockerfile` | 3.11-slim (floating) | **3.11.x-slim** (pin) | 🟡 D3. onnxruntime needs ≥3.11; staying on 3.11 is fine, just pin the patch. |

**Dev-plane (`docker-compose.yml`) images:**

| Image | Current | Latest | Recommendation |
|---|---|---|---|
| `pgvector/pgvector:pg16` | PG16 + pgvector 0.8.x | PG18.4 GA; pgvector 0.8.2 | 🔴 Confirm 0.8.2 (CVE-2026-3172). PG16→17/18 is a real DB major (pg_upgrade + reindex pgvector) — 🔵 schedule, don't rush; PG16 isn't near EOL. |
| `valkey/valkey:8-alpine` | 8.x | **9.1.0** | 🔵 v9 is a major; pin latest 8.x now, schedule 9.x evaluation. |
| `nats:2-alpine` | floating 2.x | 2.14.1 | 🟡 D2 — pin `2.14.1-alpine`. |
| `axllent/mailpit:latest` | floating | v1.30.1 | 🟡 D1 — pin. |
| `mcr.microsoft.com/playwright:v1.52.0-noble` | 1.52.0 | v1.60.0-noble | 🟡 D4 — align with npm. |

---

## 8. Recommended phased rollout

**Wave 1 — Security & drift (this sprint, low risk, high value)**
- S1 pgx → v5.9.2; S2 Go → 1.26.3 (`go.mod` + image); S3 alpine → 3.20.10; S4 node → 22.22.3; S5 confirm pgvector 0.8.2.
- D1–D4: pin mailpit, nats, python base; align Playwright to 1.60.0 everywhere.
- Run `go test ./...`, `pnpm test`, and the dockerized Playwright suite. Each item is independently revertible.

**Wave 2 — Routine in-range refresh (batch, ~monthly)**
- Frontend: `pnpm update` (next 16.2.6, react 19.2.6, eslint-config-next 16.2.6, lucide 1.17, tailwind-merge 3.6, vitest 4.1.7, jsdom 29.1.1, plugin-react 6.0.2, …).
- Backend: `go get -u ./... && go mod tidy` (aws-sdk patches, chi 5.3.0, nats 1.52, go-redis 9.20, x/crypto 0.52, x/image 0.41). Verify the 4 **VERIFY** modules with `go list -m -u`.
- Robot tests: bump selenium/seleniumlibrary/webdriver-manager.
- Raise root `engines.node` to `>=22`.

**Wave 3 — Held-back majors (plan individually, each its own branch + test cycle)**
- 🔵 numpy 2.x — only after the whole CV stack is numpy-2-ready (bump numpy+opencv+onnxruntime+insightface together).
- 🔵 insightface 1.0.1 — pilot; re-run face integration test + model load.
- 🔵 Valkey 9.x — major; functional test against cache layer.
- 🔵 Postgres 16 → 17/18 — DB major upgrade (pg_upgrade + pgvector reindex); schedule with a maintenance window.
- 🔵 Replace `disintegration/imaging` + `rwcarlsen/goexif` (abandoned) — evaluate `govips/v2` (libvips, native WebP encode — pairs well with the mandatory `cwebp` derivative pipeline) or `go-webp` + `x/image`, plus a maintained EXIF lib. Carry-forward, not urgent.
- 🔵 Watch ESLint v10 and `class-variance-authority` (dormant) for successor planning.

---

## 9. Notes & caveats

- **All backend modules are now live-confirmed.** `stretchr/testify` (v1.11.1) and `testcontainers-go` + its postgres module (v0.42.0) are already at latest; `pgvector/pgvector-go` (v0.3.0) shows no newer release; `rwcarlsen/goexif` is confirmed unmaintained (last commit 2019). Spot-check any time with `cd backend && go list -u -m all | grep '\['`.
- **Caret reality:** ranges like `^1.7.0` (lucide), `^4.1.3` (vitest), `^29.0.2` (jsdom), `^1.54.0` (playwright) already permit the latest — those are lockfile refreshes, not manifest edits.
- **No `STORAGE_DRIVER=local` / hardcoded-secret regressions** are introduced by any recommendation here; all bumps respect the architectural invariants in `AGENTS.md`.
- This audit changed **no code**. It is a plan; apply via the waves above.

### Quick command appendix (for whoever executes the waves)
```bash
# Backend — see what's behind, then refresh
cd backend && go list -u -m all | grep '\['
go get github.com/jackc/pgx/v5@v5.9.2      # Wave 1 security
go get -u ./... && go mod tidy             # Wave 2 routine
go test ./... -count=1

# Frontend — refresh within ranges
cd frontend && pnpm outdated && pnpm update && pnpm test

# Verify nothing floats in compose / Dockerfiles after pinning
grep -RnE ':latest|:[0-9]+-alpine\b|3\.11-slim' docker-compose*.yml */Dockerfile services/*/Dockerfile
```
