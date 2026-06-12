// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S2: GIF structural screener.
//
// GIF starts with "GIF87a" or "GIF89a", ends with a single-byte trailer 0x3B.
// We verify the header, find the trailer, and flag anything past it as an
// appended payload. We do NOT walk the data stream in detail — the decode
// sanity check in the worker handles malformed frames.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScanFinding, ScanResult } from "../types";
import { matchAt, scanForArchiveSignatures } from "./archive-signatures";

const GIF87A = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]; // "GIF87a"
const GIF89A = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]; // "GIF89a"

interface GifConfig {
  metadataBudgetBytes: number;
  declaredType: string;
}

export function screenGif(bytes: Uint8Array, cfg: GifConfig): ScanResult {
  const findings: ScanFinding[] = [];

  if (!matchAt(bytes, 0, GIF87A) && !matchAt(bytes, 0, GIF89A)) {
    findings.push({
      category: "malformed_structure",
      severity: "high",
      offset: 0,
      message: "file does not start with a GIF87a or GIF89a signature",
    });
    return block("gif", cfg.declaredType, findings);
  }

  // Find the GIF trailer (0x3B). We walk backwards from the end of the
  // file because the GIF image stream contains many 0x3B bytes in encoded
  // pixel data — the trailer is the LAST 0x3B that is not followed by
  // anything. The real semantic trailer is at offset fileLength - 1.
  // Any bytes past that are appended payload.
  const lastByte = bytes[bytes.byteLength - 1];
  if (lastByte !== 0x3b) {
    // Look for the trailer earlier in the stream — the file may have been
    // padded or had content appended.
    let trailerOffset = -1;
    for (let i = bytes.byteLength - 1; i >= 13; i--) {
      if (bytes[i] === 0x3b) {
        trailerOffset = i;
        break;
      }
    }
    if (trailerOffset < 0) {
      findings.push({
        category: "malformed_structure",
        severity: "high",
        message: "GIF trailer byte (0x3B) not found",
      });
      return block("gif", cfg.declaredType, findings);
    }
    const trailing = bytes.byteLength - trailerOffset - 1;
    // The real threat past the GIF trailer is a POLYGLOT — an archive or
    // executable appended after the 0x3B trailer — which scanForArchiveSignatures
    // detects. BENIGN trailers (tool/app metadata, padding) must NOT block, the
    // same policy the JPEG-EOI path adopted in #370: only block when an archive
    // signature is present; otherwise record a low-severity, never-blocking
    // warning. The Tier-D backend gate still re-screens the manifest + final
    // byte hash server-side.
    const archiveFindings = scanForArchiveSignatures(
      bytes,
      trailerOffset + 1,
      bytes.byteLength,
    );
    if (archiveFindings.length > 0) {
      findings.push({
        category: "appended_payload",
        severity: "high",
        offset: trailerOffset + 1,
        message: `${trailing} bytes of appended payload past GIF trailer containing archive signature(s)`,
      });
      findings.push(...archiveFindings);
    } else {
      findings.push({
        category: "appended_payload",
        severity: "low",
        offset: trailerOffset + 1,
        message: `${trailing} bytes of trailing data past GIF trailer (no archive signature — allowed)`,
      });
    }
  }

  // GIFs do not have a dedicated metadata budget — the comment extension
  // blocks are bounded by the data stream. We still sum Comment Extension
  // (0x21 0xFE) blocks for telemetry but do not enforce a budget.
  // (Intentionally skipping full walker — stays cheap.)

  const hasHigh = findings.some((f) => f.severity === "high");
  return {
    detectedFormat: "gif",
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
