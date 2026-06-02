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

function makeJpegWithLargeCameraMetadata(): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  for (let i = 0; i < 10; i += 1) {
    const segmentLength = 60_000;
    const segment = new Uint8Array(2 + segmentLength);
    segment[0] = 0xff;
    segment[1] = 0xe1;
    segment[2] = (segmentLength >> 8) & 0xff;
    segment[3] = segmentLength & 0xff;
    parts.push(segment);
  }
  parts.push(new Uint8Array([
    0xff, 0xda, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00,
    0xff, 0xd9,
  ]));

  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
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

  it("allows camera JPEGs with large metadata as a warning", () => {
    const result = screen(makeJpegWithLargeCameraMetadata(), { declaredType: "image/jpeg" });
    expect(result.detectedFormat).toBe("jpeg");
    expect(result.decision).toBe("pass");
    expect(result.findings).toEqual([
      expect.objectContaining({
        category: "metadata_budget",
        severity: "low",
      }),
    ]);
  });

  it.each(["Nikon MPF", "Canon/Sony camera preview"])(
    "allows %s trailing camera JPEG data as a warning",
    () => {
      const primary = makeMinimalJpeg();
      const dependentPreview = makeMinimalJpeg();
      const combined = new Uint8Array(primary.length + 8 + dependentPreview.length);
      combined.set(primary, 0);
      combined.set(new Uint8Array(8), primary.length);
      combined.set(dependentPreview, primary.length + 8);

      const result = screen(combined, { declaredType: "image/jpeg" });

      expect(result.decision).toBe("pass");
      expect(result.findings).toEqual([
        expect.objectContaining({
          category: "appended_payload",
          severity: "low",
        }),
      ]);
    },
  );

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

  it("sets needs_desktop_scan for Canon CR2 files before generic TIFF", () => {
    const cr2 = new Uint8Array([
      0x49, 0x49, 0x2a, 0x00,
      0x10, 0x00, 0x00, 0x00,
      0x43, 0x52,
    ]);
    const result = screen(cr2, { declaredType: "image/x-canon-cr2" });
    expect(result.decision).toBe("needs_desktop_scan");
    expect(result.detectedFormat).toBe("cr2");
  });

  it("sets needs_desktop_scan for Canon CR3 ISO BMFF files", () => {
    const cr3 = new Uint8Array([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70, // ftyp
      0x63, 0x72, 0x78, 0x20, // crx
      0x00, 0x00, 0x00, 0x00,
    ]);
    const result = screen(cr3, { declaredType: "image/x-canon-cr3" });
    expect(result.decision).toBe("needs_desktop_scan");
    expect(result.detectedFormat).toBe("cr3");
  });

  it("sets needs_desktop_scan for AVIF files", () => {
    const avif = new Uint8Array([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70, // ftyp
      0x61, 0x76, 0x69, 0x66, // avif
      0x00, 0x00, 0x00, 0x00,
    ]);
    const result = screen(avif, { declaredType: "image/avif" });
    expect(result.decision).toBe("needs_desktop_scan");
    expect(result.detectedFormat).toBe("avif");
  });

  it("blocks a JPEG that does not start with SOI", () => {
    const bogus = new Uint8Array([0xff, 0x00, 0xff, 0xd8]); // SOI NOT at offset 0
    const result = screen(bogus, { declaredType: "image/jpeg" });
    // screen() dispatches on the first two bytes so bogus[0]=0xFF bogus[1]=0x00
    // is not dispatched to the JPEG parser — falls through to unknown.
    expect(result.decision).toBe("block");
  });
});
