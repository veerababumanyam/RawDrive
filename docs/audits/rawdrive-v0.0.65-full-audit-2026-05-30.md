# RawDrive v0.0.65 — Full Codebase Audit

- **Date:** 2026-05-30
- **Auditor:** Claude Code (Opus 4.8, multi-agent orchestration)
- **Method:** 15 specialist finder agents + 15 adversarial verifiers (30 agents, agent teams)
- **Audited version:** `v0.0.65`
- **Audited branch:** `main`
- **Audited commit:** `1d2b6b6` (`1d2b6b6577a95bafe199184824768b89adcb77ca`)
- **Scale:** ~82K LOC Go backend (675 files, 28 packages), ~67K LOC Next.js frontend (423 files), 122 SQL migrations
- **Result:** **124 verified findings** out of 131 raw (7 false-positives rejected by adversarial verification)
- **Status:** ✅ Complete

---

## 1. Scope & Objective

Full-repo audit of the RawDrive monorepo for **bugs, configuration issues, performance issues, security vulnerabilities, database/migration discipline, and UI/design-system compliance**, requested via `/goal`.

Sources of truth: actual code under `backend/`, `frontend/`, `e2e/`, `deploy/`, `infra/`, `docker-compose.yml`; the binding invariants in `CLAUDE.md` / `AGENTS.md` / `frontend/AGENTS.md`; `design-tokens.json`; `backend/internal/database/migrations/**`; `backend/go.mod`; `frontend/package.json`. The stale top-level `README.md` was intentionally ignored.

## 2. Methodology — Agent Teams

Executed as a deterministic multi-agent workflow:

1. **Recon** — codebase scoped (LOC, package/route inventory, infra & dependency manifests) to give each agent a focused surface.
2. **Finder phase (15 agents, parallel)** — each owns one dimension, grounded in RawDrive's specific invariants, required to grep for anti-patterns then **open the file to confirm** and return findings with verbatim `file:line` evidence.
3. **Adversarial verify phase (15 agents)** — an independent skeptic re-opened every cited file and assigned a verdict. Findings whose evidence could not be reproduced were marked `false-positive` and excluded.
4. **Synthesis** — verified findings consolidated, de-duplicated, ranked by severity.

Verdict mix of included findings: **110 confirmed**, **13 likely**, **1 needs-human**. (`false-positive` excluded — see §6.)

## 3. Executive Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 7 |
| 🟠 High | 45 |
| 🟡 Medium | 46 |
| ⚪ Low | 26 |
| **Total** | **124** |

### Top risks (fix before next deploy)

- **[F-001] Password Reset Stores Plaintext Password** — `backend/internal/auth/auth.go`
- **[F-002] Invoice number UNIQUE constraint is global, not workspace-scoped — cross-workspace collisions** — `backend/internal/database/migrations/022_create_m4_billing_tables.up.sql`
- **[F-003] Platform Settings CRUD Missing RequirePlatformRole — Any Authenticated User Can Read/Write Secrets** — `backend/internal/handler/admin_settings_handler.go`
- **[F-004] ChangeRole Accepts Arbitrary Role Values — admin Can Escalate Users to super_admin** — `backend/internal/service/admin_user_service.go`
- **[F-005] R2 object orphaned when assetRepo.Create fails after CompleteMultipartUpload** — `backend/internal/handler/chunked_upload.go`
- **[F-006] workspaces.face_recognition_enabled ADD COLUMN migration is missing — migration 112 will fail on a fresh database** — `backend/internal/database/migrations/112_workspaces_face_recognition_default_true.up.sql`
- **[F-007] Cloudflare API token committed to tracked git file** — `docs/runbooks/BOOTSTRAP-KNOWN-ISSUES.md`

### Findings by dimension

| Dimension | Findings |
|-----------|----------|
| Backend · Error handling & observability | 12 |
| Backend · Performance & concurrency | 11 |
| Frontend · Design-token compliance | 11 |
| Config & Infrastructure | 10 |
| Backend · API/validation/errors | 10 |
| Frontend · Performance | 9 |
| Backend · Auth & JWT security | 8 |
| Backend · Billing/commerce | 8 |
| Dependencies & supply chain | 8 |
| Backend · Multi-tenant isolation | 7 |
| Frontend · React/Next correctness | 7 |
| Backend · Media pipeline | 6 |
| Database · Schema & migrations | 6 |
| Frontend · Security | 6 |
| Backend · Storage & hardcode-law | 5 |

---

## 4. Findings

Each finding: severity, dimension, verifier verdict, location, description, impact, recommendation, and the verbatim evidence the verifier reproduced.

### 🔴 Critical (7)

#### F-001 — Password Reset Stores Plaintext Password

- **Dimension:** Backend · Auth & JWT security
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/auth/auth.go` : 838
- **What:** PasswordService.ResetPassword passes the raw newPassword string directly to store.UpdatePassword without hashing it first. The PasswordStore interface names the parameter 'hashedPassword' and the production pgPasswordStore in main.go writes it verbatim into users.password_hash. After a successful password reset the column contains the plaintext password, meaning any SQL leak or DB read access immediately exposes all reset-path passwords.
- **Impact:** Complete plaintext exposure of every password changed via the forgot-password flow. Any read-access to the users table (backup, DB admin, SQL-injection) yields cleartext credentials.
- **Fix:** Hash newPassword using bcrypt (cost 12, matching the ChangePassword path in backend/internal/user/user.go line 171) before calling store.UpdatePassword: hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), 12); if err != nil { return err }; s.store.UpdatePassword(ctx, email, string(hashed)).
- **Verifier:** Reproduced the full chain. auth.go:838 passes raw newPassword. handler auth_password_reset_handler.go:108 passes body.NewPassword unhashed. Production store main.go:588-592 writes it verbatim to password_hash. grep confirms ZERO bcrypt/argon2/scrypt calls in auth.go or main.go, whereas user.go:171 (ChangePassword) DOES bcrypt-hash at cost 12 before storing — proving the reset path is the lone unhashed write. Genuine critical.
- **Evidence:**
  ```
  auth.go:838 `if err := s.store.UpdatePassword(ctx, email, newPassword); err != nil {` — newPassword arrives from handler line 108 (body.NewPassword, unmodified). main.go:588-592 pgPasswordStore.UpdatePassword runs `UPDATE users SET password_hash=$2 ... ` with the arg as-is. grep for bcrypt/GenerateFromPassword/argon2/scrypt in auth.go and main.go returns NOTHING.
  ```

#### F-002 — Invoice number UNIQUE constraint is global, not workspace-scoped — cross-workspace collisions

- **Dimension:** Backend · Billing/commerce
- **Category:** db  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/database/migrations/022_create_m4_billing_tables.up.sql` : 25
- **What:** The UNIQUE constraint on invoices.invoice_number is global across all workspaces: `CONSTRAINT invoices_number_unique UNIQUE (invoice_number)`. The number is generated as `INV-{FY}-{SEQ:06d}` where SEQ is a COUNT of that workspace's invoices in the FY. Two different workspaces both creating their first invoice in the same FY will independently compute SEQ=1 and both generate `INV-2024-25-000001`. The second INSERT fails with a raw DB unique-violation error surfaced verbatim to the user.
- **Impact:** Any new workspace creating its first invoice can fail with an opaque DB unique-violation error if another new workspace creates its first invoice in the same financial year. Production reliability bug for all new customers; the in-repo streaming_invoices table already shows the correct scoped constraint.
- **Fix:** Append a new migration changing the constraint to `UNIQUE (workspace_id, invoice_number)` (mirror migration 088). Per repo rules do NOT edit committed migration 022 — add NNN_scope_invoice_number_unique.up.sql / .down.sql. Optionally include a workspace prefix in the number to make collisions structurally impossible, as streaming_invoices does (`RD-{YYYYMM}-{wsprefix}-{NNNN}`).
- **Verifier:** Confirmed at migrations/022_create_m4_billing_tables.up.sql:25 — `CONSTRAINT invoices_number_unique UNIQUE (invoice_number)` is GLOBAL (no workspace_id). invoice_repo.go:201-209 generates the number as a per-workspace COUNT(*) over the FY then `INV-%s-%06d` with count+1, so two new workspaces both hit SEQ=000001 in the same FY. Strong corroborating evidence: the newer migration 088 (streaming_invoices.up.sql:89-90) uses the CORRECT `UNIQUE (workspace_id, invoice_number)` for the exact same per-workspace-COUNT scheme — proving the M4 table is the outlier and the fix pattern already exists in-repo. invoice_handler.go:101-108 surfaces the raw DB error verbatim as `{"error":"create invoice failed: <pg error>"}`, matching the finding's claimed opaque-error impact exactly. Severity critical is defensible: affects every workspace's first FY invoice on collision.
- **Evidence:**
  ```
  022:25 -> CONSTRAINT invoices_number_unique UNIQUE (invoice_number)
  invoice_repo.go:204-209 -> SELECT COUNT(*) FROM invoices WHERE workspace_id=$1 ...; return INV-%s-%06d, count+1
  CONTRAST 088:89-90 -> CONSTRAINT streaming_invoices_number_unique UNIQUE (workspace_id, invoice_number)
  invoice_handler.go:108 -> create invoice failed: %s, err.Error()
  ```

#### F-003 — Platform Settings CRUD Missing RequirePlatformRole — Any Authenticated User Can Read/Write Secrets

- **Dimension:** Backend · Multi-tenant isolation
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/admin_settings_handler.go` : 109-118
- **What:** RegisterAdminSettingsRoutes registers /api/v1/admin/settings/* on the JWT-only `api` group without RequirePlatformRole. Verified empirically that chi routes the request to this ungated subrouter, not the guarded /api/v1/admin one.
- **Impact:** Any authenticated workspace user can DELETE or OVERWRITE platform secrets (B2_APPLICATION_KEY, SMTP password, JWT signing config, PhonePe/Razorpay keys) via PUT/DELETE on /api/v1/admin/settings/{category}/{key}, and can enumerate setting keys/metadata. Enables feature sabotage and credential rotation/DoS. (GET secret values are masked to last-4.)
- **Fix:** Move registration inside RegisterAdminRoutes (under the /api/v1/admin sub-router that applies RequirePlatformRole), OR wrap the settings subrouter with r.Use(middleware.RequirePlatformRole("super_admin")) before registering routes. PUT/DELETE should require super_admin specifically. Note GET masks secrets but PUT/DELETE are the higher-severity exposure.
- **Verifier:** admin_settings_handler.go:109-118 registers /api/v1/admin/settings/* via r.Route with NO middleware; main.go:1989 calls RegisterAdminSettingsRoutes(api,...) where `api` (main.go:1389-1400) carries only JWTAuth+TenantContext+PlanTierContext — no RequirePlatformRole. The handler itself has zero role check (read whole file). I empirically tested chi precedence in an isolated module: GET /api/v1/admin/settings/categories routes to the UNGUARDED settings subrouter (status 200), NOT the /api/v1/admin guard (which returns 403) — the more-specific mount wins. So any authenticated user (photographer/client) can reach all 5 endpoints. Nuance: GET ListByCategory (lines 41-45) and GetSetting (lines 61-63) MASK secret values to last-4 chars, so plaintext secret READ is partially mitigated; but UpsertSetting (PUT) and DeleteSetting (DELETE) are fully open — any authenticated user can overwrite or delete B2/SMTP/payment/JWT settings. Confirmed.
- **Evidence:**
  ```
  admin_settings_handler.go:111 r.Route("/api/v1/admin/settings", ...) with no .Use; main.go:1989 RegisterAdminSettingsRoutes(api, platformSettingsRepo); main.go:1389-1400 api group = JWTAuth+TenantContext+PlanTierContext only. Isolated chi test: /api/v1/admin/settings/categories -> 200 (ungated), not 403.
  ```

#### F-004 — ChangeRole Accepts Arbitrary Role Values — admin Can Escalate Users to super_admin

- **Dimension:** Backend · Multi-tenant isolation
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/service/admin_user_service.go` : 211-223
- **What:** AdminUserService.ChangeRole does not validate newRole. The Create path blocks super_admin (line 283) but ChangeRole has no whitelist, and the DB CHECK constraint (migration 035) permits super_admin, so an admin-tier user can promote any account to super_admin.
- **Impact:** An admin-role user can promote any account (including their own collaborators) to super_admin, breaking the two-tier privilege model and enabling permanent backdoor super_admin accounts.
- **Fix:** In ChangeRole, before delegating to the repo, reject super_admin/superadmin and validate against an allowed-change-roles whitelist (mirror allowedCreateRoles). Consider restricting the PUT /users/{id}/role route to RequirePlatformRole("super_admin") only.
- **Verifier:** admin_user_service.go:211-223 ChangeRole does NO validation of newRole and calls userRepo.UpdateRole directly. UpdateRole (admin_user_repo.go:380-393) executes raw `UPDATE users SET platform_role = $1` with no whitelist. Migration 035 (035_add_platform_roles.up.sql:17-26) CHECK constraint explicitly permits 'super_admin', so the UPDATE succeeds. Compare Create (line 283) which rejects super_admin and applies allowedCreateRoles — ChangeRole has neither guard. The route PUT /users/{id}/role (admin_routes.go:80) sits under RequirePlatformRole("super_admin","admin"), so an admin-tier user reaches it. Handler (admin_users.go:264-284) passes body.Role straight through. Self-change is blocked (line 212-214) but escalating OTHER accounts to super_admin is fully open. Confirmed.
- **Evidence:**
  ```
  admin_user_service.go:211-217 (no validation, direct UpdateRole); admin_user_repo.go:381 `UPDATE users SET platform_role = $1 ... WHERE id = $2` (no whitelist); 035_add_platform_roles.up.sql:18-26 CHECK includes 'super_admin'; admin_routes.go:64,80 route under RequirePlatformRole("super_admin","admin").
  ```

#### F-005 — R2 object orphaned when assetRepo.Create fails after CompleteMultipartUpload

- **Dimension:** Backend · Media pipeline
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/chunked_upload.go` : 868-872
- **What:** In finalizeUpload(), CompleteMultipartUpload assembles the object in R2 (line 823), then if assetRepo.Create fails (line 869) the function returns an error WITHOUT calling h.store.Delete(). This leaves a fully-assembled R2 object with no corresponding assets DB row. The cleanup pattern IS applied for resolveFinalizeDigest (843) and verifyManifestAtFinalize (848) but was omitted here.
- **Impact:** Every transient Postgres write failure at finalize time permanently leaks a fully-assembled R2 binary (5MB-2GB) with no DB row to reclaim it. The multipart-abort sweeper cannot help because the multipart upload was already completed.
- **Fix:** Add `_ = h.store.Delete(ctx, storageKey)` immediately before the `return nil, fmt.Errorf("create asset: ...")` at line 870, mirroring lines 843/848.
- **Verifier:** Reproduced the asymmetry directly. CompleteMultipartUpload at line 823 assembles the object. resolveFinalizeDigest failure (843) and verifyManifestAtFinalize failure (848) both call `_ = h.store.Delete(ctx, storageKey)`. The assetRepo.Create path at 868-871 returns `fmt.Errorf("create asset: %w", err)` with NO h.store.Delete. The UploadSessionCleanupWorker.sweep (worker/upload_session_cleanup_worker.go:119-131) only calls AbortMultipartUpload, which is a no-op after Complete succeeded — so the composed binary is unreclaimable. Genuine orphan.
- **Evidence:**
  ```
  line 868-871:
  if h.assetRepo != nil {
      if err := h.assetRepo.Create(ctx, asset); err != nil {
          return nil, fmt.Errorf("create asset: %w", err)
      }
  }
  (no h.store.Delete, unlike lines 843 and 848)
  ```

#### F-006 — workspaces.face_recognition_enabled ADD COLUMN migration is missing — migration 112 will fail on a fresh database

- **Dimension:** Database · Schema & migrations
- **Category:** db  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/database/migrations/112_workspaces_face_recognition_default_true.up.sql` : 40-45
- **Impact:** Fresh DB setup (CI, staging, new Hostinger VPS) fails at migration 112; migrations 113-122 never apply. On a DB without the column, every call to public_gallery_handler.go:758, workspace_face_recognition_handler.go:47/:68 500-errors.
- **Fix:** Add a new appended migration (e.g. 123) with `ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS face_recognition_enabled BOOLEAN NOT NULL DEFAULT TRUE;` and `CREATE INDEX IF NOT EXISTS idx_workspaces_face_recognition_enabled ON workspaces(id) WHERE face_recognition_enabled = TRUE;`. IF NOT EXISTS makes it safe on existing prod DBs that already have the column. Add a migrations integration test that runs the full up sequence against a fresh DB to catch this class of break.
- **Verifier:** Reproduced. 112_...up.sql:40-45 runs `ALTER TABLE workspaces ALTER COLUMN face_recognition_enabled SET DEFAULT TRUE` + `UPDATE workspaces SET face_recognition_enabled = TRUE`. grep across all *.up.sql confirms NO `ADD COLUMN ... face_recognition_enabled` exists anywhere — only 111 and 112 reference the column, both assuming it pre-exists. Git history is conclusive: commit 7d918a0 'feat(face): ... migration 110' originally added it (`ADD COLUMN IF NOT EXISTS face_recognition_enabled BOOLEAN NOT NULL DEFAULT FALSE` + `CREATE INDEX ... idx_workspaces_face_recognition_enabled`), but slot 110 was later recycled for inquiry_messages (now 115) and the column-adding file was deleted. database.go Up() (line 89-91) Exec's raw SQL and returns the error on failure, halting the whole sequence — so on a fresh DB, 112 errors with 'column does not exist' and 113-122 never apply. Impact confirmed: public_gallery_handler.go:758, workspace_face_recognition_handler.go:47 & :68 SELECT/UPDATE this column and would 500 on a fresh DB. No migration test exercises the full up sequence, so this is uncaught by CI.
- **Evidence:**
  ```
  112_...up.sql:40 `ALTER TABLE workspaces ALTER COLUMN face_recognition_enabled SET DEFAULT TRUE;` | grep 'ADD COLUMN.*face_recognition' *.up.sql => no output | git show 7d918a0 line157: `+  ADD COLUMN IF NOT EXISTS face_recognition_enabled BOOLEAN NOT NULL DEFAULT FALSE;` (the lost original)
  ```

#### F-007 — Cloudflare API token committed to tracked git file

- **Dimension:** Config & Infrastructure
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `docs/runbooks/BOOTSTRAP-KNOWN-ISSUES.md` : 54
- **What:** A real Cloudflare API token is embedded verbatim in a git-tracked runbook, allowlisted in .gitleaks.toml so CI does not block. Grants Cloudflare DNS/WAF/zone access for rawdrive.in.
- **Impact:** Anyone with repo access can manipulate Cloudflare DNS/WAF for rawdrive.in. Even if revoked, history retention plus the path allowlist masks future leaks to the same file.
- **Fix:** Rotate the Cloudflare token now; replace the literal with a placeholder; tighten .gitleaks.toml from path-scope to commit-SHA scope; purge from history with git-filter-repo/BFG.
- **Verifier:** Reproduced exactly. BOOTSTRAP-KNOWN-ISSUES.md:54 contains the literal token `cfat_REDACTED_ROTATE_IN_CLOUDFLARE` verbatim. .gitleaks.toml allowlists this exact path (`^docs/runbooks/BOOTSTRAP-KNOWN-ISSUES\.md$`) and its own header block states 'Rotate every credential that was ever committed to these paths' and 'This allowlist unblocks CI. It does NOT make the exposure safe.' — the credential is acknowledged as not-yet-rotated. The file is tracked in the working tree. Genuine critical secret exposure.
- **Evidence:**
  ```
  BOOTSTRAP-KNOWN-ISSUES.md:54 — `8. **Also rotate the Cloudflare API Token** while you're there (`cfat_REDACTED_ROTATE_IN_CLOUDFLARE`)`; .gitleaks.toml paths list includes `'''^docs/runbooks/BOOTSTRAP-KNOWN-ISSUES\.md$'''`
  ```

### 🟠 High (45)

#### F-008 — X-Forwarded-For trusted unconditionally — all rate limiters can be bypassed by header spoofing

- **Dimension:** Backend · API/validation/errors
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/middleware/middleware.go` : 311-321
- **What:** The in-memory rate limiter (used by credLimiter, mfaVerifyLimiter, and the global 600/min limiter) extracts the client IP from X-Forwarded-For without validating that the request arrived through a trusted proxy. An attacker can set X-Forwarded-For: <arbitrary-IP> on a direct connection and rotate through fake IPs, defeating all rate limits including the 5/min auth brute-force guard.
- **Impact:** credLimiter (5/min auth brute-force guard) and mfaVerifyLimiter (10/min TOTP guard) are bypassable, enabling unlimited credential-stuffing and TOTP enumeration. The global 600/min limit is equally bypassable.
- **Fix:** Add a TRUSTED_PROXY_CIDR allowlist (e.g. 172.16.0.0/12, 10.0.0.0/8 for Docker). Only honor X-Forwarded-For/X-Real-IP when r.RemoteAddr falls within a trusted CIDR; otherwise key strictly on net.SplitHostPort(r.RemoteAddr). Apply in RateLimitWithReset so all three limiters inherit the fix.
- **Verifier:** middleware.go:311-321 reads X-Forwarded-For first (first hop), then X-Real-IP, then RemoteAddr — with NO trusted-proxy check. Both auth-protecting limiters route through this code: RateLimit (line 281-284) delegates to RateLimitWithReset (line 290), so mfaVerifyLimiter (main.go:1098, RateLimit(10,min)) and the global 600/min limiter (main.go:693) use it; credLimiter (main.go:1022, RateLimitWithReset(5,min)) uses it directly and wraps /auth/login, /auth/register, /auth/verify-otp, /auth/resend-otp, request/reset-password (main.go:1023-1046). A direct client can set an arbitrary X-Forwarded-For and rotate fake IPs to defeat every in-memory limit. Confirmed genuine.
- **Evidence:**
  ```
  ip := r.Header.Get("X-Forwarded-For") ... else if ip = r.Header.Get("X-Real-IP"); ip == "" { ip, _, _ = net.SplitHostPort(r.RemoteAddr) } — no TRUSTED_PROXY check (middleware.go:311-321)
  ```

#### F-009 — Public gallery PIN verify endpoint has no rate limit — brute-force PINs trivially

- **Dimension:** Backend · API/validation/errors
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/routes_m2.go` : 403
- **What:** POST /api/v1/public/galleries/{slug}/verify-pin is mounted with no PIN-specific rate-limit middleware, unlike the stream PIN endpoint which applies RequirePINRateLimit (5 attempts / 5 min). A numeric PIN can be enumerated with minimal throttling.
- **Impact:** A password-protected gallery PIN can be brute-forced (bounded only by the loose, spoofable 600/min global limit), exposing private galleries.
- **Fix:** Wrap the gallery verify-pin route with RequirePINRateLimit using the same NewMemoryPINRateLimiter(5, 5*time.Minute) pattern, keying on (IP, slug). Consider also keying the limiter on the share token/PIN target to avoid IP-rotation bypass.
- **Verifier:** routes_m2.go:403 mounts r.Post("/galleries/{slug}/verify-pin", publicHandler.VerifyPIN) as a bare call with no r.With(...) wrapper. By contrast routes_m8.go:108-109 wraps the stream verify-pin with middleware.RequirePINRateLimit(deps.PINRateLimiter). The gallery VerifyPIN handler itself (public_gallery_handler.go:392-409) has no internal throttling — it just calls shareSvc.VerifyPIN and returns {valid:bool}. Caveat: the global 600/min IP limiter (main.go:693) does still apply, so it is not literally zero throttling, but 600/min is far too loose for a 4-6 digit PIN and is itself spoofable per finding #1. Genuine gap.
- **Evidence:**
  ```
  routes_m2.go:403 — r.Post("/galleries/{slug}/verify-pin", publicHandler.VerifyPIN) [no .With wrapper]. Compare routes_m8.go:108-109 — r.With(middleware.RequirePINRateLimit(deps.PINRateLimiter)).Post("/{id}/verify-pin", streamHandler.VerifyPin). VerifyPIN handler (public_gallery_handler.go:392-409) has no internal attempt counter.
  ```

#### F-010 — Streaming recharge routes mounted on unauthenticated outer router — authenticated endpoints always return 401

- **Dimension:** Backend · API/validation/errors
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `backend/cmd/api/main.go` : 2016
- **What:** streamingrecharge.RegisterRoutes(r, ...) is called with the outer unauthenticated router instead of the authenticated api sub-router. The handler's RequireAuth checks claims that JWTAuth never injected on r, so all authenticated recharge/balance endpoints return 401.
- **Impact:** The entire streaming recharge purchase and balance-check flow is broken for all users — they cannot buy credits, view orders, or check balance. Super-admin refund is also dead.
- **Fix:** Pass the authenticated api router: streamingrecharge.RegisterRoutes(api, ...). Note the public packages + webhook routes inside RegisterRoutes intentionally need no auth, so either split them out or ensure the api group does not break them (api also adds TenantContext/RequireMFA which webhooks must not get) — cleanest is to register the public/webhook routes on r and only the auth group on api.
- **Verifier:** main.go:2016 calls streamingrecharge.RegisterRoutes(r, ...) passing the OUTER router r, while the immediately adjacent sibling registrations at lines 1989 (RegisterAdminSettingsRoutes(api,...)) and 1995 (streamingrate...RegisterAdminStreamingRoutes(api,...)) correctly use the api sub-router. The api group is r.Group(func(api chi.Router){...}) spanning lines 1389-2265, where JWTAuth+TenantContext are applied (1390-1391). Inside that closure r still references the outer chi.NewRouter() from line 668, whose middleware chain (671-693) has NO JWTAuth. recharge/handler.go:44-49 and 56-60 use g.Use(middleware.RequireAuth) (and RequirePlatformRole for refund); RequireAuth (middleware.go:355-363) returns 401 when JWTClaimsFromContext is nil, which it always is on the outer router. Routes use absolute paths so they resolve on r. Confirmed: POST /api/v1/streaming/recharge, GET /recharges, GET /balance, and the admin refund are permanently 401. (Public packages + webhooks on the same router are unaffected since they require no auth.)
- **Evidence:**
  ```
  main.go:2016 — streamingrecharge.RegisterRoutes(r, ...) [outer r]; cf. main.go:1989/1995 use api. recharge/handler.go:44-49 — g.Use(middleware.RequireAuth); g.Post("/api/v1/streaming/recharge",...). Outer r middleware (main.go:671-693) lacks JWTAuth. RequireAuth 401s on nil claims (middleware.go:355-363).
  ```

#### F-011 — MFA Bypass via Token Refresh After Workspace Change

- **Dimension:** Backend · Auth & JWT security
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/auth/handler.go` : 762-768
- **What:** The RefreshToken handler re-generates the access token from fresh workspace claims when the workspace has changed (e.g., after onboarding completes). The re-generated TokenClaims struct omits the MFAVerified field, so it defaults to false. A user who logged in with MFA (mfa_verified=true) will silently hold a downgraded token after their first post-onboarding refresh, bypassing any RequireMFA middleware gate on subsequent requests.
- **Impact:** MFA-enrolled users lose their mfa_verified=true claim on first token refresh after completing onboarding. All RequireMFA-protected routes become accessible without re-authenticating via TOTP — actually the inverse: the user is downgraded and would be re-challenged, but more importantly the claim is silently flipped, breaking the documented invariant that refresh must not downgrade MFA state.
- **Fix:** Carry the MFAVerified field from the parsed claims into the freshly-generated token: MFAVerified: claims.MFAVerified.
- **Verifier:** Confirmed at handler.go:762-768. ParseAccessToken (auth.go:356-364) populates claims.MFAVerified from the token, and RotateRefreshToken preserves MFA across rotation (auth.go:508,540) — so newAccess pre-overwrite is correct. The regeneration block then drops MFAVerified, defaulting false, and replaces newAccess at line 770. This directly violates the AGENTS.md invariant 'refresh token rotation preserves mfa_verified'. One-line fix as recommended. Genuine high.
- **Evidence:**
  ```
  handler.go:757 parses newAccess (which carries MFAVerified — RotateRefreshToken preserves it via entry.MFAVerified at auth.go:508/540). Then handler.go:762-768 GenerateAccessToken(TokenClaims{Sub, WorkspaceID, Role, PlatformRole, StateID}) — MFAVerified is omitted, defaulting to false (struct zero value), and overwrites newAccess at line 770.
  ```

#### F-012 — Google OAuth Login Bypasses TOTP Step-Up

- **Dimension:** Backend · Auth & JWT security
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/auth/handler.go` : 668-734
- **What:** OAuthGoogleCallback completes authentication and issues full tokens without checking whether the user has an active TOTP enrollment. The mfaEnrollments field is only consulted in the password Login handler (line 468). A user who enrolled TOTP can log in via Google and bypass the second factor entirely, receiving an access token with mfa_verified=false.
- **Impact:** OAuth login is a complete MFA-step-up bypass path for RawDrive's own second factor. A TOTP-enrolled user can log in via Google and receive a session with mfa_verified=false, never being prompted for TOTP. RequireMFA-protected routes would then re-challenge (good), but the design intent that enrolled users always step up is not honored on the OAuth path.
- **Fix:** After resolving the user identity in OAuthGoogleCallback, check h.mfaEnrollments (same logic as Login lines 468-485). If the user has a verified active enrollment, issue an MFA challenge and redirect the frontend to the TOTP step-up page instead of issuing full tokens.
- **Verifier:** Confirmed: OAuthGoogleCallback (handler.go:668-734) contains no mfaEnrollments/mfaHandler reference, while the password Login path gates on it at 468-486. The OAuth path issues a refresh token at line 719 with no step-up. Note the nuance: OAuth-issued tokens carry mfa_verified=false, so RequireMFA-gated routes are still blocked downstream — the bypass is of the *step-up prompt*, not necessarily of every gated route. Real inconsistency in the auth model worth fixing; high stands.
- **Evidence:**
  ```
  Login handler checks h.mfaEnrollments + h.mfaHandler and issues an mfa challenge (handler.go:468-486). OAuthGoogleCallback (handler.go:668-734) resolves the user (line 687) and goes straight to GenerateRefreshTokenWithClaims (line 719) / sets cookie / redirects — no mfaEnrollments lookup anywhere in the function.
  ```

#### F-013 — MFA Refresh Token Family ID Collision (All MFA Sessions Share One Family)

- **Dimension:** Backend · Auth & JWT security
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/auth/mfa_handler.go` : 478, 606
- **What:** Both VerifyTOTP and VerifyRecoveryCode generate a refresh token with family ID 'family-'+claims.Sub (a static, user-derived string). The password Login path (handler.go:501) and OAuth path (handler.go:719) both use 'family-'+uuid.New().String() (unique per session). Because the family ID is deterministic and shared, all MFA-verified sessions for the same user are placed in the same refresh token family. A family revocation (logout, token reuse detection) kills every concurrent MFA session. Additionally, the MaxSessions check will treat a second MFA login as the same family, not a new one, producing misleading session accounting.
- **Impact:** Logging out of one MFA session silently invalidates all other active MFA sessions for the same user. Revoking one MFA device's token via reuse detection logs out every other device. MaxSessions accounting is wrong for MFA users (second login folds into the same family). Session isolation is broken for MFA users.
- **Fix:** Replace 'family-'+claims.Sub with 'family-'+uuid.New().String() in both VerifyTOTP (line 478) and VerifyRecoveryCode (line 606) to give each successful MFA step-up its own independent refresh token family.
- **Verifier:** Confirmed both call sites use the deterministic 'family-'+claims.Sub, while Login (501) and OAuth (719) use unique UUIDs. Verified RevokeFamily/RevokeSession act family-wide (auth.go:474/481, handler.go:803) and enforceSessionLimit short-circuits on UserHasFamily (auth.go:382-388), so the cross-session revocation and session-count impacts are real. Note: the MFA-verified session is the most security-sensitive one, so collapsing all of them into one shared family is a meaningful isolation bug. Genuine high.
- **Evidence:**
  ```
  mfa_handler.go:478 (VerifyTOTP) and mfa_handler.go:606 (VerifyRecoveryCode): `GenerateRefreshTokenWithMFA(..., "family-"+claims.Sub, ...)`. Contrast handler.go:501 and handler.go:719 which use `"family-"+uuid.New().String()`. RotateRefreshToken's RevokeFamily (auth.go:474,481) and Logout's RevokeSession(info.FamilyID) (handler.go:803) operate on the whole family; enforceSessionLimit treats UserHasFamily==true as a free rotation (auth.go:382-388).
  ```

#### F-014 — Payment status update after RecordPayment is non-atomic with silently swallowed errors

- **Dimension:** Backend · Billing/commerce
- **Category:** concurrency  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/payment_handler.go` : 62-84
- **What:** RecordPayment inserts a payment row, then reads the total paid, then updates invoice status — three uncoordinated DB operations with no transaction. Concurrent payments can each read a partial sum and independently set partially_paid even when together they fully cover the invoice. GetTotalPaidForInvoice and UpdateStatusAndPaid are inside `if err == nil` blocks and the UpdateStatusAndPaid return is discarded with `_ =`, so a failed status update is silently ignored while the caller still gets HTTP 201.
- **Impact:** Invoices can be permanently stuck in partially_paid even when fully paid; failed status updates are silently lost; concurrent/double-click payments produce inconsistent amount_paid_paisa and status.
- **Fix:** Wrap Create + GetTotal + UpdateStatus in one pgx.Tx with SELECT ... FOR UPDATE on the invoice, or do a single SQL UPDATE recomputing amount_paid_paisa = (SELECT COALESCE(SUM(amount_paisa),0) FROM payments WHERE invoice_id=$1) with a CASE for status. Replace `_ =` with real error handling and return 500 on failure.
- **Verifier:** Confirmed verbatim at payment_handler.go:62-84. Create (62), then GetTotalPaidForInvoice (72) gated by `if err == nil`, then GetByID (74) gated by `if err == nil`, then `_ = h.invoiceRepo.UpdateStatusAndPaid(...)` (80) — return value discarded. No pgx.Tx anywhere in RecordPayment; the three ops run on separate pool connections with no SELECT...FOR UPDATE or transaction. respondJSON 201 Created (84) is returned regardless of whether the status update succeeded. UpdateStatusAndPaid (invoice_repo.go:182-188) is a plain UPDATE, so a swallowed error or lost-update race leaves the invoice stuck. Two concurrent payments can each read a partial SUM and both write `partially_paid`. All claims reproduce.
- **Evidence:**
  ```
  payment_handler.go:72 totalPaid, err := h.paymentRepo.GetTotalPaidForInvoice(...)
  :73 if err == nil {
  :74   inv, err := h.invoiceRepo.GetByID(...); :75 if err == nil {
  :80     _ = h.invoiceRepo.UpdateStatusAndPaid(r.Context(), workspaceID, invoiceID, newStatus, totalPaid)
  :84 respondJSON(w, http.StatusCreated, p)  // always 201
  ```

#### F-015 — Coupon redemption limit is not enforced atomically — concurrent over-redemption possible

- **Dimension:** Backend · Billing/commerce
- **Category:** concurrency  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/repository/coupon_repository.go` : 145-149
- **What:** ValidateCoupon reads redemption_count and checks against max_redemptions in application code without a row lock. IncrementRedemption increments in a separate UPDATE with no WHERE guard and no rows-affected check. Two concurrent requests can both pass the check and both increment, exceeding the limit. No DB CHECK constraint prevents redemption_count > max_redemptions.
- **Impact:** Limited coupons (e.g. first-100 50%-off) can be redeemed beyond the cap under concurrent checkout, causing revenue loss proportional to discount value and traffic concurrency.
- **Fix:** Add a guard to IncrementRedemption: `... WHERE id=$1 AND (max_redemptions IS NULL OR redemption_count < max_redemptions)` and check rows-affected==1 (else return ErrCouponExhausted). Also add a DB CHECK `(max_redemptions IS NULL OR redemption_count <= max_redemptions)` in a new migration. Acquire a row lock (SELECT ... FOR UPDATE) inside the redemption tx.
- **Verifier:** Confirmed. coupon_validation_service.go:56 reads `coupon.RedemptionCount >= *coupon.MaxRedemptions` in app code (GetByCodeActive does a plain SELECT, no row lock). IncrementRedemption (coupon_repository.go:145-149) is `UPDATE coupons SET redemption_count = redemption_count + 1 WHERE id = $1` with NO guard on max_redemptions and no rows-affected check. Although RedeemCouponTx (coupon_validation_service.go:104-116) runs inside a tx, the check-then-increment is split across ValidateCoupon (no lock) and RedeemCouponTx, so two concurrent validations both pass and both increment past the limit. Grepped the migrations: no CHECK (redemption_count <= max_redemptions) constraint exists. TOCTOU over-redemption is real.
- **Evidence:**
  ```
  coupon_validation_service.go:56 if coupon.MaxRedemptions != nil && coupon.RedemptionCount >= *coupon.MaxRedemptions { return nil, ErrCouponExhausted }
  coupon_repository.go:146-148 UPDATE coupons SET redemption_count = redemption_count + 1, updated_at = now() WHERE id = $1
  (no max_redemptions guard; no CHECK constraint found in migrations)
  ```

#### F-016 — Inconsistent GST rounding: truncation in recharge path vs. round-half-up in billing path

- **Dimension:** Backend · Billing/commerce
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/streaming/recharge/service.go` : 399-408
- **What:** Billing path (gst_engine.go) uses round-half-up; the streaming/recharge invoice path uses integer truncation `(subtotal*18)/100`. For many subtotals these diverge (e.g. subtotal=55 -> billing 10 vs recharge 9), so a workspace's streaming invoice tax differs from a billing invoice for the same subtotal.
- **Impact:** Streaming invoice tax can differ from billing invoice tax by 1 paisa for many subtotals; inconsistent GSTR-1 filings; cumulative drift across many small transactions.
- **Fix:** Replace the inline calc in generateInvoiceIfMissing with a call to service.CalculateGST(subtotal, issuerStateID, buyerStateID) so both invoice paths share identical round-half-up arithmetic and CGST/SGST splitting.
- **Verifier:** Confirmed. gst_engine.go:43-45 roundHalfUpPercent = `(amount*percent + 50) / 100` (round-half-up). recharge/service.go:399 uses `totalGST := (subtotal * 18) / 100` (integer floor, no +50). For subtotal=55: billing IGST = (55*18+50)/100 = 1040/100 = 10; recharge totalGST = (55*18)/100 = 990/100 = 9. The two paths diverge by 1 paisa as claimed. The existing service.CalculateGST is not called from generateInvoiceIfMissing; the inline arithmetic at 399-408 is a separate, non-equivalent implementation. GST-compliance inconsistency between the two invoice families is real.
- **Evidence:**
  ```
  gst_engine.go:44 return (amount*percent + 50) / 100
  recharge/service.go:399 totalGST := (subtotal * 18) / 100
  recharge/service.go:405-406 cgst = totalGST / 2; sgst = totalGST - cgst
  ```

#### F-017 — Intra-state CGST/SGST split produces unequal amounts for odd totalGST values

- **Dimension:** Backend · Billing/commerce
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/streaming/recharge/service.go` : 405-406
- **What:** For intra-state supplies CGST and SGST must each be half the GST. The recharge code computes cgst = totalGST/2 (floor) and sgst = totalGST - cgst, so for odd totalGST cgst is 1 paisa less than sgst, violating the GST requirement CGST==SGST on intra-state streaming invoices.
- **Impact:** Streaming invoices show CGST != SGST for a large fraction of intra-state transactions — legally incorrect asymmetric split that can trigger GST notices.
- **Fix:** Compute CGST and SGST independently (each = roundHalfUpPercent(subtotal, 9)) as gst_engine.go does, or simply call service.CalculateGST. This guarantees CGST==SGST for all amounts.
- **Verifier:** Confirmed at recharge/service.go:405-406: `cgst = totalGST / 2; sgst = totalGST - cgst`. When totalGST is odd, cgst != sgst (e.g. totalGST=9 -> 4 and 5). Contrast gst_engine.go:34-35 which computes CGST and SGST INDEPENDENTLY as roundHalfUpPercent(subtotal, 9) each (GSTRate/2 = 18/2 = 9 via integer div), so they are always equal there. The recharge path's split-the-total approach genuinely violates CGST==SGST for odd totals on every intra-state streaming invoice. Confirmed.
- **Evidence:**
  ```
  recharge/service.go:405 cgst = totalGST / 2
  recharge/service.go:406 sgst = totalGST - cgst   // totalGST=9 -> 4 / 5
  CONTRAST gst_engine.go:34-35 CGST=roundHalfUpPercent(sub,9); SGST=roundHalfUpPercent(sub,9)  // always equal
  ```

#### F-018 — DSR ProcessAccess Endpoint Accessible to Any Authenticated User

- **Dimension:** Backend · Multi-tenant isolation
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/dsr_handler.go` : 94-117
- **What:** POST /api/v1/dsr/{id}/process-access is registered on the JWT-only api group with no RequirePlatformRole and no ownership check, letting any authenticated user trigger an access export for any DSR id.
- **Impact:** Any authenticated user can force-process another subject's DSR access request, triggering collection/persistence of that subject's PII into export_payload, and can repeatedly hammer the synchronous exporter.
- **Fix:** Register this endpoint inside RegisterAdminRoutes (under RequirePlatformRole) or wrap it with RequirePlatformRole("super_admin","admin"). In production it is meant to be driven by the background worker; the synchronous route should be admin-gated.
- **Verifier:** dsr_handler.go:97-117 ProcessAccess parses the URL id and calls svc.ProcessAccessRequest with no claims/ownership/admin check (confirmed reading the whole handler). main.go:2222 registers api.Post("/api/v1/dsr/{id}/process-access", dsrHandler.ProcessAccess) inside the `api` group (JWTAuth+TenantContext only, main.go:1389-1400) — NOT inside RegisterAdminRoutes and with no RequirePlatformRole. The handler comment (lines 6,94-96) even says it is for admin review yet is wired with no admin guard. dsr_service.go:167-214 ProcessAccessRequest gathers and persists the export bundle. So any authenticated user can force-process any DSR by id. Confirmed.
- **Evidence:**
  ```
  main.go:2222 api.Post("/api/v1/dsr/{id}/process-access", dsrHandler.ProcessAccess) on JWT-only group; dsr_handler.go:97-103 no claims/role check; dsr_service.go:167-214 builds+persists export payload.
  ```

#### F-019 — DSR Get Endpoint Returns Full PII Export Payload Without Ownership Check

- **Dimension:** Backend · Multi-tenant isolation
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/dsr_handler.go` : 74-92
- **What:** GET /api/v1/dsr/{id} returns the complete DSRRequest including subject_email and export_payload to any authenticated user, with no check that the caller is the subject or a platform admin.
- **Impact:** An attacker with a DSR UUID can download another subject's full personal-data export (email, gallery/proofing data, consent records, audit entries) — a serious DPDPA/GDPR confidentiality breach.
- **Fix:** Add an authorization check: require RequirePlatformRole("super_admin","admin") OR verify the caller is the named subject (sub == subject_user_id). For the subject-self case, also omit export_payload unless completed and owned. Move under the admin router for the admin-review use case.
- **Verifier:** dsr_handler.go:75-92 Get parses id and calls svc.GetRequest, then respondJSON(w, 200, req) returning the full DSRRequest with no ownership/admin check. dsr_service.go:59-69 DSRRequest includes SubjectEmail (json:"subject_email") and ExportPayload (json.RawMessage, json:"export_payload,omitempty") — the full PII bundle. GetRequest (dsr_service.go:216-225) just fetches by id with no caller scoping. Route main.go:2221 api.Get("/api/v1/dsr/{id}") on JWT-only group, no RequirePlatformRole. So any authenticated user who knows/guesses a UUID gets another subject's full export. Confirmed.
- **Evidence:**
  ```
  dsr_handler.go:91 respondJSON(w, http.StatusOK, req); dsr_service.go:61 SubjectEmail, :67 ExportPayload json.RawMessage; dsr_service.go:216-225 GetRequest no scoping; main.go:2221 JWT-only registration.
  ```

#### F-020 — Impersonation Token Missing workspace_id and platform_role Claims — Impersonation Broken for All Workspace APIs

- **Dimension:** Backend · Multi-tenant isolation
- **Category:** bug  ·  **Verdict:** `likely`
- **Location:** `backend/internal/service/admin_user_service.go` : 194-198
- **What:** ImpersonateUser issues a token the system cannot use. The finding attributes this to missing workspace_id/platform_role claims (causing a 403 at TenantContext), but the actual cause is that the token is HS256-signed with JWT_IMPERSONATION_SECRET while the only validator requires RS256 with the platform key, and no code path validates the impersonation secret at all.
- **Impact:** Admin impersonation is non-functional — the issued token is rejected by the only JWT validator (wrong algorithm/key) and no part of the system consumes it. Feature appears to succeed (returns a token) but the token is unusable. (Impact direction matches the finding; the precise failure point differs.)
- **Fix:** Decide the impersonation design first: either (a) sign impersonation tokens with the same RS256 platform key via jwtSvc and include workspace_id + platform_role (plus impersonator/impersonation), so JWTAuth/TenantContext accept them; or (b) add a dedicated middleware/exchange endpoint that validates JWT_IMPERSONATION_SECRET and mints a real session. As written, the feature returns a token nothing can consume.
- **Verifier:** The OUTCOME (impersonation is non-functional) is real, but the finding's stated ROOT CAUSE is wrong. admin_user_service.go:194-199 signs the impersonation JWT with jwt.SigningMethodHS256 using s.jwtSecret = os.Getenv("JWT_IMPERSONATION_SECRET") (main.go:1920,1944). The ONLY validator, jwtService.ParseAccessToken (auth.go:326-332), REQUIRES *jwt.SigningMethodRSA and rejects any non-RSA token at line 328-329 BEFORE any claim is read — so the HS256 token fails signature/alg validation (401) and never reaches TenantContext's workspace_id=="" -> 403 path the finding describes. Furthermore, grep shows JWT_IMPERSONATION_SECRET is only ever READ to SIGN (main.go:1920); there is NO middleware or exchange endpoint that validates the impersonation secret anywhere, and frontend impersonateUser (admin.ts:207-209) just returns {token} with no consumer. So the missing workspace_id/platform_role claims are moot — the token is unusable due to algorithm/secret mismatch with no validator. Marking 'likely': bug confirmed, mechanism mis-attributed.
- **Evidence:**
  ```
  admin_user_service.go:199 jwt.NewWithClaims(jwt.SigningMethodHS256, claims) signed with JWT_IMPERSONATION_SECRET (main.go:1920); auth.go:328-329 ParseAccessToken rejects non-RSA: `if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok { return nil, ... }`; grep: JWT_IMPERSONATION_SECRET only read at main.go:1920 (sign-only), no validator/exchange exists.
  ```

#### F-021 — R2 object orphaned when scan manifest JSON decode fails after CompleteMultipartUpload

- **Dimension:** Backend · Media pipeline
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/chunked_upload.go` : 830-838
- **What:** If json.Unmarshal of the DB-resident scan_manifest column fails (line 832) after CompleteMultipartUpload succeeded, the code intentionally returns an error WITHOUT deleting the R2 object, leaving it orphaned with no DB row.
- **Impact:** Corrupted scan_manifest data (truncated write, schema mismatch after migration) permanently leaks the assembled R2 object; client gets a 500 and cannot retrieve or delete the upload.
- **Fix:** Add `_ = h.store.Delete(ctx, storageKey)` before the return at line 836, consistent with lines 843/848.
- **Verifier:** Confirmed at lines 830-838. CompleteMultipartUpload already ran at 823. The json.Unmarshal of row.ScanManifest failure path returns `fmt.Errorf("decode scan manifest: %w", err)` with an explicit comment 'don't roll back the upload' and NO h.store.Delete — unlike the very next two error paths (843, 848) which do delete. Sweeper only aborts the (already-completed) multipart, so the object is orphaned. Same root cause as the assetRepo.Create finding.
- **Evidence:**
  ```
  line 832-837:
  if err := json.Unmarshal(row.ScanManifest, manifest); err != nil {
      // ... don't roll back the upload (finalize has already completed the R2 composition).
      return nil, fmt.Errorf("decode scan manifest: %w", err)
  }
  ```

#### F-022 — Runtime panic in isJPEGFilename for 4-character filenames not ending in .jpg

- **Dimension:** Backend · Media pipeline
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/service/download_service.go` : 138-152
- **What:** isJPEGFilename guards len < 4 but `s[len(s)-5:]` requires len >= 5. A 4-char filename not matching '.jpg' (e.g. 'test', 'a.jp') panics. Short-circuit only saves 4-char '.jpg' names because the first clause is true first.
- **Impact:** Any gallery asset whose filename lowercases to exactly 4 chars not forming '.jpg' makes WriteZIPWithPolicy panic; the panic crashes the ZIP streaming goroutine/request, dropping the connection and leaving the client with a broken download.
- **Fix:** Fix the guard: `return (len(s) >= 4 && s[len(s)-4:] == ".jpg") || (len(s) >= 5 && s[len(s)-5:] == ".jpeg")`, or use strings.HasSuffix which is panic-safe.
- **Verifier:** Reproduced live. Extracted the exact function from download_service.go:138-152 and ran it: isJPEGFilename("test") panics with `runtime error: slice bounds out of range [-1:]` because the guard `len(s) >= 4` does not protect the `s[len(s)-5:]` slice when len==4 and the first `.jpg` comparison is false. Note: the finding's example 'a.jpg' is length 5 (safe) — but 'test', 'a.jp', '1.jp' (length 4) all panic. The function is called at line 106 with asset.Filename (user-controlled) inside WriteZIPWithPolicy; the panic propagates and crashes the ZIP-streaming request.
- **Evidence:**
  ```
  download_service.go:151 — return len(s) >= 4 && (s[len(s)-4:] == ".jpg" || s[len(s)-5:] == ".jpeg")
  Live repro of the exact code: isJPEGFilename("test") -> PANIC: runtime error: slice bounds out of range [-1:]
  Caller download_service.go:106 — if isJPEGFilename(filename) && policy != download.PolicyPassthrough
  ```

#### F-023 — Rolling hash double-absorbs chunk bytes on transient UploadPart failure and client retry

- **Dimension:** Backend · Media pipeline
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/chunked_upload.go` : 606-628
- **What:** In UploadChunk, nextPart++ and absorbChunk (rolling SHA-256) run before mpc.UploadPart. If UploadPart fails the handler returns 500 with no rollback. A TUS client retry with the same offset passes the offset check and re-absorbs the same bytes, corrupting the rolling hash so finalize yields a hash mismatch and deletes the object.
- **Impact:** Any transient B2/network error during a chunked upload corrupts the in-memory rolling hash; the upload can never finalize with a valid manifest, finalize deletes the composed object and refunds, forcing a full restart. Presents as a confusing 'scan hash mismatch'.
- **Fix:** Move absorbChunk (and the nextPart commit) to AFTER a successful UploadPart, or decrement nextPart and skip absorb on UploadPart failure so a retry re-processes the chunk exactly once.
- **Verifier:** Confirmed at lines 606-628. Under state.mu: partNumber=state.nextPart (607), state.nextPart++ (608), state.absorbChunk(chunk) (612) — all BEFORE mpc.UploadPart at 624. On UploadPart error, line 626 returns 500 with NO rollback of nextPart or hasher (grep of all nextPart usages shows only ++ at 608, never a decrement). absorbChunk (line 167-189) calls s.hasher.Write(chunk) and mutates head/tail. On TUS retry the DB UploadOffset (set at 645) never updated, so the offset check at 522 passes, absorbChunk runs again on the same bytes -> SHA-256 contains them twice -> finalize ErrScanHashMismatch -> refund + delete. Mechanism fully verified.
- **Evidence:**
  ```
  state.mu.Lock(); partNumber := state.nextPart; state.nextPart++; if state.hasher != nil { state.absorbChunk(chunk) }; ...; state.mu.Unlock(); ... etag, err := mpc.UploadPart(...); if err != nil { http.Error(..., 500); return }  // no rollback of absorbChunk/nextPart
  ```

#### F-024 — Migration numbering collision: 000014–000017 share parsed order 14–17 with 014–017, causing M5 tables to run interleaved with core M2/M3 tables

- **Dimension:** Database · Schema & migrations
- **Category:** db  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/database/database.go` : 196-215
- **Impact:** M5 marketplace/messaging migrations run interleaved with core M2/M3 share-link/proofing/invitation migrations at positions 14-17. No current break, but a future cross-group FK dependency would silently fail to order correctly; rollback order is likewise interleaved.
- **Fix:** Renumber 000014–000017 to a slot above the highest migration (e.g. 123-126), or harden migrationOrder()/getMigrationFiles() to reject coexisting differently-zero-padded files at the same logical order. Update schema_migrations on existing DBs accordingly.
- **Verifier:** Verified. migrationOrder() (database.go:196-215) strips leading digit chars then strconv.Atoi, so '000014_...' and '014_...' both parse to 14 (leading zeros dropped by Atoi). getMigrationFiles() (database.go:176-183) tie-breaks equal orders by lexicographic string compare; confirmed '000014' < '014' (Python check: True), so the four M5 files (000014 marketplace, 000015 gear, 000016 messaging, 000017 moderation) sort BEFORE 014_create_share_links..017 and run interleaved at orders 14-17. Note: extractVersion() yields distinct version strings ('000014_...' vs '014_...'), so schema_migrations does NOT dedupe them — both apply; the issue is purely ordering/rollback-order, exactly as the finding states. Severity 'high' is slightly generous since the finding itself concedes no current FK dependency breaks; the risk is latent for future contributors. Real and worth fixing but not currently causing a failure.
- **Evidence:**
  ```
  database.go:196 `func migrationOrder(filename string) int` strips digit prefix + Atoi('000014')==14==Atoi('014'); database.go:182 tie-break `return files[i] < files[j]`; '000014' < '014' == true
  ```

#### F-025 — galleries.GetBySlug performs a full table scan — no standalone index on the slug column

- **Dimension:** Database · Schema & migrations
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/repository/gallery_repo.go` : 242
- **Impact:** Every public gallery URL load (and proofing/cart slug lookups) performs a sequential scan of galleries. Latency grows linearly with gallery count.
- **Fix:** Add appended migration: `CREATE INDEX IF NOT EXISTS idx_galleries_slug ON galleries(slug) WHERE deleted_at IS NULL;`. Partial index keeps it lean and matches the query predicate exactly.
- **Verifier:** Verified. gallery_repo.go:233-242 GetBySlug runs `... FROM galleries WHERE slug = $1 AND deleted_at IS NULL` (line 242). The only slug index across all migrations is the composite UNIQUE `idx_galleries_workspace_slug ON galleries(workspace_id, slug)` (012:26); no standalone slug index exists. Postgres cannot use a composite index whose leading column (workspace_id) is absent from the predicate, so a query keyed on slug alone gets a seq scan. Confirmed this is a public hot path: public_gallery_handler.go:128 calls gallerySvc.GetBySlug, and proofing_handler.go:140 + cart_handler.go also call it — all unscoped by workspace. Severity 'high' is plausible but depends on galleries table size; at small row counts a seq scan is cheap, so impact magnitude is data-dependent (the finder did not measure row counts). The missing-index fact is solidly confirmed.
- **Evidence:**
  ```
  gallery_repo.go:242 `FROM galleries WHERE slug = $1 AND deleted_at IS NULL`; 012_alter_galleries_m2.up.sql:26 `CREATE UNIQUE INDEX ... idx_galleries_workspace_slug ON galleries(workspace_id, slug);` (only slug index); public_gallery_handler.go:128 `return h.gallerySvc.GetBySlug(r.Context(), slug)`
  ```

#### F-026 — Invoice status update silently discarded after payment recording

- **Dimension:** Backend · Error handling & observability
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/payment_handler.go` : 80
- **What:** After creating a payment row, UpdateStatusAndPaid syncs the invoice status but the error is discarded with _ =. If it fails the payment is recorded while the invoice stays in its old status, creating data inconsistency.
- **Impact:** Invoices show incorrect payment status (e.g. remain 'sent' after being fully paid), causing billing reconciliation issues.
- **Fix:** Log the error at minimum, ideally emit a metric for ops to reconcile.
- **Verifier:** Verified at payment_handler.go:80 — exact snippet present inside the `if err == nil` blocks (lines 72-82). Error from UpdateStatusAndPaid is discarded. The outer GetTotalPaidForInvoice/GetByID errors are also silently swallowed (the if-err==nil guards skip the update entirely with no log). Genuine error-handling gap. High is slightly generous since the payment row itself persists and a later payment/list recomputation could correct it, but the inconsistency window is real and unobservable.
- **Evidence:**
  ```
  _ = h.invoiceRepo.UpdateStatusAndPaid(r.Context(), workspaceID, invoiceID, newStatus, totalPaid)
  ```

#### F-027 — Credit Refund failures silently swallowed on upload error paths

- **Dimension:** Backend · Error handling & observability
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/chunked_upload.go` : 670,677,685
- **What:** When an upload fails the handler calls h.creditGate.Refund with _ =, discarding any error. If the refund itself fails the user has been charged for a failed upload with no detection path.
- **Impact:** Users may be billed for failed uploads if the refund silently fails; credit ledger left inconsistent with no observability.
- **Fix:** Log refund failures at ERROR level and optionally enqueue a retry / dead-letter for reconciliation.
- **Verifier:** Verified at chunked_upload.go:670-672, 677-679, 685-687 — all three Refund calls discard the error with _ =. Note the adjacent Consume call at 695-700 DOES log its failure (m40 log.Printf), so the inconsistency is real: success-path settlement is logged but refund-path failure is not. Refund reasons (hashfail/manifest/infra) carry idempotency keys so a retry job could settle them, but there is no log to trigger one. Genuine gap.
- **Evidence:**
  ```
  _ = h.creditGate.Refund(r.Context(), state.reservation, fmt.Sprintf("refund:%s:hashfail", uploadID), "stream-hash-fail")  // + lines 677, 685
  ```

#### F-028 — zip.Writer.Close errors swallowed via defer — truncated ZIP downloads

- **Dimension:** Backend · Error handling & observability
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/service/download_service.go` : 68,270,322
- **What:** All three WriteZIP paths create a zip.Writer and close it with defer zw.Close(). zip.Writer.Close() flushes the central directory record; its error is discarded and the function has already returned nil, so callers never learn the ZIP was truncated.
- **Impact:** Clients can receive a corrupt ZIP (missing/partial central directory) on close failure; photographers/clients silently get broken archives.
- **Fix:** Replace defer with an explicit zw.Close() before the successful return, wrapping/returning its error.
- **Verifier:** Verified: download_service.go:67-68 (WriteZIPWithPolicy), 269-270 (writeZipWithProgress), 321-322 (WriteSelectedZIP) all use `zw := zip.NewWriter(w)` then `defer zw.Close()` and the functions `return nil` before the deferred Close runs. This is the textbook deferred-Close-on-a-Writer bug — the central directory flush error is genuinely lost. Legitimate correctness issue for download integrity; the most actionable finding in this batch.
- **Evidence:**
  ```
  zw := zip.NewWriter(w)
  defer zw.Close()
  ```

#### F-029 — N+1 queries on hot public gallery read path (ListAssets + per-asset GetByID)

- **Dimension:** Backend · Performance & concurrency
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/public_gallery_handler.go` : 243-266
- **What:** PublicGalleryHandler.ListAssets calls gallerySvc.ListAssets to get all GalleryAsset junction rows, then iterates and calls assetSvc.GetByID per asset to build the response. Same N+1 in ListAlbumAssets (371-386). NOTE: the two FaceID locations the finding also cites (859, 1045) are NOT N+1 — they only call id.String() on an already-fetched ID slice.
- **Impact:** Public gallery page load scales linearly with photo count: a 1000-photo wedding gallery issues ~1001 sequential DB round-trips on an unauthenticated hot path, degrading under concurrent viewers.
- **Fix:** Add AssetRepo.GetByIDs(ctx, []uuid.UUID) using WHERE id = ANY($1), fetch once, build a map for O(1) lookup, and apply to both ListAssets (251-266) and ListAlbumAssets (371-386). The two FaceID loops need no change.
- **Verifier:** Confirmed at public_gallery_handler.go:251-266 — loop over galleryAssets calling h.assetSvc.GetByID(r.Context(), ga.AssetID) per asset; identical pattern in ListAlbumAssets at 371-386. HOWEVER the cited lines 859 and 1045 are FALSE sub-claims: both are `for _, id := range ... { stringIDs = append(stringIDs, id.String()) }` over IDs already returned by ListClusterAssetIDsInGallery — no per-asset DB round-trip there. Core finding (the two real loops) is a genuine N+1.
- **Evidence:**
  ```
  galleryAssets, err := h.gallerySvc.ListAssets(r.Context(), gallery.ID)
  ...
  for _, ga := range galleryAssets {
      asset, err := h.assetSvc.GetByID(r.Context(), ga.AssetID)
      ...
  }
  ```

#### F-030 — N+1 queries in WriteZIPWithPolicy and WriteSelectedZIP — individual GetByID per asset in download loop

- **Dimension:** Backend · Performance & concurrency
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/service/download_service.go` : 71-72, 275, 326
- **What:** WriteZIPWithPolicy (71-72), writeZipWithProgress (275), and WriteSelectedZIP (326) each iterate asset IDs and call assetRepo.GetByID per asset before fetching from storage. For a 500-photo download this is hundreds of DB queries interleaved with storage Get calls.
- **Impact:** Gallery download latency for large galleries is dominated by N sequential DB round-trips before/within the ZIP stream; connection-pool slots and storage readers held longer than necessary.
- **Fix:** Bulk-fetch asset rows with WHERE id = ANY($1) before the loop, build map[uuid.UUID]*Asset, lookup O(1) inside the loop. Reduces N+1 to 2 queries.
- **Verifier:** All three sites verified verbatim: download_service.go:72 (WriteZIPWithPolicy), :275 (writeZipWithProgress), :326 (WriteSelectedZIP) each do `asset, err := s.assetRepo.GetByID(ctx, ...)` inside the per-asset loop followed by s.store.Get. Genuine N+1 on the download path.
- **Evidence:**
  ```
  for _, ga := range galleryAssets {
      asset, err := s.assetRepo.GetByID(ctx, ga.AssetID)
      if err != nil || asset == nil {
          continue // skip missing assets
      }
      reader, err := s.store.Get(ctx, asset.StorageKey)
  ```

#### F-031 — Global mutex held across DB query and SMTP send in passwordService.RequestReset

- **Dimension:** Backend · Performance & concurrency
- **Category:** concurrency  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/auth/auth.go` : 762-802
- **What:** RequestReset acquires s.mu.Lock() with defer Unlock(), then performs store.FindByEmail (DB) and notifier.SendPasswordResetOTP (SMTP) while holding the lock, serializing all concurrent password-reset requests globally. ResetPassword (805) has the same mutex+DB+notifier shape.
- **Impact:** A single SMTP timeout blocks all concurrent password-reset requests for its duration, enabling request pile-up / effective DoS on the reset endpoint.
- **Fix:** Hold the mutex only for the s.resets[email] read/write; release before FindByEmail and SendPasswordResetOTP. Those calls touch no shared mutable state.
- **Verifier:** Confirmed: auth.go:763-764 `s.mu.Lock(); defer s.mu.Unlock()`; FindByEmail at :794 and SendPasswordResetOTP at :796 both execute inside that locked scope (function returns at :802). passwordService has `mu sync.Mutex` (field at :736). ResetPassword at :806-849 confirms the same lock-spanning-DB pattern (UpdatePassword at :838, SendSecurityNotification at :846 under the lock).
- **Evidence:**
  ```
  func (s *passwordService) RequestReset(ctx context.Context, email string) error {
      s.mu.Lock()
      defer s.mu.Unlock()
      ...
      user, lookupErr := s.store.FindByEmail(ctx, email)
      ...
      if err := s.notifier.SendPasswordResetOTP(ctx, email, code, s.config.ResetOTPExpiry); err != nil {
  ```

#### F-032 — Global mutex held across SMTP send in otpService.Generate

- **Dimension:** Backend · Performance & concurrency
- **Category:** concurrency  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/auth/auth.go` : 142-178
- **What:** otpService.Generate acquires s.mu.Lock() with defer Unlock(), then calls s.delivery.SendOTP(ctx, identifier, code) (SMTP round-trip) while holding the lock, serializing all registration OTP generation behind one mutex.
- **Impact:** All concurrent registration OTP requests serialize; an SMTP timeout blocks every new registration for the timeout duration. Sign-up spikes queue and time out.
- **Fix:** Record the entry under the lock, release, then call SendOTP lock-free. On failure re-acquire and delete the entry.
- **Verifier:** Confirmed verbatim at auth.go:143-176 — `s.mu.Lock(); defer s.mu.Unlock()` then `s.delivery.SendOTP(ctx, identifier, code)` at :173 inside the locked scope. otpService has `mu sync.Mutex` (field at :107). Genuine global serialization of SMTP under lock.
- **Evidence:**
  ```
  func (s *otpService) Generate(ctx context.Context, identifier string) (string, error) {
      s.mu.Lock()
      defer s.mu.Unlock()
      ...
      if s.delivery != nil {
          if err := s.delivery.SendOTP(ctx, identifier, code); err != nil {
              return "", err
          }
      }
      return code, nil
  }
  ```

#### F-033 — Thumbnail worker ListByStatus query cannot use any existing index (full table scan every 1 second)

- **Dimension:** Backend · Performance & concurrency
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/repository/asset_repo.go` : 218-247
- **What:** ListByStatus runs WHERE status = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT $2 across all workspaces; the thumbnail worker (backend/internal/worker/thumbnail_worker.go) calls it every 1s with status='processing' LIMIT 10. No index on assets(status) or assets(status,created_at) exists — idx_assets_workspace_status requires workspace_id as leading column, and idx_assets_processing_status is on the different column processing_status.
- **Impact:** Every second the planner must scan + top-N sort over all status='processing' rows with no supporting index; as assets grows this is steady I/O on a hot poll loop. The worker's own comment claiming the SELECT is 'on the indexed status column' is incorrect.
- **Fix:** Add a partial index e.g. CREATE INDEX idx_assets_status_created ON assets (status, created_at) WHERE deleted_at IS NULL AND status = 'processing'. Migrating to NATS JetStream event-driven processing is already noted as a follow-up (worker comment line 100, G4 fix session 2026-05-17).
- **Verifier:** Query confirmed at asset_repo.go:222-228. Worker confirmed at backend/internal/worker/thumbnail_worker.go (NOT service/ as cited): pollInterval 1s (:102), ListByStatus(... 'processing', 10) (:134). Grep across all migrations found NO `CREATE INDEX ... ON assets(status ...)`; only idx_assets_workspace_status (workspace_id-leading, migration 011:23) and idx_assets_processing_status on the distinct processing_status column (migration 038:12). The worker comment at :97-98 asserting the column is indexed is factually wrong. NATS follow-up comment exists at thumbnail_worker.go:100. Severity slightly tempered by LIMIT 10 + small working set, but the index gap is real and on a 1s poll loop.
- **Evidence:**
  ```
  asset_repo.go:226 `FROM assets WHERE status = $1 AND deleted_at IS NULL ORDER BY created_at ASC LIMIT $2`; thumbnail_worker.go:102 `pollInterval: 1 * time.Second`; thumbnail_worker.go:134 `ListByStatus(ctx, "processing", 10)`. Migration 011: idx_assets_workspace_status ON assets(workspace_id, status). Migration 038: idx_assets_processing_status ON assets(processing_status).
  ```

#### F-034 — JWT claims map missing 'user_id' key — handlers always receive uuid.Nil

- **Dimension:** Backend · Storage & hardcode-law
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/middleware/jwt_auth.go` : 35-46
- **Impact:** Gallery duplication records uuid.Nil as created_by (broken audit/ownership); design-collab presence/lock sessions join under an empty userID making presence and lock tracking non-functional; affected handlers accept uuid.Nil without rejecting the request.
- **Fix:** Add "user_id": claims.Sub to claimsMap in jwt_auth.go so JWTClaimsFromContext exposes it, and drop the dead context.WithValue(contextKey("user_id")) line. Alternatively change the affected handlers to read claims["sub"]. Also stop discarding the uuid.Parse error so an empty/nil user is rejected rather than stored as uuid.Nil.
- **Verifier:** Reproduced exactly. jwt_auth.go:35-42 builds claimsMap with keys sub/workspace_id/role/platform_role/state_id/mfa_verified — NO 'user_id' key. Line 46 sets context.WithValue(ctx, contextKey("user_id"), claims.Sub) but contextKey is the private type in middleware.go:17 and there is NO accessor for it anywhere (grep confirms only jwtClaimsKey is read, via JWTClaimsFromContext at middleware.go:35-40). Verified all cited handler reads: gallery_handler.go:656 'userIDStr,_ := claims["user_id"].(string)' then uuid.Parse(userIDStr) -> uuid.Nil; design_collab_handler.go:31/57/71/101 join sessions/locks under empty userID; design_template_handler.go:32 same. uuid.Parse("") returns uuid.Nil with a discarded error, so identity is silently lost. By contrast, working handlers (asset_handler.go:276, profile_handler.go:40, etc.) correctly read claims["sub"]. Genuine bug across the named handlers.

#### F-035 — Storage proxy path traversal: no sanitization of key before auth bypass check

- **Dimension:** Backend · Storage & hardcode-law
- **Category:** security  ·  **Verdict:** `likely`
- **Location:** `backend/cmd/api/main.go` : 2312-2346
- **Impact:** Currently low real-world exploitability against B2's flat keyspace (private originals/ZIPs are under other prefixes and '..' is a literal key char). Residual risk: unvalidated unauthenticated key surface; if any future feature ever stores sensitive bytes under a key lexically prefixed with 'thumbnails/', it would be served without auth.
- **Fix:** Still harden: after capturing key, apply path.Clean and reject any key containing '..' or leading '/', and gate the unauthenticated thumbnails/ bypass behind a strict regex (^thumbnails/[0-9a-f-]{36}/(thumb_sm|thumb_md|thumb_lg|display)\.webp$). This closes the keyspace-pollution and future-prefix-collision risks even though flat-keyspace traversal is not currently exploitable.
- **Verifier:** Code matches: main.go:2313 key := chi.URLParam(r,"*"); line 2326 isPublicThumbnail := strings.HasPrefix(key,"thumbnails/"); line 2346 storageProvider.Get(ctx, key) with the raw key — no path.Clean, no '..' rejection, no key-format validation, and no CleanPath middleware on the router (chi.NewRouter at main.go:668, no CleanPath/StripSlashes). So the missing-sanitization observation is REAL and worth hardening. HOWEVER the HIGH-severity exploit claim is overstated: B2/S3 object keys are a FLAT keyspace (s3.go:45 Get just calls client.GetObject(key); the AWS SDK does NOT normalize '..'). Sensitive content lives under derivatives/ (thumbnail_service.go:310), downloads/ (download_service.go:254), and <workspace>/ prefixes — never thumbnails/. A crafted key like 'thumbnails/../derivatives/x.webp' is a DISTINCT literal object key that was never written, so it 404s rather than retrieving a private original. Cross-prefix unauthenticated retrieval as described is not achievable against object storage; the finding's own evidence hedges ('Depending on whether ... transparently decodes'). Treating as a legitimate defense-in-depth hardening gap, not a confirmed auth bypass.

#### F-036 — NATS client port 4222 exposed on 0.0.0.0 with no client authentication

- **Dimension:** Config & Infrastructure
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `deploy/nats/nats-server.conf` : 6
- **What:** No authorization/accounts/nkeys block for NATS client or cluster connections; NATS_CLUSTER_SEED never wired to compose or config. 4222/6222 bound to 0.0.0.0.
- **Impact:** Any host reaching 4222 can publish/subscribe JetStream subjects (inject fake image/email/face-detection jobs, leak upload paths and workspace IDs); cluster port 6222 also unauthenticated.
- **Fix:** Add an authorization (token or user/pass) block for client connections and a cluster.authorization block; actually consume NATS_CLUSTER_SEED; bind ports as 127.0.0.1:4222:4222 / use a private overlay network.
- **Verifier:** Verified. nats-server.conf has `port: 4222` (line 6) and contains NO `authorization`/`accounts`/`nkeys` block at all — only a cluster block with name/port/routes and a comment (lines 29-30) claiming cluster auth is 'generated per-deploy from NATS_CLUSTER_SEED env var in Compose file.' That claim is FALSE in the code: grep for NATS_CLUSTER_SEED across deploy/ returns only deploy/.env.example:46 and the comment itself — the variable is never referenced in either compose command (prod-app nats command is just `-c <conf> -n ${NATS_NODE_NAME}`) nor any config directive. So neither client port 4222 nor cluster port 6222 has auth. prod-app:155-156 and prod-db:88-89 bind 4222/6222 with no host-IP prefix. The finder's mitigation note (Docker iptables bypassing UFW) is a well-established Docker behavior; the practical reach depends on whether the VPS provider firewall blocks these ports externally, but the config-level absence of NATS auth is unambiguous.
- **Evidence:**
  ```
  nats-server.conf:6 `port: 4222` with no authorization block; cluster block lines 21-31 (name/port/routes only); NATS_CLUSTER_SEED appears only in deploy/.env.example:46 and the conf comment, never in the nats compose command; prod-app:155-156 and prod-db:88-89 bind `4222:4222`/`6222:6222`.
  ```

#### F-037 — Postgres and Valkey ports bound to 0.0.0.0 on production DB node, bypassing UFW

- **Dimension:** Config & Infrastructure
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `deploy/docker-compose.prod-db.yml` : 29
- **What:** Postgres 5432 and Valkey 6379 bound without 127.0.0.1 prefix on prod-db; Docker iptables rules can bypass UFW. postgresql.conf listen_addresses='*'. pg_hba.conf is the sole remaining access control.
- **Impact:** Postgres primary reachable beyond loopback relying on pg_hba alone; a future pg_hba misconfig or app-node compromise directly exposes the multi-tenant DB. Valkey similarly reachable (password-protected).
- **Fix:** Bind `127.0.0.1:5432:5432` and `127.0.0.1:6379:6379` (mirroring pgbouncer); connect cross-host via a private overlay/WireGuard; or set listen_addresses to specific VPS IPs.
- **Verifier:** Verified. prod-db.yml binds `5432:5432` (line 29) and `6379:6379` (line 61) with no host-IP prefix — the only 127.0.0.1 occurrence in the file is the nats healthcheck (line 92), confirming these DB/cache ports are NOT loopback-scoped. postgresql.conf:5 is `listen_addresses = '*'`. Contrast: pgbouncer in prod-app.yml:36 is correctly bound `127.0.0.1:6432:6432`, proving the team knows the safe pattern and chose not to apply it here. pg_hba.conf does restrict to .42/.44 /32 with scram-sha-256 (real defense-in-depth), so internet-level exploitability hinges on the provider/UFW firewall and the Docker-iptables-bypass claim; thus pg_hba is genuinely the last line if the network firewall fails. High severity is appropriate as a hardening gap on a multi-tenant DB.
- **Evidence:**
  ```
  prod-db.yml:29 `- "5432:5432"`; prod-db.yml:61 `- "6379:6379"`; postgresql.conf:5 `listen_addresses = '*'`; pg_hba.conf:15-18 restricts rawdrive DB to 187.127.142.42/32 and .44/32 with scram-sha-256.
  ```

#### F-038 — Next.js 16.2.3 vulnerable to middleware bypass (GHSA-26hh-7cqf-hhc6, HIGH)

- **Dimension:** Dependencies & supply chain
- **Category:** security  ·  **Verdict:** `likely`
- **Location:** `frontend/package.json` : 17
- **What:** The project pins Next.js to 16.2.3. GitHub advisory GHSA-26hh-7cqf-hhc6 (High) affects next >= 16.0.0, < 16.2.6; GHSA-267c-6grr-h53f affects next >= 16.0.0, < 16.2.5. An active middleware.ts handles subdomain routing.
- **Impact:** An attacker can craft a segment-prefetch route to bypass middleware in App Router apps. Current middleware only rewrites subdomain URLs (no auth), so impact is latent — but any future auth enforcement in middleware.ts would be silently bypassable on 16.2.3.
- **Fix:** Upgrade next and eslint-config-next from 16.2.3 to 16.2.6 in frontend/package.json (lines 17 and 34), run pnpm install to update pnpm-lock.yaml, and delete the stale frontend/package-lock.json. Verify the fixed version against the live GitHub Advisory DB before pinning.
- **Verifier:** Confirmed in-repo: frontend/package.json line 17 pins "next": "16.2.3" and line 34 pins "eslint-config-next": "16.2.3". An active middleware.ts exists at frontend/src/middleware.ts (7.1k, git-tracked) and confirms it only does per-subdomain URL rewrites with a ?ws= query, performing NO auth enforcement (header comment lines 3-36 + BASE_DOMAIN logic). The finding cites line 10 but the actual line is 17 — minor location error, version value is exactly right. I cannot offline-verify the GitHub Advisory data (GHSA-26hh-7cqf-hhc6 fixed in 16.2.6, GHSA-267c-6grr-h53f fixed in 16.2.5) so the specific CVE applicability/fix-version claims are 'likely' rather than fully confirmed. The code preconditions (vulnerable pinned version + live App Router middleware) are real; the impact note correctly flags it as latent until auth is added to middleware.
- **Evidence:**
  ```
  frontend/package.json line 17: "next": "16.2.3"; line 34: "eslint-config-next": "16.2.3". frontend/src/middleware.ts header (lines 3-36) documents subdomain rewrite only, no auth.
  ```

#### F-039 — Dual lockfile in frontend/ causes package manager resolution drift

- **Dimension:** Dependencies & supply chain
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `frontend/package-lock.json` : 1
- **What:** Both frontend/pnpm-lock.yaml (authoritative for pnpm) and frontend/package-lock.json (npm-generated, stale at 0.0.64) are committed. Running npm install instead of pnpm install resolves from the stale lockfile, risking a divergent dependency tree.
- **Impact:** Supply-chain drift: an npm install installs from a stale lockfile (0.0.64 vs 0.0.65), potentially pulling different transitive versions than tested, undermining reproducible builds.
- **Fix:** Delete frontend/package-lock.json, add it to .gitignore, and add "packageManager": "pnpm@<version>" to frontend/package.json so corepack enforces pnpm. Track only pnpm-lock.yaml.
- **Verifier:** Fully confirmed. git ls-files shows BOTH frontend/package-lock.json AND frontend/pnpm-lock.yaml are tracked. package-lock.json lines 1-9 read {"name":"rawdrive-app","version":"0.0.64","lockfileVersion":3} while frontend/package.json line 3 is "version":"0.0.65" — a real drift. pnpm-lock.yaml line 1 is lockfileVersion '9.0'. package.json has no packageManager field (lines 1-41 confirm absence), so corepack does not enforce pnpm. The npm lockfile being stale + present is a genuine reproducible-build hazard exactly as described.
- **Evidence:**
  ```
  git ls-files lists frontend/package-lock.json + frontend/pnpm-lock.yaml. package-lock.json lines 1-3: version 0.0.64, lockfileVersion 3. package.json line 3: version 0.0.65, no packageManager field. pnpm-lock.yaml line 1: lockfileVersion '9.0'.
  ```

#### F-040 — GlassIconButton uses Tailwind dark: prefix overrides instead of token-driven theming

- **Dimension:** Frontend · Design-token compliance
- **Category:** ui  ·  **Verdict:** `likely`
- **Location:** `frontend/src/components/ui/glass-icon-button.tsx` : 48-61
- **Fix:** Define an explicit @custom-variant dark mapped to [data-theme='liquid-glass-dark'],[data-theme='midnight'] in globals.css, OR replace the dark: modifiers with a per-theme CSS custom property (e.g. --glass-btn-bg) so the glass surface tracks the data-theme toggle rather than prefers-color-scheme.
- **Verifier:** Mechanism confirmed: lines 48/50/53 (glass) and 61 (solid) use dark: modifiers, and NO `@custom-variant dark` is defined anywhere in frontend/src (grep found none), so Tailwind v4's default `dark:` = @media (prefers-color-scheme: dark). Theme selection is via data-theme on <html> (globals.css 347-354 sets color-scheme per data-theme but does not redefine the dark variant). So dark: tracks the OS, not the in-app theme toggle — confirmed. However the severity-high impact ('midnight looks identical to light mode for icon buttons') is overstated: the glass variant base (bg-white/[0.12], text-white/90, white borders) already renders correctly on dark surfaces; dark: only nudges opacity from 0.12->0.08. The visual defect is a subtle opacity mismatch, not a broken control. Genuine but lower-impact than stated.

#### F-041 — GlassIconButton hover states use Tailwind color primitives (red-500, green-500, blue-500)

- **Dimension:** Frontend · Design-token compliance
- **Category:** ui  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/components/ui/glass-icon-button.tsx` : 80-100
- **Fix:** Replace the three hover lines with token-driven equivalents: hover:bg-feedback-error/25, hover:bg-feedback-success/25, hover:bg-accent-secondary/25 (matching each variant's existing base/active token usage) so hover states stay theme-aware.
- **Verifier:** Verified verbatim: danger hover `hover:bg-red-500/[0.25] hover:border-red-400/[0.35]` (line 80), success `hover:bg-green-500/[0.25] hover:border-green-400/[0.35]` (line 90), accent `hover:bg-blue-500/[0.25] hover:border-blue-400/[0.35]` (line 100). green/red/blue are NOT in the @theme inline color map in globals.css (grep for color-green/red/blue returned nothing), so these resolve to Tailwind's built-in palette and do not adapt per theme. Inconsistent with the same variants' base/active states which correctly use feedback-error/feedback-success/accent-secondary tokens (lines 76-82, 84-92, 94-102) — the hover line is the outlier. On midnight (gold accent) the accent button hovers blue. Confirmed real token violation.

#### F-042 — Raw <button> with inline <svg> anti-pattern — galleries/page.tsx filter chips

- **Dimension:** Frontend · Design-token compliance
- **Category:** ui  ·  **Verdict:** `likely`
- **Location:** `frontend/src/app/(dashboard)/galleries/page.tsx` : 303-336
- **Fix:** Either (a) extract a FilterChip component that renders the XMark icon from frontend/src/components/icons/index.tsx (keeping the text label and click-to-dismiss), or (b) accept the labeled chip as-is and at minimum swap the inline SVG for the shared XMark icon for consistency.
- **Verifier:** Confirmed the code exists: three filter chips at lines 303-311, 313-325, 327-336 are raw <button> elements each containing an inline X <svg> (path d='M6 18L18 6M6 6l12 12'). They use semantic token classes (bg-accent-primary/10, text-accent-primary). Downgraded from confirmed-as-stated to 'likely' because these are labeled chips (the whole button has visible text + an embedded close glyph), not standalone icon-only buttons. The GlassIconButton mandate targets icon ACTIONS; a text+glyph dismiss chip is a gray area — replacing the entire chip with GlassIconButton would lose the label. The inline-svg-in-button is a real style inconsistency but not a clear-cut GlassIconButton violation. Severity high is overstated; medium/low is fairer.

#### F-043 — Raw <button> with inline <svg> in toast dismiss — gallery [id] page, h-6 w-6 (24px touch target)

- **Dimension:** Frontend · Design-token compliance
- **Category:** ui  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/galleries/[id]/page.tsx` : 1974-1983, 2055-2066
- **Fix:** Replace both toast dismiss buttons with GlassIconButton size='sm' (36px) or 'md' (44px), variant='ghost', label='Dismiss', rendering the XMark icon from the icon registry.
- **Verifier:** Confirmed both instances. Line 1977 and line 2060 each declare `inline-flex h-6 w-6 ... rounded-md` raw <button> with aria-label='Dismiss' (lines 1978/2061) and an inline X svg (`h-3.5 w-3.5`, path d='M6 18L18 6M6 6l12 12', lines 1980/2063). h-6 w-6 = 24px, well below the 44px WCAG/project touch-target floor. Compound violation (raw button+svg AND sub-44px) is real. Line numbers are off by ~3 from the finding but the cited region and content match exactly.

#### F-044 — Multiple interactive buttons at h-8 w-8 (32px) — WCAG touch target failure

- **Dimension:** Frontend · Design-token compliance
- **Category:** ui  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/components/DealerApplicationModal.tsx` : 111-118
- **Fix:** Replace these icon-action buttons with GlassIconButton size='sm' (36px) or 'md' (44px). For the gallery-canvas 24px selection indicator, keep the small visual but wrap in a >=44px hit area (padding or absolute-inset clickable layer).
- **Verifier:** All cited instances verified: DealerApplicationModal.tsx:115 (h-8 w-8), ui/data-table.tsx:346 (h-8 w-8 pagination), pwa/install-banner.tsx:81 (h-8 w-8 dismiss), messages/page.tsx:104 (h-8 w-8 back, md:hidden — mobile-only, where 44px matters MOST) and an additional surface-button h-8 w-8 at messages:360, admin/audit-logs/page.tsx:96 (h-8 w-8 close), gallery-canvas.tsx:201 (w-6 h-6 = 24px selection checkbox). 32px and 24px are both below the 44px WCAG 2.1 AA / project floor. The mobile back button (messages:104) is the most severe since touch is the only input there. Confirmed across all listed files.

#### F-045 — N+1 HTTP waterfall: gallery detail page fetches each asset individually after listing

- **Dimension:** Frontend · Performance
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/galleries/[id]/page.tsx` : 243-252
- **Impact:** On a 500-photo gallery the page makes 500 parallel API calls, saturating the HTTP/1.1 6-connection-per-host pool, delaying time-to-interactive, and hammering the Go API and DB.
- **Fix:** Extend GET /api/v1/galleries/{id}/assets to JOIN the assets table and return full Asset fields (thumbnail_urls, status) inline, or add POST /api/v1/assets/batch accepting an array of IDs. Then drop the per-asset getAsset() loop.
- **Verifier:** Reproduced exactly. Lines 243-252 map galleryAssets to per-entry getAsset(token, entry.asset_id) inside Promise.all. GalleryAsset (galleries.ts:289-295) carries only {id, gallery_id, asset_id, sort_order, is_hero} — no embedded asset object — so hydration is mandatory, and getAsset (assets.ts:49) is a single GET /api/v1/assets/{id}. The identical pattern repeats at lines 787-796 after upload completion. For a 500-photo gallery this is 500 concurrent authenticated requests. Genuine N+1 moved to the network layer.
- **Evidence:**
  ```
  galleries.ts:289 interface GalleryAsset { id; gallery_id; asset_id; sort_order; is_hero } ; page.tsx:246 const asset = await getAsset(token, entry.asset_id);
  ```

#### F-046 — Gallery detail grid renders all assets without pagination or virtualization

- **Dimension:** Frontend · Performance
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/galleries/[id]/page.tsx` : 1630-1631
- **Impact:** A 500-2000 photo wedding gallery generates that many DOM nodes and img elements on first render, causing multi-second layout/paint, high memory use, and possible mobile tab crashes.
- **Fix:** Add cursor/offset pagination to the backend endpoint (?limit=50&cursor=...) and implement virtual scrolling or a Load-more button on the frontend.
- **Verifier:** Confirmed. Line 1630 is a plain CSS grid and line 1631 does visibleAssets.map(...) with no pagination, slice, windowing, or load-more anywhere. listGalleryAssets (galleries.ts:455-462) issues GET /api/v1/galleries/{id}/assets with no limit/cursor/page query param, so the full asset set is fetched and rendered. visibleAssets (line ~470) is the asset list filtered by album/face/proofing only — never paged.
- **Evidence:**
  ```
  page.tsx:1630 <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"> {visibleAssets.map((entry) => ...} ; galleries.ts:456 authFetch(`/api/v1/galleries/${galleryId}/assets`) (no pagination params)
  ```

#### F-047 — Gallery detail grid img tags missing loading=lazy — all thumbnails block page load

- **Dimension:** Frontend · Performance
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/galleries/[id]/page.tsx` : 1722-1726
- **Impact:** On a 100+ photo gallery every thumbnail request fires immediately on load, saturating bandwidth and competing with LCP; severe on mobile data.
- **Fix:** Add loading="lazy" decoding="async" to the grid img; consider a blurhash placeholder for below-the-fold tiles.
- **Verifier:** Confirmed. The grid <img> at lines 1722-1726 has only src/alt/className — no loading or decoding attributes. grep for loading="lazy" / decoding="async" across the entire page.tsx returned zero matches. The public counterpart public-gallery-grid.tsx:813-814 does set both, confirming the dashboard grid omits them. Note: an isProcessing skeleton branch (lines 1705-1720) covers freshly-uploaded assets, but every ready thumbnail still loads eagerly.
- **Evidence:**
  ```
  page.tsx:1722-1726 <img src={previewUrl} alt={entry.asset?.filename || "Gallery asset preview"} className="aspect-[4/3] w-full object-cover" /> ; grep 'loading="lazy"' in page.tsx -> no matches
  ```

#### F-048 — useSearchParams() called without Suspense boundary in 9 client pages

- **Dimension:** Frontend · React/Next correctness
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/settings/plans/page.tsx` : 40-42
- **Impact:** Build-time static-generation error or whole-page CSR bailout for core payment and dashboard pages, including the plans and payment-callback critical payment path.
- **Fix:** Refactor each useSearchParams-dependent page to move the logic into a child client component wrapped in <Suspense fallback={...}>, mirroring the existing correct pattern in app/login/page.tsx (LoginForm), app/forgot-password/page.tsx, and app/reset-password/page.tsx.
- **Verifier:** Verified all 9 cited pages exist and call useSearchParams() directly in their default-export function with no Suspense wrapper: settings/plans/page.tsx:42 (PlansPage), settings/plans/payment-callback/page.tsx:26, settings/plans/choose-payment/page.tsx:121, settings/security/page.tsx:55, galleries/page.tsx:16, calendar/page.tsx:39, billing/page.tsx:41, onboarding/page.tsx:62, crm/projects/page.tsx:37 (ProjectsPage — the finder listed it without naming the fn, correct). The (dashboard)/layout.tsx has no Suspense and none of the pages set `export const dynamic`. Strong corroboration: the repo ITSELF documents this requirement — forgot-password/page.tsx:191 has the comment 'Next 15 requires useSearchParams() to sit inside a Suspense boundary' and both forgot-password and reset-password correctly wrap the inner component in <Suspense>, as does login/page.tsx:43 (LoginForm). next is 16.2.3, where this rule still holds. Nuance on impact: in Next 15/16 a missing Suspense most commonly forces a CSR bailout / de-opts static prerendering for the whole page (or errors during static generation), rather than a guaranteed unconditional runtime crash on every render — but it is a genuine correctness/build defect on the critical payment path.
- **Evidence:**
  ```
  settings/plans/page.tsx:40-43 `export default function PlansPage() { const router = useRouter(); const searchParams = useSearchParams(); const upgradeTo = searchParams.get("upgrade_to") ?? "";` — no Suspense in file (grep -c Suspense = 0). Contrast forgot-password/page.tsx:191-197 which wraps it correctly.
  ```

#### F-049 — PayoutHistory and PayoutApproval pass JSON null to setPayouts, crashing useDataTable

- **Dimension:** Frontend · React/Next correctness
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/features/dealer/PayoutHistory.tsx` : 54-63
- **Impact:** Runtime TypeError crash rendering PayoutHistory and PayoutApproval for any dealer with no payout records (new/empty accounts), via the useDataTable spread on null.
- **Fix:** Guard the fetch chain: `.then((d) => setPayouts(Array.isArray(d) ? d : []))`, or fix the Go repo to return `payouts := make([]Payout, 0)` (or normalize in respondJSON) so empty result serializes as [] not null.
- **Verifier:** Backend chain verified end-to-end. payout_repository.go:124 declares `var payouts []Payout` (nil slice) and List returns it unchanged when zero rows match (lines 124-132). handler/payout_handler.go:59 calls respondJSON(w, 200, payouts). respondJSON (asset_handler.go:287-291) is just `json.NewEncoder(w).Encode(data)` with NO nil-slice normalization, so a nil []Payout serializes to JSON `null`. Frontend PayoutHistory.tsx:59-60 does `.then((r) => (r.ok ? r.json() : [])).then(setPayouts)` — on a 200 with body null, r.json() yields null and setPayouts(null) runs. PayoutHistory.tsx:66 passes `data: payouts` into useDataTable, whose useMemo at use-data-table.ts:133 executes `let result = [...data]` — spreading null throws TypeError: null is not iterable. PayoutApproval.tsx:28-29 has the same `.then(r => {... return r.json()}).then(setPayouts)` against the same /api/v1/dealers/payouts endpoint. Confirmed for any dealer with zero payout rows.
- **Evidence:**
  ```
  payout_repository.go:124 `var payouts []Payout` returned directly; asset_handler.go:290 `json.NewEncoder(w).Encode(data)`; PayoutHistory.tsx:60 `.then(setPayouts)`; use-data-table.ts:133 `let result = [...data];`
  ```

#### F-050 — Banner CTA URL rendered without scheme validation (javascript: XSS)

- **Dimension:** Frontend · Security
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/components/gallery/public-gallery-banners.tsx` : 102-109
- **What:** The gallery banner CTA URL (banner.cta_url) is written directly into an <a href=...> without any scheme validation. A studio owner with access to the banner management API can set cta_url to a javascript: URI. Public gallery visitors who click the banner CTA button will execute that JavaScript in their browser context. The backend banner_service.go::validateBannerInput performs no URL scheme check on CTAURL.
- **Impact:** Any photographer with gallery access can inject javascript: scheme into cta_url and achieve stored XSS against every public gallery visitor who clicks the CTA banner. The CSP 'unsafe-inline' does NOT block javascript: href execution.
- **Fix:** Validate cta_url before rendering: only allow http: and https: schemes. Add an isSafeUrl helper and short-circuit the render when it returns false. Apply the same fix in backend/internal/service/banner_service.go::validateBannerInput to reject non-http(s) values at write time.
- **Verifier:** Reproduced exactly. public-gallery-banners.tsx:101-110 renders <a href={banner.cta_url} target="_blank" rel="noopener noreferrer"> with no scheme check (rel=noopener does NOT block javascript: execution, only window.opener access). Backend banner_service.go:52-63 validateBannerInput checks only Title (non-empty) and the active window; CTAURL is stored verbatim from in.CTAURL at line 76 (Create) and line 128 (Update). javascript: URIs survive end-to-end. Note: cta_url is studio/photographer-controlled, not arbitrary-visitor-controlled, so this is a privileged-insider stored-XSS against public visitors rather than anonymous XSS — still a genuine high given any photographer can hit every public gallery viewer.
- **Evidence:**
  ```
  {banner.cta_url && banner.cta_label ? (
    <a
      href={banner.cta_url}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer"
      className="..."
    >
      {banner.cta_label}
    </a>
  ) : null}
  ```

#### F-051 — Message attachment_url rendered without scheme validation (javascript: XSS)

- **Dimension:** Frontend · Security
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/messages/page.tsx` : 465-469
- **What:** The attachment_url field from the messaging API is rendered directly as an <a href=...> value with no URL scheme check. Any workspace member who can send a message can supply a javascript: URL as attachment_url. The recipient clicking the Attachment link will execute that JavaScript in the dashboard origin.
- **Impact:** Stored XSS in the authenticated dashboard. An attacker with workspace access can send a crafted message; any team member who opens the messages thread executes arbitrary JS under the dashboard origin, enabling session hijacking or data exfiltration.
- **Fix:** Validate msg.attachment_url before rendering: only allow https: scheme (attachment URLs are backend-generated storage paths). Add a guard: const safeAttachmentUrl = msg.attachment_url?.startsWith('https:') ? msg.attachment_url : null; and only render the <a> when safeAttachmentUrl is non-null. Alternatively apply the same isSafeUrl helper from the banner fix.
- **Verifier:** Reproduced at messages/page.tsx:465-469 — href={msg.attachment_url} with no scheme guard. The finding actually UNDERSTATES the exposure: the recommendation assumes attachment_url is 'backend-generated', but messaging_handler.go:131-156 decodes attachment_url straight from the request JSON body (line 134) and persists it verbatim into the Message (line 155) with zero validation. So it is fully attacker-controlled, not a trusted storage path — any workspace member can POST attachment_url=javascript:... and it renders into another member's dashboard <a href>. Genuine stored XSS. Fix should be a positive https-only allowlist as recommended.
- **Evidence:**
  ```
  {msg.attachment_url && (
    <a href={msg.attachment_url} className="text-xs text-accent underline mt-1 block" target="_blank" rel="noopener noreferrer">
      Attachment
    </a>
  )}
  ```

#### F-052 — PhonePe redirect_url used without scheme validation (open redirect / XSS)

- **Dimension:** Frontend · Security
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/settings/plans/choose-payment/page.tsx` : 203-208
- **What:** The UpgradeOrderResponse.redirect_url from the backend is passed directly to window.location.assign() without any URL scheme check. The streaming RechargeModal.tsx (line 114) correctly guards with if (!url.startsWith('https:')) before navigating. The plans payment page omits this guard entirely. If the backend endpoint is ever misconfigured or the response is intercepted, a javascript: or data: URL would execute in the user's browser.
- **Impact:** Open redirect / potential XSS. An attacker who can influence the API response (e.g. MITM over HTTP in dev, or a compromised backend) can redirect users to a phishing or JavaScript payload URL during the payment upgrade flow.
- **Fix:** Add the same scheme guard present in RechargeModal.tsx: if (!order.redirect_url.startsWith('https:')) { setErrorMsg('Invalid payment redirect URL'); return; } immediately before the window.location.assign call.
- **Verifier:** Reproduced at choose-payment/page.tsx:203-209 — window.location.assign(order.redirect_url) with only a non-empty check, no scheme guard. The cited sibling guard exists and is correct, but the path is components/streams/RechargeModal.tsx (line 114: if (!url.startsWith("https:")) throw ...), not components/streaming/ as the finding cited — minor path typo, code is real. This is an inconsistency-driven gap; severity 'high' is slightly generous since exploitation requires influencing the trusted backend response (the API is reached via Bearer-auth fetch to the configured backend), but adding the one-line https guard is the correct defensive fix and matches the established pattern.
- **Evidence:**
  ```
  if (order.provider === "phonepe") {
    if (!order.redirect_url) throw new Error("PhonePe order missing redirect URL");
    try {
      window.sessionStorage.setItem("rawdrive-pending-plan-name", plan.name);
    } catch { /* non-critical */ }
    window.location.assign(order.redirect_url);
    return;
  }
  ```

### 🟡 Medium (46)

#### F-053 — Multiple handlers leak raw internal error messages (err.Error()) in 5xx responses

- **Dimension:** Backend · API/validation/errors
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/chunked_upload.go` : 443, 484, 514, 626, 640, 646, 658, 688, 722, 742, 756
- **What:** Numerous handlers pass err.Error() directly into 5xx response bodies, exposing storage-layer detail (bucket names, object paths, multipart upload IDs), DB error text, and session state. Most sensitive on the chunked upload path.
- **Impact:** Information disclosure of storage bucket names, internal endpoint URLs, and Postgres error text (table/column/constraint names) to clients, aiding targeted attacks against the storage/DB layers.
- **Fix:** For 5xx errors, log err.Error() server-side and return a generic body (e.g. 'internal server error'). Reserve echoing err.Error() for 400-class validation where the message is user-actionable and contains no internal detail.
- **Verifier:** grep of chunked_upload.go confirms err.Error() embedded in 500 responses at EVERY cited line: 443 (failed to create multipart upload), 484 (persist upload session), 514/722/742 (session lookup failed), 626 (upload part), 640 (record part etag), 646 (update offset), 658 (session refresh), 688 (finalize), 756 (delete session). Corroborating references confirmed: album_handler.go:54 and 6 more (73,91,113,131,173,192) embed err.Error() in 500s; admin_users.go:108 (list users failed: %s); gallery_analytics_handler.go:59 etc. via respondError. S3/B2 multipart errors at line 443/484 can carry bucket/endpoint detail. Confirmed.
- **Evidence:**
  ```
  chunked_upload.go:443 — http.Error(w, fmt.Sprintf(`{"error":"failed to create multipart upload: %s"}`, err.Error()), 500). Same pattern at 484,514,626,640,646,658,688,722,742,756. album_handler.go:54 — `{"error":"`+err.Error()+`"}` (500). admin_users.go:108.
  ```

#### F-054 — Analytics list endpoints accept unbounded ?limit/?days query parameters — potential DB scan amplification

- **Dimension:** Backend · API/validation/errors
- **Category:** performance  ·  **Verdict:** `likely`
- **Location:** `backend/internal/handler/gallery_analytics_handler.go` : 121-122, 137-138
- **What:** GET top-views/top-downloads pass ?limit through handler→service→repo with no upper cap (only a <=0 default of 10). ?days on daily/summary/devices has no upper bound either. An authenticated user can request very large limit/days values.
- **Impact:** Authenticated user can issue large analytical queries (large sort/scan window via days), potentially causing latency spikes; low-effort amplification under concurrency. Bounded by row counts in practice.
- **Fix:** Cap limit (e.g. >100→100) and days (e.g. >365→365) in the handler, matching the existing admin_users.go:222 pattern.
- **Verifier:** Confirmed there is NO upper bound anywhere: handler (gallery_analytics_handler.go:121-122 GetTopViews, 137-138 GetTopDownloads, and days at 30/52/73/89/105) passes the value straight through; service (gallery_analytics_service.go:45-71) does no clamping; repo (gallery_asset_analytics_repo.go:64-72,83-91) only defaults limit=10 when <=0, then `LIMIT $2` with no max. The codebase even has the correct pattern at admin_users.go:222-223 (if limit>100 {limit=100}) and 94 (limit<=0||limit>100), so this is a real inconsistency. Marked 'likely' rather than 'confirmed' because actual amplification is bounded: `LIMIT n` returns at most the rows that exist, and the daily table is per-gallery date-ranged; true DoS impact depends on table size/indexes and is less severe than the title implies. The missing-cap fact is real; the severity/impact is somewhat overstated.
- **Evidence:**
  ```
  gallery_analytics_handler.go:121-122 — limit,_:=strconv.Atoi(...); h.analyticsSvc.TopViewed(...,limit). gallery_asset_analytics_repo.go:64-72 — if limit<=0 {limit=10}; ... LIMIT $2 [no max]. service layer (gallery_analytics_service.go:58-62) passes through unmodified.
  ```

#### F-055 — Contact CSV import handler has no request body size limit

- **Dimension:** Backend · API/validation/errors
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/contact_import_handler.go` : 18
- **What:** POST /api/v1/crm/contacts/import calls r.FormFile("file") without http.MaxBytesReader or an explicit ParseMultipartForm cap, relying on Go's implicit 32MB default — far larger than a contacts CSV needs.
- **Impact:** Authenticated users can upload up to ~32MB CSVs, forcing excess memory/CPU on parse; repeated concurrent uploads create a DoS condition.
- **Fix:** Set r.Body = http.MaxBytesReader(w, r.Body, 5<<20) and call r.ParseMultipartForm(5<<20) before r.FormFile, consistent with the explicit caps used elsewhere in the codebase.
- **Verifier:** contact_import_handler.go:18 calls r.FormFile("file") with no preceding http.MaxBytesReader or explicit r.ParseMultipartForm — confirmed by reading the full file (only 35 lines). Other handlers DO set explicit caps (public_gallery_handler.go:918 MaxBytesReader; asset_handler.go:101 ParseMultipartForm(500<<20); recharge/handler.go:239 1MB cap), so the absence here is a genuine inconsistency. Go's net/http implicitly defaults ParseMultipartForm to 32MB; the whole reader is then streamed into ImportContactsCSV. The fact (no explicit limit) is confirmed; 'medium' severity is generous (32MB implicit cap already prevents unbounded memory) but the gap is real.
- **Evidence:**
  ```
  contact_import_handler.go:18 — file,_,err := r.FormFile("file") with no MaxBytesReader/ParseMultipartForm above it; file is passed straight to service.ImportContactsCSV (line 25).
  ```

#### F-056 — No maximum password length at registration — bcrypt 72-byte truncation and potential DoS

- **Dimension:** Backend · API/validation/errors
- **Category:** security  ·  **Verdict:** `likely`
- **Location:** `backend/internal/auth/handler.go` : 345-348
- **What:** Register validates only a minimum password length (>=8) with no maximum. bcrypt truncates at 72 bytes, so passwords differing only past position 72 hash identically; arbitrarily long inputs are also accepted and hashed.
- **Impact:** Passwords >72 chars are silently truncated (weakened); large password strings waste server work. Bounded by the 5/min credLimiter and bcrypt's fixed cost.
- **Fix:** Add a max-length 400 check (e.g. >128 bytes) in Register, ValidatePassword, ChangePassword, and admin_user_service.go user creation. Note the cited 'user.go:106' reference is incorrect — fix it to the actual hashing site.
- **Verifier:** Register handler (handler.go:345-348) only checks len(req.Password) < 8 — no maximum — then calls h.users.Create(...,req.Password,...) (handler.go:370) which hashes downstream with bcrypt. passwordService.ValidatePassword (auth.go:852) likewise only enforces len < 8. Confirmed: no max-length guard, and bcrypt silently truncates >72 bytes. CAVEAT: the cited evidence 'user.go:106 bcrypt.GenerateFromPassword' is inaccurate — there is no backend/internal/auth/user.go; the Create implementation hashes the password elsewhere. The underlying weakness (no max length → 72-byte truncation collision + CPU waste on huge inputs) is real, but DoS impact is limited (bcrypt cost is fixed; a 100KB string mainly wastes the truncation copy, and the credLimiter 5/min throttles registration). Marked likely due to the partly-wrong cite and modest impact.
- **Evidence:**
  ```
  handler.go:345-348 — if len(req.Password) < 8 { ...400... } with no max check; handler.go:370 — h.users.Create(...,req.Password,...). auth.go:852 — ValidatePassword: if len(password)<8 {...} (no max).
  ```

#### F-057 — handlers Read claims["user_id"] Which Is Never Set in the JWT Claims Map

- **Dimension:** Backend · Auth & JWT security
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/design_collab_handler.go` : 31, 57, 71, 101
- **What:** JWTAuth middleware (jwt_auth.go line 35-42) stores: sub, workspace_id, role, platform_role, state_id, mfa_verified in the JWT claims map returned by JWTClaimsFromContext. It stores the user ID separately via context.WithValue(ctx, contextKey("user_id"), claims.Sub) — a different context slot. Multiple handlers (design_collab_handler.go, gallery_handler.go:656, design_template_handler.go:32) read claims["user_id"] from the JWT map, which is always empty. The correct claim is claims["sub"]. The result is that userID is always uuid.Nil for operations like JoinSession, AcquireLock, ReleaseLock, DuplicateGallery, and CreateTemplate.
- **Impact:** Every collaborative editing session, gallery duplication, and design template creation attributes the action to uuid.Nil instead of the real user. Presence tracking, lock ownership, and audit trails are silently corrupted. full_name/avatar_url are always empty so presence shows blank identities.
- **Fix:** Replace claims["user_id"] with claims["sub"] in design_collab_handler.go (lines 31,57,71,101), gallery_handler.go:656, and design_template_handler.go:32. Remove claims["full_name"]/claims["avatar_url"] reads (not JWT claims); source display name/avatar from a profile lookup instead.
- **Verifier:** Confirmed against jwt_auth.go:35-46 — the claims map contains NO user_id/full_name/avatar_url; user_id lives in a separate contextKey slot. Verified the bad reads at design_collab_handler.go:31,57,71,101, gallery_handler.go:656 (-> uuid.Nil into DuplicateGallery), and design_template_handler.go:32 (-> uuid.Nil into CreateTemplate). Other handlers (profile, asset, share_link, subscription) correctly use claims["sub"], confirming "sub" is the right key. Genuine medium-severity data-attribution bug.
- **Evidence:**
  ```
  jwt_auth.go:35-42 claimsMap keys = {sub, workspace_id, role, platform_role, state_id, mfa_verified}; user_id is set in a SEPARATE slot at line 46 via context.WithValue(ctx, contextKey("user_id"), claims.Sub). design_collab_handler.go:31-33 reads claims["user_id"], claims["full_name"], claims["avatar_url"] (none exist in the map). gallery_handler.go:656-657: userIDStr=claims["user_id"] ("") -> uuid.Parse("") err discarded -> userID=uuid.Nil passed to DuplicateGallery (line 678). design_template_handler.go:32-33 same, &userID(=Nil) passed to CreateTemplate (line 45).
  ```

#### F-058 — TOTP Verification Has No Replay Protection (Same Code Usable Twice in 30s Window)

- **Dimension:** Backend · Auth & JWT security
- **Category:** security  ·  **Verdict:** `likely`
- **Location:** `backend/internal/auth/totp.go` : 88
- **What:** TOTPService.Verify delegates to totp.Validate from github.com/pquerna/otp/totp using default options (skew=1 window). There is no used-codes cache to prevent replaying the same 6-digit code within the same 30-second TOTP step. An attacker observing a valid TOTP submission (e.g., via a phishing proxy or session recording) can immediately replay it to VerifyTOTP on a second request within the same window and receive a second valid session.
- **Impact:** Real-time phishing / AiTM attacks could capture and replay a TOTP code. However a replay requires a fresh, unconsumed mfa_token, which requires passing the password Login step again — so a captured code alone is not directly replayable through VerifyTOTP.
- **Fix:** After a successful totp.Validate, store the (userID, code, window-timestamp) triple in an in-process sync.Map or Valkey key with TTL=60s and reject any code already present, following the same pattern as consumedChallenges. Reasonable defense-in-depth, but lower priority than stated.
- **Verifier:** Code-level claim is accurate: totp.go:88 has no used-code cache and consumedChallenges (mfa_handler.go:736-768) dedupes the mfa_token, not the code. BUT the stated impact is materially mitigated: VerifyTOTP requires a valid unconsumed mfa_token (single-use, burned on success at mfa_handler.go:446-449), which is issued only after a password-Login. So 'replay the code on a second request within the window' needs a second mfa_token = a second password auth. Pure code-observation replay is not directly exploitable. Downgrading confidence to 'likely'; effective severity is closer to low. Defense-in-depth fix is still reasonable.
- **Evidence:**
  ```
  totp.go:81-89 Verify -> `return totp.Validate(code, secret), nil` with no per-code cache. The consumedChallenges sync.Map (mfa_handler.go:131,736-768) keys on the mfa_token (sha256 of the challenge JWT), NOT on the TOTP code — so it does not dedupe codes, only challenge tokens.
  ```

#### F-059 — Commission calculation uses float64 arithmetic for paisa amounts

- **Dimension:** Backend · Billing/commerce
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/service/commission_service.go` : 19-21
- **What:** CalculateCommission converts paisa to float64, multiplies by a float64 percent, divides by 100, truncates to int64. Same pattern in dealer_analytics_repository.go:129. float64 multiplication introduces rounding that differs from an integer basis-point calc and is inconsistent with the codebase's paisa-integer invariant.
- **Impact:** Commission/revenue-share payouts can be off by 1 paisa from a pure-integer basis, causing systematic small over/under-payment to dealers and violating the project's paisa-integer money rule. Not catastrophic for realistic amounts.
- **Fix:** Store rates as integer basis points (1500 = 15.00%) and compute paymentAmountPaisa * basisPoints / 10000 in pure integer arithmetic; update DealerPct/PlatformPct/CommissionRatePct schema/fields accordingly.
- **Verifier:** Confirmed. commission_service.go:19-21 `return int64(float64(paymentAmountPaisa) * dealerPct / 100)` — float multiply then truncate. dealer_analytics_repository.go:129 has the identical pattern `int64(float64(d.TotalSubscriptionPaisa) * commissionRatePct / 100.0)`. DealerPct/PlatformPct/CommissionRatePct are all float64 (margin_repository.go:19-20, dealer_repository.go:24, dealer_analytics_repository.go:24). CalculateCommission is live — called from payout_service.go:57 for real payouts. The 1-paisa rounding drift and paisa-integer-invariant violation are genuine; impact is bounded (sub-2^53) so medium severity is appropriate, not higher.
- **Evidence:**
  ```
  commission_service.go:20 return int64(float64(paymentAmountPaisa) * dealerPct / 100)
  dealer_analytics_repository.go:129 d.RevenueSharePaisa = int64(float64(d.TotalSubscriptionPaisa) * commissionRatePct / 100.0)
  payout_service.go:57 commissionEarned := CalculateCommission(grossRevenue, margin.DealerPct)  // live caller
  ```

#### F-060 — Margin validation uses float64 equality comparison — valid configs can be wrongly rejected

- **Dimension:** Backend · Billing/commerce
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/service/margin_service.go` : 36
- **What:** ConfigureMargin validates dealer_pct + platform_pct == 100 with float64 equality. Float64 addition can fail exact equality for inputs that sum to 100 in decimal, causing valid fractional splits to be rejected with ErrInvalidMarginSum.
- **Impact:** Admins may be unable to configure certain fractional dealer/platform splits due to floating-point imprecision; valid business configs silently rejected. Whole-number splits are unaffected.
- **Fix:** Use tolerance comparison `math.Abs(m.DealerPct+m.PlatformPct-100) > 0.001`, or store percentages as integer basis points (10000 = 100.00%) and validate with exact integer arithmetic.
- **Verifier:** Confirmed at margin_service.go:36: `if m.DealerPct+m.PlatformPct != 100 { return ErrInvalidMarginSum }`. DealerPct and PlatformPct are float64 (margin_repository.go:19-20). Exact float64 equality on a sum of two decimals can fail for fractional splits whose binary representation does not sum exactly to 100.0 (e.g. 0.7+99.3). The vulnerability is real; in practice many admin inputs are whole numbers (15/85, 20/80) which sum exactly, so real-world incidence is lower — medium severity is fair. The finding's specific 0.7+99.2=99.9 example arithmetic is muddled but the float-equality flaw itself is valid.
- **Evidence:**
  ```
  margin_service.go:36 if m.DealerPct+m.PlatformPct != 100 { return ErrInvalidMarginSum }
  margin_repository.go:19-20 DealerPct float64; PlatformPct float64
  ```

#### F-061 — RevokeInvite Has No Workspace Ownership Check — Cross-Tenant Invitation Revocation

- **Dimension:** Backend · Multi-tenant isolation
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/team/handler.go` : 168-183
- **What:** RevokeInvite passes only the invite ID to the service; the service ignores workspace scope and swallows errors (returns nil); the repo UPDATE has no workspace_id filter. The invitations RLS policy is the only backstop and is unreliable (no FORCE RLS, owner bypass, and session-var-on-pooled-connection race).
- **Impact:** A user in workspace A may revoke a pending invitation in workspace B (cross-tenant), and the swallowed error hides failures. Severity depends on RLS being effectively enforced in the deployed DB role, which the code does not guarantee.
- **Fix:** 1) Read workspace_id from JWT claims in the handler and pass it through. 2) Add `AND workspace_id = $2` to the Revoke UPDATE. 3) Return a real error when RowsAffected()==0 so the handler can 404. 4) Stop swallowing repo errors in RevokeInvitation. Separately, fix the RLS reliability: add FORCE ROW LEVEL SECURITY and run the app as a non-owner role, and set app.workspace_id transaction-locally on the same connection as queries.
- **Verifier:** All application-layer claims verified exactly. handler.go:168-183 RevokeInvite reads claims (line 169) but never extracts workspace_id; passes only inviteID to svc.RevokeInvitation. team.go:191-201 RevokeInvitation calls repo.Revoke with no workspace scope AND swallows any error returning nil (lines 194-199). repo.go:62-70 Revoke = `UPDATE invitations SET revoked = true WHERE id = $1` (no workspace_id filter). The ONLY backstop is RLS: migration 061 (061_rls_extension_f009.up.sql:58 ENABLE, :152-156 invitations_isolation policy on app.workspace_id) — but it is UNRELIABLE here: (1) no FORCE ROW LEVEL SECURITY anywhere, so a table-owner DB role bypasses RLS; (2) main.go:701-712 connects via DATABASE_URL with no SET ROLE/AfterConnect to a non-owner; (3) db_context.go:29-31 SetWorkspaceID uses set_config(...,false) (session-scoped) on a pooled pgx connection, decoupled from the separate r.pool.Exec connection that runs the UPDATE — so app.workspace_id may not be set on the executing connection. Code-layer vulnerability is real and the RLS mitigation is not guaranteed. Confirmed.
- **Evidence:**
  ```
  handler.go:175-177 inviteID := chi.URLParam(...); h.svc.RevokeInvitation(r.Context(), inviteID) (no wsID); team.go:193-200 err := s.repo.Revoke(...); if err != nil { return nil }; repo.go:64 `UPDATE invitations SET revoked = true WHERE id = $1`; 061_rls_extension_f009.up.sql:152-156 policy but no FORCE; db_context.go:31 set_config(...,$1,false) on pool.
  ```

#### F-062 — AdminWorkspaceService Constructed Without Audit Log — Workspace Suspend/Delete Produce No Audit Trail

- **Dimension:** Backend · Multi-tenant isolation
- **Category:** audit-log  ·  **Verdict:** `confirmed`
- **Location:** `backend/cmd/api/main.go` : 1957
- **What:** AdminWorkspaceService is built without WithAuditLog, so its nil-guarded recordAudit no-ops and workspace suspend/unsuspend/delete write no audit_logs entries. The repo layer also writes no audit entry.
- **Impact:** Workspace suspend/unsuspend/delete are absent from audit_logs, undermining incident investigation and SOC2/DPDPA reconstruction of who suspended/deleted a workspace and when (only suspended_by/deleted_by columns survive on the row).
- **Fix:** Change main.go:1957 to service.NewAdminWorkspaceService(adminWorkspaceRepo).WithAuditLog(auditLogSvc), mirroring workspacePolicySvc at line 1942.
- **Verifier:** main.go:1957 WorkspaceSvc: service.NewAdminWorkspaceService(adminWorkspaceRepo) — no .WithAuditLog(auditLogSvc), unlike main.go:1942 workspacePolicySvc.WithAuditLog(auditLogSvc). admin_workspace_service.go:22-24 constructor leaves auditLog nil; recordAudit (lines 75-78) `if s.auditLog == nil { return }` no-ops; SuspendWorkspace/UnsuspendWorkspace/DeleteWorkspace (lines 50,59,69) all call recordAudit, so all three silently produce no audit_logs row. I also checked the repo (admin_workspace_repo.go:285-344): Suspend/Unsuspend/SoftDelete do only `UPDATE workspaces` and write NO audit_logs entry, so there is no compensating audit at the repo layer. Minor mitigation: workspaces.suspended_by/deleted_by columns capture who, but that is not the immutable audit trail. Confirmed.
- **Evidence:**
  ```
  main.go:1957 NewAdminWorkspaceService(adminWorkspaceRepo) [no WithAuditLog]; main.go:1942 workspacePolicySvc.WithAuditLog(auditLogSvc); admin_workspace_service.go:76 `if s.auditLog == nil { return }`; admin_workspace_repo.go:285-344 UPDATE-only, no audit_logs insert.
  ```

#### F-063 — ThumbnailWorker and UploadSessionCleanupWorker Stop() panic on double-call (DownloadWorker is safe)

- **Dimension:** Backend · Media pipeline
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/worker/thumbnail_worker.go` : 128-130
- **What:** ThumbnailWorker.Stop() and UploadSessionCleanupWorker.Stop() call close(w.stopCh) unconditionally; a second or concurrent Stop() panics with 'close of closed channel'. DownloadWorker.Stop() in the same package uses the idempotent select guard and was not propagated to the others.
- **Impact:** If both context cancellation and an explicit StopAll() fire during graceful shutdown, or test teardown calls Stop() twice, the worker panics and can crash the process.
- **Fix:** Replace bare `close(w.stopCh)` with the idempotent select guard from DownloadWorker in ThumbnailWorker (thumbnail_worker.go:129) and UploadSessionCleanupWorker (upload_session_cleanup_worker.go:87); also consider the bare-close workers in internal/ai/.
- **Verifier:** Core claim confirmed but the finding's file paths were imprecise. ThumbnailWorker.Stop (worker/thumbnail_worker.go:128-130) and UploadSessionCleanupWorker.Stop (worker/upload_session_cleanup_worker.go:86-88) both do bare `close(w.stopCh)` — a second call or concurrent call panics 'close of closed channel'. DownloadWorker.Stop (worker/download_worker.go:105-112) uses the idempotent select{ case <-w.stopCh: default: close } guard, exactly the safe pattern. The finding cited the comparison file as ai/face_worker.go; the cited workers actually live in internal/worker/, not internal/ai/. (Separately, ai/face_worker.go:66, aesthetic_worker.go:44, burst_worker.go:38, duplicate_worker.go:51, search_worker.go:56 also use bare close — broader than the finding noted.)
- **Evidence:**
  ```
  thumbnail_worker.go:129 — close(w.stopCh)
  upload_session_cleanup_worker.go:87 — close(w.stopCh)
  download_worker.go:106-111 — select { case <-w.stopCh: default: close(w.stopCh) }  // safe
  ```

#### F-064 — TUS Upload-Offset header not enforced on PATCH — offset check silently skipped when header absent or malformed

- **Dimension:** Backend · Media pipeline
- **Category:** bug  ·  **Verdict:** `likely`
- **Location:** `backend/internal/handler/chunked_upload.go` : 519-526
- **What:** PATCH offset validation is wrapped in `if offsetStr != ""`, so an absent Upload-Offset header skips validation entirely; a present-but-unparseable header sets parseErr != nil and the inner condition short-circuits to false, silently ignoring it. TUS 5.3 requires the header and a 409 on mismatch.
- **Impact:** A non-compliant or replaying client can omit/garble Upload-Offset and bypass the offset-ordering guard, removing a defensive correctness check and masking the double-absorb retry bug.
- **Fix:** Make the header mandatory: return 400 if offsetStr == "" ('Upload-Offset header required') and 400 if parseErr != nil ('Upload-Offset header invalid'), keeping the existing 409 on mismatch, per TUS 1.0.0 section 5.3.
- **Verifier:** Code matches the finding exactly at 519-526: the offset comparison is gated on `if offsetStr != ""` (absent header => no validation), and within it `parseErr == nil && offset != row.UploadOffset` (unparseable header => silently ignored, no 409/400). This is a genuine deviation from TUS 5.3, which requires the header and a 409 on mismatch. Marking 'likely' rather than 'confirmed' because no concrete corruption was demonstrated in the normal single-instance flow — the server still numbers parts from its own state.nextPart and updates offset server-side, so a missing header mainly removes a defensive guard (and, as the finding notes, would let the double-absorb retry slip past undetected). The bypass is real; the corruption impact is plausible but unproven.
- **Evidence:**
  ```
  offsetStr := r.Header.Get("Upload-Offset"); if offsetStr != "" { offset, parseErr := strconv.ParseInt(offsetStr, 10, 64); if parseErr == nil && offset != row.UploadOffset { http.Error(..., 409); return } }
  ```

#### F-065 — coupon_redemptions.discount_applied and dealer_commission_config.fixed_incentive_inr store monetary amounts as DECIMAL(10,2) instead of integer paisa

- **Dimension:** Database · Schema & migrations
- **Category:** db  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/database/migrations/027_create_m6_coupon_tables.up.sql` : 49
- **Impact:** Monetary values stored as 2-decimal INR diverge from the BIGINT-paisa convention; Go reads fixed_incentive_inr into int64 producing a 100x magnitude error and risking scan failures on fractional values.
- **Fix:** Migrate both columns to BIGINT paisa with `... TYPE BIGINT USING ROUND(col*100)::BIGINT`, rename fixed_incentive_inr -> fixed_incentive_paise, and update Go structs/SQL. Confirm no live data depends on the current 2-decimal semantics before converting.
- **Verifier:** Verified, with a line-number correction. discount_applied DECIMAL(10,2) is at 027:49 (finding said 47). fixed_incentive_inr DECIMAL(10,2) NOT NULL DEFAULT 0 is at 026:76. Billing convention is BIGINT paisa throughout 022 (subtotal_paisa, total_paisa, amount_paisa at lines 12-18,48), confirming the inconsistency. The 100x mismatch claim is confirmed: margin_repository.go:22 declares `FixedIncentiveINR int64` and scans the DECIMAL(10,2) column directly (margin_cols line 38, Scan line 43). pgx scanning a DECIMAL into int64 truncates the rupee value (e.g. 500.00 -> 500) rather than storing 50000 paisa, and a fractional value would error — so reads are semantically wrong vs the paisa convention used everywhere else. Genuine correctness/consistency issue; medium is fair.
- **Evidence:**
  ```
  027_create_m6_coupon_tables.up.sql:49 `discount_applied DECIMAL(10,2) NOT NULL,`; 026_...:76 `fixed_incentive_inr DECIMAL(10,2) NOT NULL DEFAULT 0,`; 022_...:12-18 `*_paisa BIGINT`; margin_repository.go:22 `FixedIncentiveINR int64`
  ```

#### F-066 — MessagingHandler.CreateChannel ignores AddMember error

- **Dimension:** Backend · Error handling & observability
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/messaging_handler.go` : 87-91
- **What:** After creating a channel, AddMember makes the creator an admin but the returned error is fully discarded (not even _ =). If it fails the channel exists with no membership for its creator.
- **Impact:** Creator may be unable to access a channel they just created; orphaned channels accumulate.
- **Fix:** Check and log the AddMember error.
- **Verifier:** Verified at messaging_handler.go:86-92 — AddMember return value is discarded entirely (no assignment) and CreateChannel responds 201 unconditionally. Contrast with line 78 where CreateChannel's own error IS handled. Genuine inconsistency and error-handling gap.
- **Evidence:**
  ```
  h.repo.AddMember(r.Context(), &repository.ChannelMember{
      ChannelID: ch.ID,
      UserID:    userID,
      Role:      "admin",
  })
  respondJSON(w, http.StatusCreated, map[string]any{"data": ch})
  ```

#### F-067 — Subscription upgrade order failure status update silently discarded

- **Dimension:** Backend · Error handling & observability
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/subscription_upgrade_handler.go` : 525-527
- **What:** On a FAILED/EXPIRED PhonePe result the handler marks the order 'failed' via _, _ = h.db.Exec(...), discarding both rows-affected and error. If the UPDATE fails the order stays 'pending'.
- **Impact:** Failed payment orders can remain 'pending', confusing subscription state.
- **Fix:** Capture and log the error from Exec.
- **Verifier:** Verified at subscription_upgrade_handler.go:524-528 — exact `_, _ = h.db.Exec(...)` present in the default (FAILED/EXPIRED) branch. Note the surrounding handler DOES handle errors elsewhere (FetchOrderStatus 512, applyPhonePePayment 532), so this swallow is a localized gap. The plan tier is correctly left unchanged, limiting blast radius to a stale order row. Medium is fair.
- **Evidence:**
  ```
  _, _ = h.db.Exec(r.Context(),
      `UPDATE subscription_upgrade_orders SET status = 'failed', updated_at = NOW()
       WHERE id::text = $1 AND status = 'pending'`, body.MerchantOrderID)
  ```

#### F-068 — GearHandler.UpdateBookingStatus silently ignores gear availability update failure

- **Dimension:** Backend · Error handling & observability
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/gear_handler.go` : 394
- **What:** On booking approve/return/complete the handler flips gear.IsAvailable and persists via h.repo.Update, discarding the error with _ =. On failure the listing shows stale availability.
- **Impact:** Stale gear availability can cause double-bookings.
- **Fix:** Log the Update error.
- **Verifier:** Verified at gear_handler.go:384-396. The `_ = h.repo.Update(r.Context(), &gear)` at line 394 is real and inside a best-effort block guarded by `gErr == nil`. The primary booking-status update (line 379) is properly error-handled and returns 500; only the secondary availability sync is swallowed. Genuine but secondary; medium is appropriate.
- **Evidence:**
  ```
  _ = h.repo.Update(r.Context(), &gear)
  ```

#### F-069 — consent_service uses fmt.Printf instead of structured logger, leaks PII to stdout

- **Dimension:** Backend · Error handling & observability
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/service/consent_service.go` : 226
- **What:** A DPDP consent-withdrawal cascade error is logged via fmt.Printf with the visitor email and consent type embedded, writing PII to unstructured stdout.
- **Impact:** Email PII in unstructured container logs; DPDP/GDPR compliance risk; especially relevant for India market.
- **Fix:** Use a structured logger and hash/omit the email; log a correlation ID instead.
- **Verifier:** Verified at consent_service.go:226 — `fmt.Printf("[consent] cascade emit failed for %s/%s: %v\n", email, ct, err)` present, with `email` being the visitor's raw address (see VisitorEmail at line 219). Using fmt.Printf for an error path and embedding PII are both real. Ironic given this is the DPDP consent-withdrawal flow itself. Confirmed.
- **Evidence:**
  ```
  fmt.Printf("[consent] cascade emit failed for %s/%s: %v\n", email, ct, err)
  ```

#### F-070 — Email addresses logged in plaintext across auth, dealer, and password-reset paths

- **Dimension:** Backend · Error handling & observability
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/auth/handler.go` : 387,399,628,641
- **What:** Multiple log.Printf calls embed the raw user email in registration, OTP-resend, dealer credential, password-reset session-revoke, and password-reset OTP-send paths.
- **Impact:** User email PII persists in log aggregators with no TTL; DPDP/GDPR risk.
- **Fix:** Mask or hash emails in logs (e.g. us***@example.com); keep a user UUID correlation ID instead.
- **Verifier:** Primary citations verified exactly: auth/handler.go:387, 399, 628, 641 all log req.Email/email. Secondary references mostly verified: dealer_service.go:321 logs dealerEmail; auth/auth.go:797 logs email in the password-reset OTP path. ONE path correction: the cited 'backend/internal/auth/auth_password_reset_handler.go:122' does NOT exist — the file is at backend/internal/handler/auth_password_reset_handler.go and line 122 indeed logs the email (`failed to revoke sessions for %s`). So the issue is real but the path was wrong. Net: confirmed; note the corrected handler path.
- **Evidence:**
  ```
  log.Printf("auth.Register: create user failed email=%s: %v", req.Email, err)
  log.Printf("auth.Register: OTP generation failed email=%s: %v", req.Email, err)
  log.Printf("auth.ResendOTP: user lookup failed email=%s: %v", req.Email, err)
  log.Printf("[dealer-creds] credentials email sent to %s for dealer %q", dealerEmail, businessName)
  ```

#### F-071 — BulkRemoveTags issues one UPDATE per tag — O(tags × rows) DB round-trips

- **Dimension:** Backend · Performance & concurrency
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/repository/asset_repo.go` : 618-625
- **What:** BulkRemoveTags loops over tags and runs a separate UPDATE (full JSONB rewrite of every affected row) per tag against the same id set, when a single query with !=ALL could handle all removals.
- **Impact:** Removing N tags from M assets = N round-trips and N full JSONB rewrites per row; bulk-edit (select all → remove tags) causes write amplification and pool pressure.
- **Fix:** Pass the whole tag list as a text[] param and filter in one pass: WHERE elem->>'tag' != ALL($1::text[]). Collapses N round-trips to 1.
- **Verifier:** Confirmed verbatim at asset_repo.go:619-624 — `for _, tagName := range tags { r.pool.Exec(ctx, `UPDATE assets SET ai_tags = (SELECT ... WHERE elem->>'tag' != $1)...`, tagName, ids, workspaceID) }`. One UPDATE per tag, all rewriting the same id set. Genuine O(tags) round-trips; contrast BulkAddTags at :611 which is a single Exec.
- **Evidence:**
  ```
  for _, tagName := range tags {
      _, err := r.pool.Exec(ctx, `UPDATE assets SET ai_tags = (...) WHERE id = ANY($2) AND workspace_id = $3 AND deleted_at IS NULL`, tagName, ids, workspaceID)
      ...
  }
  ```

#### F-072 — BulkMoveToGallery issues one INSERT per asset in a loop inside a transaction

- **Dimension:** Backend · Performance & concurrency
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/repository/asset_repo.go` : 549-556
- **What:** BulkMoveToGallery iterates owned asset IDs and calls tx.Exec per asset to INSERT into gallery_assets, N round-trips inside one transaction where an UNNEST multi-row INSERT would do.
- **Impact:** Moving 100 assets = 100 INSERT round-trips inside the tx, extending tx duration and holding row locks longer.
- **Fix:** Single INSERT ... SELECT $1, unnest($2::uuid[]), generate_series(0, array_length($2,1)-1), now() ON CONFLICT DO NOTHING.
- **Verifier:** Confirmed verbatim at asset_repo.go:549-557 — `for i, id := range owned { tx.Exec(ctx, `INSERT INTO gallery_assets ... VALUES ($1,$2,$3,now()) ON CONFLICT DO NOTHING`, toGalleryID, id, i) }`. Note the preceding DELETE at :540 already uses ANY($2) (bulk), so the insert loop is the inconsistent slow path. Genuine.
- **Evidence:**
  ```
  for i, id := range owned {
      if _, err := tx.Exec(ctx, `INSERT INTO gallery_assets (gallery_id, asset_id, sort_order, added_at) VALUES ($1, $2, $3, now()) ON CONFLICT DO NOTHING`, toGalleryID, id, i); err != nil { ... }
  }
  ```

#### F-073 — GalleryAssetRepo.Reorder issues one UPDATE per asset in a loop

- **Dimension:** Backend · Performance & concurrency
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/repository/gallery_asset_repo.go` : 101-117
- **What:** Reorder iterates items and runs tx.Exec per item to set sort_order; a 500-photo re-sort emits 500 UPDATEs inside one transaction.
- **Impact:** Drag-and-drop reorder of a large gallery = N sequential round-trips holding the tx open, increasing lock contention.
- **Fix:** Single UPDATE ... FROM unnest($1::uuid[], $2::int[]) AS v(asset_id, sort_order) WHERE gallery_id=$3 AND asset_id=v.asset_id.
- **Verifier:** Confirmed verbatim at gallery_asset_repo.go:108-114 inside the Begin/Commit tx (102/116) — per-item `tx.Exec(ctx, `UPDATE gallery_assets SET sort_order=$1 WHERE gallery_id=$2 AND asset_id=$3`, ...)`. Genuine N-round-trip reorder.
- **Evidence:**
  ```
  for _, item := range items {
      if _, err := tx.Exec(ctx, `UPDATE gallery_assets SET sort_order=$1 WHERE gallery_id=$2 AND asset_id=$3`, item.SortOrder, galleryID, item.AssetID); err != nil { ... }
  }
  ```

#### F-074 — DesignCollabService.cleanupLoop goroutine leaks on application shutdown — no stop channel

- **Dimension:** Backend · Performance & concurrency
- **Category:** concurrency  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/service/design_collab_service.go` : 60, 247-277
- **What:** NewDesignCollabService spawns `go svc.cleanupLoop()` which runs `for range ticker.C` with no ctx.Done() / stop-channel case and the service exposes no Stop/Shutdown. The goroutine never terminates; in tests instantiating the service repeatedly, goroutines accumulate.
- **Impact:** No graceful join on shutdown; goroutine and ticker leak. Test suites that build multiple instances accumulate live goroutines.
- **Fix:** Accept a ctx (or add stopCh chan struct{} + Stop()) and select on ctx.Done()/stopCh alongside ticker.C. Compare ThumbnailWorker which already has stopCh+Stop().
- **Verifier:** Confirmed: design_collab_service.go:53-62 NewDesignCollabService takes only nc *nats.Conn and fires `go svc.cleanupLoop()` at :60 with no ctx/stopCh stored on the struct; cleanupLoop at :247-277 is a bare `for range ticker.C { ... }` with no ctx.Done()/stop case and no Stop method on the type. Genuine unbounded goroutine. (Notably ThumbnailWorker in the same codebase does it correctly with stopCh+Stop, confirming the leak is an oversight.)
- **Evidence:**
  ```
  NewDesignCollabService: `go svc.cleanupLoop()` (line 60); cleanupLoop: `ticker := time.NewTicker(30 * time.Second); ... for range ticker.C { s.mu.Lock(); ...; s.mu.Unlock() }` (247-277) — no exit case.
  ```

#### F-075 — N+1 per-asset GetByID in smart album face cluster resolution

- **Dimension:** Backend · Performance & concurrency
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/service/album_service.go` : 283-291
- **What:** Smart-album resolution loops cluster asset IDs and calls assetRepo.GetByID per ID (283-291); same N+1 for favorites (240-250). The in-code comment justifies it as 'always small' but face clusters for popular subjects can reach 50-200 photos, and the public gallery album endpoint reaches this path for unauthenticated visitors.
- **Impact:** Smart album load for a 100-asset face cluster issues 100 sequential DB queries, on a path reachable by anonymous gallery visitors.
- **Fix:** Add AssetRepo.GetByIDs and replace both loops (favorites 240, cluster 283) with a single WHERE id = ANY($1).
- **Verifier:** Confirmed both loops in album_service.go: favorites at :240-250 (`for _, aid := range favIDs { a, err := assetRepo.GetByID(ctx, aid) ... }`) and face-cluster at :283-291 (`for _, aid := range clusterAssets { a, err := assetRepo.GetByID(ctx, aid) ... }`), the latter with the code comment at :279-281 explicitly acknowledging O(N) and rationalizing 'always small'. Genuine N+1 on both, reachable from the public album path.
- **Evidence:**
  ```
  for _, aid := range clusterAssets {
      a, err := assetRepo.GetByID(ctx, aid)
      if err != nil || a == nil { continue }
      matched = append(matched, *a)
  }
  ```

#### F-076 — Download service assembles ZIP on local disk before uploading to B2

- **Dimension:** Backend · Storage & hardcode-law
- **Category:** config  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/service/download_service.go` : 221-258
- **Impact:** On pods with small /tmp or heavy concurrent download load, the local filesystem can fill (ENOSPC/OOM), affecting all services sharing the FS. Large gallery contents are briefly written to local disk during assembly.
- **Fix:** Stream the zip.Writer through an io.Pipe into the storage MultipartCapable interface (multipart.go) to upload chunks directly to B2 without materializing the ZIP on /tmp. If keeping temp files short-term, bound concurrency and place temp dir on a sized volume with a disk-space guard.
- **Verifier:** Code matches exactly: download_service.go:224 tmp,_ := os.CreateTemp("", "rawdrive-dl-%s-*.zip"); line 232-235 defer Close+os.Remove; line 237 writeZipWithProgress(...,tmp,...); line 250 Seek(0); line 255 s.store.Put(ctx, storageKey, tmp, size, "application/zip"). So a full gallery ZIP is materialized on local disk (/tmp) before upload. This is genuine local-disk I/O. Severity nuance: the file is request-scoped, double-deferred for cleanup, and the doc comment (lines 208-211) notes /tmp tmpfiles cleanup — so it is not persistent storage of user files, but it does risk /tmp/ENOSPC exhaustion on constrained pods under large/concurrent downloads. The recommended fix is viable: MultipartCapable exists (multipart.go:34-42) so a streaming io.Pipe + multipart upload can avoid the temp file.

#### F-077 — pg_hba.conf uses trust authentication for all local Unix socket connections

- **Dimension:** Config & Infrastructure
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `deploy/postgres/pg_hba.conf` : 8
- **What:** `local all all trust` allows any OS user inside the Postgres container passwordless access to any database via the Unix socket.
- **Impact:** A compromise of any process inside the container yields full DB access (all workspace data, credentials, MFA secrets, payment records).
- **Fix:** Use `local all postgres peer` plus a passworded maintenance role, or `local all all scram-sha-256`. Entrypoint init scripts already run as postgres, so peer suffices.
- **Verifier:** Verified verbatim. pg_hba.conf:8 is `local   all             all                                     trust` under the comment 'Unix socket for container-local maintenance'. Any in-container process reaching the Unix socket gets passwordless access to every database. Severity medium is fair: exploitation requires an existing foothold inside the postgres container, but in that scenario it is unrestricted access to all tenant data, MFA secrets, and payment records. Standard hardening would use `peer` for the postgres superuser or scram-sha-256.
- **Evidence:**
  ```
  pg_hba.conf:8 `local   all             all                                     trust`
  ```

#### F-078 — api.rawdrive.in nginx server block missing X-Frame-Options, X-XSS-Protection, and Referrer-Policy headers; no CSP anywhere

- **Dimension:** Config & Infrastructure
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `deploy/nginx/templates/rawdrive.conf.template` : 176
- **What:** api.rawdrive.in block has only HSTS + X-Content-Type-Options; wildcard block adds Referrer-Policy but lacks X-Frame-Options/X-XSS-Protection; no Content-Security-Policy in any block.
- **Impact:** api responses can be framed (clickjacking) and lack legacy XSS hints; absence of CSP everywhere leaves reflected-XSS/injection/mixed-content unmitigated at the proxy.
- **Fix:** Add X-Frame-Options DENY, X-XSS-Protection, Referrer-Policy to the api block; add a CSP to all blocks; factor shared headers into an include file to prevent drift.
- **Verifier:** Verified. The api.rawdrive.in block (server_name at line 170) sets only HSTS (176) and X-Content-Type-Options (177) — no X-Frame-Options, X-XSS-Protection, or Referrer-Policy. The wildcard gallery-host block (server_name at 201) adds Referrer-Policy (216) but still lacks X-Frame-Options and X-XSS-Protection. The main rawdrive.in block (53) sets all seven (65-71). A grep for 'content-security' across the template returns nothing, confirming no CSP in any block. Matches the finding precisely. Note the line cited (176) is the HSTS header, not the X-Frame line; the X-Frame omission is the real point and is accurate.
- **Evidence:**
  ```
  Template: api block lines 176-177 (HSTS + nosniff only); wildcard block 214-216 (HSTS + nosniff + Referrer-Policy); main block 65-71 (all 7); grep 'content-security' → no matches.
  ```

#### F-079 — .env.example references obsolete Cloudflare R2 driver (STORAGE_DRIVER=r2) after migration to Backblaze B2

- **Dimension:** Config & Infrastructure
- **Category:** config  ·  **Verdict:** `confirmed`
- **Location:** `.env.example` : 116
- **What:** Root .env.example ships STORAGE_DRIVER=r2 + R2_* vars; actual stack uses STORAGE_DRIVER=s3 + B2_*. The 'r2' driver is unrecognized by the factory and errors at boot.
- **Impact:** New engineers following .env.example set an unsupported driver; backend fails at storage init (no images stored/served). Both root and deploy .env.example are out of sync with the shipped B2 backend.
- **Fix:** Update both .env.example files to STORAGE_DRIVER=s3 with B2_BUCKET_NAME, B2_KEY_ID, B2_APPLICATION_KEY, B2_ENDPOINT, B2_REGION; remove or clearly mark R2_* as legacy.
- **Verifier:** Verified and impact strengthened. Root .env.example:116 sets `STORAGE_DRIVER=r2` with R2_* vars (117-123). The storage factory (backend/internal/storage/factory.go:24-37) switches on only 'local' (returns hardcode-law error) and 's3' (NewS3Driver); ANY other value — including 'r2' — hits `default: unsupported driver %q` at line 36, so a developer following .env.example gets a backend that errors at storage init. The S3 driver reads B2_* vars (per factory error text and .env.backend), not R2_*. Actual prod config .env.backend:18-22 documents 'Migrated 2026-05-18: R2 → B2', STORAGE_DRIVER=s3, B2_BUCKET_NAME=rawfolder. deploy/.env.example:28-34 is also stale with R2_* vars. The README/onboarding-breakage claim is fully substantiated.
- **Evidence:**
  ```
  .env.example:116 `STORAGE_DRIVER=r2` + R2_* (117-123); factory.go:36 `default: return nil, fmt.Errorf("storage: unsupported driver %q", cfg.Driver)`; .env.backend:18-22 documents R2→B2 + STORAGE_DRIVER=s3 + B2_BUCKET_NAME; deploy/.env.example:28-34 also R2_*.
  ```

#### F-080 — Production deploy script disables SSH host-key checking (StrictHostKeyChecking=no)

- **Dimension:** Config & Infrastructure
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `deploy/scripts/deploy-prod.sh` : 22
- **What:** Deploy script disables TOFU/MITM detection on all SSH connections, then pushes a source tarball over SSH and builds on the VPS.
- **Impact:** A MITM between operator and VPS can inject code into the pushed tarball; it becomes part of the prod Docker image with no warning surfaced.
- **Fix:** Use StrictHostKeyChecking=yes with a seeded UserKnownHostsFile of the VPS fingerprints; document the fingerprints for first-connect verification.
- **Verifier:** Verified. deploy-prod.sh:22 `SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=10"`. The supply-chain concern is substantiated by the push mechanism: push_code() (lines 116-128) does `tar ... -cf - . | $SSH "root@$ip" 'tar -xf - -C /opt/rawdrive/app'` and the script then builds Docker images on the VPS from that pushed source. With host-key verification disabled, a MITM on first/any connect could intercept and tamper with the streamed tarball, and the injected code would be built into prod images with no host-key warning. Severity medium is reasonable given it requires network-position MITM.
- **Evidence:**
  ```
  deploy-prod.sh:22 `StrictHostKeyChecking=no`; push_code() lines 120-121 `tar "${tar_excludes[@]}" -cf - . | $SSH "root@$ip" 'tar -xf - -C /opt/rawdrive/app'`; subsequent build-on-VPS steps.
  ```

#### F-081 — Abandoned EXIF parser (rwcarlsen/goexif) used on untrusted uploaded images

- **Dimension:** Dependencies & supply chain
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/go.mod` : 19
- **What:** github.com/rwcarlsen/goexif is pinned to a 2019 commit and is effectively abandoned. It decodes EXIF from every untrusted user-uploaded image in exif_service.go, so future parser/memory-safety bugs would never be patched upstream.
- **Impact:** Parsing attacker-crafted JPEG EXIF with an unmaintained parser risks DoS via panics or, worst case, memory-corruption affecting backend stability; future CVEs in this lib will go unfixed.
- **Fix:** Replace with a maintained parser (e.g. github.com/dsoprea/go-exif v3) or extract EXIF via exiftool subprocess; update backend/internal/service/exif_service.go accordingly. Run govulncheck to confirm no currently-tracked CVE.
- **Verifier:** Confirmed. backend/go.mod line 19 requires github.com/rwcarlsen/goexif v0.0.0-20190401172101-9e8deecbddbd (April 2019 pseudo-version, unmaintained). backend/internal/service/exif_service.go line 12 imports "github.com/rwcarlsen/goexif/exif" and line 73 calls exif.Decode(r) inside Extract(r io.Reader) — r is the uploaded image stream, i.e. attacker-controlled. Finding cited go.mod line 18 (actual 19) and decode line 70 (actual 73) — minor off-by-one location errors; the substance is exactly right. Severity medium is appropriate: this is a maintenance/supply-chain risk, not a known live CVE.
- **Evidence:**
  ```
  backend/go.mod line 19: github.com/rwcarlsen/goexif v0.0.0-20190401172101-9e8deecbddbd. exif_service.go line 12 imports goexif/exif; line 73: x, err := exif.Decode(r) where r is the uploaded io.Reader (func Extract(r io.Reader), line 72).
  ```

#### F-082 — Production Docker image edoburu/pgbouncer:latest is a floating tag

- **Dimension:** Dependencies & supply chain
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `deploy/docker-compose.prod-app.yml` : 32
- **What:** Production deploy uses edoburu/pgbouncer:latest, a floating tag. A docker compose pull on any deploy day can silently pull a different (or compromised) pgbouncer image sitting between the backend and prod Postgres.
- **Impact:** Non-reproducible deployments and automatic pull of a compromised upstream image; a pgbouncer bug or supply-chain compromise could cause connection failures or credential exposure.
- **Fix:** Pin to a specific digest or version tag (e.g. edoburu/pgbouncer:1.22.1) in deploy/docker-compose.prod-app.yml line 32. Also pin axllent/mailpit:latest in docker-compose.yml line 50.
- **Verifier:** Confirmed. deploy/docker-compose.prod-app.yml line 32: 'image: edoburu/pgbouncer:latest' — a floating tag for the production connection pooler. Also confirmed docker-compose.yml line 50: 'image: axllent/mailpit:latest' (dev). Note: prod compose pins nats:2.11-alpine, valkey:9.0-alpine, pgvector:pg17 (lines 143/166/189) — so pgbouncer is the one unpinned prod image, exactly as the finding states. Genuine non-reproducible-deploy / supply-chain exposure.
- **Evidence:**
  ```
  deploy/docker-compose.prod-app.yml line 32: image: edoburu/pgbouncer:latest. docker-compose.yml line 50: image: axllent/mailpit:latest.
  ```

#### F-083 — Dev/prod Docker infrastructure version mismatch (Postgres 16 vs 17, Valkey 8 vs 9)

- **Dimension:** Dependencies & supply chain
- **Category:** config  ·  **Verdict:** `confirmed`
- **Location:** `docker-compose.yml` : 5
- **What:** Dev docker-compose.yml runs Postgres 16 / Valkey 8 / nats:2-alpine while prod compose runs Postgres 17 / Valkey 9.0 / nats:2.11 — major-version drift for Postgres and Valkey plus a floating dev nats tag.
- **Impact:** Behavior differences in Postgres 17 / Valkey 9 (SQL, pgvector ops, Valkey commands) never surface in dev/CI, a classic parity-failure root cause for hard-to-reproduce prod incidents.
- **Fix:** Align dev to prod: set docker-compose.yml to pgvector/pgvector:pg17, valkey/valkey:9.0-alpine, nats:2.11-alpine, then run the full test suite against the updated stack.
- **Verifier:** Confirmed precisely. docker-compose.yml line 5: pgvector/pgvector:pg16; line 21: valkey/valkey:8-alpine; line 34: nats:2-alpine. deploy/docker-compose.prod-db.yml lines 9/43/74 and prod-app.yml lines 189/166/143: pgvector:pg17, valkey:9.0-alpine, nats:2.11-alpine. So dev/prod diverge by a full major version on both Postgres (16->17) and Valkey (8->9), and dev nats uses a floating minor (2-alpine) vs prod 2.11-alpine. Real parity gap as described.
- **Evidence:**
  ```
  docker-compose.yml line 5 pgvector:pg16, line 21 valkey:8-alpine, line 34 nats:2-alpine. deploy/docker-compose.prod-db.yml lines 9/43/74 pg17/valkey:9.0-alpine/nats:2.11-alpine.
  ```

#### F-084 — Raw <button> with inline <svg> for icon action in streams/page.tsx

- **Dimension:** Frontend · Design-token compliance
- **Category:** ui  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/streams/page.tsx` : 151-159
- **Fix:** Replace with GlassIconButton variant='danger' size='md' label='Delete stream' containing the Trash icon from frontend/src/components/icons/index.tsx.
- **Verifier:** Confirmed: the stream delete control is a raw <button onClick={handleDelete} aria-label='Delete stream'> with an inline trash <svg className='w-5 h-5'>. It correctly carries min-w-[44px] min-h-[44px] (touch target OK) and uses hover:bg-error/10 / hover:text-error token classes, but it bypasses the GlassIconButton mandate for icon-only destructive actions. Anti-pattern is real; touch target is fine. Medium severity is appropriate.

#### F-085 — Hardcoded hex color in Footer.tsx

- **Dimension:** Frontend · Design-token compliance
- **Category:** ui  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/components/layout/Footer.tsx` : 51
- **Fix:** If this orange is intentional partner branding, add a named token (e.g. brand.partnerAccent) to globals.css/@theme and reference the generated class. Otherwise replace with an existing semantic token. Do not leave the raw hex arbitrary value.
- **Verifier:** Verified verbatim at Footer.tsx:51: `<span className="text-[#e07b39]">Consultants</span>` — an arbitrary Tailwind hex value, explicitly forbidden by the project rule against arbitrary values (text-[#3B82F6] is the cited example). Surrounding context (lines 33/43 'Swaz Consultants') shows it is partner brand styling. Not theme-aware and not in any token. Confirmed.

#### F-086 — Tailwind gray primitive text-gray-200 in admin/layout.tsx

- **Dimension:** Frontend · Design-token compliance
- **Category:** ui  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/admin/layout.tsx` : 33
- **Fix:** Replace hover:text-gray-200 with a semantic token: hover:text-text-primary (light surface) or hover:text-text-inverse (dark surface), matching the admin nav background.
- **Verifier:** Verified at admin/layout.tsx:33: `text-text-tertiary hover:text-gray-200 hover:bg-white/[0.03]`. text-gray-200 is a Tailwind primitive scale, forbidden by the project rule (text-gray-500 is the cited example). gray-200 is near-white and is NOT in the @theme color map, so it does not adapt per theme; on the liquid-glass light theme the hover text would be low-contrast. Confirmed token violation; the light-theme legibility risk is plausible (depends on the admin nav surface color, which I did not fully trace, but the primitive usage itself is unambiguous).

#### F-087 — bg-green-600 Tailwind primitive in public submission success banner

- **Dimension:** Frontend · Design-token compliance
- **Category:** ui  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/components/gallery/public-gallery-grid.tsx` : 899
- **Fix:** Replace bg-green-600/95 with bg-feedback-success/95 (or bg-success/95). Leave shadow-lg as-is (it is a token).
- **Verifier:** Verified at public-gallery-grid.tsx:899: `fixed bottom-0 ... bg-green-600/95 backdrop-blur-xl px-4 py-3 shadow-lg`. bg-green-600 is a Tailwind color primitive NOT present in the @theme color map (grep for color-green returned nothing), so it bypasses the token system and ignores the per-theme success color (e.g. midnight --semantic-success #2eb88a). Confirmed. NOTE: the finding's secondary 'shadow-lg is also a violation' claim is FALSE — shadow-lg is token-mapped here (globals.css 319); only the bg-green-600 is the real issue.

#### F-088 — Tailwind color primitives (text-red-400, text-red-500, text-green-500) in gallery components

- **Dimension:** Frontend · Design-token compliance
- **Category:** ui  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/components/gallery/product-preview.tsx` : 248, 334-348
- **Fix:** Replace with semantic tokens: text-red-400/500 -> text-feedback-error, text-green-500 -> text-feedback-success, text-blue-400 -> text-info, and bg-*-500/10 -> bg-feedback-error/10, bg-info/10, etc.
- **Verifier:** All instances verified. product-preview.tsx:248 `text-sm text-red-400` (error alert); :334-336 `bg-blue-500/10 border-blue-500/30`, `text-blue-400` (status badge); :346-348 `bg-red-500/10 border-red-500/40`, `text-red-400`. gallery-canvas.tsx:215 `text-red-500 text-lg` (heart). comment-thread.tsx:115 `text-xs text-green-500` ('✓ Resolved'). red/green/blue are NOT in the @theme color map, so all are raw Tailwind primitives bypassing the token system and not adapting to midnight's semantic palette. Confirmed across all four cited files.

#### F-089 — getStoredAccessToken() called inline in render body, triggering synchronous localStorage writes on every render

- **Dimension:** Frontend · Performance
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/galleries/[id]/page.tsx` : 482
- **Impact:** Each re-render (frequent during uploads) does 4 synchronous storage removeItem() calls on the main thread during the most performance-sensitive UX window.
- **Fix:** Read the token once via useRef(getStoredAccessToken()) or useState initializer, or make clearLegacyStoredTokens() lazy (check key existence first / call once at app boot).
- **Verifier:** Confirmed. Line 482 `const token = getStoredAccessToken();` sits in the component render body (outside any hook/effect), passed to useUpload at line 483. lib/auth.ts:35-38 shows getStoredAccessToken() calls clearLegacyStoredTokens() unconditionally, which (auth.ts:13-23) loops over both window.localStorage and window.sessionStorage and calls removeItem() for each of 2 LEGACY_TOKEN_KEYS = 4 synchronous storage writes per call. Upload progress state updates re-render the component, so this runs on every re-render during uploads. The estimate of '4 writes/sec' is plausible but rate depends on progress event cadence — the mechanism itself is verified.
- **Evidence:**
  ```
  auth.ts:36 clearLegacyStoredTokens(); auth.ts:18 for (const storage of [window.localStorage, window.sessionStorage]) { for (const key of LEGACY_TOKEN_KEYS) storage.removeItem(key); } ; page.tsx:482 const token = getStoredAccessToken();
  ```

#### F-090 — lucide-react imported in 58 files alongside custom icons barrel, bloating client bundles

- **Dimension:** Frontend · Performance
- **Category:** performance  ·  **Verdict:** `needs-human`
- **Location:** `frontend/src/app/(dashboard)/layout.tsx` : 8-17
- **Impact:** Possible incremental client-bundle weight in the shell and inconsistent icon treatment across themes; exact KB cost unmeasured.
- **Fix:** Measure actual bundle delta first (analyze build). If material, migrate shell/sidebar icons to the custom SF-Symbols barrel in components/icons/index.tsx; otherwise treat as a design-consistency cleanup, not a perf fix.
- **Verifier:** The factual core is confirmed: grep counts exactly 58 .tsx files importing from "lucide-react", and layout.tsx:8-17 imports Bell, FolderOpen, Home, LogOut, Menu, Search, Settings, User, X. The shell layout plus Navbar and all four sidebars (AdminSidebar, ClientSidebar, DealerSidebar, StudioSidebar) and SidebarShell all import lucide. What I cannot verify without a build is the ~20-40 KB bundle-weight claim (lucide tree-shakes per icon, so unused icons are not shipped) and whether this is truly a 'performance' issue versus a design-system-consistency (UI-rule) concern. The AGENTS.md GlassIconButton rule targets icon BUTTON actions, not every inline icon, so the rule-violation framing needs human judgment.
- **Evidence:**
  ```
  grep -rl 'from "lucide-react"' src --include='*.tsx' | wc -l -> 58 ; layout.tsx:8-17 imports {Bell, FolderOpen, Home, LogOut, Menu, Search, Settings, User, X}
  ```

#### F-091 — Album membership loading is also N+1: one listAlbumAssets call per album

- **Dimension:** Frontend · Performance
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/galleries/[id]/page.tsx` : 284-301
- **Impact:** Every album-targeted upload completion fires N+1 album-membership requests (11 for a 10-album gallery).
- **Fix:** Add GET /api/v1/galleries/{id}/albums?include_asset_ids=true returning membership inline, collapsing N+1 to one request.
- **Verifier:** Confirmed verbatim. refreshAlbums (lines 284-301) calls listGalleryAlbums then Promise.all over nextAlbums each issuing listAlbumAssets(t, album.id) — 1 + N requests. It runs on mount via useEffect (lines 304-306) and is awaited after upload at line 806 (inside the targetAlbumId branch). For 10 albums that is 11 requests per refresh, repeating on every upload that targets an album.
- **Evidence:**
  ```
  page.tsx:289-293 const memberships = await Promise.all(nextAlbums.map(async (album) => { const albumAssets = await listAlbumAssets(t, album.id).catch(() => []); ...})); page.tsx:806 await refreshAlbums();
  ```

#### F-092 — Public gallery grid renders all assets with no pagination on a public-facing client component

- **Dimension:** Frontend · Performance
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/components/gallery/public-gallery-grid.tsx` : 637
- **Impact:** A 1000-photo public gallery builds 1000 DOM nodes with event listeners for every guest, inflating memory/JS heap and causing frame drops on low-end Android while scrolling.
- **Fix:** Render the first 50-100 assets and append pages via IntersectionObserver, or add server-side pagination to the public asset endpoint with infinite scroll.
- **Verifier:** Confirmed. Line 637 visibleAssets.map renders every asset. visibleAssets (line 554-557 useMemo) returns the full assets array, only face-filtered — no slice, no pagination, no virtualization. grep for pagination/virtual/IntersectionObserver/slice/loadMore in the file found no rendering-pagination usage. Individual imgs do set loading=lazy and decoding=async (lines 813-814) so network is throttled, but the full DOM tree (with click/keyboard handlers) is built eagerly as the finding states.
- **Evidence:**
  ```
  public-gallery-grid.tsx:554 const visibleAssets = useMemo(() => { if (!faceFilterIds) return assets; return assets.filter(...); }, ...) ; line 637 {visibleAssets.map((asset) => ...)}
  ```

#### F-093 — AI CullingView uses non-WebP thumbnail key (thumbnail_urls.sm), bypassing the mandatory WebP derivative rule

- **Dimension:** Frontend · Performance
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/components/ai/CullingView.tsx` : 64
- **Impact:** Legacy .sm JPEG is ~40-70% larger than .sm_webp for photographic content; in a 500-photo culling session this wastes bandwidth and slows the exact surface where photographers need fast visual feedback.
- **Fix:** Use asset.thumbnail_urls?.thumb_sm_webp || asset.thumbnail_urls?.thumb_md_webp || asset.thumbnail_urls?.sm to prefer WebP with JPEG fallback.
- **Verifier:** Confirmed. CullingView.tsx:63-64 checks asset.thumbnail_urls?.sm and renders <img src={asset.thumbnail_urls.sm} ...> — the legacy JPEG small key, with no WebP preference. This contrasts with public-gallery-grid.tsx:640-651 which prefers thumb_md_webp/thumb_lg_webp/thumb_sm_webp/display_webp before any legacy key. Violates the AGENTS.md 'UI always serves WebP variants' rule on the AI culling surface.
- **Evidence:**
  ```
  CullingView.tsx:64 <img src={asset.thumbnail_urls.sm} alt={asset.filename} className="w-full h-full object-cover" loading="lazy" />
  ```

#### F-094 — SpendDashboard sets state after unmount — no cancelled/ignore guard in useEffect

- **Dimension:** Frontend · React/Next correctness
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/components/ai/SpendDashboard.tsx` : 15-21
- **Impact:** Stale-token data race: when the AI token prop changes, a slower prior response can overwrite fresher state. Post-unmount writes are no-ops under React 18+.
- **Fix:** Add `let cancelled = false;` before the Promise.all, guard setSpend/setCredits/setLoading with `if (!cancelled)`, and return `() => { cancelled = true; }`.
- **Verifier:** Verified SpendDashboard.tsx:15-20 exactly matches the cited code: Promise.all([getSpend(token), getCredits(token)]).then(([s,c])=>{setSpend(s);setCredits(c);}).catch(console.error).finally(()=>setLoading(false)); with dep array [token], no cancelled flag, no returned cleanup. The real bug is the stale-response race when `token` changes while a request is in flight (old response can land after new and overwrite). The post-unmount setState part is a true no-op in React 18+ (React silently drops it and emits no warning), so that specific framing slightly overstates severity, but the token-change race is genuine. Repo uses the correct guarded pattern elsewhere (e.g. FaceClusterBrowser.tsx:28 `let ignore = false` + cleanup), so medium is fair.
- **Evidence:**
  ```
  SpendDashboard.tsx:15-20 useEffect with Promise.all(...).then(...).finally(()=>setLoading(false)); deps [token]; no cleanup returned.
  ```

#### F-095 — BYOKSetup, CouponAnalytics, DealerDashboard, CommissionTracker, DealerAdminReview lack unmount guard in useEffect

- **Dimension:** Frontend · React/Next correctness
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/components/ai/BYOKSetup.tsx` : 20-28
- **Impact:** Prop-change data races (stale responses overwriting fresh state) for token/couponId-driven effects; post-unmount writes are no-ops under React 18+. Low production visibility.
- **Fix:** Add `let ignore = false` + `if (!ignore)` guards + `return () => { ignore = true; }` to each effect. Correct the component paths to src/features/dealer/ for the four non-BYOK components.
- **Verifier:** Primary cited file verified: BYOKSetup.tsx:20-28 has getAIConfig(token).then(...).catch(console.error).finally(()=>setLoading(false)) with deps [token], no ignore flag, no cleanup — matches evidence exactly. The other four components also confirmed to lack guards, BUT the description's paths are wrong: they live in src/features/dealer/ (CouponAnalytics.tsx:16-17, DealerDashboard.tsx:17-21, DealerAdminReview.tsx:33-38, CommissionTracker.tsx:22-29), not src/components/ai/ or src/components/dealer/. CouponAnalytics fires on couponId; DealerDashboard/DealerAdminReview/CommissionTracker on mount. Reference pattern claim verified: FaceClusterBrowser.tsx:27-50 and StreamAnalyticsPanel.tsx:50-63 do return cleanup. Same caveat as finding 3: in React 18+ the post-unmount write is a no-op; the real exposure is prop-change races (token/couponId), which exists for BYOKSetup and CouponAnalytics. Confirmed with a path-accuracy note.
- **Evidence:**
  ```
  BYOKSetup.tsx:20-28 (no cleanup); src/features/dealer/CouponAnalytics.tsx:17 single-line .then(...).finally(...); DealerDashboard.tsx:17-21; DealerAdminReview.tsx:33-38; CommissionTracker.tsx:22-29 — none return a cleanup.
  ```

#### F-096 — MarketplaceInquiriesPanel suppresses exhaustive-deps ESLint rule hiding a stale closure

- **Dimension:** Frontend · React/Next correctness
- **Category:** bug  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/components/crm/marketplace-inquiries-panel.tsx` : 60
- **Impact:** Race condition when token refreshes (two concurrent listInquiries each call setState); eslint suppression masks the stale-closure from review; per-render atob decode of the JWT.
- **Fix:** Wrap `load` in useCallback with [token, currentUserID] deps, add an ignore guard inside it, add load to the effect dep array, and remove the eslint-disable. Memoize currentUserID/claims via useMemo to avoid per-render atob.
- **Verifier:** Verified marketplace-inquiries-panel.tsx:42-60: `load` is a plain function (not useCallback) closing over token + currentUserID, doing listInquiries(token).then(...).catch(...) with no cancelled/ignore guard (grep for cancelled/ignore/return () => in this file returned nothing). Line 60 is `useEffect(() => { load(); }, [token, currentUserID]); // eslint-disable-line react-hooks/exhaustive-deps` exactly as cited. Also confirmed currentUserID is derived at component-body level (line 31 `const currentUserID = claims?.sub ?? ""` from getStoredAccessTokenClaims at line 30), and getStoredAccessTokenClaims calls window.atob (auth.ts:43) — so it runs on every render, not just mount, as the finder claimed. Note: a concurrent .filter on listInquiries result would also throw if the API returns null (line 51), an additional latent risk. Confirmed.
- **Evidence:**
  ```
  marketplace-inquiries-panel.tsx:30-31 claims/currentUserID at render; :42-58 unguarded `load`; :60 `useEffect(() => { load(); }, [token, currentUserID]); // eslint-disable-line react-hooks/exhaustive-deps`; auth.ts:43 `return window.atob(padded);`
  ```

#### F-097 — JWT access token interpolated into SSE URL without encodeURIComponent

- **Dimension:** Frontend · Security
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/messages/page.tsx` : 261-262
- **What:** The JWT access token is appended to the EventSource URL using template string interpolation without encodeURIComponent. The use-asset-ready-subscription.ts hook (line 81) correctly uses encodeURIComponent(token). Passing unencoded JWT in a URL query string also means the token appears in server access logs in plain text. SSE does not support Authorization headers, so a query-param approach is necessary here, but the value must be encoded.
- **Impact:** A JWT containing special characters (e.g. if the token format ever changes) could break the SSE connection or lead to mis-parsed query strings. More importantly, the raw token is logged by the Go access logger and any reverse proxy (nginx) between the client and backend, increasing token exposure surface.
- **Fix:** Wrap token in encodeURIComponent: ?token=${encodeURIComponent(token)}&channels=chat. This matches the pattern in use-asset-ready-subscription.ts.
- **Verifier:** Reproduced at messages/page.tsx:261-262 — token interpolated raw into the EventSource query string. Contrast confirmed: use-asset-ready-subscription.ts:81-83 wraps both token and channel in encodeURIComponent. Standard JWTs (base64url, no special chars) won't actually break, so the functional risk is low and this is more a hardening/consistency fix; the token-in-URL logging concern is pre-existing for both call sites. Medium is reasonable for the inconsistency; the one-line fix is correct.
- **Evidence:**
  ```
  const es = new EventSource(
    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"}/api/v1/events/stream?token=${token}&channels=chat`
  );
  ```

#### F-098 — Production CSP carries 'unsafe-inline' in script-src

- **Dimension:** Frontend · Security
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `frontend/next.config.ts` : 63
- **What:** The Content-Security-Policy header served on every route includes 'unsafe-inline' in script-src. This is a known configuration — the comment acknowledges it is pending a nonce-based CSP follow-up — but it materially weakens XSS defences. Any XSS that does inject an inline <script> or inline event handler will execute unimpeded.
- **Impact:** Inline script injection XSS bypasses the CSP. The banner CTA and attachment_url findings above are significantly worse because the CSP provides no compensating control.
- **Fix:** Implement nonce-based CSP as noted in the comment. Next.js 14+ supports nonce injection via middleware and the nonce prop on Script components. Remove 'unsafe-inline' from script-src once nonces are wired.
- **Verifier:** Verified at next.config.ts:63 — script-src includes 'unsafe-inline' on every route (headers() applies securityHeaders to source '/:path*'). The comment at lines 11-12 and 58 acknowledges it as a known temporary state pending nonce-based CSP. This is a real defense-in-depth weakness and correctly amplifies the javascript:/inline XSS findings above, though it is a documented, accepted-tradeoff config rather than an accidental bug. Medium is appropriate.
- **Evidence:**
  ```
  `script-src 'self' 'unsafe-inline' blob:${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`
  ```

### ⚪ Low (26)

#### F-099 — Gallery analytics GetDailyStats leaks raw DB/service error in 500 response

- **Dimension:** Backend · API/validation/errors
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/gallery_analytics_handler.go` : 59, 76, 92, 108, 124, 140
- **What:** All analytics endpoint 5xx paths embed err.Error(), which can contain Postgres error text with table/column/constraint names. Authenticated workspace owners see internal schema detail.
- **Impact:** Authenticated gallery owners see raw DB error messages disclosing internal schema details.
- **Fix:** Replace err.Error() with a static safe message ('analytics unavailable') and log the real error server-side, matching the GetSummary path already in the same file.
- **Verifier:** Confirmed all six cited error paths call respondError(w, 500, "analytics_failed", err.Error()): line 59 (GetDailyStats), 76 (GetDeviceBreakdown), 92 (GetDownloadVelocity), 108 (GetShareChannels), 124 (GetTopViews), 140 (GetTopDownloads). Note GetSummary (line 37) is the one exception — it returns a static 'analytics failed' message — so the pattern is inconsistent within the same file. These are authenticated workspace-owner endpoints, so raw DB/service error text reaches the client. Genuine (subset of finding #4, but the cited lines are accurate).
- **Evidence:**
  ```
  gallery_analytics_handler.go:59 — respondError(w, http.StatusInternalServerError, "analytics_failed", err.Error()); identical at 76,92,108,124,140. (Line 37 GetSummary correctly uses a static message.)
  ```

#### F-100 — Admin settings handler accepts arbitrary {category} and {key} path params with no allowlist

- **Dimension:** Backend · API/validation/errors
- **Category:** bug  ·  **Verdict:** `likely`
- **Location:** `backend/internal/handler/admin_settings_handler.go` : 33-34, 52-55
- **What:** Admin settings CRUD accepts any category/key string with no allowlist of valid categories. Values are parameterized (injection-safe), but a super_admin can create rows in undefined categories.
- **Impact:** Super-admins can write settings rows under undefined categories (table pollution / confusion). The stated encryption-bypass is not real — encryption depends on is_secret, not category. Low severity, super_admin-only.
- **Fix:** Add an allowlist {storage, auth, payments, ai, email, messaging} and 400 on unlisted categories. Drop the encryption-bypass justification from the rationale — it does not apply.
- **Verifier:** Confirmed: admin_settings_handler.go ListByCategory (33-34), GetSetting (52-55), UpsertSetting (70-71), DeleteSetting (97-98) all take chi.URLParam category/key and pass them to the repo with no allowlist validation — values are parameterized SQL (no injection). The missing-allowlist fact is real. HOWEVER the finding's stated impact ('bypass the documented encryption handling') is a FALSE premise: platform_settings_repo.go drives encryption off the is_secret request-body field (decryptIfNeeded at line 58, encryption gated on IsSecret), NOT on the category string — so an unlisted category does not bypass encryption. Real impact is only minor table pollution with undefined categories, reachable solely by super_admin. Downgraded to likely because the validation gap exists but its security rationale is incorrect and the actual impact is cosmetic.
- **Evidence:**
  ```
  admin_settings_handler.go:33 — category := chi.URLParam(r,"category"); h.repo.ListByCategory(...,category) [no validation]. UpsertSetting:70-71 — category/key from URL passed to h.repo.Upsert. No validCategories map anywhere. platform_settings_repo.go gates encryption on IsSecret, not category.
  ```

#### F-101 — Password reset handler leaks complexity rule message verbatim in 400 response

- **Dimension:** Backend · API/validation/errors
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/auth_password_reset_handler.go` : 105
- **What:** validateResetPasswordComplexity returns an errors.New sentinel embedded directly into the response body. Safe here (controlled message), but it normalizes a +err.Error()+ pattern reused elsewhere with DB/storage errors.
- **Impact:** Low here (controlled complexity message), but the copied pattern leaks internal detail in album_handler.go / api_key_handler.go / chunked_upload.go.
- **Fix:** Use a fixed string per known sentinel instead of echoing err.Error(); reserve verbatim error text for known-safe validation messages and never for service/DB errors.
- **Verifier:** auth_password_reset_handler.go:105 confirmed — http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest) for validateResetPasswordComplexity (line 104). As the finding itself states, this specific case is safe (the message is a controlled in-process complexity sentinel), and notably the ResetPassword call at lines 108-116 correctly avoids leaking internal errors (maps everything to generic 400/429). The value of the record is the precedent: the same `+err.Error()+` pattern is copied to album_handler.go (54,73,91,...) and api_key_handler.go:71 where err originates from DB/service. Confirmed as a low/info-level pattern note.
- **Evidence:**
  ```
  auth_password_reset_handler.go:104-106 — if err := validateResetPasswordComplexity(body.NewPassword); err != nil { http.Error(w, `{"error":"`+err.Error()+`"}`, 400) }. Pattern reused at album_handler.go:54 and api_key_handler.go:71 with DB/service errors.
  ```

#### F-102 — Email OTP Validation Uses Non-Constant-Time String Comparison

- **Dimension:** Backend · Auth & JWT security
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/auth/auth.go` : 204
- **What:** OTPService.Validate uses the Go != operator to compare the stored 6-digit code against the user-supplied code. String comparison in Go is not constant-time; a timing side-channel leaks how many leading digits match. The password-reset service (same file, line 831) correctly uses subtle.ConstantTimeCompare, but the email-OTP path does not.
- **Impact:** Timing oracle on the 6-digit code. With sufficient requests an attacker could in theory determine correct leading digits. The rate limiter (MaxAttempts, 15-minute window) significantly reduces practical exploitability, but the defence-in-depth gap is real.
- **Fix:** Replace 'if entry.code != code' with 'if subtle.ConstantTimeCompare([]byte(entry.code), []byte(code)) != 1', matching the pattern already used in passwordService.ResetPassword (auth.go:831).
- **Verifier:** Confirmed at auth.go:204 (plain != compare) vs auth.go:831 (ConstantTimeCompare). crypto/subtle is imported (line 7) and the MaxAttempts rate limiter at line 190 caps practical exploitability, exactly as scoped. Genuine low-severity, easy one-line fix consistent with the existing pattern.
- **Evidence:**
  ```
  auth.go:204 `if entry.code != code {`. Contrast auth.go:831 `if subtle.ConstantTimeCompare([]byte(entry.otp), []byte(otp)) != 1 {`. crypto/subtle is already imported (auth.go:7). Rate limiter present: MaxAttempts checked at auth.go:190.
  ```

#### F-103 — JWT Access Token Missing Audience and Issuer Claims

- **Dimension:** Backend · Auth & JWT security
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/auth/auth.go` : 312-322
- **What:** GenerateAccessToken and generateAccessTokenUnlocked produce JWT MapClaims with sub, workspace_id, role, platform_role, state_id, mfa_verified, exp, iat — but no aud (audience) or iss (issuer) claims. ParseAccessToken does not validate aud or iss. Without audience binding, a token issued for the RawDrive API would be accepted by any service that trusts the same RS256 public key.
- **Impact:** Low risk today (single service). Becomes a token confusion/replay risk if a second service ever shares the same signing key or public key. OAuth/OIDC mandate aud validation.
- **Fix:** Add "iss": "rawdrive-api" and "aud": []string{"rawdrive-api"} to all generated tokens (access, refresh, MFA challenge). In ParseAccessToken and the challenge-token parse path, pass jwt.WithAudience and jwt.WithIssuer to jwt.Parse.
- **Verifier:** Confirmed: access-token MapClaims (auth.go:312-321) has no aud/iss; ParseAccessToken (auth.go:326-339) checks only signing method + Valid. grep across the auth package finds no JWT-level Issuer/Audience anywhere. Correctly self-scoped as low (single service today). Valid defense-in-depth hardening.
- **Evidence:**
  ```
  auth.go:312-321 MapClaims = {sub, workspace_id, role, platform_role, state_id, mfa_verified, exp, iat} — no aud/iss. ParseAccessToken (auth.go:326-339) validates only the RSA signing method and token.Valid; no WithAudience/WithIssuer. grep shows the only Issuer/Audience usage in the auth package is TOTP otpauth-URL issuer, not JWT claims.
  ```

#### F-104 — Hardcoded UPI PA address in payment link generation

- **Dimension:** Backend · Billing/commerce
- **Category:** config  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/handler/payment_handler.go` : 141
- **What:** GeneratePaymentLink hardcodes the UPI payee address `rawdrive@upi` in source. Per the hardcode-prohibition invariant, config must resolve platform_settings -> env -> disable-with-warning, never a literal.
- **Impact:** UPI address cannot change without a code deploy. Currently a stub (Razorpay replaces it in prod) so not a live credential, but it violates the hardcode invariant and becomes a real operational issue if the UPI path is ever activated.
- **Fix:** Resolve the UPI PA from platform_settings (category=payments, key=upi_pa) with env fallback UPI_PA; return 503 with a clear message when unset rather than defaulting to a literal. Better, gate the whole stub behind a non-prod flag.
- **Verifier:** Confirmed at payment_handler.go:141 — literal `pa=rawdrive@upi` hardcoded in the payment_link string. The handler is explicitly a dev stub (comments at :108 and :133 say 'Razorpay integration is production-only' / 'dev stub', response field `provider: upi_stub`, note 'Production will use Razorpay payment links'). So it is NOT yet a live payment credential — but it does literally hardcode a config value, contradicting the platform_settings->env->disable resolution invariant. Low severity is correct given the stub status; flag stands as a latent hardcode violation to fix before activation.
- **Evidence:**
  ```
  payment_handler.go:141 "payment_link": "upi://pay?pa=rawdrive@upi&pn=RawDrive&am=" + ... 
  Context: :108 'Razorpay integration is production-only'; :133 'dev stub'; :142 provider: upi_stub
  ```

#### F-105 — Migration comment numbering mismatch: 114 and 115 carry internal comments claiming to be 'Migration 109' and 'Migration 110'

- **Dimension:** Database · Schema & migrations
- **Category:** db  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/database/migrations/114_marketplace_inquiry_reply.up.sql` : 1
- **Impact:** Comment numbering is misleading; obscures that the face_recognition_enabled column adder was lost in renumbering. Documentation/audit confusion only.
- **Fix:** Update the header comments in 114/115 to match their actual file numbers, and add a note in 112 that the migration which originally added face_recognition_enabled (old 110, commit 7d918a0) was lost during renumbering. Fix the root cause via finding #1.
- **Verifier:** Verified verbatim. 114_marketplace_inquiry_reply.up.sql:1 = `-- Migration 109: add reply_message to marketplace_inquiries`. 115_inquiry_messages.up.sql:1 = `-- Migration 110: per-inquiry conversation thread`. 112_...up.sql:4 = `-- Migration 110 introduced workspaces.face_recognition_enabled`. So two distinct migrations both claim '110' — one survived as 115, the other (the face_recognition column adder) was lost. Git confirms commit 7d918a0 added the face column as the real migration 110, later recycled. Cosmetic/traceability issue, correctly rated low, and it is the documentary footprint of the critical finding #1.
- **Evidence:**
  ```
  114_marketplace_inquiry_reply.up.sql:1 `-- Migration 109: add reply_message to marketplace_inquiries`; 115_inquiry_messages.up.sql:1 `-- Migration 110: per-inquiry conversation thread`; 112_...up.sql:4 `-- Migration 110 introduced workspaces.face_recognition_enabled`
  ```

#### F-106 — upload_sessions and assets tables use 'r2_*' column names and default values that refer to the old Cloudflare R2 backend instead of the current Backblaze B2

- **Dimension:** Database · Schema & migrations
- **Category:** config  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/database/migrations/066_upload_sessions.up.sql` : 31
- **Impact:** Misleading naming artifact from the pre-B2 era. No functional effect — the 'r2' label is metadata; storage is routed through the s3 driver to Backblaze B2. Onboarding/audit confusion only.
- **Fix:** Optional cleanup: rename columns (r2_multipart_upload_id -> s3_multipart_upload_id, r2_part_etags -> s3_part_etags) via appended migration, set assets.storage_driver default to 's3', re-seed platform_settings keys as b2_*/s3_*, and update the two hardcoded `StorageDriver: "r2"` literals. Non-blocking.
- **Verifier:** Verified verbatim and confirmed harmless/cosmetic. 066:31-32 `r2_multipart_upload_id text` + `r2_part_etags jsonb`. 011:8 `storage_driver TEXT NOT NULL DEFAULT 'r2'`. Hardcoded labels: chunked_upload.go:861 and upload_service.go:99 both `StorageDriver: "r2"`. platform_settings 039:24-29 seed r2_bucket_name/r2_region/r2_endpoint/r2_access_key_id/etc. The finding correctly states this is pure metadata: factory.go only has a 'local' case (disabled, returns error per the No-Local-Storage invariant) and an 's3' case (line 33) which routes to B2 via B2_BUCKET_NAME/B2_KEY_ID/B2_APPLICATION_KEY/B2_ENDPOINT (factory.go:30) — the 'r2' string is never used to select a driver. No functional bug; naming/onboarding-clarity only. Low severity is correct, and it does NOT violate the No-Local-Storage or hardcoded-credentials invariants (the r2_* platform_settings rows are unused empty seeds, not credentials).
- **Evidence:**
  ```
  066_upload_sessions.up.sql:31-32 `r2_multipart_upload_id text` / `r2_part_etags jsonb`; 011_create_assets.up.sql:8 `storage_driver TEXT NOT NULL DEFAULT 'r2'`; chunked_upload.go:861 & upload_service.go:99 `StorageDriver: "r2"`; factory.go:30 routes 's3' case to B2 env vars
  ```

#### F-107 — panic in NewJWTService on RSA key generation failure

- **Dimension:** Backend · Error handling & observability
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/auth/auth.go` : 277
- **What:** NewJWTService calls rsa.GenerateKey and panics on failure. It is a startup constructor returning JWTService (no error), so panic is the only out-of-band signal.
- **Impact:** Process crash without a structured error on a near-impossible failure path.
- **Fix:** Optionally change signature to (JWTService, error) and log.Fatalf at the call site; low priority.
- **Verifier:** Verified at auth.go:274-285 — panic is present exactly as cited. However rsa.GenerateKey(rand.Reader, 2048) failing is effectively impossible outside a broken crypto RNG, and this runs once at startup where fail-fast is acceptable. The finder already downgraded analogous concerns; severity is correctly low. Confirmed as existing code but low real-world impact.
- **Evidence:**
  ```
  func NewJWTService(config JWTConfig) JWTService {
      key, err := rsa.GenerateKey(rand.Reader, 2048)
      if err != nil {
          panic("failed to generate RSA key: " + err.Error())
      }
  ```

#### F-108 — PlanTierContext scan error silently swallowed — potential privilege escalation

- **Dimension:** Backend · Error handling & observability
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/middleware/middleware.go` : 241
- **What:** PlanTierContext calls row.Scan(&planTier) and discards the error with _ =. On failure planTier stays empty and no log is emitted, so transient lookup failures are invisible.
- **Impact:** Fail-open to empty plan tier is observable only via the audit table; no structured log on scan failure.
- **Fix:** Add a WARN log when scan fails. The fail-open-to-empty behavior is intentional and safe.
- **Verifier:** Verified at middleware.go:236-244. The swallow is real AND the 'privilege escalation' worry in the title is refuted by the surrounding doc-comment (lines 213-218) and the design: empty plan tier => treated as 'not enterprise' => the balance/quota gate STAYS enforced (fail-closed for entitlements). So an empty tier downgrades privileges, it does not escalate them. Confirmed as a missing-log observability gap (low), but the 'privilege escalation' framing in the original title is incorrect — flagging via this note.
- **Evidence:**
  ```
  // Fail-open on scan error — log would be nice but import scope
  // here is minimal and the audit table already records the request.
  _ = row.Scan(&planTier)
  ```

#### F-109 — stream_webhook extractReplayURL silently ignores json.Unmarshal failure

- **Dimension:** Backend · Error handling & observability
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/webhook/cloudflare/stream_webhook.go` : 175
- **What:** extractReplayURL discards the json.Unmarshal error with _ = and returns empty string on failure; the caller stores empty as the replay URL.
- **Impact:** VOD replay URLs silently lost on payload-shape drift, with no observable cause.
- **Fix:** Log at WARN on unmarshal failure; degrade gracefully.
- **Verifier:** Verified at stream_webhook.go:168-177 — `_ = json.Unmarshal(p, &m); return m.ReplayURL`. Empty-payload guard exists (lines 169-171) but a malformed-but-nonempty payload silently yields empty. Real low-severity gap; graceful degradation but no observability.
- **Evidence:**
  ```
  _ = json.Unmarshal(p, &m)
  return m.ReplayURL
  ```

#### F-110 — ai/search_service discards json.Unmarshal error for AI tags — silent wrong search results

- **Dimension:** Backend · Error handling & observability
- **Category:** error-handling  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/ai/search_service.go` : 98
- **What:** Reading ai_tags from assets, the unmarshal error is discarded with _ =. Malformed JSONB leaves tags nil and the embedding is built from caption only, degrading search.
- **Impact:** Degraded AI search with no operator visibility into corrupt tag data.
- **Fix:** Log a WARN on unmarshal failure with asset_id.
- **Verifier:** Verified at search_service.go:97-98 — `var tags []AITag; _ = json.Unmarshal(tagsJSON, &tags)`. The QueryRow scan error above (line 93) IS handled, but the unmarshal is swallowed. Real low-severity observability gap; degrades gracefully to caption-only embedding.
- **Evidence:**
  ```
  var tags []AITag
  _ = json.Unmarshal(tagsJSON, &tags)
  ```

#### F-111 — exec.LookPath("cwebp") called once per derivative variant (4× per upload) in concurrent goroutines

- **Dimension:** Backend · Performance & concurrency
- **Category:** performance  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/service/thumbnail_service.go` : 330-331
- **What:** generateWebPDerivative calls exec.LookPath('cwebp') on every invocation, after the expensive imaging.Fit Lanczos resize. GenerateAll runs an errgroup with 3 WebPThumbSizes + display = 4 concurrent goroutines, so each upload triggers 4 concurrent PATH lookups and wastes the resize work for all 4 if cwebp is absent.
- **Impact:** Minor repeated PATH-search syscalls per upload; more notably the check is after the Lanczos resize, so all 4 goroutines waste CPU before discovering a missing binary.
- **Fix:** Resolve/validate cwebp once at NewThumbnailService (sync.Once or a field) and move the existence check before imaging.Fit.
- **Verifier:** Confirmed at thumbnail_service.go:328-333 — imaging.Fit Lanczos at :328 precedes exec.LookPath('cwebp') at :330. GenerateAll (:125) builds jobs over WebPThumbSizes (3) + display (1) and runs them via errgroup (`g, gctx := errgroup.WithContext`, calling generateWebPDerivative at :175), so 4 concurrent LookPaths per upload, each after a resize. Accurate; impact genuinely low (PATH lookup is cheap/OS-cached) — severity 'low' is correct.
- **Evidence:**
  ```
  func (s *ThumbnailService) generateWebPDerivative(...) {
      resized := imaging.Fit(src, size.MaxWidth, size.MaxHeight, imaging.Lanczos)
      if _, err := exec.LookPath("cwebp"); err != nil { return nil, fmt.Errorf(...) }
      return s.encodeWebPViaCwebp(ctx, assetID, resized, size)
  }
  ```

#### F-112 — Thumbnail service uses local temp files as intermediate cwebp I/O

- **Dimension:** Backend · Storage & hardcode-law
- **Category:** config  ·  **Verdict:** `confirmed`
- **Location:** `backend/internal/service/thumbnail_service.go` : 339-370
- **Impact:** Under high upload concurrency, transient PNG+WebP temp files accumulate in /tmp until defers fire; possible /tmp pressure but bounded by small file sizes and per-request cleanup.
- **Fix:** Optional: pipe PNG to cwebp stdin and read WebP from stdout (cwebp '-o' '-' with PNG on stdin where supported) to avoid disk I/O entirely; otherwise bound upload-processing concurrency so the 2-file-per-variant temp churn cannot exhaust /tmp under burst load.
- **Verifier:** Code matches: thumbnail_service.go:339 tmpIn,_ := os.CreateTemp("","rawdrive-webp-in-*.png") with defer os.Remove (343); line 350-351 tmpOut := tmpIn.Name()+".webp" with defer os.Remove; line 357 exec.CommandContext(ctx,"cwebp","-q","82","-m","4",tmpIn.Name(),"-o",tmpOut); line 362 os.ReadFile(tmpOut); line 368 store.Put. So it is literal local-disk I/O, but as the finding itself states it is forced by cwebp being a CLI that needs named paths, files are bounded (a few MB) and deferred for removal. Low practical risk, correctly self-rated low. The stdin/stdout suggestion is plausible but cwebp PNG-stdin support is version-dependent, so the recommendation is reasonable-but-optional.

#### F-113 — PLATFORM_SETTINGS_KEK allowed to be absent in non-production with plaintext fallback

- **Dimension:** Backend · Storage & hardcode-law
- **Category:** config  ·  **Verdict:** `confirmed`
- **Location:** `backend/cmd/api/main.go` : 737-743
- **Impact:** Staging/review environments that hold real SMTP/Razorpay/PhonePe/TOTP secrets store them in plaintext if KEK is unset; a staging DB compromise (or staging->prod clone) exposes those secrets without needing the KEK.
- **Fix:** Consider requiring PLATFORM_SETTINGS_KEK whenever any secrets-category row is written (storage/auth/payments/ai/email/messaging) regardless of APP_ENV, or enforce KEK presence in staging environments that handle real third-party credentials, to remove the clone-to-prod plaintext-leak path.
- **Verifier:** Code matches exactly: main.go:728 reads PLATFORM_SETTINGS_KEK; if empty (line 736 else branch) it checks appEnv at 737, log.Fatalf when production/prod (738-741), otherwise logs the PLAINTEXT warning (743) and continues without WithEnvelope — so in non-prod, platform_settings secrets are stored unencrypted. The described behavior is accurate. This is an intentional, documented design tradeoff (prod is hard-gated; the warning explicitly says non-prod only), referencing F-005 audit. The 'staging cloned to prod exposes plaintext secrets' impact is a valid but speculative operational concern, not a code defect — hence low/needs-human on whether to tighten the policy.

#### F-114 — edoburu/pgbouncer:latest used in production — mutable image tag

- **Dimension:** Config & Infrastructure
- **Category:** config  ·  **Verdict:** `confirmed`
- **Location:** `deploy/docker-compose.prod-app.yml` : 32
- **What:** PgBouncer pinned to mutable :latest in production.
- **Impact:** A breaking pgbouncer release or compromised :latest tag pulled on the next deploy could break all DB connections or inject malicious code.
- **Fix:** Pin to a concrete tag (e.g. edoburu/pgbouncer:1.23.x matching the .ini syntax) and bump deliberately.
- **Verifier:** Verified. prod-app.yml:32 `image: edoburu/pgbouncer:latest`. Mutable tag — a `--pull` build (the script even exposes a --pull flag) or any cache miss can silently pull a new/compromised pgbouncer. Low severity is appropriate; it is a supply-chain/repeatability hygiene issue, not an active exploit.
- **Evidence:**
  ```
  prod-app.yml:32 `image: edoburu/pgbouncer:latest`
  ```

#### F-115 — Production DATABASE_URL uses sslmode=disable — no TLS between pgbouncer and backend

- **Dimension:** Config & Infrastructure
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `deploy/.env.example` : 21
- **What:** Production DATABASE_URL template uses sslmode=disable for the app→pgbouncer loopback leg.
- **Impact:** Loopback plaintext SQL (incl. JWTs/PII); observable by another container sharing the host network namespace or via a container escape.
- **Fix:** Use a Unix socket for the same-host app→pgbouncer leg; enable TLS (sslmode=require) for any cross-host pgbouncer→postgres leg.
- **Verifier:** Verified. deploy/.env.example:21 `DATABASE_URL=postgresql://rawdrive:<POSTGRES_PASSWORD>@127.0.0.1:6432/rawdrive?sslmode=disable`. The surrounding comments confirm this is the local app→pgbouncer (127.0.0.1:6432) leg, so it is loopback plaintext — the finder itself correctly scopes this as lower-risk, hence low severity. Accurate as stated.
- **Evidence:**
  ```
  deploy/.env.example:21 `...@127.0.0.1:6432/rawdrive?sslmode=disable`
  ```

#### F-116 — No resource limits on any production container

- **Dimension:** Config & Infrastructure
- **Category:** config  ·  **Verdict:** `confirmed`
- **Location:** `deploy/docker-compose.prod-app.yml`
- **What:** Neither prod compose file defines deploy.resources.limits for any service.
- **Impact:** Unbounded memory growth can OOM-kill Postgres/Valkey on the shared host without graceful shutdown, risking in-flight WAL corruption.
- **Fix:** Add deploy.resources.limits (memory/cpus) to backend, face-svc, and postgres/valkey at minimum.
- **Verifier:** Verified. grep for resources|limits|mem_limit|cpus across both prod compose files returns 0 matches in each. No service defines deploy.resources.limits. On a shared VPS, a runaway backend/WebP-derivative or JetStream pile-up can OOM-kill Postgres/Valkey. Low severity is fair (availability/robustness, not security). The cited face-svc model-weight detail is plausible context but not independently re-verified; the core claim (zero limits) is confirmed.
- **Evidence:**
  ```
  grep -c 'resources|limits|mem_limit|cpus' on prod-app.yml and prod-db.yml → 0 matches each.
  ```

#### F-117 — golang.org/x/crypto is 3 minor versions behind latest (v0.49.0 vs v0.52.0)

- **Dimension:** Dependencies & supply chain
- **Category:** security  ·  **Verdict:** `likely`
- **Location:** `backend/go.mod` : 23
- **What:** Project uses golang.org/x/crypto v0.49.0; finder reports latest is v0.52.0. Known SSH CVEs are already patched in v0.49.0 and ssh is not imported (only bcrypt + argon2), so no known CVE is exploitable — but the package is several minor versions behind.
- **Impact:** Low immediate risk given only bcrypt/argon2 are used; staying current on crypto is best practice in case of subpackage fixes in v0.50-v0.52.
- **Fix:** Run go get golang.org/x/crypto@latest && go mod tidy in backend/, re-run go test ./..., and run govulncheck ./... to confirm no DB entries cover the pinned version.
- **Verifier:** In-repo facts confirmed: backend/go.mod line 23 (finding said 15) pins golang.org/x/crypto v0.49.0; only the bcrypt (recovery_codes.go, user.go, dealer_service.go, admin_user_service.go, gallery_access_service.go, share_link_service.go, auth_adapter.go) and argon2 (auth/argon2.go) subpackages are imported — grep for golang.org/x/crypto/ssh returns NONE, matching the finding's claim that ssh is not used. The 'latest is v0.52.0' assertion relies on proxy.golang.org data I cannot verify offline, so the version-currency delta is 'likely'. Correctly self-rated low: the known SSH CVEs do not apply since ssh isn't imported.
- **Evidence:**
  ```
  backend/go.mod line 23: golang.org/x/crypto v0.49.0. Imports: golang.org/x/crypto/argon2 (auth/argon2.go), golang.org/x/crypto/bcrypt (7 files). grep golang.org/x/crypto/ssh: no matches.
  ```

#### F-118 — Frontend Dockerfile pins pnpm@9.4.0 while pnpm 11.x is current stable

- **Dimension:** Dependencies & supply chain
- **Category:** deps  ·  **Verdict:** `likely`
- **Location:** `frontend/Dockerfile` : 29
- **What:** frontend/Dockerfile pins corepack prepare pnpm@9.4.0. Finder reports pnpm 11.5.0 is current. pnpm-lock.yaml uses lockfileVersion 9.0 (pnpm 9.x), incompatible with pnpm 10+ which uses lockfileVersion 10.0. No packageManager field in package.json to enforce a version.
- **Impact:** Docker misses pnpm fixes from 9.5.x-11.x; developers on global pnpm 10/11 generate lockfileVersion 10/11, breaking CI against the pinned pnpm 9.4.0.
- **Fix:** Choose one pnpm major and pin it consistently across frontend/Dockerfile line 29, a packageManager field in frontend/package.json, and onboarding docs. If staying on 9.x, pin the latest 9.x patch; if upgrading, regenerate pnpm-lock.yaml.
- **Verifier:** In-repo facts confirmed: frontend/Dockerfile line 29: 'corepack prepare pnpm@9.4.0 --activate' (lines 27-29 install corepack@latest then activate pnpm@9.4.0). frontend/pnpm-lock.yaml line 1 is lockfileVersion '9.0'. package.json has no packageManager field, so a developer on pnpm 10/11 locally could regenerate an incompatible lockfileVersion. The 'pnpm 11.5.0 is current stable' claim depends on the npm registry which I cannot verify offline, so the currency delta is 'likely'. The lockfile-incompatibility risk between pnpm 9 (lockfileVersion 9.0) and pnpm 10+ (lockfileVersion 10) is a real, well-understood pnpm behavior.
- **Evidence:**
  ```
  frontend/Dockerfile line 29: corepack prepare pnpm@9.4.0 --activate. frontend/pnpm-lock.yaml line 1: lockfileVersion '9.0'. frontend/package.json: no packageManager field.
  ```

#### F-119 — disintegration/imaging is an unmaintained library (last release 2020)

- **Dimension:** Dependencies & supply chain
- **Category:** deps  ·  **Verdict:** `confirmed`
- **Location:** `backend/go.mod` : 10
- **What:** github.com/disintegration/imaging v1.6.2 (2020) is used for image resizing/watermarking in four files and is unmaintained, so resampling-pipeline bugs (e.g. memory exhaustion on huge images) would not be fixed upstream.
- **Impact:** No upstream fix for any future bug in the resize/resample path, which processes every uploaded image in the thumbnail and watermark pipeline.
- **Fix:** Migrate to golang.org/x/image (already a dependency at v0.39.0, actively maintained) or the libvips/sharp path; at minimum run govulncheck against v1.6.2.
- **Verifier:** Confirmed. backend/go.mod line 10: github.com/disintegration/imaging v1.6.2 (line cited correctly). Used in thumbnail_service.go (imaging.Decode/Fit/Fill/Encode at lines 127/204/207/239/328/344/386/390/428), cover_variants.go, watermark_service.go, and watermark_service_test.go — confirmed via grep. v1.6.2 is the well-known last release (2020) and the library is effectively unmaintained. It processes every uploaded image in the thumbnail/watermark pipeline as described. Correctly self-rated low (maintenance risk, no known CVE).
- **Evidence:**
  ```
  backend/go.mod line 10: github.com/disintegration/imaging v1.6.2. Used in thumbnail_service.go (e.g. lines 127, 204, 207, 328, 428), cover_variants.go, watermark_service.go, watermark_service_test.go.
  ```

#### F-120 — GlassIconButton focus ring uses ring-white/40 instead of focusRing token

- **Dimension:** Frontend · Design-token compliance
- **Category:** ui  ·  **Verdict:** `likely`
- **Location:** `frontend/src/components/ui/glass-icon-button.tsx` : 118
- **Fix:** Replace ring-white/40 with a token-driven ring (e.g. focus-visible:ring-border-focus or focus-visible:ring-accent) so the focus indicator stays visible across all three themes/surfaces.
- **Verifier:** Verified at glass-icon-button.tsx:118: `focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent`. ring-white/40 is hardcoded and not token-driven; a focusRing component token and themes.{active}.border.focus ref DO exist in design-tokens.json (lines 944/952) and a --border-focus var exists per theme in globals.css. The component is styled for white-on-glass/media contexts (text-white/90 base), where a white ring is acceptable, but it is used in 31 files including light-surface dashboard pages (galleries, crm, dealer), where a 40%-white ring on a light background is low-contrast — a plausible WCAG 2.4.7 concern. Real but context-dependent and low severity, hence 'likely'.

#### F-121 — Tailwind primitive color class hover:text-gray-200 used in admin layout, violating design token rule

- **Dimension:** Frontend · Performance
- **Category:** ui  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/admin/layout.tsx` : 33
- **Impact:** gray-200 is a fixed Tailwind hex that does not adapt to the token-driven theme system, producing incorrect hover contrast in midnight (AMOLED) and dark themes.
- **Fix:** Replace hover:text-gray-200 with a semantic token class (e.g. hover:text-text-primary or hover:text-text-secondary) and the arbitrary bg with a surface token.
- **Verifier:** Confirmed verbatim. admin/layout.tsx:33 inactive-link branch is `"text-text-tertiary hover:text-gray-200 hover:bg-white/[0.03]"`. hover:text-gray-200 is a forbidden Tailwind primitive scale class per AGENTS.md/CLAUDE.md. The line also uses arbitrary hover:bg-white/[0.03] which is similarly off-token, reinforcing the violation.
- **Evidence:**
  ```
  admin/layout.tsx:33 : "text-text-tertiary hover:text-gray-200 hover:bg-white/[0.03]"
  ```

#### F-122 — Tailwind primitive shadow classes used directly instead of design token classes

- **Dimension:** Frontend · React/Next correctness
- **Category:** ui  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/galleries/[id]/page.tsx` : 1657
- **Impact:** Non-theme-aware shadow and primitive gray color bypass the design-token cascade; do not respond to liquid-glass / liquid-glass-dark / midnight theme switches.
- **Fix:** Replace shadow-lg/md/sm with semantic shadow tokens from design-tokens.json; replace hover:text-gray-200 in admin/layout.tsx with a semantic text token; run node tools/cobolt-sync-tokens.js sync.
- **Verifier:** Verified galleries/[id]/page.tsx:1657 contains `transition-shadow hover:shadow-lg` exactly as cited (same file also uses shadow-sm at :1439 and :1508). Verified admin/layout.tsx:33 `"text-text-tertiary hover:text-gray-200 hover:bg-white/[0.03]"` — `text-gray-200` is a Tailwind primitive gray scale, a direct violation of the design-token invariant. Both confirmed at the cited file:line.
- **Evidence:**
  ```
  galleries/[id]/page.tsx:1657 `className={cn("surface-panel cursor-pointer overflow-hidden transition-shadow hover:shadow-lg relative group", ...)}`; admin/layout.tsx:33 `: "text-text-tertiary hover:text-gray-200 hover:bg-white/[0.03]"`
  ```

#### F-123 — Arbitrary color value hardcoded in Footer component

- **Dimension:** Frontend · React/Next correctness
- **Category:** ui  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/components/landing/Footer.tsx` : 51
- **Impact:** Hardcoded arbitrary color does not respond to theme changes and bypasses the design-token cascade.
- **Fix:** Move the file path to frontend/src/components/layout/Footer.tsx. Add a semantic accent token to design-tokens.json (warm/orange accent) and reference the generated class instead of the arbitrary text-[#e07b39].
- **Verifier:** Issue confirmed but cited path is WRONG: there is no src/components/landing/Footer.tsx. The actual file is src/components/layout/Footer.tsx, where line 51 is `<span className="text-[#e07b39]">Consultants</span>` — exactly the cited code. The arbitrary hex `text-[#e07b39]` violates the no-arbitrary-values design-token invariant. Confirmed with path correction.
- **Evidence:**
  ```
  src/components/layout/Footer.tsx:51 `<span className="text-[#e07b39]">Consultants</span>` (no file exists at src/components/landing/Footer.tsx).
  ```

#### F-124 — Next.js Link with target=_blank missing rel=noopener in gallery cover page

- **Dimension:** Frontend · Security
- **Category:** security  ·  **Verdict:** `confirmed`
- **Location:** `frontend/src/app/(dashboard)/galleries/[id]/cover/page.tsx` : 533-539
- **What:** The Preview link in the gallery cover/design editor uses Next.js <Link> with target='_blank' but no rel='noopener noreferrer'. Unlike native <a> elements, Next.js Link does not automatically inject rel=noopener for _blank targets. The opened /g/<slug> page gains window.opener access to the dashboard, enabling reverse tabnabbing if the public gallery is ever compromised.
- **Impact:** If the public gallery page (/g/slug) is compromised (or a malicious gallery slug is used), the opened tab can call window.opener.location.replace() to redirect the dashboard tab to a phishing page.
- **Fix:** Add rel='noopener noreferrer' to the Link: <Link href={...} target="_blank" rel="noopener noreferrer">Preview</Link>
- **Verifier:** Reproduced at cover/page.tsx:533-539 — <Link href={`/g/${gallery.slug}`} target="_blank"> with no rel. Verified the technical premise: Next.js client link.js (frontend/node_modules/next/dist/client/) contains no 'noopener' string, so Link renders a plain anchor and does not auto-add rel=noopener. However real-world impact is limited because all modern browsers (Chrome 88+, FF 79+, Safari 12.1+) default target=_blank anchors to noopener regardless of rel, and the target is a same-origin /g/ route. Genuine but minor — 'low' severity is correct; one-line hardening fix as recommended.
- **Evidence:**
  ```
  <Link
    href={`/g/${gallery.slug}`}
    target="_blank"
    className="min-h-[40px] flex-1 rounded-xl ..."
  >
    Preview
  </Link>
  ```

---

## 5. False Positives Filtered (7)

These finder claims were **rejected** by the adversarial verifier — the cited evidence did not reproduce, or surrounding code refuted the concern. Listed for transparency.

| Claimed severity | Title | Why rejected |
|------------------|-------|--------------|
| medium | factory.go returns error instead of os.Exit/log.Fatal on local driver | The implied bug — that STORAGE_DRIVER=local could silently proceed without FATAL — does NOT hold. The production callsite enforces the invariant twice: main.go:1179-1180 does lo... |
| medium | Cancel handler skips credit refund when streamStates is empty after API restart | The code path is real (Cancel refunds only via streamStates.Load at 765, with no cold-path from row.CreditReservationID, unlike UploadChunk 588-593), BUT the finding's central i... |
| medium | Core auth tables (sessions, otp_tokens, magic_link_tokens, user_auth_methods, pr | The factual sub-claim is TRUE (003:3,12,20 otp_tokens/magic_link_tokens/user_auth_methods user_id REFERENCES users(id) with no ON DELETE; 004:3 sessions; 004:14 refresh_tokens.s... |
| medium | Workspaces.owner_id FK has no ON DELETE — workspace owner deletions blocked or d | Fact is correct (005:5 `owner_id UUID REFERENCES users(id)` with no ON DELETE -> RESTRICT), but two supporting claims are wrong and the impact premise is refuted. (1) The findin... |
| medium | SetWorkspaceID (RLS) failure silently swallowed — cross-tenant data leak risk | The swallowed _ = is real at middleware.go:159 and db_context.go:29-37 returns a wrapped error that is discarded. BUT the security impact is refuted by backend/internal/database... |
| critical | globals.css directly edited — accent tokens diverge from design-tokens.json | The stated impact ('accent renders charcoal instead of brand blue, visually broken brand identity in production, token sync never run') is wrong. globals.css IS the intentional,... |
| high | Tailwind shadow-lg / shadow-md primitives used instead of shadow tokens across 1 | Cited class usages exist (public-gallery-grid.tsx 318/321/324/326/658/869, gallery-canvas.tsx 177, public-gallery-banners.tsx 107), but the finding's premise is false for THIS c... |

---

## 6. Recommended Remediation Order

1. **Wave 1 — Critical (7):** plaintext-password reset, committed Cloudflare token, missing `face_recognition_enabled` migration (breaks fresh DBs), platform-settings authz, role-escalation, invoice-number scoping, orphaned-object cleanup.
2. **Wave 2 — High (45):** auth/MFA bypasses, IDOR on DSR/PII, rate-limit bypass, money rounding, N+1 hot paths, XSS scheme-validation, missing migration order, design-token violations.
3. **Wave 3 — Medium (46).**
4. **Wave 4 — Low (26).**

Fixes are tracked in an isolated git worktree/branch and applied via `cobolt-fix` agent teams with per-finding regression tests and full build/test/lint gates between waves.

---

_Generated by a Claude Code multi-agent audit workflow. Machine-readable findings: `.cobolt-audit-findings.json` (IDs F-001…F-124)._