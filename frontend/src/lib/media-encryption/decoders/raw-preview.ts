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
// COVERAGE: TIFF-based RAW (CR2, NEF/NRW, ARW/SR2/SRF, DNG, ORF/ORI, PEF,
// 3FR, IIQ) extract well; RW2 is best-effort (Panasonic stores its preview in
// a maker-note IFD that varies).
// RAF (Fuji) is parsed via its dedicated fixed-header layout. CR3 (Canon,
// ISO-BMFF "crx " brand) is parsed via a dedicated box walker — see
// `extractCr3Preview` — that pulls the full-resolution embedded JPEG out of the
// `mdat` image track (offset/size from the track sample table) and falls back
// to the `PRVW`/`THMB` boxes. Any other ISO-BMFF still (HEIC/AVIF) is handled
// by its own decoder upstream and returns null here. Exotic / unparseable RAW
// returns null so the caller routes the file to RawDrive Desktop. NOTHING in
// this module throws — every failure path is caught internally and surfaced as
// null.

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
 *   - CR3 (Canon, ISO-BMFF `crx ` brand) → dedicated box-walker parser.
 *   - Any other ISO-BMFF (`....ftyp`) → null (HEIC/AVIF decode upstream).
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

    if (isIsoBmff(bytes)) {
      // CR3 (Canon) embeds full-resolution + PRVW JPEGs we can slice without
      // demosaicing. Detect it by the ISO-BMFF major brand "crx " (and honor a
      // `.cr3` extension when a truncated head hid the brand). Every other
      // ISO-BMFF still (HEIC/AVIF) is decoded by its own decoder upstream and
      // must not reach here, so it routes to the Desktop fallback (null).
      if (isoBmffMajorBrand(bytes) === "crx " || extension === "cr3") {
        return extractCr3Preview(buffer);
      }
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
 * TIFF-based RAW preview extractor (CR2/NEF/NRW/ARW/SR2/SRF/DNG/ORF/ORI/RW2/PEF/3FR/IIQ/…). Uses utif2 to
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
  if (
    interchangeOffset !== null &&
    interchangeLength !== null &&
    interchangeLength > 0
  ) {
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

function isUsableJpegCandidate(
  candidate: JpegCandidate,
  bytes: Uint8Array,
): boolean {
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

// ---- CR3 / ISO-BMFF embedded-JPEG extraction ------------------------------
//
// CR3 is an ISO Base Media File Format ("MP4-like") container — NOT TIFF — so
// utif2 cannot walk it. We hand-parse the box tree (mirroring how RAF is hand-
// parsed above) to recover the camera's own embedded JPEGs without demosaicing:
//   1. The full-resolution JPEG lives as a sample in `mdat`. Its absolute
//      offset (chunk[0] from `stco`/`co64`) and byte length (`stsz`) come from
//      the first track's sample table under moov/trak/mdia/minf/stbl. The HEVC
//      "CRAW" tracks are samples too, but they do NOT start with the JPEG SOI
//      marker, so `selectLargestJpegCandidate` discards them automatically.
//   2. The `PRVW` box (~1620px) and `THMB` box are JPEG previews wrapped in a
//      small fixed header inside the moov `uuid` boxes — a reliable fallback
//      when the track table cannot be read.
// We collect every candidate, keep only those that begin with `FF D8` and lie
// within the buffer, and return the LARGEST. Any malformed box / missing
// preview yields null → the caller routes the file to RawDrive Desktop.

/** ISO-BMFF box types whose payload is itself a sequence of child boxes. */
const ISO_BMFF_CONTAINER_TYPES = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
  "dinf",
  "edts",
  "udta",
]);

/** Recursion guard for the (shallow) ISO-BMFF box tree. */
const ISO_BMFF_MAX_DEPTH = 8;

type BoxRange = { type: string; payloadStart: number; boxEnd: number };

/**
 * Extracts the largest embedded JPEG preview from a Canon CR3 (ISO-BMFF)
 * buffer. Returns a `Blob('image/jpeg')`, or `null` when no usable preview is
 * present or the container does not parse. NEVER throws.
 */
export function extractCr3Preview(buffer: ArrayBuffer): Blob | null {
  try {
    const bytes = new Uint8Array(buffer);
    if (!isIsoBmff(bytes)) {
      return null;
    }

    const candidates: JpegCandidate[] = [];
    let moov: BoxRange | null = null;
    forEachBox(bytes, 0, bytes.length, (box) => {
      if (moov === null && box.type === "moov") {
        moov = box;
      }
    });

    if (moov !== null) {
      // Full-resolution JPEG via the track sample tables (largest, preferred).
      collectCr3TrakCandidates(bytes, moov, candidates);
      // PRVW / THMB preview boxes (reliable fallback).
      collectCr3PreviewBoxCandidates(bytes, moov, candidates);
    }

    const best = selectLargestJpegCandidate(candidates, bytes);
    if (best === null) {
      return null;
    }
    return sliceJpegBlob(buffer, best);
  } catch {
    return null;
  }
}

/**
 * For each track in `moov`, reads the first sample's absolute offset
 * (`stco`/`co64` chunk[0]) and byte length (`stsz`) and appends it as a JPEG
 * candidate. Best-effort: any track whose sample table we cannot read is
 * skipped, and non-JPEG samples (HEVC CRAW) are rejected later by the SOI check.
 */
function collectCr3TrakCandidates(
  bytes: Uint8Array,
  moov: BoxRange,
  candidates: JpegCandidate[],
): void {
  forEachBox(bytes, moov.payloadStart, moov.boxEnd, (box) => {
    if (box.type !== "trak") {
      return;
    }
    const stbl = descend(bytes, box, ["mdia", "minf", "stbl"]);
    if (stbl === null) {
      return;
    }

    let offset = -1;
    let length = -1;
    forEachBox(bytes, stbl.payloadStart, stbl.boxEnd, (child) => {
      if (child.type === "stco") {
        // [ver+flags:4][entry_count:4][offset0:4 …] — chunk[0] is absolute.
        if (child.payloadStart + 12 <= child.boxEnd) {
          offset = readUint32BE(bytes, child.payloadStart + 8);
        }
      } else if (child.type === "co64") {
        // [ver+flags:4][entry_count:4][offset0:8 …] — 64-bit chunk offset.
        if (child.payloadStart + 16 <= child.boxEnd) {
          offset = readUint64BE(bytes, child.payloadStart + 8);
        }
      } else if (child.type === "stsz") {
        // [ver+flags:4][sample_size:4][sample_count:4][table…]. A nonzero
        // sample_size is the uniform size; otherwise sample[0] is in the table.
        if (child.payloadStart + 8 <= child.boxEnd) {
          const uniform = readUint32BE(bytes, child.payloadStart + 4);
          if (uniform > 0) {
            length = uniform;
          } else if (child.payloadStart + 16 <= child.boxEnd) {
            length = readUint32BE(bytes, child.payloadStart + 12);
          }
        }
      }
    });

    if (offset > 0 && length > 0) {
      candidates.push({ offset, length });
    }
  });
}

/**
 * Collects JPEG candidates from the `PRVW` / `THMB` preview boxes nested in the
 * moov `uuid` boxes. Each box wraps its JPEG behind a small fixed header, so we
 * scan the payload for the JPEG SOI marker and take from there to the box end
 * (trailing pad bytes after the EOI are ignored by every JPEG decoder).
 */
function collectCr3PreviewBoxCandidates(
  bytes: Uint8Array,
  moov: BoxRange,
  candidates: JpegCandidate[],
): void {
  const boxes: BoxRange[] = [];
  collectBoxesDeep(
    bytes,
    moov.payloadStart,
    moov.boxEnd,
    new Set(["PRVW", "THMB"]),
    boxes,
    0,
  );
  for (const box of boxes) {
    const soi = findJpegSoi(bytes, box.payloadStart, box.boxEnd);
    if (soi >= 0) {
      candidates.push({ offset: soi, length: box.boxEnd - soi });
    }
  }
}

/**
 * Iterates the ISO-BMFF boxes directly contained in `[start, end)`, invoking
 * `visit` with each box's type, payload start, and exclusive end. Handles the
 * 32-bit size, the 64-bit `largesize` escape (size == 1), the to-EOF escape
 * (size == 0), and the 16-byte UUID prefix of `uuid` boxes. Stops on any
 * malformed / zero-progress size so it can never loop. NEVER throws.
 */
function forEachBox(
  bytes: Uint8Array,
  start: number,
  end: number,
  visit: (box: BoxRange) => void,
): void {
  let pos = start;
  while (pos + 8 <= end) {
    let size = readUint32BE(bytes, pos);
    const type = boxType(bytes, pos + 4);
    let headerSize = 8;
    if (size === 1) {
      if (pos + 16 > end) return;
      size = readUint64BE(bytes, pos + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < headerSize) return;
    const boxEnd = pos + size;
    if (boxEnd > end || boxEnd <= pos) return;

    let payloadStart = pos + headerSize;
    if (type === "uuid") {
      payloadStart += 16; // skip the 16-byte user-type UUID
    }
    if (payloadStart <= boxEnd) {
      visit({ type, payloadStart, boxEnd });
    }
    pos = boxEnd;
  }
}

/**
 * Recursively collects every box whose type is in `wanted` within `[start,
 * end)`, descending only into known container boxes (and `uuid`, which in CR3
 * wraps the Canon metadata + preview). Depth-bounded; never throws.
 */
function collectBoxesDeep(
  bytes: Uint8Array,
  start: number,
  end: number,
  wanted: Set<string>,
  out: BoxRange[],
  depth: number,
): void {
  if (depth > ISO_BMFF_MAX_DEPTH) return;
  forEachBox(bytes, start, end, (box) => {
    if (wanted.has(box.type)) {
      out.push(box);
    }
    if (ISO_BMFF_CONTAINER_TYPES.has(box.type) || box.type === "uuid") {
      collectBoxesDeep(
        bytes,
        box.payloadStart,
        box.boxEnd,
        wanted,
        out,
        depth + 1,
      );
    }
  });
}

/** Descends a fixed child-box `path` from `box`; returns the leaf box or null. */
function descend(
  bytes: Uint8Array,
  box: BoxRange,
  path: readonly string[],
): BoxRange | null {
  let current: BoxRange | null = box;
  for (const want of path) {
    if (current === null) return null;
    let next: BoxRange | null = null;
    forEachBox(bytes, current.payloadStart, current.boxEnd, (child) => {
      if (next === null && child.type === want) next = child;
    });
    current = next;
  }
  return current;
}

/** First index in `[start, end)` where the JPEG SOI marker (`FF D8`) begins, or -1. */
function findJpegSoi(bytes: Uint8Array, start: number, end: number): number {
  const limit = Math.min(end, bytes.length) - 1;
  for (let i = Math.max(0, start); i < limit; i += 1) {
    if (bytes[i] === JPEG_SOI_0 && bytes[i + 1] === JPEG_SOI_1) {
      return i;
    }
  }
  return -1;
}

/** Lowercased 4-char ISO-BMFF major brand at offset 8 (e.g. "crx "), or "". */
function isoBmffMajorBrand(bytes: Uint8Array): string {
  if (bytes.length < 12) return "";
  return String.fromCharCode(
    bytes[8],
    bytes[9],
    bytes[10],
    bytes[11],
  ).toLowerCase();
}

/** Four ASCII chars of the box type at `offset`. */
function boxType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

/** Reads a big-endian uint64 as a JS number (exact for file offsets < 2^53). */
function readUint64BE(bytes: Uint8Array, offset: number): number {
  const hi = readUint32BE(bytes, offset);
  const lo = readUint32BE(bytes, offset + 4);
  return hi * 0x1_0000_0000 + lo;
}

/** Slices the candidate byte-range out of the buffer as an image/jpeg Blob. */
function sliceJpegBlob(buffer: ArrayBuffer, candidate: JpegCandidate): Blob {
  const slice = buffer.slice(
    candidate.offset,
    candidate.offset + candidate.length,
  );
  return new Blob([slice], { type: "image/jpeg" });
}

/** True if `bytes[offset..]` begins with the JPEG SOI marker (`FF D8`). */
export function hasJpegSoi(bytes: Uint8Array, offset = 0): boolean {
  return bytes[offset] === JPEG_SOI_0 && bytes[offset + 1] === JPEG_SOI_1;
}

/** True if `bytes[offset..]` ends exactly on the JPEG EOI marker (`FF D9`). */
export function endsWithJpegEoi(
  bytes: Uint8Array,
  offset: number,
  length: number,
): boolean {
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
  const littleEndian =
    bytes[0] === 0x49 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x2a &&
    bytes[3] === 0x00;
  const bigEndian =
    bytes[0] === 0x4d &&
    bytes[1] === 0x4d &&
    bytes[2] === 0x00 &&
    bytes[3] === 0x2a;
  return littleEndian || bigEndian;
}

function isIsoBmff(bytes: Uint8Array): boolean {
  // ISO Base Media File Format (CR3, HEIC, MP4, …): bytes 4..8 are "ftyp".
  if (bytes.length < 12) return false;
  return (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  );
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
