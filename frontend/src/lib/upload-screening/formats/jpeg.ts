// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S2: JPEG structural screener.
//
// Walks the JPEG markers from SOI (0xFFD8) to EOI (0xFFD9), tracking the
// cumulative metadata budget (APP0..APP15, COM, DHT, DQT segments) and
// flagging anything past EOI as an appended payload. Does NOT decode pixel
// data — the browser's <img> sanity check in the worker handles that.
//
// Spec: feature-architecture-delta.md §4.3 (browser format parsers)
// ─────────────────────────────────────────────────────────────────────────────

import type { ScanFinding, ScanResult } from "../types";
import { scanForArchiveSignatures } from "./archive-signatures";

const SOI = 0xffd8;
const EOI = 0xffd9;
const SOS = 0xffda; // Start of Scan — after this marker, payload is raw
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
 * does not have per-segment framing. After EOI, any non-padding bytes
 * are considered appended payload.
 */
export function screenJpeg(bytes: Uint8Array, cfg: JpegConfig): ScanResult {
  const findings: ScanFinding[] = [];

  // Sanity: must start with SOI (0xFFD8).
  if (
    bytes.byteLength < 2 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8
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
    if (marker === 0xd8 /* SOI */) continue;
    if (marker === 0xd9 /* EOI */) {
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
    if (marker === 0xda /* SOS */) {
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
      severity: "high",
      message: `JPEG metadata (${metadataBytes} bytes) exceeds policy budget (${cfg.metadataBudgetBytes})`,
    });
  }

  // Scan forward from SOS to find EOI.
  if (reachedSOS && eoiOffset < 0) {
    for (let i = offset; i < bytes.byteLength - 1; i++) {
      if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
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

  // Any non-padding bytes past EOI are appended payload.
  if (eoiOffset < bytes.byteLength) {
    const trailing = bytes.byteLength - eoiOffset;
    const nonZeroPad = hasNonPaddingTrailer(bytes, eoiOffset);
    if (nonZeroPad) {
      findings.push({
        category: "appended_payload",
        severity: "high",
        offset: eoiOffset,
        message: `${trailing} bytes of appended payload past JPEG EOI`,
      });
      // Also scan the trailing region for archive signatures.
      findings.push(
        ...scanForArchiveSignatures(bytes, eoiOffset, bytes.byteLength)
      );
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

function hasNonPaddingTrailer(bytes: Uint8Array, start: number): boolean {
  for (let i = start; i < bytes.byteLength; i++) {
    const b = bytes[i];
    if (b !== 0x00 && b !== 0xff) return true;
  }
  return false;
}
