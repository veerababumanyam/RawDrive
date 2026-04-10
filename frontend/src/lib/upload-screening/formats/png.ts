// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S2: PNG structural screener.
//
// PNG is a chunked format with a fixed 8-byte signature followed by a
// sequence of chunks (IHDR, ..., IEND). We walk chunks, track metadata
// budget (tEXt, iTXt, zTXt, eXIf), and flag anything past IEND as an
// appended payload.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScanFinding, ScanResult, ScanDimensions } from "../types";
import { matchAt, scanForArchiveSignatures } from "./archive-signatures";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const METADATA_CHUNK_TYPES = new Set(["tEXt", "iTXt", "zTXt", "eXIf"]);

interface PngConfig {
  metadataBudgetBytes: number;
  declaredType: string;
}

export function screenPng(bytes: Uint8Array, cfg: PngConfig): ScanResult {
  const findings: ScanFinding[] = [];

  if (!matchAt(bytes, 0, PNG_SIGNATURE)) {
    findings.push({
      category: "malformed_structure",
      severity: "high",
      offset: 0,
      message: "file does not start with a PNG signature",
    });
    return block("png", cfg.declaredType, findings);
  }

  let offset = 8;
  let metadataBytes = 0;
  let iendOffset = -1;
  let dimensions: ScanDimensions | undefined;

  while (offset + 12 <= bytes.byteLength) {
    // Chunk structure: 4 bytes length || 4 bytes type || <length> bytes data || 4 bytes CRC
    const length =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    if (length < 0 || offset + 12 + length > bytes.byteLength) {
      findings.push({
        category: "malformed_structure",
        severity: "high",
        offset,
        message: `invalid PNG chunk length ${length} at offset ${offset}`,
      });
      return block("png", cfg.declaredType, findings);
    }

    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7]
    );

    if (type === "IHDR" && length >= 8) {
      dimensions = {
        width:
          (bytes[offset + 8] << 24) |
          (bytes[offset + 9] << 16) |
          (bytes[offset + 10] << 8) |
          bytes[offset + 11],
        height:
          (bytes[offset + 12] << 24) |
          (bytes[offset + 13] << 16) |
          (bytes[offset + 14] << 8) |
          bytes[offset + 15],
      };
    }

    if (METADATA_CHUNK_TYPES.has(type)) {
      metadataBytes += length;
    }

    offset += 12 + length; // length + type + data + CRC

    if (type === "IEND") {
      iendOffset = offset;
      break;
    }
  }

  if (metadataBytes > cfg.metadataBudgetBytes) {
    findings.push({
      category: "metadata_budget",
      severity: "high",
      message: `PNG metadata (${metadataBytes} bytes) exceeds policy budget (${cfg.metadataBudgetBytes})`,
    });
  }

  if (iendOffset < 0) {
    findings.push({
      category: "malformed_structure",
      severity: "high",
      message: "PNG IEND chunk not found",
    });
    return block("png", cfg.declaredType, findings);
  }

  // Anything past IEND is appended payload.
  if (iendOffset < bytes.byteLength) {
    const trailing = bytes.byteLength - iendOffset;
    findings.push({
      category: "appended_payload",
      severity: "high",
      offset: iendOffset,
      message: `${trailing} bytes of appended payload past PNG IEND`,
    });
    findings.push(
      ...scanForArchiveSignatures(bytes, iendOffset, bytes.byteLength)
    );
  }

  const hasHigh = findings.some((f) => f.severity === "high");
  return {
    detectedFormat: "png",
    declaredType: cfg.declaredType,
    decision: hasHigh ? "block" : "pass",
    riskScore: hasHigh ? 0.95 : 0.05,
    findings,
    dimensions,
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
