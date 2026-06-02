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

  // Bytes past the primary EOI. Real-world camera JPEGs routinely carry
  // BENIGN trailing data — most commonly a Multi-Picture Format (MPF) preview
  // / second image that the camera appends after the primary image's EOI,
  // plus assorted EXIF/MPF index padding. The pre-2026-05-31 behaviour flagged
  // ALL non-padding trailing bytes as a high-severity "appended_payload" and
  // blocked the upload, which rejected the overwhelming majority of unmodified
  // DSLR/mirrorless photos (observed: 38 of 39 wedding JPEGs blocked).
  //
  // The actual threat here is a POLYGLOT — an archive or executable appended
  // after EOI — and scanForArchiveSignatures already detects those. So we only
  // BLOCK when the trailer contains an archive signature; otherwise we record a
  // low-severity warning (surfaced in the UI, never blocking) and allow the
  // upload. The Tier-D backend gate still re-screens server-side.
  if (eoiOffset < bytes.byteLength) {
    const trailing = bytes.byteLength - eoiOffset;
    if (hasNonPaddingTrailer(bytes, eoiOffset)) {
      const archiveFindings = scanForArchiveSignatures(
        bytes,
        eoiOffset,
        bytes.byteLength
      );
      if (archiveFindings.length > 0) {
        // Genuine polyglot: image + appended archive. Reject.
        findings.push({
          category: "appended_payload",
          severity: "high",
          offset: eoiOffset,
          message: `${trailing} bytes of appended payload past JPEG EOI containing archive signature(s)`,
        });
        findings.push(...archiveFindings);
      } else {
        // Benign trailing data — never blocks (#60). When the trailer positively
        // matches a camera-authored MPF/dependent-JPEG structure we say so;
        // otherwise it is still allowed as generic trailing data. Either way the
        // Tier-D backend gate re-screens server-side.
        const firstNonPadding = firstTrailerPayloadOffset(bytes, eoiOffset);
        const isCameraMpf =
          firstNonPadding < bytes.byteLength &&
          isLikelyCameraJpegTrailer(bytes, firstNonPadding);
        findings.push({
          category: "appended_payload",
          severity: "low",
          offset: eoiOffset,
          message: isCameraMpf
            ? `${trailing} bytes of trailing data past JPEG EOI (camera-authored Multi-Picture Format / dependent JPEG preview; allowed)`
            : `${trailing} bytes of trailing data past JPEG EOI (no archive signature — typical of camera Multi-Picture Format; allowed)`,
        });
      }
    }
  }

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

// True when the bytes from `start` contain at least one non-padding byte
// (anything other than 0x00 / 0xFF). Padding-only trailers are ignored.
function hasNonPaddingTrailer(bytes: Uint8Array, start: number): boolean {
  for (let i = start; i < bytes.byteLength; i++) {
    const b = bytes[i];
    if (b !== 0x00 && b !== 0xff) return true;
  }
  return false;
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
