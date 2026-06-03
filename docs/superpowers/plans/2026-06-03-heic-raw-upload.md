# HEIC/RAW Upload Support Implementation Plan

> **For agentic workers:** Execute via superpowers:subagent-driven-development — fresh implementer per task + two-stage review. This is a **PORT**: the proven source lives on the parked branch `security/upload-audit-remediation-2026-05-31` (worktree `/Users/apple/merupuai/rawdrive-audit-fixes` @ `9f848a49`), primarily commit `44621c86` + sniffer from `c95032c6`. Implementers READ that source and reconstruct onto current main, **stripping SEC-1 encryption hunks** and renumbering migration `133→152`.

**Goal:** Server-side decode of HEIC/HEIF/AVIF + camera RAW into the existing WebP derivative pipeline; originals preserved.

**Architecture:** CGO-free decoder shelling out to `heif-convert` (HEIC) + `exiftool`/`dcraw` embedded-preview (RAW); server-side magic-byte sniffer drives dispatch; transient/terminal retry state machine; wired before `imageops.Decode` in `ThumbnailService`.

**Tech Stack:** Go (Chi, CGO=0 Alpine), Postgres migration, Next.js dropzone.

**Base:** `origin/main` `17650057`. Next free migration: **152**. Decode hooks: `backend/internal/service/thumbnail_service.go:153` (`GenerateAll`) + `:265` (`GenerateAllDerivatives`). Dockerfile apk: `backend/Dockerfile:47`.

---

## Task H1: Foundation — Dockerfile tools + migration 152 + asset_repo retry/decode_format

**Files:**
- Modify: `backend/Dockerfile:47` (runtime apk line)
- Create: `backend/internal/database/migrations/152_asset_retry_tracking.up.sql` + `.down.sql`
- Create: `backend/internal/database/migrations/m152_migrations_test.go`
- Modify: `backend/internal/repository/asset_repo.go`
- Create: `backend/internal/repository/asset_repo_retry_test.go`

**Steps:**
- [ ] Dockerfile: append `perl-image-exiftool dcraw libheif-tools` to the `apk add --no-cache ... libwebp-tools ffmpeg` line. Add a comment noting which binary each provides (exiftool / dcraw / heif-convert) and that CGO stays 0.
- [ ] Migration 152 up: `ALTER TABLE assets ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0; ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ; ADD COLUMN IF NOT EXISTS decode_format TEXT;` + `CREATE INDEX IF NOT EXISTS idx_assets_retryable ON assets (next_retry_at) WHERE status = 'processing' AND deleted_at IS NULL;` (port verbatim from parked `133_asset_retry_tracking.up.sql`, renumbered). down: drop index + 3 columns.
- [ ] `m152_migrations_test.go`: hermetic file-content contract test matching the repo's existing `m*_migrations_test.go` style (assert up/down files exist, contain the column/index DDL, down reverses up). Read a sibling `m15*_migrations_test.go` on main for the exact pattern.
- [ ] `asset_repo.go`: add `DecodeFormat *string` (or matching nullable) to the Asset struct mapped to `decode_format`; add `retry_count`/`next_retry_at` mapping. Port methods from the parked `asset_repo.go`: `ListRetryable(ctx, limit)`, `MarkTransientFailure(ctx, id, err)` (retry_count++, next_retry_at = now + backoff, status stays processing), `MarkTerminalFailure(ctx, id, err)` (status failed), `GetRetryCount`, `MaxDecodeRetries=5` const, `retryBackoff(n)` exponential. Extend `BulkResetStatusForRetry` if present on main. Adapt SQL/struct to main's current asset_repo (read main's version first; preserve its existing columns/methods).
- [ ] `asset_repo_retry_test.go`: port the retry/backoff/dead-letter tests; use the repo's existing DB-test harness (or hermetic if main's asset_repo tests are hermetic).
- [ ] `go build ./... && go vet ./internal/repository/ && go test ./internal/database/migrations/ -run M152 -count=1` green.
- [ ] Commit: `feat(media): retry/decode_format columns (migration 152) + Dockerfile decode tools`.

## Task H2: Magic-byte sniffer

**Files:**
- Create: `backend/internal/service/upload_image_sniff.go` + `upload_image_sniff_test.go`

**Steps:**
- [ ] Port `upload_image_sniff.go` from parked commit `c95032c6` verbatim (it has no SEC-1 coupling): `SniffImageFormat(head []byte) (format string, ok bool)` recognizing JPEG/PNG/GIF/WebP/RAF magic, ISO-BMFF `ftyp` brands (heic/heix/mif1/avif/`crx `), TIFF (CR2 disambiguation at offset 8), and hard-rejecting PDF/ZIP/ELF/PE/Mach-O/SVG/HTML/XML; `NormalizeImageFormat` (`jpg→jpeg`, `tif→tiff`).
- [ ] Port `upload_image_sniff_test.go`. Confirm it doesn't depend on other parked-branch-only code.
- [ ] `go build ./... && go test ./internal/service/ -run Sniff -count=1` green.
- [ ] Commit: `feat(media): server-side image format sniffer (magic bytes)`.

## Task H3: Decoder (CompositeDecoder + external adapters)

**Files:**
- Create: `backend/internal/service/image_decoder.go` + `image_decoder_external.go`
- Create: `backend/internal/service/image_decoder_test.go` + `image_decoder_external_test.go`

**Steps:**
- [ ] Port `image_decoder.go` from `44621c86`: `ImageDecoder` interface, `DecodeError{Err, Transient}`, `classifyDecodeError`/`ClassifyDecodeError`, `CompositeDecoder` dispatch (jpeg/png/gif→stdlib; tiff→x/image/tiff; webp→x/image/webp; heic/heif/avif→heicDecoder; raw tokens→rawPreviewDecoder; default→terminal). `NewCompositeDecoder()`.
- [ ] Port `image_decoder_external.go`: `rawPreviewDecoder` (`exiftool -b -PreviewImage` primary, `dcraw -e -c` fallback), `heicDecoder` (`heif-convert`→png), `writeReaderToTempFile`, `runCaptureStdout` (signal-killed→transient), `exec.LookPath`-gated bins `exiftool`/`dcraw`/`heif-convert`. Arg-slices, no shell. `defer os.Remove`.
- [ ] Port both test files; they `t.Skip` when tools absent and synthesize fixtures via exiftool — keep that. Confirm `golang.org/x/image/tiff` + `/webp` are already in go.mod (they are, used elsewhere); no new deps.
- [ ] `go build ./... && go test ./internal/service/ -run 'Decoder|Decode' -count=1` green (external tests skip locally).
- [ ] Commit: `feat(media): CGO-free HEIC/RAW/TIFF/WebP decoder (heif-convert + embedded-preview)`.

## Task H4: Pipeline wiring (RISKY — two-stage review)

**Files:**
- Modify: `backend/internal/service/thumbnail_service.go`
- Modify: `backend/internal/worker/thumbnail_worker.go`
- Modify: `backend/cmd/api/main.go`
- Create: `backend/internal/service/thumbnail_service_decoder_test.go`
- Modify/Create: `backend/internal/worker/thumbnail_worker_retry_test.go`

**Steps:**
- [ ] `thumbnail_service.go`: add an optional `decoder ImageDecoder` field + `WithDecoder(d)` builder. Add `decodeSource(format string, r io.Reader)` that, when `decoder != nil` AND format is heic/raw, uses the decoder; otherwise the EXISTING `imageops.Decode(src, true)` path UNCHANGED. Insert the decode step before `imageops.Decode` at `:153` (`GenerateAll`) and `:265` (`GenerateAllDerivatives`) — `nil` decoder or jpeg/png/gif/webp/tiff = byte-identical legacy behavior. Add `GenerateAllWithFormat`/`GenerateAllDerivativesWithFormat` variants that accept the server format. **CRITICAL: preserve main's CURRENT thumbnail_service behavior exactly — only ADD the decode branch. Do NOT port the parked branch's SEC-1 `maybeSealDerivative`/`Encrypted`/`crypto.Envelope` hunks; main owns its derivative/E2EE handling.**
- [ ] `thumbnail_worker.go`: read `asset.DecodeFormat`, call the `*WithFormat` variant, classify decode errors via `ClassifyDecodeError` → `MarkTransientFailure`/`MarkTerminalFailure`, poll `assetRepo.ListRetryable` in the batch loop. Preserve main's existing worker behavior for non-decode paths.
- [ ] `main.go`: `.WithDecoder(service.NewCompositeDecoder())` on the ThumbnailService construction.
- [ ] Port `thumbnail_service_decoder_test.go` (decoder enables tiff/webp-input derivatives; nil-decoder unchanged; terminal error surfaces) + retry worker test.
- [ ] `go build ./... && go vet ./... && go test ./internal/service/ ./internal/worker/ -count=1` green.
- [ ] Commit: `feat(media): wire HEIC/RAW decode into the WebP derivative pipeline`.

## Task H5: Upload gate + decode_format persistence (RISKY — two-stage review)

**Files:**
- Modify: `backend/internal/service/chunked_upload.go` (or wherever finalize lives on main)
- Modify: `backend/internal/service/engine_allowlist.go` + `upload_manifest_verify.go` (the fail-closed branches)
- Test: extend the relevant upload tests

**Steps:**
- [ ] At finalize, persist the server-detected `SniffImageFormat` result into the asset row's `decode_format` (the column added in H1) so the worker skips a re-sniff.
- [ ] Relax the HEIC/RAW fail-closed paths now that decode exists: the finalize byte-check `default` branch and `strict_client_scan` engine allowlist (`engine_allowlist.go`) so HEIC/RAW are no longer rejected before decode. **Keep polyglot/non-image hard rejections intact.** Read main's CURRENT versions of these files first — they have diverged from the parked branch; adapt minimally.
- [ ] Add/extend tests asserting a HEIC/RAW upload now finalizes (not 415/fail-closed) and `decode_format` is persisted.
- [ ] `go build ./... && go test ./internal/service/ -count=1` green.
- [ ] Commit: `feat(media): accept HEIC/RAW at finalize + persist decode_format`.

## Task H6: Frontend dropzone allowlist

**Files:**
- Modify: `frontend/src/components/upload/upload-dropzone.tsx`
- Modify: `frontend/src/components/upload/upload-dropzone.test.tsx` (if present)

**Steps:**
- [ ] Extend the accepted-format allowlist + helper copy to include HEIC/HEIF/AVIF + RAW (cr2/cr3/nef/arw/dng/raf/orf/rw2). Match the existing component's pattern (read it first). Semantic tokens only.
- [ ] Update/extend the dropzone test.
- [ ] `pnpm --dir frontend exec tsc --noEmit && pnpm --dir frontend run lint && pnpm --dir frontend exec vitest run upload-dropzone` green.
- [ ] Commit: `feat(upload): accept HEIC/RAW/AVIF in the dropzone`.

## Task H7: Real fixtures + decode integration test

**Files:**
- Create: `tests/photos/` HEIC + RAW sample(s) (real files)
- Create/Modify: a Go integration test that decodes the fixtures end-to-end (skips when tools absent)

**Steps:**
- [ ] Add at least one real `.heic` and one real RAW (e.g. `.dng` or `.cr2`) sample to `tests/photos/`. If genuinely unobtainable in-session, document the gap and have the test skip with a clear reason.
- [ ] Add an integration test: feed each fixture through `CompositeDecoder` → assert a non-nil `image.Image` with sane bounds; `t.Skip` when `heif-convert`/`exiftool`/`dcraw` are absent.
- [ ] `go test ./internal/service/ -run Decode -count=1` (skips locally without tools).
- [ ] Commit: `test(media): real HEIC/RAW decode fixtures + integration test`.

## Task H8: Verify + Docker e2e + PR

**Steps:**
- [ ] Full `go build ./...`, `go vet ./...`, `go test ./... -count=1 -timeout 180s` green (decode external tests skip without tools).
- [ ] Frontend `tsc`/`lint`/`vitest` green.
- [ ] ATTEMPT a backend Docker rebuild (`docker compose up -d --build backend`) and run an end-to-end HEIC/RAW upload→decode→WebP-derivative check against the fixtures. If the stack can't be rebuilt safely (concurrent automation / env), flag it as the manual-verify gate and document the exact command.
- [ ] Open PR `feat/heic-raw-upload-support → main` (base origin/main), spec linked, NO merge (per standing "stage as PRs" preference + the manual decode-verify gate).

## Self-review notes
- Match real types: read main's `asset_repo.go`/`thumbnail_service.go`/`thumbnail_worker.go`/`chunked_upload.go` BEFORE porting — they differ from the parked branch.
- Strip ALL SEC-1 encryption coupling (`maybeSealDerivative`, `Encrypted`, `crypto.Envelope`, `stream.go`) — out of scope.
- Renumber migration 133→152; never reuse a committed number.
- Re-check `git branch` before each commit (main worktree is under concurrent automation; this worktree is isolated but confirm).
