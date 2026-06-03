// Client-side camera-RAW embedded-preview extraction + decode for the E2EE
// upload pipeline.
//
// WHY THIS EXISTS: gallery uploads are unconditionally end-to-end encrypted —
// the browser must produce WebP derivatives and encrypt them at source, so the
// server never sees plaintext. A <canvas> cannot decode camera RAW, and full
// demosaicing in the browser is far too heavy. Instead we mirror the server's
// exiftool/dcraw approach: every modern camera RAW embeds a full-resolution
// JPEG preview. We locate the LARGEST embedded JPEG, slice it out, and decode
// THAT to an ImageBitmap — no demosaicing. CD4 wires `decodeRaw` into the
// `decodeImage` seam and, when this returns null, falls back per-file to
// "needs RawDrive Desktop".
//
// LAZY TIFF PARSER (load-bearing): `utif2` (a TIFF/EXIF IFD parser) is reachable
// ONLY via the dynamic `await import("utif2")` inside `extractTiffRawPreview` —
// never a static top-level import. A static import would bundle the TIFF parser
// for every client regardless of whether they ever upload a RAW.
//
// COVERAGE: TIFF-based RAW (CR2, NEF, ARW, DNG, ORF) extract well; RW2 is
// best-effort (Panasonic stores its preview in a maker-note IFD that varies).
// RAF (Fuji) is parsed via its dedicated fixed-header layout. CR3 (ISO-BMFF)
// and any exotic / unparseable RAW return null so the caller routes the file to
// RawDrive Desktop. NOTHING in this module throws — every failure path is
// caught internally and surfaced as null.

/** TIFF-based RAW extensions whose embedded JPEG preview utif2 can locate. */
const TIFF_BASED_RAW_EXTENSIONS = new Set([
  "cr2", // Canon (TIFF)
  "nef", // Nikon
  "nrw", // Nikon (small-sensor)
  "arw", // Sony
  "sr2", // Sony (older)
  "srf", // Sony (older)
  "dng", // Adobe / generic
  "orf", // Olympus / OM System
  "ori", // Olympus (variant)
  "rw2", // Panasonic (best-effort)
  "raw", // Panasonic (older, best-effort)
  "pef", // Pentax
  "3fr", // Hasselblad
  "iiq", // Phase One
  "tif", // some RAW pipelines wrap previews in plain TIFF
  "tiff",
]);

/** A byte range inside the source buffer that may hold an embedded JPEG. */
export type JpegCandidate = {
  offset: number;
  length: number;
};

// JPEG markers. SOI = Start Of Image (FF D8); EOI = End Of Image (FF D9).
const JPEG_SOI_0 = 0xff;
const JPEG_SOI_1 = 0xd8;
const JPEG_EOI_0 = 0xff;
const JPEG_EOI_1 = 0xd9;

/**
 * Extracts the largest embedded full-resolution JPEG preview from a camera RAW
 * `File`/`Blob` and returns it as a `Blob('image/jpeg')`, or `null` when the
 * format is unsupported / no usable preview is present / parsing fails.
 *
 * NEVER throws: every failure is caught and surfaced as `null` so the caller
 * (CD4) can fall back to "needs RawDrive Desktop" per file.
 *
 * Detection routes by magic bytes + extension (it does NOT trust `file.type`):
 *   - RAF (Fuji) by its `FUJIFILMCCD-RAW` magic → dedicated header parser.
 *   - CR3 / ISO-BMFF (`....ftyp`) → null (Desktop; no TIFF preview to slice).
 *   - TIFF magic (`II*\0` / `MM\0*`) with a RAW extension → utif2 IFD walk.
 */
export async function extractRawPreview(
  file: File | Blob,
  ext?: string,
): Promise<Blob | null> {
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const extension = normalizeExtension(ext);

    if (isRafMagic(bytes)) {
      return extractRafPreview(buffer);
    }

    // CR3 and any other ISO Base Media File Format container ("ftyp" box) hold
    // no sliceable TIFF preview here → Desktop fallback.
    if (isIsoBmff(bytes)) {
      return null;
    }

    if (isTiffMagic(bytes) && isTiffBasedRawExtension(extension)) {
      return await extractTiffRawPreview(buffer);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Decodes a camera RAW `File`/`Blob` into an `ImageBitmap` by extracting its
 * embedded JPEG preview and decoding that. Returns `null` when no preview is
 * usable or the JPEG decode fails — NEVER throws.
 */
export async function decodeRaw(
  file: File | Blob,
  ext?: string,
): Promise<ImageBitmap | null> {
  if (typeof createImageBitmap !== "function") {
    return null;
  }
  const preview = await extractRawPreview(file, ext);
  if (preview === null) {
    return null;
  }
  try {
    return await createImageBitmap(preview);
  } catch {
    return null;
  }
}

// The shape we consume from a utif2 IFD. utif2's bundled types model tag values
// as `tXYZ` arrays but do not expose the nested sub-directories it attaches
// (`subIFD`, `exifIFD`, `fujiIFD`), so we narrow to exactly what we read.
type RawIfd = {
  [tag: string]: unknown;
  subIFD?: RawIfd[];
  exifIFD?: RawIfd;
  fujiIFD?: RawIfd;
};

/**
 * TIFF-based RAW preview extractor (CR2/NEF/ARW/DNG/ORF/RW2/…). Uses utif2 to
 * parse the IFD tree, walks IFD0 + every SubIFD (`t330`) + the EXIF IFD +
 * Fuji IFD, collects every JPEG byte-range it can describe, verifies each
 * starts with the JPEG SOI marker, and returns the LARGEST one (the full-res
 * preview, not the ~160px thumbnail) as a `Blob('image/jpeg')`.
 *
 * Lazy-imports utif2 so the TIFF parser stays out of the main bundle.
 */
export async function extractTiffRawPreview(
  buffer: ArrayBuffer,
): Promise<Blob | null> {
  let ifds: RawIfd[];
  try {
    const UTIF = await import("utif2");
    // utif2's IFD type does not surface the nested sub-directories it attaches,
    // so widen through `unknown` to our narrowed `RawIfd` view.
    ifds = UTIF.decode(buffer) as unknown as RawIfd[];
  } catch {
    return null;
  }

  const bytes = new Uint8Array(buffer);
  const candidates: JpegCandidate[] = [];
  for (const ifd of ifds) {
    collectJpegCandidates(ifd, candidates);
  }

  const best = selectLargestJpegCandidate(candidates, bytes);
  if (best === null) {
    return null;
  }
  return sliceJpegBlob(buffer, best);
}

/**
 * Walks one IFD and its nested sub-directories, appending every JPEG byte-range
 * it can describe to `candidates`. Two tag conventions describe an embedded
 * JPEG:
 *   1. JPEGInterchangeFormat (`t513`) + JPEGInterchangeFormatLength (`t514`) —
 *      the standard "embedded preview/thumbnail" pair (TIFF/EP, EXIF, DNG).
 *   2. StripOffsets (`t273`) + StripByteCounts (`t279`) when Compression
 *      (`t259`) == 6 or 7 (JPEG) — how many RAW previews store the full-res
 *      JPEG in a dedicated SubIFD.
 */
function collectJpegCandidates(ifd: RawIfd, candidates: JpegCandidate[]): void {
  const interchangeOffset = firstTagNumber(ifd, "t513");
  const interchangeLength = firstTagNumber(ifd, "t514");
  if (interchangeOffset !== null && interchangeLength !== null && interchangeLength > 0) {
    candidates.push({ offset: interchangeOffset, length: interchangeLength });
  }

  const compression = firstTagNumber(ifd, "t259");
  if (compression === 6 || compression === 7) {
    const stripOffset = firstTagNumber(ifd, "t273");
    const stripLength = firstTagNumber(ifd, "t279");
    if (stripOffset !== null && stripLength !== null && stripLength > 0) {
      candidates.push({ offset: stripOffset, length: stripLength });
    }
  }

  if (Array.isArray(ifd.subIFD)) {
    for (const sub of ifd.subIFD) {
      if (sub) collectJpegCandidates(sub, candidates);
    }
  }
  if (ifd.exifIFD) {
    collectJpegCandidates(ifd.exifIFD, candidates);
  }
  if (ifd.fujiIFD) {
    collectJpegCandidates(ifd.fujiIFD, candidates);
  }
}

/**
 * Pure preview-selection: picks the candidate with the LARGEST `length` whose
 * bytes actually start with the JPEG SOI marker (`FF D8`) and lie fully within
 * the buffer. Returns `null` if no candidate verifies. This is what keeps us
 * from grabbing the tiny embedded thumbnail instead of the full-res preview.
 */
export function selectLargestJpegCandidate(
  candidates: readonly JpegCandidate[],
  bytes: Uint8Array,
): JpegCandidate | null {
  let best: JpegCandidate | null = null;
  for (const candidate of candidates) {
    if (!isUsableJpegCandidate(candidate, bytes)) {
      continue;
    }
    if (best === null || candidate.length > best.length) {
      best = candidate;
    }
  }
  return best;
}

function isUsableJpegCandidate(candidate: JpegCandidate, bytes: Uint8Array): boolean {
  const { offset, length } = candidate;
  if (!Number.isInteger(offset) || !Number.isInteger(length)) return false;
  if (offset < 0 || length <= 0) return false;
  if (offset + length > bytes.length) return false;
  return hasJpegSoi(bytes, offset);
}

/**
 * RAF (Fuji) embedded-preview extractor. RAF is NOT a TIFF — it opens with the
 * fixed ASCII magic `FUJIFILMCCD-RAW`. The header then carries a directory of
 * big-endian uint32 (offset, length) pairs; the embedded full-size JPEG offset
 * lives at byte 0x54 and its length at 0x58 (standard RAF layout used by
 * dcraw/exiftool). We read that pair, verify the bytes start with SOI, and
 * return the JPEG. Returns `null` on any inconsistency — never throws.
 */
export function extractRafPreview(buffer: ArrayBuffer): Blob | null {
  try {
    const bytes = new Uint8Array(buffer);
    if (!isRafMagic(bytes)) {
      return null;
    }
    // RAF header: JPEG image offset (BE uint32 @ 0x54), length (BE uint32 @ 0x58).
    const RAF_JPEG_OFFSET_POS = 0x54;
    const RAF_JPEG_LENGTH_POS = 0x58;
    if (RAF_JPEG_LENGTH_POS + 4 > bytes.length) {
      return null;
    }
    const offset = readUint32BE(bytes, RAF_JPEG_OFFSET_POS);
    const length = readUint32BE(bytes, RAF_JPEG_LENGTH_POS);
    const candidate: JpegCandidate = { offset, length };
    if (!isUsableJpegCandidate(candidate, bytes)) {
      return null;
    }
    return sliceJpegBlob(buffer, candidate);
  } catch {
    return null;
  }
}

/** Slices the candidate byte-range out of the buffer as an image/jpeg Blob. */
function sliceJpegBlob(buffer: ArrayBuffer, candidate: JpegCandidate): Blob {
  const slice = buffer.slice(candidate.offset, candidate.offset + candidate.length);
  return new Blob([slice], { type: "image/jpeg" });
}

/** True if `bytes[offset..]` begins with the JPEG SOI marker (`FF D8`). */
export function hasJpegSoi(bytes: Uint8Array, offset = 0): boolean {
  return bytes[offset] === JPEG_SOI_0 && bytes[offset + 1] === JPEG_SOI_1;
}

/** True if `bytes[offset..]` ends exactly on the JPEG EOI marker (`FF D9`). */
export function endsWithJpegEoi(bytes: Uint8Array, offset: number, length: number): boolean {
  const end = offset + length;
  if (end > bytes.length || length < 2) return false;
  return bytes[end - 2] === JPEG_EOI_0 && bytes[end - 1] === JPEG_EOI_1;
}

function isRafMagic(bytes: Uint8Array): boolean {
  // "FUJIFILMCCD-RAW" — 15 ASCII bytes at the start of every RAF.
  const magic = "FUJIFILMCCD-RAW";
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i += 1) {
    if (bytes[i] !== magic.charCodeAt(i)) return false;
  }
  return true;
}

function isTiffMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  // Little-endian: "II" 0x2A 0x00 ; Big-endian: "MM" 0x00 0x2A.
  const littleEndian = bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00;
  const bigEndian = bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a;
  return littleEndian || bigEndian;
}

function isIsoBmff(bytes: Uint8Array): boolean {
  // ISO Base Media File Format (CR3, HEIC, MP4, …): bytes 4..8 are "ftyp".
  if (bytes.length < 12) return false;
  return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

function isTiffBasedRawExtension(ext: string | null): boolean {
  return ext !== null && TIFF_BASED_RAW_EXTENSIONS.has(ext);
}

function normalizeExtension(ext?: string): string | null {
  if (typeof ext !== "string") return null;
  const trimmed = ext.trim().toLowerCase().replace(/^\./, "");
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reads the first numeric value of a utif2 `tXYZ` tag. utif2 stores tag values
 * as arrays (numbers for integer types); offsets/lengths are the first element.
 * Returns `null` when the tag is absent or not a finite number.
 */
function firstTagNumber(ifd: RawIfd, tag: string): number | null {
  const value = ifd[tag];
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "number" && Number.isFinite(first) ? first : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  return null;
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}
