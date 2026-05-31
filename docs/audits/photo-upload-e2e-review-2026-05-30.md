# Photo Upload Feature — End-to-End Technical Review & World-Class Remediation Plan

**Project:** RawDrive (Go API + Next.js 15 + Postgres/pgvector + Backblaze B2)
**Date:** 2026-05-30
**Reviewer:** Claude (read-only code audit performed directly against source)
**Scope:** Full upload flow — file/folder picker → source-side screening/WebP/encryption → object storage → DB metadata → app-wide WebP usage → download format choice.
**Added requirement (this session):** uploader must support **photos/images only** across all legitimate still-image formats, including pro DSLR/mirrorless RAW and Apple/Google HEIC/HEIF photos. It must reject videos, documents, archives, executables, scripts, model/prompt files, and every non-image payload even when disguised with image extensions or MIME types.

> **Context / why this exists.** The product contract (CLAUDE.md / AGENTS.md) makes four hard promises about uploads: (1) WebP derivatives for every image, (2) **encryption at rest**, (3) B2 object storage only, (4) comprehensive DB metadata + format-choice downloads. This review traces the *actual* code path end-to-end and grades it against those promises plus the user's required flow. The headline: the happy path for **JPEG/PNG** works well, but **encryption is entirely unwired for assets** (the schema scaffolding exists, but nothing writes ciphertext), and **every non-JPEG/PNG format the UI advertises (RAW, HEIC, TIFF, WebP-in) fails derivative generation** — so the exact formats pro photographers use never render. This doc is the single source of findings + the plan to make it world-class.

> **🔄 Re-validation (2026-05-30, commit `1d2b6b6`).** This audit was re-checked against current source (migrations now at **122**, not 103/104). **Three original claims were wrong or stale and are corrected in place** (look for **[corrected]**):
> 1. The `encryption_keys` table **and** `assets.encryption_key_id` / `assets.is_encrypted` columns **do exist** — migration `044_m11_deferred_features.up.sql:9,22-24`. The M11 encryption scaffolding is present but **completely unwired** (no writer ever populates it). The earlier "no migration creates the table / no encryption columns" claims were false.
> 2. Undecodable RAW/HEIC assets are set to status **`error`** (`worker/thumbnail_worker.go:143`), **not** stuck in `processing` forever. The real gaps are: `error` rows are never retried (poller only lists `processing`, `:134`), no failure reason is persisted, and the `error` state isn't surfaced in the UI.
> 3. EXIF `ExtractAndStore` **does** have a caller — `service/processing_pipeline.go:191` — but that pipeline is **dead code** (never instantiated in `cmd/api/main.go`), so the production worker never extracts EXIF.

> **🔐 Governing encryption contract (required).** All **originals AND all WebP derivatives** must be **encrypted at rest** in object storage; the database stores **only metadata** (including encryption metadata), never ciphertext. **Strict scope (confirmed with the product owner):** even the small WebP thumbnails that public client galleries serve anonymously today are encrypted — so there are **no anonymous direct B2/CDN URLs**; every public view is served through an **authenticated decrypt-proxy**. This resolves the old §5.2 "encrypt thumbnails?" question (answer: **yes, all**) and **supersedes L-2**. Trade-off recorded: plaintext is no longer CDN-edge-cacheable; mitigate with short-lived signed decrypt URLs at the proxy.

> **🧼 Clean-platform abuse-prevention contract (required).** RawDrive is a photography platform, not a general file host, covert-transfer system, malware dropbox, prompt-injection carrier, or evidence-evasion tool. The upload path must enforce: (1) strict image-only allowlisting at both client and server; (2) source-side conversion to WebP derivatives and source-side encryption wherever possible to reduce server CPU and plaintext exposure; (3) server-side verification because clients are never trusted; (4) malware/polyglot/steganography/covert-channel defenses; (5) metadata and AI-input sanitization so uploaded photos cannot inject prompts into AI agents or downstream automation; (6) abuse monitoring, audit logs, and escalation paths for illegal or deceptive use, including attempts to hide secrets or contraband data in images to bypass lawful safety, compliance, or security checks.

> **🎨 Implementation consistency contract (required).** Remediation must not introduce hardcoded UI values, credentials, security constants, provider names, magic limits, or one-off styling. Frontend work must read `design-tokens.json` first, use semantic token classes/CSS variables generated from the token pipeline, and keep icon actions on `GlassIconButton` + the SF Symbol icon registry. Any new color, spacing, radius, shadow, z-index, typography, or component state value must be added to the token system and synced via `node tools/cobolt-sync-tokens.js sync`; do not edit generated token outputs directly. Backend/config values must come from `platform_settings` or environment with fail-closed behavior where security is involved. Every wave must include regression checks so upload, gallery display, download, authz, encryption, and public-gallery flows are not broken while security is tightened.

> **🔗 Related audits (same day — do not duplicate).** Multi-tenant isolation / IDOR / RLS and storage-proxy **authorization** are owned by `docs/security/2026-05-30-full-application-security-audit.md` (confirmed *live*: asset IDOR V5, storage-proxy V2, dormant RLS). The full-repo sweep is `docs/audits/rawdrive-v0.0.65-full-audit-2026-05-30.md` (124 findings). This upload audit **owns**: format/decode, encryption-at-rest, EXIF, folder/recursive upload, batch robustness, and download parity; it **defers** authorization findings to the security audit (see SEC-3).

---

## 1. Executive Summary

| Area | Verdict | Severity of gap |
|---|---|---|
| File picker + individual select | ✅ Works | — |
| **Image-only upload boundary** | ⚠️ Client accept list + video check; no independent server allowlist | **CRITICAL** |
| **Folder select + recursive discovery** | ❌ Missing | **HIGH** |
| Explicit Upload trigger / batch | ⚠️ Auto-uploads on drop; no concurrency cap | MEDIUM |
| **Source-side WebP conversion + encryption** | ❌ Not implemented; server does derivatives and stores plaintext | **CRITICAL** |
| WebP derivative generation (JPEG/PNG) | ✅ Works (4 variants via `cwebp`) | — |
| **WebP for RAW / HEIC / TIFF / WebP-in** | ❌ Decode fails → asset set to `error`, never retried, not surfaced **[corrected]** | **CRITICAL** |
| **Encryption at rest (all originals + all WebP)** | ❌ Unwired (M11 table/columns exist; no writer) **[corrected]** | **CRITICAL** |
| **Public serving via decrypt-proxy (no direct CDN URLs)** | ❌ Public path serves plaintext directly | **CRITICAL (contract)** |
| Object storage upload (B2/S3, streaming) | ✅ Works (TUS multipart, no local disk) | — |
| DB metadata completeness | ⚠️ Good except **partial encryption fields** (algo/nonce/version missing), EXIF not persisted **[corrected]** | HIGH |
| App-wide WebP display | ✅ Works (grid/lightbox prefer WebP) | LOW notes |
| Download format choice (dashboard) | ✅ original / webp / thumbnail | — |
| Download format choice (public/client) | ⚠️ Original only | MEDIUM |
| **Secure decryption on download** | ❌ No decrypt step (because nothing is encrypted) | **CRITICAL (contract)** |
| **Download / serve authorization (tenant isolation)** | ❌ Not assessed here — defers to security audit (SEC-3) | see security audit |
| **Upload content scanning (AV / magic-byte / steganography / polyglot)** | ⚠️ Partial client manifest + server spot-check; no independent server allowlist/AV/stego controls (SEC-4/SEC-5) | **CRITICAL** |
| **AI prompt-injection resistance for photo metadata/content** | ❌ Not covered today | HIGH |
| **Design-token / no-hardcode implementation guardrails** | ⚠️ Project rule exists; remediation must enforce per wave | HIGH |
| Robustness / error handling | ⚠️ Good per-chunk; gaps in batch + orphan cleanup; **BulkRetry is a stub** | MEDIUM |

**Bottom line:** The TUS chunked-upload + WebP pipeline is genuinely solid engineering for JPEG/PNG (durable sessions, per-chunk checksums, quota gating, credit metering, parallel `cwebp`). But three contract-level promises are **not met in code**: **source-side processing/encryption**, **strict image-only enforcement**, and **all-format support**. User-visible impact: pro RAW/HEIC either stop at browser screening or fail backend derivative generation, and "encrypted at rest" is false. Security impact: the upload surface is not yet hardened against disguised non-images, polyglots, steganographic data exfiltration, malware, or prompt-injection through image metadata. **Beyond correctness, see §7 for the enterprise-grade performance & reliability gaps** — the headline being that the **server already supports resumable uploads but the client discards that capability** (zero retries, in-memory offset, no request timeout, no offline detection), and derivative processing is a **single sequential polling worker** (~4–5 min to finish a 500-photo batch). Neither is acceptable for production at scale or on mobile networks.

---

## 2. End-to-End Flow (as actually implemented)

```
[Browser] upload-dropzone.tsx (react-dropzone, accept incl. RAW/HEIC, multiple:true)
   │  onFilesAccepted → use-upload.ts addFiles()
   │     • fires chunkedUpload() for EVERY file at once (NO concurrency cap)   ← FINDING FE-3
   │     • runScreener(): file.arrayBuffer() (whole file in RAM, main thread)  ← FINDING FE-4
   │     • normal UI may stop RAW/HEIC/TIFF as needs_desktop_scan before upload
   ▼
POST /api/v1/uploads (chunked_upload.go CreateSession)
   • rejects content_type video/*
   • Tier-D manifest validation gate (telemetry-only by default)
   • storage quota CheckQuota(total_size)  ← TOCTOU vs finalize  ← FINDING BE-5
   • upload-credit reserve (M40)
   • storage key: <ws>/<tusId>/original<ext>
   • R2/B2 CreateMultipartUpload  → upload_sessions row (Postgres, RLS)
   ▼
PATCH /api/v1/uploads/{id}  (per 5 MiB chunk)
   • MaxBytesReader cap, optional Upload-Checksum (sha256→HTTP 460)
   • rolling sha256 + head/tail window; UploadPart → B2; append etag; update offset
   ▼  (offset >= total_size)
finalizeUpload()
   • CompleteMultipartUpload (PLAINTEXT bytes land in B2)   ← FINDING SEC-1 (no encryption; 2 other plaintext paths too)
   • F-003 hash verify + Tier-D header/trailer spot-check
   • assets INSERT (status='processing', thumbnail_urls={}, exif_data={})
   • StorageAccounting.RecordUpload (quota/dashboard)
   • credit Consume
   ▼  (async, polling)
ThumbnailWorker.processOne (worker/thumbnail_worker.go)
   • store.Get(original) → imaging.Decode (ONLY gif/jpeg/png)   ← FINDING FMT-1 (RAW/HEIC/TIFF fail)
   • on decode err: processNextBatch sets status='error' (:143), NEVER retried   ← FMT-1 [corrected]
   • GenerateAll → 4 WebP via cwebp (3 thumbs public + display_webp auth)
   • UpdateThumbnails (urls+w/h+blurhash) → UpdateStatus('ready')
   • asset_derivatives upsert + derivative_bytes accounting; face enqueue
   • EXIF: ExtractAndStore only called by UNWIRED processing_pipeline.go → exif_data stays {}  ← FINDING DB-2 [corrected]
   ▼
[Display]  grid/lightbox prefer thumbnail_urls.*_webp (public path) ; display_webp auth path
[Download] GET /assets/{id}/download?format=webp|<original>  (NO decrypt — plaintext)
           public: /public/galleries/{slug}/assets/{id}/download  (original only, no format)
[Serve]    GET /storage/*  (cmd/api/main.go ~:2376 io.Copy after store.Get) — NO decrypt  ← SEC-1 (3rd plaintext path)
```

Key source files (line counts as of `1d2b6b6`): `backend/internal/handler/chunked_upload.go` (~1098 L), `service/thumbnail_service.go` (~500 L), `service/upload_service.go` (legacy, 122 L — 2nd plaintext path, hardcodes `storage_driver:"r2"`), `service/encryption_service.go` (174 L, **unwired**), `service/processing_pipeline.go` (**unwired** — sole EXIF caller), `crypto/envelope.go` (the real KEK primitive), `storage/{factory,s3,s3_aws,local}.go`, `worker/thumbnail_worker.go`, `repository/asset_derivative_repo.go`, `cmd/api/main.go` (`/storage/*` proxy, 3rd plaintext path); frontend `components/upload/upload-dropzone.tsx`, `hooks/use-upload.ts`, `workers/upload-screening.worker.ts` (**unused**), `components/gallery/{photo-lightbox,public-gallery-grid,single-photo-view}.tsx`, `lib/api/downloads.ts`; migrations `011_create_assets`, `038_m11_asset_metadata_albums`, **`044_m11_deferred_features` (encryption_keys table + asset encryption columns)**, `066_upload_sessions`, `103/104_*webp*` — **current max migration is 122**.

---

## 3. Findings (severity-rated, evidence-cited)

### 🔴 CRITICAL

**SEC-1 — Encryption at rest is scaffolded but completely unwired. [corrected]**
Contract (AGENTS.md "Service Configuration"/CLAUDE.md + the governing encryption contract above): all originals **and** all WebP derivatives encrypted at rest. Reality:
- `EncryptionService` (AES-256-GCM, per-workspace DEK) exists but has **zero non-test callers** (`grep EncryptFile/NewEncryptionService/GetActiveDEK backend/` → only the file itself + tests).
- **[corrected]** The `encryption_keys` table **does exist** — `migrations/044_m11_deferred_features.up.sql:9` (id, workspace_id, encrypted_dek, key_version, algorithm, rotated_at). The earlier "no migration creates it" claim was **false**. The schema is present; nothing writes to it.
- It requires `ENCRYPTION_MASTER_KEY`; unset → constructor returns `nil` → "encryption disabled" (`encryption_service.go:28-31`).
- **Three plaintext paths, not one:** (1) `finalizeUpload` → `CompleteMultipartUpload` (`chunked_upload.go:823`); (2) legacy `UploadService.Upload` → `store.Put` (`upload_service.go:86`); (3) the `/storage/*` serve proxy → `io.Copy` after `store.Get` (`cmd/api/main.go ~:2376`). All `ThumbnailService` derivative writes are plaintext too.
- **[corrected]** `assets` has **partial** encryption columns — `encryption_key_id` + `is_encrypted` (migration `044:22-23`) — but is **missing** `encryption_algo`, `nonce_scheme`, `encryption_version`, and there are **no** per-row columns on `asset_derivatives`. So even the partial schema can't represent a streamed per-chunk AEAD.
- Download **and** serve handlers stream bytes directly with **no `Decrypt` call** anywhere.
> Impact: a core security promise is unmet. B2 object compromise = full plaintext photo exposure. Also note `EncryptionService.EncryptFile` does `io.ReadAll` (`:86`, whole file in RAM) — architecturally incompatible with the streaming multipart path even if wired; the streaming AEAD must be built on `crypto/envelope.go` instead (see DEC-1 + §5.2).

**FMT-1 — Non-JPEG/PNG images never get WebP derivatives (the RAW/HEIC requirement is broken today). [corrected]**
- Dropzone advertises & accepts `image/tiff, image/webp, image/heic/heif, CR2, NEF, ARW, DNG, RAF` (`upload-dropzone.tsx:13-24`). **Note:** the allowlist is also incomplete for 2026 — `.cr3` (Canon R-series), `.orf` (Olympus), `.rw2` (Panasonic), and `.avif` are **absent**.
- But `ThumbnailService` only registers `image/gif|jpeg|png` decoders (`thumbnail_service.go:8-10`); no `x/image/tiff`, `x/image/webp`, libheif, or RAW decoder in `go.mod`.
- **[corrected + clarified] Actual flow has two failure modes:** (1) the normal UI screener may stop RAW/HEIC/TIFF as `needs_desktop_scan` before upload; (2) direct API uploads, missing/telemetry-only manifests, or formats the browser path allows (notably WebP-in) can upload & store fine, asset = `processing`, then worker `imaging.Decode` returns an error → `processOne` returns error → `processNextBatch` sets status **`error`** (`thumbnail_worker.go:141-143`). The asset is **not** stuck in "Processing…" forever (the earlier claim) — but the `error` row is **never retried** (the poller only lists `status="processing"`, `:134`), the existing `processing_error` column/repo method are not wired, and the `error` state is **not surfaced** in the gallery UI, so it reads as a silent failure. Download of the original works; nothing renders in-app.
- Confirmed acknowledged in code comments: `public_gallery_handler.go:1140,1177` ("thumbnailing can't handle RAW (CR2/NEF/ARW) or HEIC").
> Impact: the exact formats professional photographers (RAW) and phone users (HEIC) shoot are silently unusable in-app. Directly contradicts the all-format requirement.

**SEC-2 (contract) — No secure decryption on download.** Because SEC-1, the "decrypt selected file before delivery" requirement has no implementation. Acceptable *only* once SEC-1 is delivered; today it's a gap against the stated contract.

**SEC-0 — Image-only trust boundary is incomplete.**
Contract: this uploader must accept legitimate still photos/images only. Reality:
- The client uses a dropzone allowlist, but client-side `accept` and `file.type` are advisory.
- The server rejects `video/*` in `CreateSession`, but that is not a full image-only allowlist and still trusts `content_type`.
- The backend does finalize-time hash verification and cheap header/trailer checks for manifest-declared JPEG/PNG/WebP/GIF, but it does not independently sniff and reject every non-image payload before storage.
- Archives, PDFs, scripts, executables, model/prompt files, and polyglot files must be rejected even if named `.jpg` or sent as `image/jpeg`.
> Impact: without an independent server-side file-type boundary, RawDrive can be abused as a disguised file-transfer surface rather than a photography product.

**SEC-5 — Covert-channel, steganography, malware, and prompt-injection controls are missing.**
Contract: the platform must not be useful for hacking, malware transport, covert exfiltration, AI-agent prompt injection, or deceptive attempts to hide secrets/contraband data inside photos. Reality:
- There is no AV/malware scanner in the hot path or quarantine pipeline.
- There is no server-side polyglot detection beyond limited browser screening and cheap header/trailer checks.
- There is no steganography/covert-payload risk scoring for suspicious entropy, appended payloads, oversized metadata, embedded archives, or abnormal carrier patterns.
- EXIF/IPTC/XMP metadata is not sanitized before storage, display, search indexing, or future AI-agent ingestion.
- There is no explicit rule that AI prompts must treat image metadata/OCR/captions as untrusted data, never as instructions.
> Impact: an attacker could use photos as a carrier for malware, secrets, prompt-injection strings, or hidden payloads. Controls must detect, strip, quarantine, audit, and block this behavior without turning the app into a general surveillance tool or weakening legitimate photographer privacy.

### 🟠 HIGH

**FE-1 — Folder selection + recursive discovery missing.**
- `upload-dropzone.tsx` uses `react-dropzone` with `accept/multiple` but **no `webkitdirectory`** input and **no directory-entry recursion** (`webkitGetAsEntry`/`readEntries`). No "select folder" affordance. Dragging a folder yields, at best, top-level files; nested folders are dropped. Requirement explicitly asks for recursive folder discovery.

**DB-1 — Encryption metadata columns are partial. [corrected]** `assets` already has `encryption_key_id` + `is_encrypted` (migration `044:22-23`) but is **missing** `encryption_algo`, `nonce_scheme`, and `encryption_version`; `asset_derivatives` has **none**. Required by spec ("encryption details: method, key reference") and by the strict per-derivative encryption contract. Blocks SEC-1 done-ness — needs an additive migration `123_asset_encryption` (not a new table; the M11 table already exists).

**DB-2 — EXIF not persisted in the production path. [corrected]** `ExifService.ExtractAndStore` exists and **is** called — but only by `service/processing_pipeline.go:191`, which is **dead code** (never instantiated in `cmd/api/main.go`; see ARCH-1). The production worker `processOne` sets thumbnails/dims/blurhash/faces only — no EXIF call. `assets.exif_data` stays `{}`; lightbox "File info" shows "No EXIF". (Also: `goexif` only parses JPEG/TIFF — won't cover HEIC/RAW even once wired.) Requirement lists EXIF + dimensions among mandatory metadata; dimensions are captured (good), EXIF is not.

**FE-2 — `maxFiles=100` cap.** Wedding folders routinely exceed 100; react-dropzone rejects the whole batch over the limit. Too low for the target user.

**SEC-3 (new) — Download/serve authorization & tenant isolation not assessed here; confirmed *live* by the security audit.** This "end-to-end" review never checked whether a user can download another workspace's asset. The sibling `docs/security/2026-05-30-full-application-security-audit.md` establishes that this is a **live** problem: **asset IDOR (V5)**, **storage-proxy authorization (V2)**, and a **dormant RLS** layer (policies `ENABLE`d but never `FORCE`d, app connects as table owner → owner bypass). The decrypt-proxy this audit mandates (encryption contract) **must not** be added on top of a broken authorization layer — fixing SEC-3 (per the security audit) is a prerequisite for the encryption wave, or the decrypt-proxy will cheerfully decrypt cross-tenant. *Owned by the security audit; tracked here as a hard dependency.*

**SEC-4 (new) — Upload content scanning is partial and not an independent server trust boundary.** The flow has a client manifest, hash verification, and cheap server header/trailer spot-checks for manifest-declared formats. That is useful but insufficient. Confirmed weakness: **the server still trusts client-declared `content_type` / manifest format for policy decisions** and does not independently classify the uploaded object before storage. There is no AV scanner, no full server-side image parser allowlist, and no quarantine path. Action: document what `validation_service` + `upload-screening.worker.ts` actually do, flip enforcement to fail-closed for production, and add a strict server-side magic-byte/structure allowlist for legitimate still images only.

### 🟡 MEDIUM

**FE-3 — No client upload concurrency cap.** `addFiles` calls `chunkedUpload()` for *every* file simultaneously (`use-upload.ts:211-213`). 300 RAW files → 300 parallel TUS sessions + 300 multipart inits on B2 → connection/file-handle exhaustion, memory spike, B2 per-request cost. Needs a worker-pool (e.g. 3–6 concurrent).

**FE-4 — Screener loads whole file into RAM on main thread.** `runScreener` does `new Uint8Array(await file.arrayBuffer())` and calls `screen()` inline (a worker file exists but is unused). 50–100 MB RAW × many files = jank/OOM. Should stream/hash in the existing `upload-screening.worker.ts` and cap metadata read.

**BE-5 — Quota TOCTOU.** `CheckQuota(total_size)` at session-create, `RecordUpload` at finalize; concurrent sessions can collectively exceed quota between the two. Use a reservation/atomic increment.

**BE-6 — Orphan risk on async derivative failure. [corrected]** If the worker can never decode (FMT-1) the original sits in B2 + an **`error`** row (not `processing` — see FMT-1) that is **never retried** (poller lists `processing` only); on crash mid-process it stays `processing`. No backoff/dead-letter or cleanup is visible for permanently-undecodable inputs. **The "bulk retry endpoint for transient cases" is a non-functional stub** — `handler/processing_status_handler.go` returns `{"message":"bulk retry queued"}` with **no NATS publish / worker trigger**, so it silently does nothing. Needs: real retry of `error` rows, bounded backoff for transient B2 errors, and periodic GC of orphaned rows + their B2 objects.

**DL-1 — Public/client download has no format choice.** `PublicAssetDownload` streams the original only; dashboard lightbox offers original/webp/thumbnail but the client-facing gallery (the people who actually download) cannot pick WebP.

**DEC-1 — Two divergent KEK conventions.** `EncryptionService` uses base64 `ENCRYPTION_MASTER_KEY`; `crypto/envelope.go` uses hex `PLATFORM_SETTINGS_KEK` (the documented platform KEK). The real, working envelope primitive is `crypto/envelope.go` — asset encryption should be built on it, not the dead service.

**ARCH-1 (new) — Dead/duplicate `ProcessingPipeline`.** `service/processing_pipeline.go` defines a full pipeline (and is the **only** caller of `ExifService.ExtractAndStore`, `:191`) but `NewProcessingPipeline` is never instantiated in `cmd/api/main.go`. It is misleading dead code that duplicates the live worker's responsibilities and masks DB-2 (EXIF looks "wired" to a grep). Decide explicitly: wire it (and make it the EXIF path) or delete it.

**OPS-1 (new) — Upload-specific rate limiting, audit logging, and metrics are weak.** There is a global IP rate limiter, but no upload-specific/per-workspace concurrent-session cap or stricter upload session limiter. For an "end-to-end" review these controls are absent or incomplete: (a) a client can spam multipart session creation within the broad global limit; (b) **no structured audit log** of uploads (who/what/when/hash/scan-result/quarantine-result) — mostly `log.Printf`; (c) **no metrics** on upload success rate, derivative latency, worker backlog, scanner rejects, quarantine counts, or quota-rejection rate. Needed for production observability + compliance.

### 🟢 LOW / INFO

- **L-1** `assets.storage_driver` hardcoded `"r2"` though backend is B2/S3 — cosmetic/misleading.
- **L-2 [superseded]** Public lightbox max display is `thumb_lg_webp` (~1200px), not `display_webp` (2400px), because display_webp is auth-gated. **Superseded by the encryption contract:** once all derivatives are served through the authenticated decrypt-proxy, the auth-gating distinction disappears and `display_webp` (2400px) can be served to public viewers via a scoped token — the quality ceiling goes away.
- **L-3** Standalone `/app/(dashboard)/upload/page.tsx` exists but is **not** in sidebar nav (only `admin/upload-credits`) — complies with the "no /upload nav" rule.
- **L-4** Dropzone `maxSize` default 500 MB vs backend `UPLOAD_MAX_BYTES` 2 GiB — harmless mismatch; RAW fits.
- **L-5** Blurhash is a custom non-spec base64 (not real BlurHash) — fine for LQIP, just mislabeled.

---

## 4. Requirement-by-Requirement Compliance Matrix

| Required behavior | Status | Evidence |
|---|---|---|
| **Accept only legitimate still photos/images** | ⚠️ | client allowlist + video reject only; needs server allowlist (SEC-0) |
| Reject videos/docs/archives/scripts/executables/model/prompt files | ⚠️ | `video/*` rejected; other disguised non-images not independently classified |
| Open file picker | ✅ | dropzone input |
| Select individual files | ✅ | `multiple:true`, `accept` |
| Select folders + **recursive** | ❌ | no `webkitdirectory`/entry recursion (FE-1) |
| Click Upload to start | ⚠️ auto on drop | `addFiles`→immediate (FE-3) |
| Source-side **WebP** generated before upload when possible | ❌ | not implemented; server generates derivatives |
| Per-image **WebP** generated | ⚠️ JPEG/PNG/GIF decode path only; WebP-in/RAW/HEIC/TIFF broken or stopped earlier | `thumbnail_service.go` (FMT-1) |
| Keep original **and** WebP | ✅ (when decodable) | original in B2; 4 webp variants |
| Source-side encryption before upload when possible | ❌ | not implemented |
| **Encrypt** stored originals | ❌ | unwired (SEC-1); M11 scaffolding present |
| **Encrypt ALL WebP derivatives** (incl. public thumbnails) | ❌ | strict contract; all derivative writes plaintext (SEC-1) |
| Upload encrypted to object storage | ❌ plaintext | finalizeUpload + legacy + storage proxy (SEC-1) |
| **Metadata-only in DB (never ciphertext)** | ✅ structurally | bytes live in B2; DB holds rows only |
| Store metadata: names/format/dims/sizes | ✅ (dims via worker) | assets + asset_derivatives |
| …paths/IDs for original + WebP | ✅ | storage_key + thumbnail_urls + asset_derivatives |
| …**encryption details** | ⚠️ partial | `encryption_key_id`/`is_encrypted` exist; algo/nonce/version missing (DB-1) |
| …timestamp/user/album assoc | ✅ | created_at, uploaded_by, gallery_assets/album_assets |
| …EXIF | ❌ | not persisted; only caller is dead pipeline (DB-2) |
| Robust, graceful errors, batch | ⚠️ | per-chunk strong; batch caps/concurrency weak; BulkRetry is a stub (BE-6) |
| WebP exclusively in-app (grid/preview/thumb) | ✅ | grid+lightbox prefer `*_webp` |
| WebP thumbnails for grid/feeds/search | ✅ | thumb_sm/md/lg_webp |
| Download: choose WebP **or** original | ⚠️ dashboard only | lightbox menu; public original-only (DL-1) |
| Decrypt selected file before delivery | ❌ | no decrypt (SEC-2) |
| **Public serving via authenticated decrypt-proxy** | ❌ | public path serves plaintext directly; no proxy (SEC-1 contract) |
| Server-side content/format validation (magic-byte, AV) | ⚠️ | hash + cheap spot-check exist; no independent server allowlist/AV/quarantine (SEC-4) |
| Steganography/polyglot/covert-payload defenses | ❌ | no quarantine/risk scoring (SEC-5) |
| Prompt-injection-safe AI ingestion | ❌ | no metadata/OCR/caption sanitization contract (SEC-5) |
| No hardcoded UI/security/config values in remediation | ⚠️ | must enforce via token/config checklist (DX-1) |
| Download/serve scoped to tenant (no IDOR) | ❌ | live IDOR/RLS — see security audit (SEC-3) |

---

## 5. Recommendations & Solutions — making it world-class

Solutions are concrete and ordered by leverage. They reuse existing primitives (`crypto/envelope.go`, TUS multipart, the worker, `asset_derivatives`) while moving expensive and sensitive work as close to the source device as possible.

### 5.0 Clean upload boundary — image-only, source-first, server-verified
- **Image-only allowlist:** accept only still-image formats: JPEG/JPG, PNG, WebP, GIF if explicitly allowed for still/animated policy, TIFF, HEIC/HEIF, AVIF, and camera RAW families required by product (`CR2/CR3/NEF/ARW/DNG/RAF/ORF/RW2`, extend as needed). Reject everything else: video, PDF, Office files, archives, executables, scripts, HTML/SVG with scriptability, model/prompt files, sidecar secrets, and unknown binaries.
- **Server is the trust boundary:** client checks improve UX, but backend must independently sniff magic bytes and parse enough structure to prove the object is a legitimate still image. MIME type, extension, and client manifest are never sufficient.
- **Source-side processing default:** the browser/desktop companion should produce WebP derivatives and encrypt originals + derivatives before upload when the local platform can do so safely. The server verifies, stores ciphertext, and only falls back to server-side conversion for explicitly supported cases where source-side processing is unavailable.
- **Two-lane upload model:** browser lane for common formats (JPEG/PNG/WebP/HEIC where browser support exists); desktop companion lane for RAW/TIFF/large HEIC/AVIF and source-side WebP/encryption. Both lanes must produce the same manifest contract and both are verified server-side.
- **Quarantine before availability:** any file with unknown type, suspicious structure, AV hit, polyglot markers, abnormal metadata, hidden archive signatures, or failed source/server verification must land in `quarantined`/`blocked`, not `ready`.
- **Sanitize untrusted metadata:** EXIF/IPTC/XMP, filenames, captions, OCR text, alt text, and AI-generated labels are user-controlled data. Strip or normalize dangerous fields, preserve only an allowlisted metadata subset, and never pass metadata to AI agents as instructions.
- **Abuse prevention:** add risk scoring and audit events for suspicious payload hiding, embedded secrets, illegal-content indicators, repeated rejects, automation abuse, and attempts to use RawDrive as a covert-transfer system. Enforcement should block/quarantine and provide escalation paths for compliance review.

### 5.1 All-format support (RAW + HEIC + TIFF) — the headline feature
**Adopt libvips (govips) as the shared decode/encode engine** for the desktop companion and server fallback, replacing the stdlib `image/*` + `cwebp` shell-out on the backend:
- `govips`/libvips natively reads JPEG/PNG/**TIFF/WebP/HEIC/AVIF/GIF**, and reads **embedded JPEG previews from RAW via libraw** when libvips is built `--with-libraw` (or shell out to `exiftool -b -PreviewImage` / `dcraw -e` as a fallback to extract the full-res embedded JPEG that every CR2/CR3/NEF/ARW/DNG/RAF carries).
- Generate all 4 WebP variants + thumbnails from the decoded/preview image **at the source when possible**. Browser support may cover common formats; the desktop companion should cover RAW/TIFF/HEIC/AVIF and large batches. The server remains a verifier and fallback, not the default CPU sink.
- libvips streams + is 4–8× faster and far lower memory than `imaging`+PNG-roundtrip+`cwebp`.
- **Decode strategy per format:**
  - JPEG/PNG/TIFF/WebP/HEIC/AVIF → decode directly (libheif for HEIC).
  - RAW (CR2/CR3/NEF/ARW/DNG/RAF/ORF/RW2) → extract embedded preview JPEG (fast, deterministic) → derive WebP. Full RAW demosaic is optional/Pro-tier later.
- **Validation must move server-side** to true magic-byte/structure sniffing (don't trust the client `content_type`, extension, or manifest); keep a strict allowlist of still-image formats only (ties to SEC-0/SEC-4).
- **Pipeline robustness [corrected]:** the worker already flips undecodable assets to `error` (`thumbnail_worker.go:143`), but silently — fix the *surfacing*, not an "infinite Processing" bug: (a) wire the existing `assets.processing_error` / `AssetRepo.UpdateProcessingError`, (b) **surface the `error`/`failed` state in the gallery UI** with a clear message + "this format needs the Desktop companion" where applicable, (c) **distinguish transient vs terminal** failures — retry transient (B2 timeout) with bounded backoff, mark genuinely-undecodable as terminal `failed`, and make the poller pick up retryable rows (today it only lists `processing`).
- Update dropzone copy + `maxFiles`/size to match true server capability; add the missing `.cr3/.orf/.rw2/.avif` to the allowlist.

### 5.2 Encryption at rest — strict: encrypt ALL originals + ALL WebP (streaming-safe)
> **Prerequisite (SEC-3):** do **not** ship the decrypt-proxy until tenant authorization/RLS is fixed per the security audit — otherwise the proxy decrypts cross-tenant. Sequence: authorization fix → encryption wave.

- **Build on `crypto/envelope.go` (the real, tested KEK primitive), retire the dead `EncryptionService`** (DEC-1).
- Use **AES-256-GCM in a streaming/chunked AEAD framing** (per-chunk nonces, e.g. an STREAM/`age`-style construction or `golang.org/x/crypto/...`) so it composes with TUS multipart and never buffers a whole RAW in RAM (fixes the `io.ReadAll` flaw). Per-object DEK, DEK wrapped by `PLATFORM_SETTINGS_KEK`.
- **Prefer source-side encryption:** the browser/desktop companion should encrypt originals and generated WebP derivatives before upload whenever supported. The server must verify encryption metadata, store ciphertext only, and reject plaintext uploads once migration/backfill is complete. During migration, support mixed plaintext/encrypted reads only behind a temporary compatibility gate.
- **Encrypt everything: originals + every WebP derivative, including the small public thumbnails** (strict contract). There is **no** unencrypted-thumbnail exception. Consequence: the anonymous public `thumbnails/` direct-URL path is **retired** — all public views go through an **authenticated decrypt-proxy** (see decrypt-on-serve below) with short-lived scoped tokens to preserve CDN-style caching of the ciphertext + signed URL.
- **Additive migration `123_asset_encryption` [corrected — do NOT create the table; it exists]:** the `encryption_keys` table + `assets.encryption_key_id`/`is_encrypted` already exist (migration `044`). Add the **missing** columns: `encryption_algo`, `nonce_scheme`, `encryption_version`, `dek_wrapped` (if not derivable from `encryption_keys`) on `assets`, **and per-row encryption columns on `asset_derivatives`** (each WebP variant is independently encrypted). Never edit migration 044 — append 123.
- **Decrypt-on-serve in ALL FOUR paths** (the audit originally listed three): `asset_handler.Download`, `edge_delivery_handler`, `PublicAssetDownload`, **and the `/storage/*` proxy in `cmd/api/main.go`** (streaming decrypt → `io.Copy`). Also retire the legacy plaintext `UploadService.Upload` write path. Add round-trip tests for each.
- Key rotation: store `encryption_version` + KEK id so KEK can rotate without re-encrypting all objects.
- Backfill existing assets: asynchronously encrypt existing originals + derivatives, populate missing encryption metadata, and mark any asset that cannot be safely processed as `quarantined`/`failed` with an operator-visible reason.

### 5.3 Folder upload + recursive discovery (FE-1)
- Add a **"Select folder"** button using `<input type="file" webkitdirectory multiple>` and, for drag-drop, implement `DataTransferItem.webkitGetAsEntry()` + recursive `readEntries()` to walk nested directories. Preserve relative paths (map to sub-galleries/albums). Raise `maxFiles` (or remove the cap and rely on the queue). Handle filenames with spaces/parentheses (already required by test assets).

### 5.4 Batch robustness & performance (FE-3/FE-4/BE-5/BE-6)
- **Client concurrency pool** (3–6 simultaneous uploads) with a queue; surface aggregate + per-file progress, retry/backoff, and a single "Retry all failed".
- Move screening/hashing into the **existing `upload-screening.worker.ts`**; stream-hash instead of `arrayBuffer()`; cap metadata read.
- **Atomic quota reservation** at session-create (decrement a reserved counter; settle/refund at finalize/cancel) to kill the TOCTOU.
- **Dead-letter / terminal-failure** handling in the worker for permanently undecodable inputs (status `failed` + reason), with bounded retry/backoff for transient B2 errors; periodic GC of orphaned `processing` rows + their B2 objects.

### 5.5 Metadata completeness (DB-1/DB-2)
- Wire **EXIF extraction into the worker** (`processOne`) after decode; with libvips you can read EXIF/orientation/GPS for JPEG/TIFF/HEIC/RAW-preview uniformly and persist to `exif_data` (camera, lens, ISO, shutter, aperture, focal length, GPS, capture_date → also populate the existing `capture_date` column).
- Persist encryption metadata (5.2). Ensure `width/height/format/size_bytes` are stored for original + each derivative (derivatives already do).

### 5.6 Download experience (DL-1)
- Add **`?format=webp|original|thumbnail` to the public/client download** endpoint with a format chooser in the client gallery (mirror the dashboard lightbox menu). Decrypt per 5.2. For batch ZIP, honor the chosen variant and stream (don't buffer whole galleries).

### 5.7 Abuse prevention, AI safety, and compliance controls (SEC-5)
- **Malware/AV scanning:** add a scanner/quarantine service for all originals and derivatives before an asset becomes visible. Fail closed on scanner outage for public/production workspaces; allow an explicit admin-only quarantine override with audit logging.
- **Polyglot and archive detection:** reject image files with embedded ZIP/RAR/7z/GZIP/PDF/HTML/JS signatures outside legitimate image containers, appended payloads after EOF, or suspicious container chunks.
- **Steganography/covert-channel risk scoring:** flag abnormal entropy, oversized metadata, least-significant-bit anomalies, hidden archive signatures, or repeated suspicious uploads. High-risk files go to quarantine/manual review rather than `ready`.
- **Metadata minimization:** strip dangerous/unneeded EXIF/IPTC/XMP fields from WebP derivatives; keep only a product-approved metadata subset in DB. Never expose raw metadata to public viewers by default.
- **AI-agent prompt-injection guardrails:** treat filenames, metadata, OCR, captions, alt text, comments, and image-detected text as untrusted user content. When passed to AI models, wrap them as data, not instructions; block tool execution or policy changes from any text found inside uploaded images.
- **Secret and sensitive-data detection:** scan metadata/OCR/captions for API keys, credentials, private keys, tokens, and high-risk identifiers. Quarantine or redact according to policy; alert workspace admins/security for repeated attempts.
- **Illegal/deceptive use prevention:** publish an acceptable-use policy and enforce it technically with audit logs, rate/concurrency limits, anomaly detection, account review, and abuse reporting. The goal is a clean photography platform: protect legitimate privacy and client confidentiality while blocking attempts to use images to hide contraband data, bypass lawful checks, or conduct hacking.

### 5.8 Hardening / polish
- Fix `storage_driver` to reflect real backend (`s3`/`b2`) (L-1).
- Real BlurHash or rename the field (L-5).
- Consider serving `display_webp` (2400px) to authenticated *and* tokenized public viewers for higher-quality client viewing (L-2).

### 5.9 No-hardcode and design-token guardrails (DX-1)
- **Frontend tokens first:** before any uploader/gallery UI change, read `design-tokens.json`; use semantic token classes or generated CSS variables only. Do not use Tailwind primitive scales, arbitrary values, inline hex colors, one-off shadows, ad-hoc radii, or viewport-scaled typography.
- **Sync token changes:** if a required value does not exist, add it to `design-tokens.json`, then run `node tools/cobolt-sync-tokens.js sync`. Do not hand-edit generated token outputs such as `frontend/src/index.css`, `frontend/src/lib/tokens.ts`, `.stitch/DESIGN.md`, or `component-registry.json` for token values.
- **Component consistency:** icon buttons must use `GlassIconButton`; new icons must be added to `frontend/src/components/icons/index.tsx` following the existing SF Symbols-style pattern. Upload controls must preserve touch targets, focus rings, and theme support across `liquid-glass`, `liquid-glass-dark`, and `midnight`.
- **No hardcoded security/config values:** upload limits, scanner policy, allowed formats, encryption versions, rate/concurrency limits, quarantine policy, and provider names must be centralized in config/policy tables or environment/platform settings. Security-sensitive missing config must fail closed or quarantine rather than silently falling back to permissive defaults.
- **Regression discipline:** every remediation wave must run focused backend tests plus Docker Playwright checks for upload-in-gallery, gallery grid, lightbox, download variants, public gallery access, authz denial, and theme rendering. A security fix is not done if it breaks the core photographer/client workflow.

---

## 6. Proposed Remediation Roadmap (waves)

0. **Wave 0 — Authorization prerequisite (CRITICAL, blocks Wave 3).** Fix tenant isolation / RLS / asset-IDOR / storage-proxy auth per `docs/security/2026-05-30-full-application-security-audit.md` (SEC-3). The decrypt-proxy **must not** be built on a broken authz layer. *Outcome: download/serve is tenant-scoped before anything gets decrypted.*
1. **Wave 1 — Image-only trust boundary + abuse controls (CRITICAL).** Add independent server-side image type detection; reject non-images and disguised payloads; add AV/quarantine; add polyglot/appended-payload checks; add initial steganography/covert-channel risk scoring; sanitize metadata before AI or public display (SEC-0/SEC-4/SEC-5). *Outcome: RawDrive cannot be used as a general file host, malware carrier, covert-transfer channel, or prompt-injection delivery path.*
2. **Wave 2 — Source-side all-format decode + WebP generation.** Introduce libvips in the browser/desktop/source pipeline first, with server fallback; RAW preview extraction (exiftool/dcraw fallback); expand allowlist incl. `.cr3/.orf/.rw2/.avif`; surface the existing `error` state + add terminal `failed` + reason + retry transient failures (FMT-1/BE-6). *Outcome: RAW/HEIC/TIFF render in-app; source devices absorb conversion CPU where practical; failures are visible, not silent.*
3. **Wave 3 — Encryption at rest, strict and source-first (CRITICAL contract).** Streaming AEAD on `crypto/envelope`; **additive migration `123_asset_encryption` (extend the existing M11 table — do not recreate it)**; source-side encryption for originals + WebP derivatives where supported; server fallback only when necessary; encrypt **all** originals + **all** WebP derivatives incl. public thumbnails; decrypt-on-serve in all four paths (incl. `/storage/*` proxy); retire dead `EncryptionService` + legacy plaintext write; backfill existing assets; round-trip + B2-ciphertext tests. *Outcome: "encrypted at rest" becomes true for everything; public serving via decrypt-proxy; decrypt-on-download delivered.*
4. **Wave 4 — Folder upload + batch robustness.** webkitdirectory + recursive drag-drop; concurrency pool; move screening into the **unused `upload-screening.worker.ts`** but make it partial/streaming, not whole-file buffering; atomic quota reservation; real dead-letter/GC (replace the BulkRetry stub, BE-6); upload-specific per-workspace rate/concurrency limits (OPS-1).
5. **Wave 5 — Metadata + download parity + observability.** EXIF persistence (wire or delete `ProcessingPipeline`, ARCH-1); encryption metadata; public download format choice + ZIP variant honoring; upload audit logging + metrics (OPS-1); AI-ingestion sanitization tests.
6. **Wave 6 — No-hardcode / design-token enforcement + polish.** Audit remediation changes for hardcoded values; move UI constants into `design-tokens.json`; move policy/security constants into centralized config; verify all upload/gallery UI states across the three themes; then handle storage_driver label (L-1), BlurHash (L-5), serve `display_webp` to public via proxy (L-2 superseded), copy/limits.
7. **Wave 7 — Performance & delivery hardening.** Streaming-aware server timeouts, resumable downloads with `Range`, `ETag`/304 support, CDN strategy for the decrypt-proxy, worker leasing/concurrency, upload transport retries/timeouts/offline resume, and explicit S3/B2 10,000-part guards.

> **Alignment with repo automation.** The machine-readable remediation scaffolding already in the repo root — `.cobolt-audit-findings.json` + `.cobolt-fix-wave1-critical.js … wave4` + `gen-fix-wave.py` — should be reconciled with these waves (note: those derive from the **full-repo** v0.0.65 audit, so the IDs differ; map this audit's SEC-0/SEC-1/SEC-3/SEC-4/SEC-5/FMT-1 onto the corresponding entries before running any fix wave, and flag drift rather than running blind).

**Verification per wave (using repo conventions):**
- Backend: `npm run test:backend` (`go test ./... -count=1`), plus new tests in `chunked_upload_*_test.go`, `thumbnail_service_*_test.go`, `storage_encryption_test.go`, and a decrypt round-trip test.
- Use `tests/photos/` (17 real wedding JPEGs incl. spaces/parens) **plus add** sample CR2/NEF/ARW/DNG/HEIC/TIFF fixtures for the new decode paths.
- E2E via Docker Playwright: upload a folder mix (JPEG+RAW+HEIC) inside a gallery → assert all reach `ready`, grid shows WebP, lightbox shows WebP, download menu yields original (decrypted) + WebP. Add a negative case: a genuinely-undecodable file surfaces a **visible error/failed state** (not a silent `error` row, not infinite "Processing").
- **Authorization (SEC-3):** a download/serve request for another workspace's asset id returns 403 (not the bytes) — across `/assets/{id}/download`, the public path, and the `/storage/*` proxy.
- **Image-only / anti-abuse:** upload attempts for PDF/ZIP/EXE/JS/HTML/SVG-script/model/prompt files disguised as images are rejected before availability; image/polyglot samples with appended archives are quarantined; metadata containing prompt-injection text is stored/displayed as inert data and never executed as an AI instruction.
- **No-hardcode / design-token checks:** grep/code-review confirms no new hex colors, arbitrary Tailwind values, primitive Tailwind color/spacing scales, raw icon buttons, hardcoded credentials, hardcoded provider secrets, or scattered security constants. Token changes are made in `design-tokens.json` and synced. UI screenshots cover all three themes.
- Storage assertion: **all** object bytes in B2 are ciphertext (magic-byte check) post-encryption wave — originals **and** every WebP variant incl. public thumbnails; `assets`/`asset_derivatives` rows carry encryption + EXIF columns.
- Lighthouse/network: confirm grid/lightbox request only `*_webp` variants, and that public views resolve through the authenticated decrypt-proxy (no direct anonymous B2 URL).

---

## 7. Performance, Reliability & Scale — Enterprise-Grade Hardening

> Scope: latency sources, hard limits that cause delays/failures, large-image (RAW/TIFF/100 MB+) handling, mobile/flaky-network resilience, processing throughput, and delivery latency. Evidence re-validated against `1d2b6b6`. Severity reflects production/enterprise expectations (high reliability **and** performance), not "works on a fast LAN". The goal stated for this section: **full production, enterprise-grade, high reliability + performance.**

### 7.1 What's already solid (keep)
- **TUS chunked multipart, streaming, no local disk.** 5 MiB chunks (`chunked_upload.go:328`, `use-upload.ts:12`); `MaxBytesReader` bounds per-chunk RAM (`:540`, chunk+64 KiB slack); finalize re-reads from B2 with a buffered stream — no whole-file buffering on the upload hot path.
- **Server-side resumability already exists.** TUS `HEAD` returns `Upload-Offset` (`GetOffset`, `:713-730`); 24 h session TTL (`:42-49`, env-tunable); abandoned-session GC + `AbortMultipartUpload` on cancel (`:746-751`) so incomplete B2 multiparts don't bill forever.
- **Per-chunk integrity.** Incremental rolling SHA-256 + optional `Upload-Checksum` (HTTP 460 on mismatch); F-003 hash verify at finalize.
- **Worker pickup already tuned** 5 s → 1 s poll (`thumbnail_worker.go:99`); 4 WebP variants encoded in parallel per asset via `errgroup` (`thumbnail_service.go:195-207`).
- **Delivery streams** (`/storage/*` proxy `io.Copy`, `main.go:2338-2373`) with `Cache-Control: private, max-age=3600`; UPLOAD_MAX_BYTES default 2 GiB (`:48-49`).

### 7.2 🔴 Reliability gaps that cause upload FAILURES (mobile-critical)

**PERF-R1 — Client does ZERO chunk retries; one transient error fails the whole file.** On any non-OK PATCH the client `throw`s immediately — no retry, no backoff (`use-upload.ts:159-161`). A single 5xx / TCP reset / cellular handoff fails the entire file; the user restarts manually. *Fix: bounded jittered exponential backoff (e.g. 5 attempts, 1→16 s) per chunk before surfacing failure.*

**PERF-R2 — Client throws away the server's resume capability (biggest mobile gap).** The server supports resume (HEAD → `Upload-Offset`), but the client keeps `offset` in an in-memory variable (`use-upload.ts:137`) with **no persistence** — page refresh / tab close / app backgrounding (routine on mobile) re-uploads the file from byte 0. No `localStorage`/IndexedDB of `{tusId, fileKey, offset}`, no HEAD-before-resume. *Fix: persist the session id; on resume, HEAD the server for the true offset and continue. The backend already supports this — it's purely a client gap.*

**PERF-R3 — No request timeout on the chunk PATCH.** Uses `fetch()` (`authFetch.ts:46`) with an AbortController only for user cancel — `fetch` has no native timeout. A stalled connection (0 bytes for minutes — the typical flaky-cellular failure) hangs indefinitely and never triggers a retry. *Fix: switch upload transport to `XMLHttpRequest` (gives `upload.onprogress` for real speed/ETA **and** `xhr.timeout`) or wrap fetch in an AbortController timeout; pair with PERF-R1.*

**PERF-R4 — No offline/online detection.** No `navigator.onLine` / `online`/`offline` listeners; manual pause/resume exists (`pausedRef`, polled every 500 ms) but nothing auto-pauses. Mobile users cross WiFi↔cellular↔offline constantly; uploads stall and drain battery/data instead of pausing + auto-resuming. *Fix: auto-pause on `offline`, auto-resume (with HEAD re-sync) on `online`.*

**PERF-R5 — Server has no Read/Write/Idle timeouts.** Only `ReadHeaderTimeout: 15s` (`main.go:2500-2502`); no `ReadTimeout`/`WriteTimeout`/`IdleTimeout`. Slow clients can hold connections open indefinitely → pool exhaustion under load. (Chunked PATCH is bounded so it's mostly safe; direct/multipart posts and slow downloads are exposed.) *Fix: set bounded, streaming-aware timeouts (per-route where possible) tuned **not** to kill legitimate slow uploads.*

### 7.3 🟠 Throughput & scale limits that cause DELAYS

**PERF-T1 — Derivative processing is single-worker, sequential, polling-based.** One goroutine per pod (`worker_registry.go:36-47`), `ListByStatus("processing", 10)` (`:154`), assets processed **sequentially** in the batch (`:157-168`), 1 s poll. At ~400–500 ms/asset, **500 photos ≈ 4–5 min** before the last thumbnail is `ready`; the gallery looks empty meanwhile. *Fix: (a) event-driven — NATS JetStream is already wired but only **publishes** `asset.ready`; subscribe the worker to `asset.uploaded` to drop the 0–1 s poll floor to <100 ms; (b) configurable concurrent worker pool (`THUMBNAIL_WORKERS=N`); (c) cross-pod scale with a claim/lease so workers don't double-process.*

**PERF-T2 — Per-chunk DB overhead (3 round-trips/chunk).** Each PATCH does session read (`GetByTUSUploadID`) + `AppendPartETag` + `UpdateOffset` (`:505-647`) — ~1,200 Postgres round-trips for a 2 GiB upload; a latency multiplier under fan-in. *Fix: collapse offset+etag into one `UPDATE … RETURNING`.*

**PERF-T3 — Sequential-only chunks; one slow chunk stalls the file.** Parts must arrive strictly in offset order (`:519-525,607-609`); out-of-order → 409. No parallel parts within a file, so per-RTT cost dominates on high-latency links. *Fix: allow a bounded window of in-flight parts (S3/B2 accept out-of-order PartNumbers, reconciled at Complete), or explicitly rely on HTTP/2 multiplexing.*

**PERF-T4 — Re-sent chunk is not idempotent.** Same-offset resend → 409 (`:519-525`); the classic mobile case (server received the chunk but the ack was lost) double-writes the part and double-appends etag/offset → duplicate parts at Complete. *Fix: make PATCH idempotent on `(tusId, partNumber, chunkSha)` — if already recorded, return 204 + current offset instead of erroring/duplicating.*

### 7.4 🟠 Large-image handling (RAW / TIFF / 100 MB+)

**PERF-L1 — Worker OOM risk: full original decoded in RAM and 4 derivative jobs fan out per asset.** `store.Get` + `imaging.Decode` buffer the whole image (`thumbnail_worker.go:145`, `thumbnail_service.go:128`). The current worker processes the 10-row batch sequentially, so it is not decoding 10 originals at once, but each large asset can still create a multi-hundred-MB working set because the decoded source plus 4 resized/PNG/cwebp paths coexist. A 2 GB container can still OOM on large RAW/TIFF/phone panoramas. *Fix: the libvips/govips migration (§5.1) streams at a fraction of the memory; until then add a memory-sized semaphore and derive from the embedded/downscaled preview.*

**PERF-L2 — Screening loads the whole file into RAM on the main thread (FE-4); the worker is dead and also whole-file if used naively.** `runScreener` → `new Uint8Array(await file.arrayBuffer())` (`use-upload.ts:15-27`); `upload-screening.worker.ts` exists but is never instantiated and currently also calls `file.arrayBuffer()`. 100 MB RAW × several queued = main-thread jank / mobile OOM **before** a byte uploads. *Fix: move screening into the existing worker, but also rewrite it to stream/hash incrementally and read only header/footer/metadata windows, not the whole file.*

**PERF-L3 — No client-side downscale/transcode path.** Files upload as-is; no canvas/`createImageBitmap` preview generation. On metered mobile there's no "upload an optimized preview now, full-res on WiFi" flow. *Fix (optional, high-value for mobile): client-side preview for review/proofing while the original uploads in the background; a "WiFi-only full-res" toggle.*

**PERF-L4 — No HTTP Range on downloads → no resumable large-original download.** The `/storage/*` proxy ignores `Range` and never returns 206 (`main.go:2338-2373`); a 500 MB original that drops at 80% restarts from 0 (double egress + user pain). *Fix: honor `Range`, emit `Accept-Ranges: bytes` + `ETag`, return 206 — also enables parallel/segmented download.*

### 7.5 🟡 Delivery latency & cost

**PERF-D1 — Everything proxies through the API; no CDN / presigned path.** The presigned-URL path was removed; every thumbnail/derivative view streams through the Go `/storage/*` proxy (`asset_service.go:25-51`). A 50-image grid = 50 API hits; the API's egress, not B2's, is the ceiling, and there's no edge caching. *Fix: front `/storage/*` with a CDN keyed on the 1 h `Cache-Control`; under the strict-encryption contract the decrypt-proxy output stays CDN-cacheable behind short-lived signed URLs.*

**PERF-D2 — No `ETag` → no 304 revalidation.** `Cache-Control` is set but there's no validator, so post-expiry every request is a full re-download. *Fix: strong `ETag` (object hash) + `If-None-Match`.*

**PERF-D3 — Watermark baked per download, uncached.** `PublicAssetDownload` decodes→overlays→re-encodes on every watermarked download (`public_gallery_handler.go:1119-1139`) — 500–1000 ms CPU each, spiking under parallel client downloads. *Fix: pre-bake the watermarked variant once, or cache the baked output.*

**PERF-D4 — Storage accounting is best-effort & non-atomic.** `RecordUpload` failure is logged, not fatal (`:877-881`) → asset exists but `workspace_storage` is stale (wrong dashboard usage + wrong next quota check); the derivative-bytes delta has a restart race. *Fix: reconciliation job + fold accounting into the finalize transaction.*

### 7.6 🟡 Limits & quotas to make explicit (avoid silent failures)
- **10,000-part S3/B2 ceiling not validated.** At 5 MiB/part the practical object cap is ~50 GiB; `UPLOAD_MAX_BYTES` (2 GiB) is safe today, but if chunk size shrinks or the max grows, `CompleteMultipartUpload` fails silently. *Add a guard: `ceil(totalSize/chunkSize) ≤ 10000` at session-create.*
- **No per-workspace upload rate / concurrency limit** (OPS-1) — a script can open thousands of multipart sessions → B2 cost + connection exhaustion. *Add a per-workspace concurrent-session cap + request rate limit.*
- **No `MaxHeaderBytes` / documented reverse-proxy body+timeout limits** — confirm the edge (Cloudflare/ALB/nginx) doesn't truncate large uploads or impose a shorter timeout than the app expects.

### 7.7 Enterprise targets & acceptance criteria (measurable "done")
- **Reliability:** an upload survives ≥3 network drops **and** a full page refresh and still completes **without re-sending acked bytes** (PERF-R1/R2/R4); chunk-level success ≥99.9% with retries.
- **Mobile:** a throttled 3G profile (~400 Kbps, 300 ms RTT, 1% loss) completes a 50 MB file with live speed/ETA and automatic pause/resume.
- **Throughput:** 500-photo batch → last thumbnail `ready` in **≤60 s** (event-driven + worker pool), down from ~4–5 min.
- **Delivery:** gallery first-paint served from CDN/edge with `ETag` revalidation; large-original download resumable via `Range`.
- **Safety:** no OOM under 100×(100 MB) concurrent processing (semaphore/libvips); no orphaned B2 multiparts; storage accounting reconciles to zero drift.

**Verification:** load-test with `tests/photos/` + injected RAW/HEIC fixtures via Docker Playwright over a throttled network profile (Chrome DevTools `emulate` / throttling); assert retry/resume behavior, measure time-to-last-`ready`, and confirm `Range`/`ETag`/CDN headers on serve. Add Go benchmarks for `processOne` memory under large inputs and a soak test for orphaned-session GC.

**Suggested wave placement:** PERF-R1..R4 + PERF-L2 fold into **Wave 4** (batch robustness); PERF-T1 + PERF-L1 into **Wave 5** (processing + observability); PERF-R5, PERF-D1..D4, PERF-L4, and §7.6 limits into **Wave 7 — Performance & delivery hardening** (sequence after the encryption wave so CDN/Range work targets the decrypt-proxy, not the soon-to-change plaintext path).

---

## 8. Appendix — Evidence Index

> **Re-validated 2026-05-30 @ `1d2b6b6`.** Rows marked **[corrected]** were wrong/stale in the original index. Readers: re-verify against current code before acting — 3 of these claims had drifted within the same day.

| Claim | Verification |
|---|---|
| **[corrected]** `encryption_keys` table **exists** (was: "never created") | `migrations/044_m11_deferred_features.up.sql:9` creates it; `:22-24` add `assets.encryption_key_id`/`is_encrypted` + index. Original grep claim was false. |
| `EncryptionService` has no non-test callers | `grep EncryptFile/NewEncryptionService/GetActiveDEK backend/` → only its own file + `_test` |
| Upload stores plaintext (×3 paths) | `chunked_upload.go:823 finalizeUpload` → `CompleteMultipartUpload`; `upload_service.go:86` → `store.Put`; `cmd/api/main.go ~:2376 /storage/*` → `io.Copy` — none encrypt |
| Server rejects only `video/*`, not all non-images | `chunked_upload.go:297-300` rejects `strings.HasPrefix(input.ContentType, "video/")`; no independent still-image allowlist at session create |
| Server has manifest hash + cheap spot-check, not independent format classification | `chunked_upload.go:973-990` calls `VerifyHeaderTrailerBytes`; `upload_manifest_verify.go:144-172` checks only manifest-declared JPEG/PNG/WebP/GIF signatures |
| Only gif/jpeg/png decoders | `thumbnail_service.go:8-10`; `go.mod` has no tiff/webp/heif/vips |
| **[corrected]** Undecodable asset → status `error` (was: "stuck before `ready`") | `worker/thumbnail_worker.go:141-143` sets `error` on `processOne` err; poller lists `processing` only (`:134`) → never retried |
| `processing_error` exists but worker does not use it | `migrations/038_m11_asset_metadata_albums.up.sql:5` adds column; `asset_repo.go:313-323` has `UpdateProcessingError`; `thumbnail_worker.go:141-143` only calls `UpdateStatus(..., "error")` |
| **[corrected]** EXIF caller is dead code (was: "no caller") | `grep ExtractAndStore` → `service/processing_pipeline.go:191`; `NewProcessingPipeline` never instantiated in `cmd/api/main.go` |
| BulkRetry is a stub | `handler/processing_status_handler.go` returns `{"message":"bulk retry queued"}`, no NATS publish/worker trigger |
| Dashboard download supports `?format=webp` | `asset_handler.go Download` switch on `format` (`webp`→`display_webp`, else original); **no Decrypt** |
| Public download original-only | `public_gallery_handler.go PublicAssetDownload` (no format param, streams original) |
| No client concurrency cap | `use-upload.ts addFiles` loops `chunkedUpload` for all files |
| Screener reads whole file, main thread; worker unused | `use-upload.ts runScreener` → `file.arrayBuffer()` + inline `screen()`; `workers/upload-screening.worker.ts` exists but is never imported |
| Global rate limit exists but upload-specific caps do not | `cmd/api/main.go:687-693` wires global IP limit; no per-workspace concurrent upload-session cap found in upload path |
| No `/upload` in sidebar nav | nav grep → only `admin/upload-credits`; page exists at `app/(dashboard)/upload/page.tsx` (unlinked) |
| Folder/recursive not implemented | `upload-dropzone.tsx` → no `webkitdirectory`/`webkitGetAsEntry`; `maxFiles=100` (`:29`) |
| Migration max is 122 (not 103/104) | top migrations: `122_drop_galleries_subdomain_slug`, `121_…`, `120_…` |

*End of review. Re-validated against `1d2b6b6` on 2026-05-30 — see the Re-validation banner at the top for corrected claims.*
