// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S2: WebP structural screener.
//
// WebP is RIFF-based: "RIFF" + size + "WEBP" + chunks. We verify the RIFF
// header, check the total size matches the file length, and flag anything
// past the declared RIFF size as an appended payload.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScanFinding, ScanResult } from "../types";
import { matchAt, scanForArchiveSignatures } from "./archive-signatures";

const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_MAGIC = [0x57, 0x45, 0x42, 0x50]; // "WEBP"

interface WebpConfig {
  metadataBudgetBytes: number;
  declaredType: string;
}

export function screenWebp(bytes: Uint8Array, cfg: WebpConfig): ScanResult {
  const findings: ScanFinding[] = [];

  if (!matchAt(bytes, 0, RIFF_MAGIC) || !matchAt(bytes, 8, WEBP_MAGIC)) {
    findings.push({
      category: "malformed_structure",
      severity: "high",
      offset: 0,
      message: "file does not have a RIFF/WEBP header",
    });
    return block("webp", cfg.declaredType, findings);
  }

  // RIFF size (little-endian) at offset 4. Value is the total size minus 8
  // (the "RIFF" + size fields are not counted).
  const riffSize =
    bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
  const declaredTotal = riffSize + 8;

  if (declaredTotal > bytes.byteLength) {
    findings.push({
      category: "malformed_structure",
      severity: "high",
      offset: 4,
      message: `RIFF size (${declaredTotal}) exceeds file length (${bytes.byteLength})`,
    });
    return block("webp", cfg.declaredType, findings);
  }

  // Anything past the declared RIFF size is appended payload.
  if (declaredTotal < bytes.byteLength) {
    const trailing = bytes.byteLength - declaredTotal;
    findings.push({
      category: "appended_payload",
      severity: "high",
      offset: declaredTotal,
      message: `${trailing} bytes of appended payload past RIFF end`,
    });
    findings.push(
      ...scanForArchiveSignatures(bytes, declaredTotal, bytes.byteLength)
    );
  }

  // Walk the RIFF sub-chunks to sum up metadata-bearing ones (EXIF, XMP, ICCP).
  let offset = 12;
  let metadataBytes = 0;
  while (offset + 8 <= declaredTotal) {
    const chunkFourCC = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3]
    );
    const chunkSize =
      bytes[offset + 4] |
      (bytes[offset + 5] << 8) |
      (bytes[offset + 6] << 16) |
      (bytes[offset + 7] << 24);

    if (chunkSize < 0 || offset + 8 + chunkSize > declaredTotal) {
      findings.push({
        category: "malformed_structure",
        severity: "high",
        offset,
        message: `invalid WebP chunk size ${chunkSize}`,
      });
      return block("webp", cfg.declaredType, findings);
    }

    if (chunkFourCC === "EXIF" || chunkFourCC === "XMP " || chunkFourCC === "ICCP") {
      metadataBytes += chunkSize;
    }

    // Chunks are padded to an even length.
    const padded = chunkSize + (chunkSize & 1);
    offset += 8 + padded;
  }

  if (metadataBytes > cfg.metadataBudgetBytes) {
    findings.push({
      category: "metadata_budget",
      severity: "high",
      message: `WebP metadata (${metadataBytes} bytes) exceeds policy budget (${cfg.metadataBudgetBytes})`,
    });
  }

  const hasHigh = findings.some((f) => f.severity === "high");
  return {
    detectedFormat: "webp",
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
