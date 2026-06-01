import { describe, it, expect } from "vitest";
import { screen } from "../screen";

// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S2 — Format screener tests.
//
// These tests synthesize minimal valid and invalid byte sequences for each
// supported format and assert that the screen() dispatcher picks the right
// parser and produces the right decision.
// ─────────────────────────────────────────────────────────────────────────────

function makeMinimalJpeg(): Uint8Array {
  // SOI + APP0 JFIF segment + SOS marker + 1 byte entropy + EOI
  // Byte-level layout (matches the JFIF 1.01 wire format):
  //   FFD8                SOI
  //   FFE0                APP0 marker
  //   0010                length = 16
  //   4A 46 49 46 00      "JFIF\0"
  //   01 01               version 1.1
  //   00                  aspect ratio units
  //   00 01 00 01         x/y density
  //   00 00               thumbnail 0x0
  //   FFDA 00 08 00 00 00 00 00 00   SOS segment (length 8)
  //   00                  entropy placeholder
  //   FFD9                EOI
  return new Uint8Array([
    0xff, 0xd8, // SOI
    0xff, 0xe0, 0x00, 0x10, // APP0, length 16
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // SOS
    0x00, // entropy byte
    0xff, 0xd9, // EOI
  ]);
}

function makeMinimalPng(): Uint8Array {
  // PNG signature + IHDR (13 bytes data) + IEND
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
    // IHDR chunk: length=13, type="IHDR", 13 bytes data, CRC=00000000
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, // width = 1
    0x00, 0x00, 0x00, 0x01, // height = 1
    0x08, 0x02, 0x00, 0x00, 0x00, // bit depth 8, color type 2, ...
    0x00, 0x00, 0x00, 0x00, // CRC (not verified by our screener)
    // IEND chunk: length=0, type="IEND", CRC=ae426082
    0x00, 0x00, 0x00, 0x00,
    0x49, 0x45, 0x4e, 0x44,
    0xae, 0x42, 0x60, 0x82,
  ]);
}

function makeMinimalGif(): Uint8Array {
  // GIF89a + 7 bytes Logical Screen Descriptor + 1 byte trailer
  return new Uint8Array([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, 0x01, 0x00, // width=1, height=1
    0x00, 0x00, 0x00, // packed, bg, aspect
    0x3b, // trailer
  ]);
}

function makeMinimalWebp(): Uint8Array {
  // RIFF <size=16> WEBP VP8  <chunksize=4> <4 bytes body>
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x10, 0x00, 0x00, 0x00, // size = 16 (little-endian) — total = 24
    0x57, 0x45, 0x42, 0x50, // "WEBP"
    0x56, 0x50, 0x38, 0x20, // "VP8 " chunk
    0x04, 0x00, 0x00, 0x00, // chunk size = 4
    0x00, 0x00, 0x00, 0x00, // chunk body
  ]);
}

describe("screen() format dispatcher", () => {
  it("detects a minimal JPEG and passes it", () => {
    const result = screen(makeMinimalJpeg(), { declaredType: "image/jpeg" });
    expect(result.detectedFormat).toBe("jpeg");
    expect(result.decision).toBe("pass");
    expect(result.findings).toHaveLength(0);
  });

  it("detects a minimal PNG and passes it", () => {
    const result = screen(makeMinimalPng(), { declaredType: "image/png" });
    expect(result.detectedFormat).toBe("png");
    expect(result.decision).toBe("pass");
  });

  it("detects a minimal WebP and passes it", () => {
    const result = screen(makeMinimalWebp(), { declaredType: "image/webp" });
    expect(result.detectedFormat).toBe("webp");
    expect(result.decision).toBe("pass");
  });

  it("detects a minimal GIF89a and passes it", () => {
    const result = screen(makeMinimalGif(), { declaredType: "image/gif" });
    expect(result.detectedFormat).toBe("gif");
    expect(result.decision).toBe("pass");
  });

  it("blocks an unknown binary format", () => {
    const result = screen(new Uint8Array([0xde, 0xad, 0xbe, 0xef]), {
      declaredType: "application/octet-stream",
    });
    expect(result.decision).toBe("block");
    expect(result.detectedFormat).toBe("unknown");
    expect(result.findings[0].category).toBe("unsupported_format");
  });

  it("flags a JPEG with appended ZIP payload", () => {
    const jpeg = makeMinimalJpeg();
    const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]); // "PK\x03\x04"
    const combined = new Uint8Array(jpeg.length + zipHeader.length);
    combined.set(jpeg, 0);
    combined.set(zipHeader, jpeg.length);

    const result = screen(combined, { declaredType: "image/jpeg" });
    expect(result.decision).toBe("block");
    expect(result.findings.some((f) => f.category === "appended_payload")).toBe(true);
    expect(result.findings.some((f) => f.category === "archive_signature")).toBe(true);
  });

  it("allows a JPEG with benign trailing data past EOI (camera Multi-Picture Format)", () => {
    // Regression for the 2026-05-31 upload-blocked bug: real Nikon/Sony JPEGs
    // append an MPF preview / second image after the primary EOI. Such trailing
    // bytes carry no archive signature and must NOT block the upload.
    const jpeg = makeMinimalJpeg();
    // A second SOI..EOI image-ish blob (no archive magic) appended after EOI.
    const trailer = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x4d, 0x50, 0x46, 0x30, 0xff, 0xd9]);
    const combined = new Uint8Array(jpeg.length + trailer.length);
    combined.set(jpeg, 0);
    combined.set(trailer, jpeg.length);

    const result = screen(combined, { declaredType: "image/jpeg" });
    expect(result.detectedFormat).toBe("jpeg");
    expect(result.decision).toBe("pass"); // benign trailer is allowed (low-severity warning only)
    // It is still surfaced as a low-severity warning, never a blocking finding.
    const appended = result.findings.find((f) => f.category === "appended_payload");
    expect(appended?.severity).toBe("low");
    expect(result.findings.some((f) => f.severity === "high")).toBe(false);
  });

  it("flags a PNG with appended RAR payload", () => {
    const png = makeMinimalPng();
    const rarHeader = new Uint8Array([
      0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00,
    ]); // "Rar!\x1a\x07\x00"
    const combined = new Uint8Array(png.length + rarHeader.length);
    combined.set(png, 0);
    combined.set(rarHeader, png.length);

    const result = screen(combined, { declaredType: "image/png" });
    expect(result.decision).toBe("block");
    expect(result.findings.some((f) => f.category === "archive_signature")).toBe(true);
  });

  it("sets needs_desktop_scan for TIFF files", () => {
    const tiff = new Uint8Array([
      0x49, 0x49, 0x2a, 0x00, // TIFF little-endian
      0x08, 0x00, 0x00, 0x00, // offset to first IFD
    ]);
    const result = screen(tiff, { declaredType: "image/tiff" });
    expect(result.decision).toBe("needs_desktop_scan");
    expect(result.detectedFormat).toBe("tiff");
  });

  it("blocks a JPEG that does not start with SOI", () => {
    const bogus = new Uint8Array([0xff, 0x00, 0xff, 0xd8]); // SOI NOT at offset 0
    const result = screen(bogus, { declaredType: "image/jpeg" });
    // screen() dispatches on the first two bytes so bogus[0]=0xFF bogus[1]=0x00
    // is not dispatched to the JPEG parser — falls through to unknown.
    expect(result.decision).toBe("block");
  });
});
