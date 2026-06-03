# Client-Side Canon CR3 Decode for E2EE Gallery Upload — Design

**Date:** 2026-06-04
**Status:** Approved (extends PR #27 — completes its camera-RAW coverage with Canon CR3)
**Branch:** `feat/heic-raw-upload-support` (worktree `rawdrive-port-heic`).

## Problem
PR #27 added client-side camera-RAW decode for the E2EE gallery upload path by extracting each RAW's **embedded full-resolution JPEG preview** (no demosaic) and feeding it into the existing WebP-derivative pipeline. It covers the TIFF-based families (CR2, NEF, ARW, DNG, ORF, RW2) and Fuji RAF, but **Canon CR3 fell back to "needs RawDrive Desktop"**: CR3 is an ISO Base Media File Format (MP4-like) container, not TIFF, so the `utif2` IFD walker cannot read it. Canon's current bodies (R5/R6/R7/R8/R10, 90D, M6 II, …) all shoot CR3, so this is the most-requested gap. This change makes CR3 decode in the browser exactly like the other RAW formats.

## Approach
Add a dedicated **CR3 box-walker** at the existing RAW seam — no new dependency, mirroring how RAF is already hand-parsed. The decode boundary (`decodeImage` → `decodeToImageSource` → `decodeRaw` → `extractRawPreview`) and everything downstream (resize → WebP encode → encrypt → upload) are unchanged and format-agnostic. The original CR3 bytes are still encrypted + uploaded for download; we only slice an embedded JPEG to produce the derivatives.

### CR3 extraction — `extractCr3Preview(buffer)` in `decoders/raw-preview.ts`
Hand-parses the ISO-BMFF box tree (32-bit size, 64-bit `largesize`, to-EOF size, 16-byte `uuid` prefix; depth-bounded; never throws → `null` on any malformation). It collects JPEG candidates from two sources and returns the **largest** that begins with the JPEG SOI marker and lies within the buffer (reusing the existing `selectLargestJpegCandidate` / `sliceJpegBlob` helpers):
1. **Full-resolution JPEG in `mdat`** (preferred) — absolute offset (`stco`/`co64` chunk[0]) + byte length (`stsz`) from the first track's sample table under `moov/trak/mdia/minf/stbl`. The HEVC "CRAW" tracks are samples too but are rejected automatically because they do not start with `FF D8`.
2. **`PRVW` / `THMB` preview boxes** (reliable fallback, ~1620px) nested in the moov `uuid` boxes — scan the box payload for the SOI past its small fixed header.

`extractRawPreview` routes ISO-BMFF input with major brand `crx ` (or a `.cr3` extension) to `extractCr3Preview`; every other ISO-BMFF still (HEIC/AVIF) continues to return `null` here (those decode via their own decoders upstream).

### Unblock the gates (in lock-step with the existing RAW families)
1. `still-image-formats.ts` — move `cr3` from `DESKTOP_REQUIRED_STILL_IMAGE_EXTENSIONS` into `BROWSER_DECODE_STILL_IMAGE_EXTENSIONS`.
2. `decode-to-image-source.ts` — `crx ` brand / `cr3` ext → family `"raw"` (was `"unsupported"`); add `cr3` to `BROWSER_RAW_EXTENSIONS`.
3. `upload-screening/screen.ts` — `crx ` brand → `{ format:"cr3", browserDecodable:true }` (was `false`) so the screener returns `decision:"pass"` and the E2EE scan manifest lets CR3 finalize; `cr3` added to `BROWSER_DECODABLE_RAW`.
4. `browser-upload-support.ts` — no logic change (it derives from `isBrowserDecodableStillImageName`, now CR3-inclusive); comments updated.
5. `upload-dropzone.tsx` — copy moves CR3 into the "upload directly in your browser" list.

### Backend
**No change required.** The E2EE gallery path verifies only the ciphertext digest and never sniffs plaintext (`chunked_upload.go` `mediaEncrypted` branch), so the client screener manifest is the sole format gate. The non-E2EE / API fallback was already CR3-ready: `upload_image_sniff.go` maps `crx ` → `cr3`, `engine_allowlist.go` `IsServerDecodableFormat` includes `cr3`, and the server `rawPreviewDecoder` extracts CR3 via `exiftool -b -PreviewImage`.

## Non-goals (YAGNI)
- JS RAW demosaicing (preview-only, as with every other RAW family).
- Canon **Cinema RAW Light** video (`.CRM`) — out of scope; photo galleries only.
- **NRW / SR2 / SRF widening:** the TIFF extractor already handles these Nikon/Sony siblings, and only the four gate sets would need the additions — but per the project rule "never claim a format without a real-file smoke pass," they stay Desktop-only until a real sample is smoke-tested. Documented as a ready-to-flip follow-up.

## Testing
- Unit (`decoders/__tests__/raw-preview.test.ts`): hand-built CR3 ISO-BMFF fixtures (`ftyp crx ` + `mdat` full-res JPEG + `moov/trak` sample table + `uuid/PRVW`) assert: full-res mdat JPEG wins over PRVW; PRVW-only fallback; non-JPEG (HEVC) track rejected; bare-ftyp / non-ISO-BMFF / malformed-box → `null` (no throw).
- Gate tests updated: `decode-to-image-source` (CR3 → `decodeRaw`), `screen` (CR3 → `pass`), `still-image-formats` (CR3 browser-decodable), `browser-upload-support` (CR3 not blocked), `upload-dropzone` (copy).
- Real decode (`createImageBitmap`/WASM) is mocked in jsdom — unit tests assert routing + byte-slicing, not pixels.
- **Manual cross-browser smoke is the real decode gate (required before merge):** a real `.cr3` (recent Canon body) uploaded to a gallery on **Chromium AND Safari/iOS** — derivatives render (sm/md/lg + display), no Desktop bounce, original CR3 downloads intact, EXIF preserved; a corrupt `.cr3` degrades cleanly to the Desktop fallback. `tests/photos/` has JPEGs only, so a real `.cr3` sample must be sourced.

## Security/privacy
- Decode is entirely client-side; plaintext never leaves the device; derivatives are encrypted at source exactly as today. The original CR3 is encrypted + uploaded for download.
- Routing keys on magic bytes (ISO-BMFF `crx ` brand) + extension, never `file.type`.
- The box walker never throws and is bounds-/depth-checked; any malformed CR3 yields the existing per-file Desktop fallback rather than a crash, and a mis-sliced candidate fails `createImageBitmap` → same safe fallback.
