// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S6 — Runtime fixture generator for upload screening tests.
//
// Generates the three synthetic bad-files that the Playwright tests feed
// to the upload screener:
//
//   1. clean-jpeg.bin       — valid minimal JPEG (SOI + APP0 + SOS + 1 byte + EOI)
//   2. appended-zip.bin     — same JPEG with a trailing ZIP central directory
//   3. oversized-metadata.bin — JPEG with an APP0 segment larger than the policy budget
//
// Fixtures are written to e2e/fixtures/generated/ (gitignored — regenerated
// on demand). The Playwright spec imports this module and calls
// generateAll() in its test.beforeAll hook.
// ─────────────────────────────────────────────────────────────────────────────

import * as fs from "fs";
import * as path from "path";

const OUT_DIR = path.join(__dirname, "generated");

function ensureOutDir(): void {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }
}

/**
 * Build a minimal but structurally valid JPEG. Same byte sequence the
 * frontend vitest screen.test.ts uses, kept in sync.
 */
function minimalJpeg(): Buffer {
  return Buffer.from([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, // APP0 length 16
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // SOS
    0x00, // entropy placeholder
    0xff, 0xd9, // EOI
  ]);
}

/**
 * Append a ZIP central directory header ("PK\x05\x06") past EOI. The
 * structural screener flags this as an appended_payload + archive_signature
 * finding.
 */
function jpegWithAppendedZip(): Buffer {
  const jpeg = minimalJpeg();
  const zipHeader = Buffer.from([
    0x50, 0x4b, 0x05, 0x06, // "PK\x05\x06"
    0x00, 0x00, 0x00, 0x00, // disk number + start disk
    0x00, 0x00, 0x00, 0x00, // CD entries total
    0x00, 0x00, 0x00, 0x00, // CD size
    0x00, 0x00, 0x00, 0x00, // CD offset
    0x00, 0x00, // comment length
  ]);
  return Buffer.concat([jpeg, zipHeader]);
}

/**
 * Build a JPEG whose APP0 segment is larger than the 512 KB metadata
 * budget. The screener flags this as a metadata_budget finding.
 */
function jpegWithOversizedMetadata(): Buffer {
  // 600 KB of filler. APP0 length field is 16-bit so we actually need
  // multiple APPn segments to exceed 64 KB per segment; the screener
  // sums them all against the budget, so 10 segments of 60 KB each is
  // enough to blow the 512 KB budget.
  const chunks: Buffer[] = [Buffer.from([0xff, 0xd8])]; // SOI

  const segLen = 60 * 1024; // 60 KB
  for (let i = 0; i < 10; i++) {
    const header = Buffer.from([
      0xff, 0xe1, // APP1
      (segLen >> 8) & 0xff,
      segLen & 0xff,
    ]);
    const body = Buffer.alloc(segLen - 2, 0x20); // space-filled body
    chunks.push(header, body);
  }

  // Minimal SOS + entropy + EOI so the marker walker reaches the end.
  chunks.push(
    Buffer.from([0xff, 0xda, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Buffer.from([0x00]),
    Buffer.from([0xff, 0xd9])
  );

  return Buffer.concat(chunks);
}

/**
 * Generate all fixtures and write them to disk. Called from the Playwright
 * beforeAll hook. Safe to call repeatedly — overwrites in place.
 */
export function generateAll(): void {
  ensureOutDir();
  fs.writeFileSync(path.join(OUT_DIR, "clean-jpeg.bin"), minimalJpeg());
  fs.writeFileSync(
    path.join(OUT_DIR, "appended-zip.bin"),
    jpegWithAppendedZip()
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "oversized-metadata.bin"),
    jpegWithOversizedMetadata()
  );
}

export const FIXTURE_PATHS = {
  cleanJpeg: path.join(OUT_DIR, "clean-jpeg.bin"),
  appendedZip: path.join(OUT_DIR, "appended-zip.bin"),
  oversizedMetadata: path.join(OUT_DIR, "oversized-metadata.bin"),
};
