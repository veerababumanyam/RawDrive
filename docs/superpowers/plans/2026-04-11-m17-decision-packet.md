# M17 Decision Packet — Hardening Closure (F-007 + F-013 + F-008 Part B)

**Date:** 2026-04-11
**Session:** cobolt-plan input packet (Session 1)
**Status:** Pre-baked user decisions ready for `cobolt-plan feature` ingestion
**Decided by:** Manyam Prasad (user) via interactive clarification rounds in this session

---

## 1. Framing

M17 is the **hardening closure milestone** — the remaining P1 items from the 2026-04-10 360° audit that were not addressed in M16 hardening waves 1-7 (already shipped on `fix/m16-p0-p1-hardening`, merged to main). M17 is *not* a new feature milestone.

**Source documents (authoritative — do not paraphrase, quote them):**
- Audit: `docs/audits/rawdrive-v0.0.35-m16-360-audit-2026-04-10.md` (Section 14 "Recommended M17 Action Plan" at line 423)
- Wave plan: `docs/superpowers/plans/2026-04-10-m16-p0-p1-hardening.md` (waves 1-7 shipped; waves 8-9 map to M17)
- AGENTS.md hardcode laws (must not violate; must extend auth section)

**Milestone number collision resolved:** The audit names this "M17". M16 Tier D upload-screening code has 6 legacy references to "M17" meaning "RawDrive Desktop companion". Those are **housekeeping-reassigned to M18** as part of M17 Step 08 deliverables. See Section 7.

---

## 2. Scope (LOCKED — do not re-litigate in planning phases)

### In scope
| ID | Title | Source | Audit line | Scope size |
|----|-------|--------|-----------|------------|
| F-007 | TOTP MFA for photographers + staff | audit §P1 | 249 | M (biggest in P1 tier) |
| F-013 | Spec-compliant TUS upload (persistence + direct-R2 streaming) | audit §P1 | 255 | M (LARGEST in P1 tier) |
| F-008 Part B | Remove temp-disk staging (absorbed by F-013 TUS state design) | hardening plan 256 | 250 | included in F-013 |

### Explicitly out of scope
- **F-002** — OAuth token flow. User tag: `DEFERRED: scope exceeds single session`. Not touched this milestone. Remains in `issue-and-blocker-tracker.json`.
- **F-014 through F-023** — P2/P3 items. Out of M17, considered for M18+.
- **Net-new features.** M17 is closure only.

---

## 3. Pre-baked design decisions (LOCKED)

### 3.1 — TOTP enforcement policy (F-007)

**Decision:** Mandatory for all photographers AND staff, optional for clients.

**Enforcement matrix (keys off existing JWT `TokenClaims.Role` and `TokenClaims.PlatformRole`):**

| Role category | Example roles | TOTP enrollment | TOTP verification at login |
|---------------|---------------|-----------------|----------------------------|
| Platform staff | `platform_admin`, `platform_staff` | Mandatory | Required (hard-block without) |
| Photographers | `workspace_owner`, `workspace_admin`, `workspace_member` | Mandatory | Required (hard-block without) |
| Clients (gallery viewers) | `client`, `gallery_viewer` | Optional (self-enroll in settings) | Required only if enrolled |

**Recovery codes:** 10 codes issued at enroll time. One-time use. Stored **bcrypt-hashed** (same cost factor as password hashes). Regeneration allowed from settings; regeneration invalidates all prior codes. Recovery-code consumption is audit-logged.

**Rollout grace window:** Photographers and staff who are already logged in when M17 deploys get a **14-day forced-enrollment window**. During the grace window, login succeeds without TOTP but the dashboard shows a blocking enrollment banner. After 14 days, login requires TOTP. Grace-window deadline is stored per-user in `users.mfa_grace_until` (nullable timestamp).

**Session token impact:** Add `mfa_verified` (bool) to `jwt.MapClaims` in `GenerateAccessToken` at `backend/internal/auth/auth.go:285`. Parse-side at line 325 maps it into `TokenClaims`. Middleware `RequirePlatformRole` gains an `OrMFA()` decorator — platform_admin/platform_staff routes require `mfa_verified == true` OR explicit grace-window allowance.

**Storage:** New table `user_mfa_enrollments` (see migration plan §6). TOTP secret stored encrypted at rest using the F-005 KEK/DEK envelope encryption (already shipped in wave 4, `backend/internal/crypto/envelope.go` — reuse, do not re-implement).

**Rate limiting:** Login TOTP verification endpoint (`POST /auth/verify-totp`) gets **5 attempts per 15 minutes per user** via existing Valkey rate-limit middleware (F-015 fail-closed mode). After 5 failures, account is **temporarily locked** for 15 minutes. Recovery code verification has its own stricter limit: **3 attempts per hour per user**.

### 3.2 — TUS upload state design (F-013)

**Decision:** Postgres `upload_sessions` table + R2 multipart upload IDs. Direct-to-R2 streaming per PATCH (no temp disk, solves F-008 Part B).

**Schema (migration `055_create_upload_sessions.up.sql`):**

```sql
CREATE TABLE upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tus_upload_id text NOT NULL UNIQUE,  -- client-facing TUS ID
  filename text NOT NULL,
  content_type text NOT NULL,
  total_size bigint NOT NULL CHECK (total_size > 0),
  upload_offset bigint NOT NULL DEFAULT 0 CHECK (upload_offset >= 0),
  chunk_size bigint NOT NULL,
  r2_multipart_upload_id text,                 -- from R2 CreateMultipartUpload
  r2_part_etags jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{part_number, etag, size, sha256}]
  expires_at timestamptz NOT NULL,             -- for GC
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,                    -- non-null once finalized
  scan_manifest jsonb,                         -- M16 E47-S5 Tier D, optional
  scan_manifest_verified_at timestamptz
);
CREATE INDEX idx_upload_sessions_workspace ON upload_sessions(workspace_id);
CREATE INDEX idx_upload_sessions_expires ON upload_sessions(expires_at) WHERE completed_at IS NULL;
ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;
-- RLS policy uses the parameterized set_config pattern (F-009 wave 3 fix)
CREATE POLICY upload_sessions_rls ON upload_sessions
  USING (workspace_id = current_setting('app.workspace_id', true)::uuid);
```

**R2 streaming approach (direct-to-multipart):**

1. `CreateSession` (POST `/api/v1/uploads`): create DB row, call R2 `CreateMultipartUpload`, persist `r2_multipart_upload_id`, return `upload_id` + `Location`.
2. `UploadChunk` (PATCH): stream `r.Body` directly to R2 `UploadPart` via the S3-compatible SDK. NO temp file. On success, append `{part_number, etag}` to `r2_part_etags` via a jsonb array update. Update `upload_offset`.
3. `GetOffset` (HEAD): read `upload_offset` from DB.
4. `Cancel` (DELETE): call R2 `AbortMultipartUpload`, delete DB row.
5. `finalizeUpload` (when `upload_offset >= total_size`): call R2 `CompleteMultipartUpload` with the collected parts, then run the **existing** F-003 hash verification + F-004 scan metadata persistence + asset creation (load-bearing, do NOT strip).

**Per-chunk checksum:** Accept `Upload-Checksum: sha256 <base64>` header on PATCH. Before uploading to R2, verify the chunk body's SHA-256 matches. Reject with HTTP 460 `Checksum Mismatch` (TUS spec). The collected chunk hashes are also stored in `r2_part_etags[].sha256` so the finalize step can re-compose the full-file hash without a second read.

**Expiry + GC:** Default `expires_at = now() + interval '24 hours'`. Configurable via `platform_settings` category `upload` key `session_ttl_hours`. GC cron runs every 15 min:
```sql
SELECT id, tus_upload_id, r2_multipart_upload_id FROM upload_sessions
WHERE completed_at IS NULL AND expires_at < now()
LIMIT 100;
```
For each: call R2 `AbortMultipartUpload`, then DELETE the row. Cron lives in `backend/internal/workers/upload_session_gc.go` (new file).

**Configurable size cap:** Remove hardcoded `2*1024*1024*1024` at line 162. Pull max size from `platform_settings` category `upload` key `max_upload_bytes` (default 2GB, enterprise can raise). Return it via `Tus-Max-Size` header dynamically (currently hardcoded in `setTUSHeaders` at line 32).

**`Tus-Extension` header update (line 31):**
```
Current:  "creation,termination"
New:      "creation,creation-with-upload,expiration,checksum,termination"
```

**`Upload-Expires` header:** Set on POST and HEAD responses using the session's `expires_at` in RFC 1123 format per TUS spec.

**`Upload-Defer-Length` support:** Accept POST without `Upload-Length`, mark session as `total_size = -1` (or use a separate `length_deferred` column — decide in planning). Client must later PATCH with `Upload-Length` header to set it.

### 3.3 — Frontend upload resume persistence (F-013 frontend)

**Decision:** IndexedDB keyed by content hash + workspace_id.

**Schema (IndexedDB object store `upload_resume_state`):**
```typescript
{
  key: `${sha256OfFirstMB}:${workspaceId}:${fileSize}`,
  uploadId: string,        // TUS upload_id from backend
  offset: number,          // last known good offset
  totalSize: number,
  filename: string,
  createdAt: number,
  lastProgressAt: number,
}
```

On page load, `useUpload` scans IndexedDB for non-expired entries. If a file is re-dropped whose content-hash+size matches an entry, offer "Resume upload?" with a 5-second confirm banner (user can ignore = start fresh). Entries are cleared on successful finalize or after `expires_at` passes.

**First-MB hash is intentional** — full-file hashing blocks the "resume detection" UX. First 1MB is enough to discriminate files in practice; the full-file SHA-256 still runs in the background for the M16 Tier D manifest.

### 3.4 — AGENTS.md auth section update (M17 deliverable)

AGENTS.md currently says (line 101-106):
> ### Auth Model (OTP is registration-only)
> - OTP is used only during registration to verify email ownership.
> - All subsequent logins are email + password only.
> - `/auth/login` checks password + email_verified flag. Unverified accounts get 403 "account not activated".
> - `/auth/verify-otp` is only called from the /activate page after registration.
> - **Do not add OTP paths to login flows.**

M17 Step 08 must rewrite this section to disambiguate **email-OTP** (unchanged: registration-only) from **authenticator-app TOTP** (new: second factor after password for photographers + staff). Proposed new text (draft — planning phase finalizes wording):

> ### Auth Model (email-OTP is registration-only; TOTP is login second-factor)
> **Email OTP** (6-digit code sent via SMTP/Mailpit to the user's email):
> - Used only during registration to verify email ownership.
> - `/auth/verify-otp` is called only from the `/activate` page after registration.
> - **Never added to the login flow.**
>
> **TOTP (authenticator-app, RFC 6238)** — introduced in M17:
> - Mandatory for photographers (`workspace_owner`, `workspace_admin`, `workspace_member`) and platform staff (`platform_admin`, `platform_staff`). Optional for clients.
> - Verified at login **after** password check, via `POST /auth/verify-totp`. JWT access token only issues with `mfa_verified: true` in claims for mandatory-MFA roles.
> - Recovery codes (10 per user, bcrypt-hashed) allow login recovery if the authenticator is lost.
> - `/auth/login` for TOTP-mandatory roles returns 401 + `{"mfa_required": true, "mfa_token": "<short-lived>"}` instead of a full access token. Client then POSTs to `/auth/verify-totp` with the short-lived token + code.
> - **Do not conflate email-OTP and TOTP. They are separate primitives with separate flows.**

---

## 4. Load-bearing invariants (do NOT break in planning or implementation)

These exist in shipped code and must survive M17:

1. **M16 E47-S5 Tier D validation hook.** `ChunkedUploadHandler.validationSvc` (chunked_upload.go:54) and `WithValidation()` setter (line 96) must be preserved across the F-013 rewrite. The new TUS handler wires this the same way.

2. **F-003 finalize-time manifest hash verification.** `verifyManifestAtFinalize` at chunked_upload.go:390 must run in the new streaming finalize path before asset creation.

3. **F-004 scan metadata persistence.** `applyScanMetadata` at chunked_upload.go:409 must still populate `UploadScanStatus`, `UploadScanEngine`, `UploadScanPolicyVersion`, `UploadScanRiskScore`, `UploadScanManifestHash`, `UploadScanFindings` on the asset row.

4. **F-005 envelope encryption.** TOTP secrets reuse `backend/internal/crypto/envelope.go` (shipped in wave 4). Do not introduce a second encryption path.

5. **F-006 Parts A + B.** JWT signing key persistence (wave 5) and refresh session DB-backed store (wave 7) are shipped. F-007 builds on top — `mfa_verified` claim slots into the existing `GenerateAccessToken` flow, it does not replace it.

6. **F-009 RLS parameterization.** The `upload_sessions` table RLS policy uses `current_setting('app.workspace_id', true)::uuid` — the same parameterized `set_config` pattern wave 3 + wave 6 settled on. No SQL interpolation.

7. **F-010 security headers.** New `/auth/verify-totp` and `/api/v1/mfa/*` endpoints go through the hardened security-headers middleware (CSP/Referrer-Policy/Permissions-Policy shipped in wave 2).

8. **AGENTS.md hardcode laws.**
   - **No local storage (ABSOLUTE):** F-013 cannot introduce any disk I/O during the upload path. Direct R2 multipart only. `h.tmpDir` field at chunked_upload.go:49 gets deleted.
   - **No hardcoded credentials (ABSOLUTE):** TOTP issuer name, recovery-code cost factor, and upload session TTL all come from env vars or `platform_settings`.
   - **WebP derivatives (MANDATORY):** The existing derivative pipeline runs on `asset.Status = "processing"` after finalize. F-013 preserves the status transition so derivatives still trigger.
   - **Upload UX:** No standalone `/upload` route added. TUS client resume UX lives inside gallery detail pages. The legacy `frontend/src/app/(dashboard)/upload/page.tsx` shell (flagged in F-019) stays orphaned from navigation this milestone.
   - **Glass icon system (MANDATORY):** TOTP enrollment UI, recovery-code display, and MFA settings tile all use `GlassIconButton` + SF Symbol icons from `frontend/src/components/icons/index.tsx`. Add new icons (e.g., `ShieldCheck`, `KeyRound`, `QrCode`) to the registry, do not inline SVGs.
   - **Design tokens (MANDATORY):** TOTP QR code surround, enrollment step-card, recovery-code grid all resolve to semantic tokens from `design-tokens.json`. No primitive scales.

---

## 5. Load-bearing code pointers (for planning agents — READ THESE)

Planning agents must read these files in full before producing PRD/architecture/epics:

- `backend/internal/auth/auth.go` (800 lines — full file, focus on NewJWTService, GenerateAccessToken, ParseAccessToken, refresh flow)
- `backend/internal/handler/chunked_upload.go` (443 lines — full file, the entire F-013 starting state)
- `frontend/src/hooks/use-upload.ts` (213 lines — full file, the F-013 frontend starting state)
- `backend/internal/middleware/` (for RequirePlatformRole and the JWT claim context key — M1.1 context key fix, see memory)
- `backend/internal/repository/platform_settings_repo.go` (for F-005 envelope encryption reuse pattern)
- `backend/internal/database/migrations/` (scan for highest migration number to decide `055_*`, `056_*`)
- `backend/internal/crypto/envelope.go` (for reuse — TOTP secret encryption)
- `backend/seeds/` (for M7.5 test user fixtures — integration tests will need MFA-enrolled fixtures)

---

## 6. Migration plan

| # | File | Purpose |
|---|------|---------|
| 055 | `055_create_upload_sessions.up.sql` + `.down.sql` | Schema per §3.2, RLS per §3.2, indexes |
| 056 | `056_create_user_mfa_enrollments.up.sql` + `.down.sql` | TOTP secrets (envelope-encrypted), recovery codes (bcrypt hashes), enrollment state, `users.mfa_grace_until` column |
| 057 | `057_platform_settings_upload_config.up.sql` + `.down.sql` | Seed default `platform_settings` rows for `upload.session_ttl_hours`, `upload.max_upload_bytes`, `auth.mfa_issuer_name`, `auth.mfa_grace_period_days` |

---

## 7. Housekeeping: reassign "M17" references in M16 Tier D code to "M18"

Affected files (6 references across 4 files — string swaps only, no logic change):

| File | Line | Current | New |
|------|------|---------|-----|
| `frontend/src/hooks/use-upload.ts` | 69 | `(M17)` | `(M18)` |
| `frontend/src/lib/upload-screening/types.ts` | 29 | `reserved for M17` | `reserved for M18` |
| `frontend/src/lib/upload-screening/screen.ts` | 29 | `desktop companion (M17)` | `desktop companion (M18)` |
| `frontend/src/lib/upload-screening/screen.ts` | 66 | `require desktop agent (M17)` | `require desktop agent (M18)` |
| `frontend/src/lib/upload-screening/screen.ts` | 78 | `available in M17` | `available in M18` |
| `docs/runbooks/upload-screening-alerts.md` | 57 | `explain M17 timing` | `explain M18 timing` |

This is a single Step 04 REFACTOR sub-task, not a planning concern. Documented here so planning phases know the Desktop companion is slotted to M18 and don't plan anything for M17 related to it.

---

## 8. Test strategy pointers (for test-architect)

- **Test photos:** Use `tests/photos/` (17 real JPEGs) for all upload integration tests. F-013 tests should exercise at least one large file (`Wedding (42).jpg` is typically the biggest). Filenames with spaces + parentheses must be handled correctly (existing hard rule).
- **E2E auth:** Dashboard tests inject auth token via `storageState` or `addInitScript`. For MFA-mandatory roles, either inject `mfa_verified: true` directly into the token claim OR drive the full `POST /auth/verify-totp` flow with a test TOTP secret. Prefer the latter for realism, injection for smoke.
- **MFA enrollment E2E:** Full flow — login → blocking banner → QR code display → scan with pyotp-generated secret → verify → recovery codes displayed → logout → re-login with TOTP.
- **TUS E2E:** Upload a 50MB file in 10 chunks, kill the PATCH loop mid-way, reload the page, verify resume prompt appears, complete the upload. Use Playwright MCP inside the Docker playwright service (not Windows host).
- **Rate limit tests:** 6 wrong TOTP codes in 15 min → 401 + rate-limit headers → 7th attempt → account lock. 4 wrong recovery codes in 1 hour → stricter limit triggers.
- **RLS leakage tests:** Create `upload_sessions` in workspace A, query as workspace B, assert zero rows. Same for `user_mfa_enrollments`.
- **GC test:** Insert expired session with live R2 multipart ID, run GC cron, assert R2 `AbortMultipartUpload` was called (use the existing mock storage provider) and DB row is gone.

---

## 9. Deliverable summary (for epics/stories generation)

**Backend (Go):**
- New: `backend/internal/auth/totp.go` (TOTP enrollment, generate secret, verify code using `github.com/pquerna/otp/totp`)
- New: `backend/internal/auth/recovery_codes.go` (generate 10 codes, bcrypt-hash, verify, consume)
- New: `backend/internal/repository/user_mfa_enrollments_repo.go`
- New: `backend/internal/repository/upload_sessions_repo.go`
- New: `backend/internal/handler/mfa_handler.go` (enroll, verify, list recovery codes, regenerate recovery codes)
- New: `backend/internal/workers/upload_session_gc.go`
- Heavy modify: `backend/internal/handler/chunked_upload.go` (direct R2 streaming, DB-backed session state)
- Modify: `backend/internal/auth/auth.go` (`mfa_verified` claim, TOTP-gate in login path)
- Modify: `backend/internal/middleware/` (RequirePlatformRole + `OrMFA()` decorator OR parallel RequireMFA middleware)
- Modify: `backend/cmd/api/main.go` (wire mfa handler routes, start GC worker)
- Migrations 055, 056, 057

**Frontend (Next.js + TS):**
- New: `frontend/src/app/(dashboard)/settings/security/page.tsx` (MFA enrollment tile + recovery codes display)
- New: `frontend/src/app/mfa/verify/page.tsx` (post-login TOTP prompt for mandatory roles)
- New: `frontend/src/components/mfa/enrollment-wizard.tsx`
- New: `frontend/src/components/mfa/recovery-codes-grid.tsx`
- New: `frontend/src/components/icons/index.tsx` additions: `ShieldCheck`, `KeyRound`, `QrCode`
- New: `frontend/src/lib/upload-resume/indexed-db.ts`
- Modify: `frontend/src/hooks/use-upload.ts` (IndexedDB resume, per-chunk Upload-Checksum, new backend error codes)
- Modify: login page to handle `{"mfa_required": true}` response
- Housekeeping: 6 M17→M18 string swaps per Section 7

**Docs:**
- New: `docs/runbooks/mfa-enrollment.md`
- New: `docs/runbooks/upload-session-gc.md`
- Modify: `AGENTS.md` auth section per §3.4
- Modify: `.env.example` (add `MFA_ISSUER_NAME`, `UPLOAD_SESSION_TTL_HOURS`, `UPLOAD_MAX_BYTES`)

**Tests:**
- Unit: totp.go, recovery_codes.go, upload_sessions_repo.go, per-chunk checksum verification, R2 multipart streaming (with mock provider)
- Integration: full MFA enroll+verify flow, full TUS upload+resume+GC, RLS leakage negative tests
- E2E (Playwright MCP, inside Docker): MFA enrollment wizard, TUS large-file resume
- Regression: assert F-003, F-004, F-009 shipped behavior still holds

---

## 10. What cobolt-plan should NOT re-decide

The planning phases (1-5) should produce PRD, architecture delta, epics, stories, RTM, test strategy, etc. They should **not**:
- Change the scope (F-007 + F-013 + F-008 Part B, nothing else)
- Change the TOTP enforcement policy (mandatory photographers + staff, optional clients)
- Change the TUS state design (Postgres + R2 multipart, direct streaming)
- Change the M17 vs M18 assignment (M17 = hardening; M18 = Desktop companion)
- Change the load-bearing invariants in §4
- Add features not listed here

If a planning agent thinks it has a better answer, it should add a **note to the human in a "Decisions revisited" section** of the final report, not silently pivot.

---

## 11. Multi-session execution plan

**Session 1 (this session):** Write this packet. Invoke `cobolt-plan feature` with this packet + audit + hardening plan as `--from-files`. Verify planning artifacts on disk at the path `cobolt-planning-gate.js` expects. Update `cobolt-state.json` to reflect M17. Checkpoint. Stop.

**Session 2+ (future):** `/cobolt-build M17` (without `--auto` to keep session-scoped). Pipeline runs Steps 00 → 08 across as many `--resume` sessions as context pressure requires. Final Step 08 commits, merges to main, bumps version to v0.0.36, tags, pushes.

**No session tries to run both cobolt-plan AND cobolt-build in full.** That would exhaust context. Checkpoints are the seams.
