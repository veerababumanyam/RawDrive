// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S2: Archive signature scanner.
//
// Walks a byte buffer looking for known archive magic numbers. Used by every
// format parser to detect polyglot files (image + appended ZIP/RAR/7z).
//
// This is a structural check, not a content scan — we only flag the presence
// of the archive magic at a byte offset where it has no business being, not
// the actual archive content. The Tier D backend gate then rejects on the
// presence of the finding.
// ─────────────────────────────────────────────────────────────────────────────

import type { ScanFinding } from "../types";

/**
 * Known archive magic numbers. Kept minimal on purpose — every signature
 * here is one the screening worker must be able to match in O(n·k) where
 * n is the file size and k is the number of signatures. More signatures
 * = more per-file CPU, so we keep the list tight.
 */
const ARCHIVE_SIGNATURES: readonly { label: string; bytes: readonly number[] }[] = [
  // ZIP ("PK\x03\x04"). Also matches JAR, DOCX, ODT, EPUB, etc.
  { label: "zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  // ZIP empty / spanned ("PK\x05\x06")
  { label: "zip_empty", bytes: [0x50, 0x4b, 0x05, 0x06] },
  // ZIP spanned ("PK\x07\x08")
  { label: "zip_spanned", bytes: [0x50, 0x4b, 0x07, 0x08] },
  // RAR 1.5 ("Rar!\x1a\x07\x00")
  { label: "rar", bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00] },
  // RAR 5.0 ("Rar!\x1a\x07\x01\x00")
  { label: "rar5", bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00] },
  // 7z ("7z\xBC\xAF\x27\x1C")
  { label: "7z", bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  // gzip ("\x1f\x8b")
  { label: "gzip", bytes: [0x1f, 0x8b] },
  // tar ("ustar" at offset 257 — common but not the only tar variant)
  // We don't check this because it requires offset arithmetic that is
  // cheaper to let the backend handle for suspicious files.
];

/**
 * Scan a byte range for archive signatures. Returns an array of findings,
 * empty when clean. The caller decides whether to upgrade the severity
 * based on context (e.g. a ZIP header at offset 0 is normal for a .zip
 * file but suspicious for a .jpg).
 *
 * startOffset and endOffset are inclusive-start, exclusive-end. The common
 * call pattern is "scan everything past the known EOI of an image".
 */
export function scanForArchiveSignatures(
  bytes: Uint8Array,
  startOffset: number,
  endOffset: number
): ScanFinding[] {
  const findings: ScanFinding[] = [];
  const end = Math.min(endOffset, bytes.byteLength);

  // Naive O(n·k) search. Fine for the budgeted workloads we see (up to
  // ~512 KB of trailing bytes per image). If this becomes a hot path we
  // can swap in Aho-Corasick.
  for (let i = startOffset; i < end; i++) {
    for (const sig of ARCHIVE_SIGNATURES) {
      if (matchAt(bytes, i, sig.bytes)) {
        findings.push({
          category: "archive_signature",
          severity: "high",
          offset: i,
          message: `archive magic '${sig.label}' detected at offset ${i} (file is likely a polyglot)`,
        });
        // One finding per signature match is enough — the backend blocks
        // on any finding, so we don't need to enumerate every occurrence.
        break;
      }
    }
  }

  return findings;
}

/**
 * Returns true when `bytes` contains `needle` starting at `offset`.
 * Extracted as its own function so the format parsers can reuse the
 * same magic-number matcher for their own format signatures.
 */
export function matchAt(
  bytes: Uint8Array,
  offset: number,
  needle: readonly number[]
): boolean {
  if (offset + needle.length > bytes.byteLength) return false;
  for (let i = 0; i < needle.length; i++) {
    if (bytes[offset + i] !== needle[i]) return false;
  }
  return true;
}
