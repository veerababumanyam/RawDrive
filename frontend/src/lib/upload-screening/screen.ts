// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S1: Top-level upload screening dispatcher.
//
// Detects the file format from its magic bytes and runs the appropriate
// format-specific parser. Used by both the Web Worker entry point and
// by the main-thread unit tests (vitest runs in jsdom which does not
// support Workers natively).
// ─────────────────────────────────────────────────────────────────────────────

import type { ScanResult } from "./types";
import { screenJpeg } from "./formats/jpeg";
import { screenPng } from "./formats/png";
import { screenWebp } from "./formats/webp";
import { screenGif } from "./formats/gif";
import { matchAt } from "./formats/archive-signatures";
import { isBrowserDecodableStillImageName } from "../still-image-formats";

export interface ScreenOptions {
  metadataBudgetBytes: number;
  declaredType: string;
  /**
   * CD5b: the original filename (e.g. `File.name`). TIFF-based camera RAW
   * (NEF/ARW/DNG/ORF/RW2) is byte-identical to a plain TIFF at the header
   * level, so when the browser/OS does not stamp a vendor `image/x-*` MIME —
   * many report `image/tiff` or "" — the screener cannot tell RAW apart from a
   * real multi-page TIFF by `declaredType` alone. The extension derived from
   * this name backstops the MIME path so those RAW files `pass` by extension
   * (matching the CD4 format gate + decoder), while a plain `.tif/.tiff` (or
   * any non-RAW / desktop-only extension) stays `needs_desktop_scan`. Optional
   * and back-compatible: when absent the MIME path is the only signal.
   */
  declaredName?: string;
}

const DEFAULT_METADATA_BUDGET = 512 * 1024; // 512 KB

/**
 * Detect the format of a byte buffer via magic-byte sniffing, then run
 * the matching format screener. Returns a ScanResult.
 *
 * CD5/CD5c: HEIC / HEIF / AVIF and the now-browser-decodable camera RAW
 * families return decision = "pass" with the canonical detected_format, so the
 * source-side encrypted upload's scan manifest lets them finalize. Formats
 * that still need the desktop companion (exotic / proprietary RAW, ambiguous
 * or multi-page TIFF) return
 * decision = "needs_desktop_scan". Anything unrecognized is blocked.
 */
export function screen(
  bytes: Uint8Array,
  opts: Partial<ScreenOptions> = {},
): ScanResult {
  const cfg: ScreenOptions = {
    metadataBudgetBytes: opts.metadataBudgetBytes ?? DEFAULT_METADATA_BUDGET,
    declaredType: opts.declaredType ?? "application/octet-stream",
    declaredName: opts.declaredName,
  };

  // JPEG: 0xFFD8 0xFFE0..EF or 0xFFDB etc.
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return screenJpeg(bytes, cfg);
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (matchAt(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return screenPng(bytes, cfg);
  }

  // WebP: "RIFF" + 4 bytes + "WEBP"
  if (
    matchAt(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    matchAt(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return screenWebp(bytes, cfg);
  }

  // GIF: "GIF87a" or "GIF89a"
  if (
    matchAt(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    matchAt(bytes, 0, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return screenGif(bytes, cfg);
  }

  // TIFF / HEIC / AVIF / RAW → classify into browser-decodable (pass) vs
  // desktop-only (needs_desktop_scan). classifyContainerFormat distinguishes
  // RAW families that share TIFF magic via the declaredType the screener is
  // given (camera RAW reports a vendor `image/x-*` MIME through the file
  // picker accept-list) and — CD5b — backstops that with the filename
  // extension when the MIME is generic/absent.
  const detected = classifyContainerFormat(
    bytes,
    cfg.declaredType,
    cfg.declaredName,
  );
  if (detected) {
    if (detected.browserDecodable) {
      return {
        detectedFormat: detected.format,
        declaredType: cfg.declaredType,
        decision: "pass",
        riskScore: 0,
        findings: [],
      };
    }
    return {
      detectedFormat: detected.format,
      declaredType: cfg.declaredType,
      decision: "needs_desktop_scan",
      riskScore: 0.5,
      findings: [
        {
          category: "unsupported_format",
          severity: "medium",
          message: `${detected.format} requires RawDrive Desktop for source-side encryption`,
        },
      ],
    };
  }

  // Unknown format — block as a safety measure.
  return {
    detectedFormat: "unknown",
    declaredType: cfg.declaredType,
    decision: "block",
    riskScore: 0.9,
    findings: [
      {
        category: "unsupported_format",
        severity: "high",
        message:
          "file format not recognized by the browser screener (browser-decodable: jpeg, png, webp, gif, heic, heif, avif, CR3, and TIFF-based RAW; exotic RAW/multi-page TIFF require RawDrive Desktop)",
      },
    ],
  };
}

/** A container-format classification: the canonical lowercase format token
 *  plus whether the browser can decode it for source-side encrypted upload. */
interface ContainerFormat {
  format: string;
  browserDecodable: boolean;
}

/**
 * TIFF-magic camera RAW families are byte-identical at the header level
 * (they all open with the TIFF magic) and can only be told apart from one
 * another — and from a real multi-page TIFF — by the declared MIME the file
 * picker stamps. Map the known vendor MIME types to their canonical RAW
 * token. A file whose declaredType is a generic `image/tiff` (or anything
 * not in this map) stays a plain `tiff` → needs_desktop_scan.
 */
const TIFF_RAW_MIME_TO_FORMAT: Record<string, string> = {
  "image/x-nikon-nef": "nef",
  "image/x-nikon-nrw": "nrw",
  "image/x-sony-arw": "arw",
  "image/x-sony-sr2": "sr2",
  "image/x-sony-srf": "srf",
  "image/x-adobe-dng": "dng",
  "image/x-dng": "dng",
  "image/x-olympus-orf": "orf",
  "image/x-olympus-ori": "ori",
  "image/x-panasonic-rw2": "rw2",
  "image/x-pentax-pef": "pef",
  "image/x-hasselblad-3fr": "3fr",
  "image/x-phaseone-iiq": "iiq",
};

/**
 * Browser-decodable camera RAW tokens (CD4). CR2, RAF, and CR3 are detected by
 * their own magic/brand; the TIFF-based rest disambiguate via declaredType above.
 */
const BROWSER_DECODABLE_RAW = new Set([
  "cr2",
  "cr3",
  "nef",
  "nrw",
  "arw",
  "sr2",
  "srf",
  "dng",
  "orf",
  "ori",
  "raf",
  "rw2",
  "pef",
  "3fr",
  "iiq",
]);

/**
 * CD5b: the TIFF-based, browser-decodable RAW extensions used by the
 * extension backstop. CR2 and RAF have their own magic (matched above), so
 * they're excluded — only the families that are byte-identical to a plain
 * TIFF at the header level need an extension to be disambiguated. The
 * filename gate still routes through `isBrowserDecodableStillImageName`
 * (which validates against the canonical `BROWSER_DECODE_STILL_IMAGE_EXTENSIONS`
 * in still-image-formats.ts) so we never pass an extension that family list
 * doesn't already vouch for — this set just narrows that to the TIFF-magic
 * subset and maps the extension to its canonical detected_format token. Each
 * extension equals its format token for these families.
 */
const TIFF_RAW_EXTENSION_TO_FORMAT: Record<string, string> = {
  nef: "nef",
  nrw: "nrw",
  arw: "arw",
  sr2: "sr2",
  srf: "srf",
  dng: "dng",
  orf: "orf",
  ori: "ori",
  rw2: "rw2",
  pef: "pef",
  "3fr": "3fr",
  iiq: "iiq",
};

/** Extract the lowercase extension from a filename, or "" when absent. */
function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  if (index < 0 || index === name.length - 1) return "";
  return name.slice(index + 1).toLowerCase();
}

/**
 * Classify a non-baseline container format (ISO-BMFF still / TIFF-based RAW /
 * TIFF / RAF). Returns the canonical lowercase format token plus whether the
 * browser can decode it, or null when the bytes don't match any known
 * container format (the caller then blocks).
 */
function classifyContainerFormat(
  bytes: Uint8Array,
  declaredType: string,
  declaredName?: string,
): ContainerFormat | null {
  if (bytes.length < 4) return null;

  // Canon RAW (CR2): "II\x2A\x00\x10\x00\x00\x00CR". Check before generic
  // TIFF because CR2 is TIFF-based and shares the same opening bytes.
  if (
    bytes.length >= 10 &&
    matchAt(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) &&
    bytes[8] === 0x43 &&
    bytes[9] === 0x52
  ) {
    return { format: "cr2", browserDecodable: true };
  }

  // Fuji RAF: opens with the ASCII magic "FUJIFILMCCD-RAW".
  if (
    matchAt(bytes, 0, [
      0x46,
      0x55,
      0x4a,
      0x49,
      0x46,
      0x49,
      0x4c,
      0x4d, // "FUJIFILM"
      0x43,
      0x43,
      0x44,
      0x2d,
      0x52,
      0x41,
      0x57, // "CCD-RAW"
    ])
  ) {
    return { format: "raf", browserDecodable: true };
  }

  // ISO-BMFF still formats: HEIC/HEIF/AVIF/CR3 expose an ftyp box at offset 4.
  if (bytes.length >= 12 && matchAt(bytes, 4, [0x66, 0x74, 0x79, 0x70])) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "crx ") {
      // Canon CR3 — decoded in-browser via the ISO-BMFF embedded-JPEG parser.
      return { format: "cr3", browserDecodable: true };
    }
    if (["heic", "heix", "mif1", "heim", "heis", "hevc"].includes(brand)) {
      return { format: "heic", browserDecodable: true };
    }
    if (["avif", "avis"].includes(brand)) {
      return { format: "avif", browserDecodable: true };
    }
  }

  // TIFF magic (little- or big-endian). DNG and many proprietary RAW variants
  // share it, so disambiguate the now-browser-decodable RAW families via the
  // vendor MIME the file picker stamped. Anything that doesn't resolve to a
  // known RAW MIME stays a plain `tiff` (could be multi-page) → desktop-only.
  const isTiff =
    matchAt(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) || // little-endian "II*\0"
    matchAt(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a]); // big-endian "MM\0*"
  if (isTiff) {
    const rawFormat = TIFF_RAW_MIME_TO_FORMAT[declaredType.toLowerCase()];
    if (rawFormat && BROWSER_DECODABLE_RAW.has(rawFormat)) {
      return { format: rawFormat, browserDecodable: true };
    }
    // CD5b: the vendor MIME didn't resolve a RAW format (browser/OS reported a
    // generic `image/tiff` or "" instead of `image/x-*`). Backstop with the
    // filename extension: a TIFF-based, browser-decodable RAW extension
    // (nef/arw/dng/orf/rw2) `passes`. The still-image-formats family list is
    // the source of truth via isBrowserDecodableStillImageName, so we never
    // pass an extension it doesn't already vouch for, and CR3/exotic/desktop-
    // only extensions are absent from TIFF_RAW_EXTENSION_TO_FORMAT — they keep
    // the conservative `tiff` → needs_desktop_scan classification.
    if (declaredName) {
      const ext = extensionOf(declaredName);
      const extFormat = TIFF_RAW_EXTENSION_TO_FORMAT[ext];
      if (
        extFormat &&
        BROWSER_DECODABLE_RAW.has(extFormat) &&
        isBrowserDecodableStillImageName(declaredName)
      ) {
        return { format: extFormat, browserDecodable: true };
      }
    }
    return { format: "tiff", browserDecodable: false };
  }

  return null;
}
