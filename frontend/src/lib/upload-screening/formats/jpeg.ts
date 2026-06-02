// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S2: JPEG structural screener.
//
// Walks the JPEG markers from SOI (0xFFD8) to EOI (0xFFD9), tracking the
// cumulative metadata budget (APP0..APP15, COM, DHT, DQT segments). It blocks
// dangerous non-image data after EOI, but allows camera-authored MPF/trailing
// JPEG preview data as a warning. Does NOT decode pixel data — the browser's
// <img> sanity check in the worker handles that.
//
// Spec: feature-architecture-delta.md §4.3 (browser format parsers)
// ─────────────────────────────────────────────────────────────────────────────

import type { ScanFinding, ScanResult } from "../types";
import { scanForArchiveSignatures } from "./archive-signatures";

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda; // Start of Scan — after this marker, payload is raw
                    //                 entropy-coded data until EOI.

interface JpegConfig {
  metadataBudgetBytes: number;
  declaredType: string;
}

/**
 * Walk the JPEG marker stream and produce a ScanResult.
 *
 * The walker only processes segments up to the SOS marker; past SOS we
 * skip forward scanning for the EOI marker since the entropy-coded data
 * does not have per-segment framing. After EOI, unknown non-padding bytes
 * are suspicious, but Nikon/Sony/Canon camera JPEGs may legitimately carry
 * MPF / dependent JPEG preview data after the primary image.
 */
export function screenJpeg(bytes: Uint8Array, cfg: JpegConfig): ScanResult {
  const findings: ScanFinding[] = [];

  // Sanity: must start with SOI (0xFFD8).
  if (
    bytes.byteLength < 2 ||
    bytes[0] !== 0xff ||
    bytes[1] !== SOI
  ) {
    findings.push({
      category: "malformed_structure",
      severity: "high",
      offset: 0,
      message: "file does not start with a JPEG SOI marker (0xFFD8)",
    });
    return block("jpeg", cfg.declaredType, findings);
  }

  let offset = 2;
  let metadataBytes = 0;
  let reachedSOS = false;
  let eoiOffset = -1;

  // Marker walker up to SOS.
  while (offset < bytes.byteLength) {
    // Markers are 0xFF followed by a non-zero byte (0x00 is an escape for
    // literal 0xFF within entropy-coded data — we handle that in the EOI
    // scanner below).
    if (bytes[offset] !== 0xff) {
      findings.push({
        category: "malformed_structure",
        severity: "high",
        offset,
        message: `expected 0xFF marker prefix at offset ${offset}, got 0x${bytes[
          offset
        ].toString(16)}`,
      });
      return block("jpeg", cfg.declaredType, findings);
    }

    // Scan past 0xFF padding bytes (legal — appears in the wild).
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset++;
    if (offset >= bytes.byteLength) break;

    const marker = bytes[offset];
    offset++;

    // Standalone markers (no length) — SOI, EOI, RSTn, TEM.
    if (marker === SOI) continue;
    if (marker === EOI) {
      eoiOffset = offset;
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7 /* RSTn */) continue;
    if (marker === 0x01 /* TEM */) continue;

    // Length-prefixed segments.
    if (offset + 2 > bytes.byteLength) {
      findings.push({
        category: "malformed_structure",
        severity: "high",
        offset,
        message: "truncated JPEG segment length",
      });
      return block("jpeg", cfg.declaredType, findings);
    }
    const segLen = (bytes[offset] << 8) | bytes[offset + 1];
    if (segLen < 2) {
      findings.push({
        category: "malformed_structure",
        severity: "high",
        offset,
        message: `invalid JPEG segment length ${segLen}`,
      });
      return block("jpeg", cfg.declaredType, findings);
    }

    // Metadata segments count towards the budget: APP0..APP15 (0xE0..0xEF)
    // and COM (0xFE).
    const isMetadata =
      (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (isMetadata) {
      metadataBytes += segLen;
    }

    // SOS marker: from here on, the data is entropy-coded — break out of
    // the marker walker and scan forward for EOI.
    if (marker === SOS) {
      reachedSOS = true;
      offset += segLen;
      break;
    }

    offset += segLen;
  }

  // Metadata budget check.
  if (metadataBytes > cfg.metadataBudgetBytes) {
    findings.push({
      category: "metadata_budget",
      // Real DSLR/mirrorless JPEGs often carry large APP1/APP2 blocks for
      // EXIF, ICC profiles, XMP, and embedded camera previews. In the E2EE
      // path those bytes stay inside the encrypted original; the app only
      // sends extracted metadata fields to the database. Treat this as an
      // operator-visible warning, while malformed structure and appended
      // archive payloads below still fail closed.
      severity: "low",
      message: `JPEG camera metadata (${metadataBytes} bytes) exceeds the quick-scan budget (${cfg.metadataBudgetBytes}) but remains encrypted in the original`,
    });
  }

  // Scan forward from SOS to find EOI.
  if (reachedSOS && eoiOffset < 0) {
    for (let i = offset; i < bytes.byteLength - 1; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === EOI) {
        eoiOffset = i + 2;
        break;
      }
    }
  }

  if (eoiOffset < 0) {
    findings.push({
      category: "malformed_structure",
      severity: "high",
      message: "JPEG EOI marker (0xFFD9) not found",
    });
    return block("jpeg", cfg.declaredType, findings);
  }

  findings.push(...classifyTrailer(bytes, eoiOffset));

  // Decision: any high-severity finding → block. Otherwise → pass.
  const hasHigh = findings.some((f) => f.severity === "high");
  return {
    detectedFormat: "jpeg",
    declaredType: cfg.declaredType,
    decision: hasHigh ? "block" : "pass",
    riskScore: hasHigh ? 0.95 : 0.05,
    findings,
  };
}

function block(
  format: string,
  declaredType: string,
  findings: ScanFinding[]
): ScanResult {
  return {
    detectedFormat: format,
    declaredType,
    decision: "block",
    riskScore: 0.99,
    findings,
  };
}

function classifyTrailer(bytes: Uint8Array, eoiOffset: number): ScanFinding[] {
  if (eoiOffset >= bytes.byteLength) return [];

  const firstNonPadding = firstTrailerPayloadOffset(bytes, eoiOffset);
  if (firstNonPadding >= bytes.byteLength) return [];

  const cameraTrailer = isLikelyCameraJpegTrailer(bytes, firstNonPadding);
  if (cameraTrailer) {
    return [
      {
        category: "appended_payload",
        severity: "low",
        offset: firstNonPadding,
        message: "camera-authored JPEG preview/MPF data detected after the primary JPEG image",
      },
    ];
  }

  const archiveFindings = scanForArchiveSignatures(bytes, firstNonPadding, bytes.byteLength);
  if (archiveFindings.length > 0) {
    return [
      {
        category: "appended_payload",
        severity: "high",
        offset: firstNonPadding,
        message: `${bytes.byteLength - firstNonPadding} bytes of non-image payload past JPEG EOI`,
      },
      ...archiveFindings,
    ];
  }

  return [
    {
      category: "appended_payload",
      severity: "high",
      offset: firstNonPadding,
      message: `${bytes.byteLength - firstNonPadding} bytes of unknown payload past JPEG EOI`,
    },
  ];
}

function firstTrailerPayloadOffset(bytes: Uint8Array, start: number): number {
  for (let i = start; i < bytes.byteLength; i += 1) {
    const b = bytes[i];
    if (b === 0x00) continue;
    if (b === 0xff && i + 1 < bytes.byteLength && bytes[i + 1] === SOI) return i;
    if (b === 0xff && isAllByte(bytes, i, 0xff)) return bytes.byteLength;
    return i;
  }
  return bytes.byteLength;
}

function isAllByte(bytes: Uint8Array, start: number, value: number): boolean {
  for (let i = start; i < bytes.byteLength; i += 1) {
    if (bytes[i] !== value) return false;
  }
  return true;
}

function isLikelyCameraJpegTrailer(bytes: Uint8Array, start: number): boolean {
  if (start + 4 > bytes.byteLength) return false;
  if (bytes[start] !== 0xff || bytes[start + 1] !== SOI) return false;

  // A dependent MPF/preview image should look like a JPEG marker stream and
  // terminate as a JPEG. We intentionally do not scan inside this image for
  // archive signatures; compressed image entropy can contain byte sequences
  // that resemble file magic. Unknown non-JPEG trailers still fail closed.
  if (bytes[start + 2] !== 0xff) return false;

  const lastNonPadding = lastNonPaddingOffset(bytes);
  return lastNonPadding > start && bytes[lastNonPadding - 1] === 0xff && bytes[lastNonPadding] === EOI;
}

function lastNonPaddingOffset(bytes: Uint8Array): number {
  for (let i = bytes.byteLength - 1; i >= 0; i -= 1) {
    const b = bytes[i];
    if (b !== 0x00 && b !== 0xff) {
      return i;
    }
  }
  return -1;
}
