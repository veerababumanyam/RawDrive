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

export interface ScreenOptions {
  metadataBudgetBytes: number;
  declaredType: string;
}

const DEFAULT_METADATA_BUDGET = 512 * 1024; // 512 KB

/**
 * Detect the format of a byte buffer via magic-byte sniffing, then run
 * the matching format screener. Returns a ScanResult; if the format is
 * not in the browser-worker allowlist, the result has decision =
 * "needs_desktop_scan" so the UI can prompt the user to download the
 * desktop companion (M17).
 */
export function screen(
  bytes: Uint8Array,
  opts: Partial<ScreenOptions> = {}
): ScanResult {
  const cfg: ScreenOptions = {
    metadataBudgetBytes: opts.metadataBudgetBytes ?? DEFAULT_METADATA_BUDGET,
    declaredType: opts.declaredType ?? "application/octet-stream",
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

  // TIFF / HEIC / AVIF / RAW → require desktop agent. AVIF is browser-decodable
  // in Chromium, but this worker does not yet perform the structural checks
  // needed to vouch for it under source-side encrypted upload.
  const detectedFormat = detectDesktopFormat(bytes);
  if (detectedFormat) {
    return {
      detectedFormat,
      declaredType: cfg.declaredType,
      decision: "needs_desktop_scan",
      riskScore: 0.5,
      findings: [
        {
          category: "unsupported_format",
          severity: "medium",
          message: `${detectedFormat} requires RawDrive Desktop for source-side encryption`,
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
          "file format not recognized by the browser screener (browser-supported: jpeg, png, webp, gif; RAW/TIFF/HEIC/AVIF require RawDrive Desktop)",
      },
    ],
  };
}

/**
 * Detect formats that need the desktop companion. Returns the canonical
 * lowercase format name or null when the bytes don't match a desktop
 * format either.
 */
function detectDesktopFormat(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;

  // Canon RAW (CR2): "II\x2A\x00\x10\x00\x00\x00CR". Check this before
  // generic TIFF because CR2 is TIFF-based and shares the same opening bytes.
  if (
    bytes.length >= 10 &&
    matchAt(bytes, 0, [0x49, 0x49, 0x2a, 0x00]) &&
    bytes[8] === 0x43 &&
    bytes[9] === 0x52
  ) {
    return "cr2";
  }
  // ISO BMFF still formats: HEIC/HEIF/AVIF expose an ftyp box at offset 4.
  if (bytes.length >= 12 && matchAt(bytes, 4, [0x66, 0x74, 0x79, 0x70])) {
    // Look at the major brand (4 bytes at offset 8) for known desktop formats.
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    if (brand === "crx ") {
      return "cr3";
    }
    if (["heic", "heix", "mif1", "heim", "heis", "hevc"].includes(brand)) {
      return "heic";
    }
    if (["avif", "avis"].includes(brand)) {
      return "avif";
    }
  }
  // TIFF little-endian: "II\x2A\x00"
  if (matchAt(bytes, 0, [0x49, 0x49, 0x2a, 0x00])) return "tiff";
  // TIFF big-endian: "MM\x00\x2A"
  if (matchAt(bytes, 0, [0x4d, 0x4d, 0x00, 0x2a])) return "tiff";
  // DNG and many proprietary RAW variants share TIFF magic; the upload gate
  // routes them by MIME/extension before the browser screener tries to parse.

  return null;
}
