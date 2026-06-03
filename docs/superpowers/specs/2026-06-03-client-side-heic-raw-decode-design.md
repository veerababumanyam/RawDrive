# Client-Side HEIC/RAW Decode for E2EE Gallery Upload — Design

**Date:** 2026-06-03
**Status:** Approved (user chose client-side decode + Safari WebP fix + recommended RAW coverage)
**Branch:** `feat/heic-raw-upload-support` (worktree `rawdrive-port-heic`), on `origin/main` `17650057`.

## Problem
RawDrive gallery uploads are **unconditionally E2EE**: the browser generates WebP derivatives then encrypts them at source (`webp-derivatives.ts` → `use-upload.ts`), so the server never sees plaintext. `<canvas>` can't decode HEIC/RAW, so `getBrowserE2EEUploadBlockReason` blocks them with "use RawDrive Desktop". The server-side decode (H1–H5, shipped on this branch) is never reached by the E2EE browser path. To let users upload HEIC/RAW to galleries **from the browser**, the browser must decode them client-side, then reuse the existing derivative+encrypt pipeline.

## Approach
Add a decode boundary at the existing seam **`decodeImage(file)` in `frontend/src/lib/media-encryption/webp-derivatives.ts:84`**. Everything downstream (resize → `toBlob('image/webp')` → `encryptBlob`) is format-agnostic and stays unchanged. The original raw HEIC/RAW bytes are still encrypted + uploaded for download; we only decode to produce the derivatives.

### Decode routing — `decodeToImageSource(file)` capability
Returns either decoded pixels (an `ImageBitmap`/canvas source the existing pipeline consumes) or `{ ok:false, reason:"needs-desktop", detail }` (per-file graceful fallback — keeps the existing Desktop block for THAT file only; the rest of the batch proceeds).
- **jpeg/png/gif/webp** → native `createImageBitmap(file)` (unchanged).
- **AVIF** → native `createImageBitmap` behind a one-time feature-detect (Safari 16.4+/Chrome/FF support it); miss → Desktop fallback.
- **HEIC/HEIF** → `libheif-js`/`heic-decode` (WASM) in a **lazy-loaded Web Worker**; frame 0 for multi-image/Live Photos → `ImageData` → `createImageBitmap`.
- **RAW (CR2/NEF/ARW/DNG/ORF + RAF; RW2 best-effort)** → extract the embedded **full-res JPEG preview** (UTIF/minimal TIFF-IFD walker for TIFF-based; small RAF offset reader) → native `createImageBitmap`. **No demosaicing** (mirrors the server's exiftool/dcraw embedded-preview approach).
- **CR3 + exotic RAW + any decode failure** → `{ ok:false, reason:"needs-desktop" }`.

### Safari WebP-encode fix (approved — fixes a pre-existing bug)
The existing pipeline encodes via `canvas.toBlob('image/webp')`, unsupported on Safari/iOS → WebP derivatives **silently fail on iPhones today**. Add a `@jsquash/webp` (WASM, lazy) encoder fallback used when `canvas.toBlob('image/webp')`/`OffscreenCanvas.convertToBlob('image/webp')` is unavailable. This makes HEIC-from-iPhone work AND fixes the pre-existing Safari gap for all uploads.

### Unblock the gates (in lock-step)
1. `still-image-formats.ts` — move HEIC/HEIF/AVIF + CR2/NEF/ARW/DNG/ORF/RAF/RW2 from the DESKTOP_REQUIRED sets into the BROWSER_DECODE sets.
2. `browser-upload-support.ts` — narrow the blanket `type.startsWith("image/x-")` RAW reject so the unblocked RAW families pass (CR3/exotic still blocked → Desktop).
3. `upload-screening/screen.ts` — for the unblocked formats, return `decision:"pass"` with the canonical `detected_format` (instead of `needs_desktop_scan`), so the screener manifest lets the upload finalize.

### Backend
**No change required.** For E2EE (encrypted) uploads, finalize verifies only the ciphertext digest and SKIPS the header/trailer byte spot-check (`chunked_upload.go` `mediaEncrypted` branch); Standard workspace policy accepts a `browser-worker` manifest for any format; `strict_client_scan`'s `IsServerDecodableFormat` already includes the targets. The H1–H5 server-side decode stays as the non-E2EE / API / server-ingestion fallback.

## Performance / safety
- HEIC decode + RAW parse run in a **Web Worker** (the repo already uses a worker for screening). Resize on `OffscreenCanvas` where available; WebP encode via native `convertToBlob` fast-path or `@jsquash/webp` WASM fallback.
- Decode ONE file at a time per worker; cap worker concurrency (libheif WASM is memory-hungry; 256MB original cap stays). `bitmap.close()`/`dispose()` after each derivative set.
- All WASM/parsers **lazy-loaded** (dynamic import) so the main bundle isn't bloated — libheif (~2MB) and @jsquash/webp (~900KB) fetched only on first relevant file.

## Dependencies (all lazy-loaded)
- `heic-decode` + `libheif-js` (HEIC/HEIF; **LGPL-3.0** — same lib the backend already uses via `heif-convert`; kept as a separate lazy worker chunk for clean LGPL posture; flag for a compliance nod).
- `utif2` OR a custom minimal IFD walker (RAW TIFF previews; MIT) + a tiny in-house RAF offset reader.
- `@jsquash/webp` (Safari WebP encode fallback; Apache-2.0).
- AVIF: none (native).

## Non-goals (YAGNI)
- JS RAW demosaicing (not viable in-browser; preview-only).
- CR3 + exotic RAW client decode (Desktop fallback).
- Moving the whole derivative pipeline off the main thread (only decode needs the worker; a full OffscreenCanvas migration is a later optimization).

## Testing
- Unit: `decodeToImageSource` routing per format; AVIF feature-detect; per-file fallback ({ok:false}) for CR3/failure; the WebP-encode feature-detect + WASM fallback path; the format-set flip; `browser-upload-support` now permits the unblocked formats; `screen.ts` returns `pass` for them.
- Real fixtures: at least one `.heic` + one RAW (e.g. `.dng`/`.cr2`) under `tests/photos/`; an integration test decoding them through `decodeToImageSource` (skip/mocked where a WASM bundle can't load in jsdom — use the existing worker/test patterns).
- Regression: the existing jpeg/png `webp-derivatives` + `use-upload` tests pass unchanged.

## Security/privacy
- Decode happens entirely client-side; plaintext never leaves the device; derivatives are encrypted at source exactly as today. The original is encrypted + uploaded for download.
- Routing keys on extension + magic bytes, not just `file.type`.
- Per-file fallback never weakens the existing block for formats we can't decode.
