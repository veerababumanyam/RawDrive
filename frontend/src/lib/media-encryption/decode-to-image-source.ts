// CD4 — the routing seam between the E2EE derivative pipeline and the
// format-specific decoders.
//
// WHY THIS EXISTS: gallery uploads are unconditionally end-to-end encrypted —
// the browser produces WebP derivatives and encrypts them at source
// (`webp-derivatives.ts`), so the server never sees plaintext. The original
// `decodeImage` seam used `createImageBitmap(file)` for EVERY format, which
// throws for HEIC/HEIF and camera RAW (a <canvas> cannot decode them). This
// router keeps jpeg/png/gif/webp on the byte-identical native path and routes
// HEIC/HEIF/AVIF/RAW through the dedicated decoders built earlier on this
// branch. Anything we cannot decode in-browser (CR3, exotic RAW, corrupt
// input, or an unsupported engine) collapses to a `needs-desktop` result so
// `decodeImage` can throw a typed error and `use-upload` flags the file
// "needs RawDrive Desktop" per file.
//
// CONTRACT — `decodeToImageSource` NEVER throws. Every failure, including a
// thrown decoder or a missing browser API, is caught and surfaced as
// `{ ok: false, reason: "needs-desktop", detail }`. The format decision is made
// from the file extension (when `file.name` is present) plus a small head
// slice of MAGIC BYTES — `file.type` is never trusted (cameras/OSes mislabel
// RAW and HEIC routinely, and a hostile blob could lie).

import { decodeAvif, decodeHeic, supportsNativeAvifDecode } from "./decoders/heic";
import { decodeRaw } from "./decoders/raw-preview";

export type DecodeResult =
  | { ok: true; source: CanvasImageSource; width: number; height: number; close?: () => void }
  | { ok: false; reason: "needs-desktop"; detail: string };

// Camera-RAW extensions whose embedded JPEG preview the RAW decoder can slice
// out. Kept in lock-step with the BROWSER_DECODE side of still-image-formats.ts
// and the TIFF-based set in decoders/raw-preview.ts. CR3 + exotic RAW are
// intentionally absent — they fall through to the needs-desktop default.
const BROWSER_RAW_EXTENSIONS = new Set(["cr2", "nef", "arw", "dng", "orf", "raf", "rw2"]);

// How many leading bytes we read to brand-sniff the container.
const MAGIC_HEAD_BYTES = 16;

/**
 * Routes a still-image `File`/`Blob` to the correct in-browser decoder and
 * returns a canvas-drawable source, or a `needs-desktop` fallback. NEVER
 * throws — see the module header for the contract.
 */
export async function decodeToImageSource(file: File | Blob): Promise<DecodeResult> {
  try {
    const ext = extensionOf(file);
    const head = await readHead(file);
    const family = detectFamily(ext, head);

    switch (family) {
      case "native":
        return await decodeNative(file);
      case "heic":
        return await decodeViaHeic(file);
      case "avif":
        return await decodeViaAvif(file);
      case "raw":
        return await decodeViaRaw(file, ext);
      default:
        return needsDesktop(`Unsupported in-browser format: ${describe(ext, head)}`);
    }
  } catch (err) {
    // Defense in depth: the per-family helpers already swallow their own
    // failures, but any unexpected throw (head read, detection) also collapses
    // to needs-desktop so this function can never reject.
    return needsDesktop(`Decode failed: ${(err as Error)?.message ?? "unknown error"}`);
  }
}

type Family = "native" | "heic" | "avif" | "raw" | "unsupported";

/**
 * Decides the decode family from extension + magic bytes, trusting neither
 * alone. Magic bytes win for the container disambiguation that matters most
 * (HEIC vs AVIF vs CR3 are all ISO-BMFF and indistinguishable by extension
 * when the name is absent), while the extension disambiguates the RAW family
 * (all TIFF-magic) and lets us route a mislabeled-but-named file.
 */
function detectFamily(ext: string | null, head: Uint8Array): Family {
  // Magic-byte container detection first — it is the most reliable signal.
  if (isJpegMagic(head) || isPngMagic(head) || isGifMagic(head) || isWebpMagic(head)) {
    return "native";
  }

  if (isIsoBmff(head)) {
    const brand = isoBmffMajorBrand(head);
    if (isAvifBrand(brand)) return "avif";
    if (isCr3Brand(brand)) return "unsupported"; // CR3 → RawDrive Desktop
    if (isHeicBrand(brand)) return "heic";
    // Unknown ISO-BMFF brand — fall back to extension below, else unsupported.
    if (ext === "avif") return "avif";
    if (ext === "heic" || ext === "heif" || ext === "hif") return "heic";
    if (ext === "cr3") return "unsupported";
    return "unsupported";
  }

  if (isTiffMagic(head) && ext !== null && BROWSER_RAW_EXTENSIONS.has(ext)) {
    return "raw";
  }

  // RAF (Fuji) is not TIFF — its decoder detects the FUJIFILMCCD-RAW magic
  // itself; we only need the extension to route it there.
  if (ext === "raf" && isRafMagic(head)) {
    return "raw";
  }

  // Extension-only fallbacks when magic bytes were inconclusive (e.g. a truncated
  // head). Only honor extensions whose decoder can actually handle the bytes.
  if (ext !== null) {
    if (ext === "jpg" || ext === "jpeg" || ext === "jpe" || ext === "jfif" || ext === "jfi") return "native";
    if (ext === "png") return "native";
    if (ext === "gif") return "native";
    if (ext === "webp") return "native";
    if (ext === "avif") return "avif";
    if (ext === "heic" || ext === "heif" || ext === "hif") return "heic";
    if (BROWSER_RAW_EXTENSIONS.has(ext)) return "raw";
  }

  return "unsupported";
}

async function decodeNative(file: File | Blob): Promise<DecodeResult> {
  if (typeof createImageBitmap !== "function") {
    return needsDesktop("createImageBitmap is unavailable in this environment");
  }
  try {
    const bitmap = await createImageBitmap(file);
    return fromBitmap(bitmap);
  } catch (err) {
    return needsDesktop(`Native image decode failed: ${(err as Error)?.message ?? "unknown error"}`);
  }
}

async function decodeViaHeic(file: File | Blob): Promise<DecodeResult> {
  try {
    const bitmap = await decodeHeic(file);
    return fromBitmap(bitmap);
  } catch (err) {
    return needsDesktop(`HEIC/HEIF decode failed: ${(err as Error)?.message ?? "unknown error"}`);
  }
}

async function decodeViaAvif(file: File | Blob): Promise<DecodeResult> {
  let supported = false;
  try {
    supported = await supportsNativeAvifDecode();
  } catch {
    supported = false;
  }
  if (!supported) {
    return needsDesktop("AVIF native decode is not supported by this browser");
  }
  try {
    const bitmap = await decodeAvif(file);
    return fromBitmap(bitmap);
  } catch (err) {
    return needsDesktop(`AVIF decode failed: ${(err as Error)?.message ?? "unknown error"}`);
  }
}

async function decodeViaRaw(file: File | Blob, ext: string | null): Promise<DecodeResult> {
  try {
    const bitmap = await decodeRaw(file, ext ?? undefined);
    if (bitmap === null) {
      return needsDesktop("No usable embedded preview could be extracted from this RAW file");
    }
    return fromBitmap(bitmap);
  } catch (err) {
    return needsDesktop(`RAW decode failed: ${(err as Error)?.message ?? "unknown error"}`);
  }
}

function fromBitmap(bitmap: ImageBitmap): DecodeResult {
  return {
    ok: true,
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => bitmap.close(),
  };
}

function needsDesktop(detail: string): DecodeResult {
  return { ok: false, reason: "needs-desktop", detail };
}

async function readHead(file: File | Blob): Promise<Uint8Array> {
  const slice = file.slice(0, MAGIC_HEAD_BYTES);
  const buffer = await slice.arrayBuffer();
  return new Uint8Array(buffer);
}

function extensionOf(file: File | Blob): string | null {
  const name = (file as File).name;
  if (typeof name !== "string") return null;
  const index = name.lastIndexOf(".");
  if (index < 0 || index === name.length - 1) return null;
  const ext = name.slice(index + 1).toLowerCase();
  return ext.length > 0 ? ext : null;
}

// ---- Magic-byte predicates (do NOT trust file.type) ------------------------

function isJpegMagic(b: Uint8Array): boolean {
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function isPngMagic(b: Uint8Array): boolean {
  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}

function isGifMagic(b: Uint8Array): boolean {
  return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38; // "GIF8"
}

function isWebpMagic(b: Uint8Array): boolean {
  // "RIFF" .... "WEBP"
  return (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  );
}

function isTiffMagic(b: Uint8Array): boolean {
  if (b.length < 4) return false;
  const le = b[0] === 0x49 && b[1] === 0x49 && b[2] === 0x2a && b[3] === 0x00; // "II*\0"
  const be = b[0] === 0x4d && b[1] === 0x4d && b[2] === 0x00 && b[3] === 0x2a; // "MM\0*"
  return le || be;
}

function isIsoBmff(b: Uint8Array): boolean {
  // bytes 4..8 == "ftyp"
  if (b.length < 12) return false;
  return b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70;
}

/** Four ASCII chars of the ISO-BMFF major brand at offset 8 (lowercased). */
function isoBmffMajorBrand(b: Uint8Array): string {
  if (b.length < 12) return "";
  return String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
}

function isAvifBrand(brand: string): boolean {
  return brand === "avif" || brand === "avis";
}

function isHeicBrand(brand: string): boolean {
  // heic/heix/heim/heis = HEVC; mif1/msf1 = generic HEIF; hevc/hevx variants.
  return (
    brand === "heic" || brand === "heix" || brand === "heim" || brand === "heis" ||
    brand === "mif1" || brand === "msf1" || brand === "hevc" || brand === "hevx"
  );
}

function isCr3Brand(brand: string): boolean {
  return brand === "crx "; // Canon CR3 major brand (note trailing space)
}

function isRafMagic(b: Uint8Array): boolean {
  // "FUJIF" — enough of FUJIFILMCCD-RAW to disambiguate within a 16-byte head.
  return b[0] === 0x46 && b[1] === 0x55 && b[2] === 0x4a && b[3] === 0x49 && b[4] === 0x46;
}

function describe(ext: string | null, head: Uint8Array): string {
  const extPart = ext !== null ? `.${ext}` : "no extension";
  const brand = isIsoBmff(head) ? ` (ISO-BMFF brand "${isoBmffMajorBrand(head)}")` : "";
  return `${extPart}${brand}`;
}
