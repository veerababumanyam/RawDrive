# HEIC/RAW Upload Support (FMT-1 decode port) — Design

**Date:** 2026-06-03
**Status:** Approved (user chose "Full port")
**Branch:** `feat/heic-raw-upload-support` (worktree `rawdrive-port-heic`), based on `origin/main` `17650057`.

## Goal
Accept **HEIC/HEIF/AVIF** and **camera RAW** (CR2/CR3/NEF/ARW/DNG/RAF/ORF/RW2) uploads, decode them **server-side** into the existing WebP derivative pipeline (`thumb_sm/md/lg_webp` + `display_webp`), and preserve the original for download. Today `main` accepts these MIME types into a session but **fail-closes at finalize/worker** — there is no server-side decode, so `imageops.Decode` throws and the asset is marked `error`.

## Approach (reconstruct the proven slice onto current main)
The implementation already exists on the parked branch `security/upload-audit-remediation-2026-05-31` (worktree `/Users/apple/merupuai/rawdrive-audit-fixes` @ `9f848a49`), primarily commit **`44621c86`** ("FMT-1 — all-format decode + retry/failure state machine") plus the sniffer from **`c95032c6`**. We **reconstruct** it (not cherry-pick) because: (1) migration `133` must renumber to `152`; (2) the branch's `thumbnail_service`/`worker`/`asset_repo` carry intertwined SEC-1 derivative-encryption hunks that must be **stripped** (main handles its own derivative/E2EE path — preserve main's current behavior, only ADD decode); (3) `chunked_upload.go` has diverged.

### Decode engine (CGO-free — preserve `CGO_ENABLED=0` static Alpine build)
- **HEIC/HEIF/AVIF:** shell out to `heif-convert <in> <out.png>` (libheif-tools) → `png.Decode`.
- **Camera RAW:** extract the camera's **embedded full-res JPEG preview** (NOT demosaic): `exiftool -b -PreviewImage` (primary) → `jpeg.Decode`; fallback `dcraw -e -c` → decode. This is fast, CGO-free, and sufficient for display derivatives. Most cameras embed a full-res preview.
- **jpeg/png/gif/tiff/webp:** pure-Go (stdlib + `golang.org/x/image`), unchanged.
- All external calls use `exec.CommandContext` with arg-slices (no shell → no injection), `exec.LookPath`-gated (mirrors the existing `cwebp` pattern), input streamed to a temp file with `defer os.Remove`.
- **Format dispatch** is driven by a server-side magic-byte sniffer (`SniffImageFormat`), never the client content-type.

### Failure handling (transient vs terminal retry state machine)
Decode shells out to external tools, so failures must be classified: context-cancel/timeout/`signal: killed`/OOM → **transient** (retry with exponential backoff, stays `processing`); parse/corrupt/unsupported → **terminal** (dead-letter, status `failed`). Backed by new `assets` columns `retry_count`/`next_retry_at`/`decode_format` + a partial `idx_assets_retryable` index (migration 152), and `asset_repo` methods `ListRetryable`/`MarkTransientFailure`/`MarkTerminalFailure` polled by `ThumbnailWorker`. `MaxDecodeRetries = 5`.

### Pipeline integration
Insert a decode-normalization step in `ThumbnailService.GenerateAll`/`GenerateAllDerivatives` immediately before `imageops.Decode` (`thumbnail_service.go:153`/`:265`): if the asset's server-detected format is HEIC/RAW, decode via the `CompositeDecoder` into an `image.Image`, then feed the **unchanged** cwebp fan-out. For jpeg/png/gif/tiff/webp the behavior is byte-identical to today (additive, `nil`-decoder = legacy path). `main.go` wires `.WithDecoder(service.NewCompositeDecoder())`. Persist the server-detected `decode_format` at finalize (`chunked_upload.go`) to avoid a re-sniff. Originals are preserved (WebP-derivatives-only law unchanged).

### Upload gate relaxation
Now that decode exists, relax the fail-closed paths for HEIC/RAW: the finalize byte-check `default` branch (`upload_manifest_verify.go`/`chunked_upload.go` finalize fallback) and the `strict_client_scan` engine allowlist (`engine_allowlist.go`) — so HEIC/RAW no longer fail-close before decode. Keep the polyglot/non-image hard rejections intact.

### Frontend
`upload-dropzone.tsx`: extend the accepted-format allowlist + helper copy to include HEIC/HEIF/AVIF + the RAW set.

## Non-goals (YAGNI)
- Full RAW demosaicing / color science (embedded-preview is sufficient for display derivatives).
- HEIC/RAW EXIF deep-parsing beyond what the embedded preview/goexif yields (the pure-Go `goexif` won't read HEIC boxes / RAW maker notes — acceptable for Phase 1; orientation comes from the decoded preview).
- Pulling ANY of the parked branch's unrelated work (download-policy migrations 134-137, at-rest encryption migration 131, RLS/IDOR security 123-130, `crypto.Envelope`/`stream.go`).

## Testing & verification
- **Unit/integration (Go):** decoder dispatch + error classification; external-tool adapters (`t.Skip` when the binary is absent, matching the branch); thumbnail decode wiring (nil-decoder unchanged); retry/backoff/dead-letter state machine; migration 152 hermetic file-content test (`m152_*`).
- **Fixtures:** add at least one real HEIC and one real RAW sample under `tests/photos/` (none exist today) for an end-to-end decode assertion.
- **Verification ceiling:** the decode tools (`exiftool`/`dcraw`/`heif-convert`) are NOT in the current backend image and unit tests `t.Skip` without them. Full end-to-end decode verification requires a **backend Docker image rebuild** (`docker compose up -d --build backend`). We port + `go build`/`vet`/`test` green + add fixtures, then ATTEMPT the Docker rebuild for an e2e decode check; if the stack can't be rebuilt safely it is flagged as the manual-verify gate (like the offline E2E).

## Security notes
- No shell interpolation in external-tool calls (arg-slices only). Tools are `LookPath`-gated and disabled-with-error if absent.
- Server-detected format (sniffer) drives decode, never the client MIME — preserves the upload security boundary.
- Polyglot/non-image rejections (PDF/ZIP/ELF/SVG/HTML…) stay intact.
- No new secrets; CGO stays disabled.
