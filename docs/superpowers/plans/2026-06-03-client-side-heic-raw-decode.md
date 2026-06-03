# Client-Side HEIC/RAW Decode Implementation Plan

> Execute via superpowers:subagent-driven-development — fresh implementer per task + two-stage review for the risky ones. Frontend: Next.js 15 + TS + pnpm, vitest+jsdom, strict eslint/React-Compiler purity, named exports, semantic design tokens. Worktree `/Users/apple/merupuai/rawdrive-port-heic`, branch `feat/heic-raw-upload-support`. Spec: `docs/superpowers/specs/2026-06-03-client-side-heic-raw-decode-design.md`.

**Goal:** Decode HEIC/HEIF/AVIF + common camera RAW in the browser so E2EE gallery uploads can generate WebP derivatives client-side; CR3/exotic RAW fall back per-file to Desktop. Also fix the pre-existing Safari WebP-encode gap.

**Seam:** `frontend/src/lib/media-encryption/webp-derivatives.ts:84` `decodeImage(file)`. Downstream resize→`toBlob('image/webp')`→`encryptBlob` is format-agnostic.

---

## CD1: Cross-browser WebP encode (Safari fix) — foundation
**Files:** `frontend/src/lib/media-encryption/webp-derivatives.ts` (the `renderWebP`/encode step ~:115-136), new `frontend/src/lib/media-encryption/webp-encoder.ts` (the encode-with-fallback helper), tests.
- [ ] Add a lazy WebP-encode helper: try native `canvas.toBlob('image/webp', q)` (and `OffscreenCanvas.convertToBlob` where used); if unsupported (feature-detect once, cached) → dynamic-`import('@jsquash/webp')`, encode the canvas's `ImageData` to a WebP `Blob`. Add `@jsquash/webp` to `frontend/package.json` (pnpm).
- [ ] Route `renderWebP` through the helper. Behavior on Chromium/FF unchanged (native fast-path); Safari now produces real WebP.
- [ ] Test: feature-detect both branches (mock `toBlob` returning null/unsupported → WASM fallback invoked; native present → WASM not loaded). Run existing `webp-derivatives` tests — unchanged.
- [ ] `pnpm --dir frontend exec tsc --noEmit` + `lint` + `vitest run webp` green. Commit: `fix(upload): WASM WebP-encode fallback for Safari/iOS`.

## CD2: HEIC/HEIF + AVIF client decode (RISKY — two-stage review)
**Files:** new `frontend/src/lib/media-encryption/decoders/heic.ts`, new worker `frontend/src/workers/heic-decode.worker.ts`, AVIF feature-detect util, tests.
- [ ] HEIC worker: dynamic-`import('heic-decode')` (on `libheif-js`); `decode({buffer})` → `{width,height,data}`; postMessage transfer back. Add `heic-decode` + `libheif-js` to package.json (lazy — only imported inside the worker chunk).
- [ ] `heic.ts`: `decodeHeic(file): Promise<ImageBitmap>` — spin the worker, get ImageData, `createImageBitmap(new ImageData(...))`. AVIF: `decodeAvifNative(file)` via `createImageBitmap` behind a cached 1×1-probe feature-detect.
- [ ] Tests: worker message contract (mock the worker); AVIF feature-detect both branches; HEIC decode mocked (jsdom can't run the WASM — mock `heic-decode` to return ImageData, assert an ImageBitmap-shaped result). Real HEIC fixture deferred to CD6 integration.
- [ ] tsc + lint + vitest green. Commit: `feat(upload): client-side HEIC/HEIF/AVIF decode`.

## CD3: Camera RAW embedded-preview decode (RISKY — two-stage review)
**Files:** new `frontend/src/lib/media-encryption/decoders/raw-preview.ts` (TIFF-IFD walker + RAF reader), tests + small RAW fixtures or synthetic IFD.
- [ ] `extractRawPreview(file): Promise<Blob|null>` — parse the file: TIFF-based (CR2/NEF/ARW/DNG/ORF/RW2) via UTIF (`utif2`) or a minimal IFD walker → find the largest embedded JPEG (entry whose bytes start with `FFD8`, biggest length) → slice it as a `Blob('image/jpeg')`. RAF (Fuji) via its fixed-offset header table. Return null if no usable full-res preview (→ caller falls back to Desktop). Add `utif2` to package.json if used.
- [ ] `decodeRaw(file): Promise<ImageBitmap|null>` — `extractRawPreview` → `createImageBitmap(jpegBlob)`; null on failure.
- [ ] Tests: build a synthetic minimal TIFF with an embedded JPEG (SOI/EOI) at a known IFD offset → assert extraction returns that JPEG; a file with only a tiny thumbnail / no preview → returns null (Desktop fallback); RAF offset parse with a crafted header. Use real fixtures in CD6.
- [ ] tsc + lint + vitest green. Commit: `feat(upload): client-side camera-RAW embedded-preview decode`.

## CD4: Wire decoder into the seam + unblock gates (RISKY — two-stage review)
**Files:** `webp-derivatives.ts` (`decodeImage` seam), new `frontend/src/lib/media-encryption/decode-to-image-source.ts` (the router), `still-image-formats.ts`, `browser-upload-support.ts`, tests.
- [ ] `decode-to-image-source.ts`: `decodeToImageSource(file)` router by extension+magic: native (jpeg/png/gif/webp), AVIF (native+detect), heic/heif → `decodeHeic`, cr2/nef/arw/dng/orf/raf(/rw2) → `decodeRaw`, else `{ok:false, reason:"needs-desktop"}`. Catch all decode errors → `{ok:false}` (per-file fallback). Returns the existing `DecodedImage` shape on success.
- [ ] `decodeImage(file)` in `webp-derivatives.ts`: call `decodeToImageSource`; on `{ok:false}` throw a typed `NeedsDesktopError` that `use-upload.ts`'s existing catch maps to status `needs_desktop` (it already sets `needs_desktop` when `createEncryptedWebPDerivativeSet` fails — confirm/route). jpeg/png path byte-identical.
- [ ] `still-image-formats.ts`: move HEIC/HEIF/AVIF + CR2/NEF/ARW/DNG/ORF/RAF/RW2 from DESKTOP_REQUIRED → BROWSER_DECODE sets. `browser-upload-support.ts`: narrow the `image/x-*` blanket block for those families (CR3/exotic stay blocked).
- [ ] Tests: router per format + fallback; `getBrowserE2EEUploadBlockReason` now returns null for the unblocked formats + still blocks CR3/exotic/non-image; `decodeImage` jpeg unchanged + HEIC routes to the decoder (mocked) + CR3 → needs-desktop. Regression: existing webp-derivatives/use-upload tests pass.
- [ ] tsc + lint + vitest green. Commit: `feat(upload): route HEIC/RAW through client decode + unblock gates`.

## CD5: Screener pass for unblocked formats
**Files:** `frontend/src/lib/upload-screening/screen.ts`, its tests.
- [ ] For the unblocked formats, return `decision:"pass"` with the canonical `detected_format` (instead of `needs_desktop_scan`), with minimal ISO-BMFF/IFD structural validation. CR3/exotic stay `needs_desktop_scan`. Keep non-image `block`.
- [ ] Tests: a HEIC/CR2 sample header → `pass` + correct `detected_format`; CR3 → `needs_desktop_scan`; non-image → `block`.
- [ ] tsc + lint + vitest green. Commit: `feat(upload): screener passes browser-decodable HEIC/RAW`.

## CD6: Dropzone copy + real fixtures + verify + PR
**Files:** `frontend/src/components/upload/upload-dropzone.tsx` (copy), `tests/photos/` fixtures, integration test, final verification.
- [ ] Update dropzone/picker helper copy to reflect HEIC/RAW now upload in-browser (note CR3/exotic still need Desktop). Semantic tokens.
- [ ] Add a real `.heic` + a real RAW fixture (e.g. `.dng`); integration test through `decodeToImageSource` (skip/mocked if the WASM can't load in jsdom — document).
- [ ] Full frontend suite + tsc + lint green; backend (H1-H5) build/vet/test green.
- [ ] Open PR `feat/heic-raw-upload-support → main` covering BOTH server-side (H1-H5) + client-side decode + the Safari fix, spec+plan linked, NO merge (manual cross-browser smoke gate noted). Subject `feat(media): HEIC/RAW upload support (client decode + server decode)`.

## Self-review notes
- The original raw bytes are STILL encrypted+uploaded (download integrity) — only decode for derivatives.
- Lazy-load ALL WASM/parser deps (no main-bundle bloat); LGPL libheif stays a separate worker chunk.
- Per-file fallback is mandatory — a decode failure must never break the batch, only mark that file needs_desktop.
- Re-check `git branch` before each commit (this worktree is isolated; main is under concurrent automation).
