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

  it("flags a JPEG with padded appended ZIP payload", () => {
    const jpeg = makeMinimalJpeg();
    const padding = new Uint8Array([0x00, 0x00, 0x00]);
    const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]); // "PK\x03\x04"
    const combined = new Uint8Array(jpeg.length + padding.length + zipHeader.length);
    combined.set(jpeg, 0);
    combined.set(padding, jpeg.length);
    combined.set(zipHeader, jpeg.length + padding.length);

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

  it("allows camera dependent JPEG trailers even when preview entropy resembles archive magic", () => {
    const jpeg = makeMinimalJpeg();
    const dependentPreview = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10,
      0x4a, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xda, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x50, 0x4b, 0x03, 0x04, // ZIP-like bytes inside compressed JPEG entropy.
      0xff, 0xd9,
    ]);
    const combined = new Uint8Array(jpeg.length + dependentPreview.length);
    combined.set(jpeg, 0);
    combined.set(dependentPreview, jpeg.length);

    const result = screen(combined, { declaredType: "image/jpeg" });

    expect(result.detectedFormat).toBe("jpeg");
    expect(result.decision).toBe("pass");
    expect(result.findings).toEqual([
      expect.objectContaining({
        category: "appended_payload",
        severity: "low",
      }),
    ]);
    expect(result.findings.some((f) => f.category === "archive_signature")).toBe(false);
  });

  it("allows camera trailers with an MPF index before preview entropy that resembles archive magic", () => {
    const jpeg = makeMinimalJpeg();
    const mpfIndex = new Uint8Array([
      0x4d, 0x50, 0x46, 0x00, // "MPF\0"
      0x00, 0x00, 0x00, 0x18,
    ]);
    const dependentPreview = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xe0, 0x00, 0x10,
      0x4a, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
      0xff, 0xda, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x50, 0x4b, 0x03, 0x04, // ZIP-like bytes inside compressed JPEG entropy.
      0xff, 0xd9,
    ]);
    const combined = new Uint8Array(jpeg.length + mpfIndex.length + dependentPreview.length);
    combined.set(jpeg, 0);
    combined.set(mpfIndex, jpeg.length);
    combined.set(dependentPreview, jpeg.length + mpfIndex.length);

    const result = screen(combined, { declaredType: "image/jpeg" });

    expect(result.detectedFormat).toBe("jpeg");
    expect(result.decision).toBe("pass");
    expect(result.findings).toEqual([
      expect.objectContaining({
        category: "appended_payload",
        severity: "low",
      }),
    ]);
    expect(result.findings.some((f) => f.category === "archive_signature")).toBe(false);
  });

  it("allows large camera vendor trailers with incidental archive-like bytes away from the payload start", () => {
    const jpeg = makeMinimalJpeg();
    const trailer = new Uint8Array(194_566);
    trailer.fill(0x2a);
    trailer.set([0x52, 0x44, 0x43, 0x41, 0x4d], 0); // "RDCAM"
    trailer.set([0x50, 0x4b, 0x03, 0x04], 12_000); // incidental ZIP-like bytes.
    const combined = new Uint8Array(jpeg.length + trailer.length);
    combined.set(jpeg, 0);
    combined.set(trailer, jpeg.length);

    const result = screen(combined, { declaredType: "image/jpeg" });

    expect(result.detectedFormat).toBe("jpeg");
    expect(result.decision).toBe("pass");
    expect(result.findings).toEqual([
      expect.objectContaining({
        category: "appended_payload",
        severity: "low",
      }),
    ]);
    expect(result.findings.some((f) => f.category === "archive_signature")).toBe(false);
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

  // ───────────────────────────────────────────────────────────────────────
  // CD5 — browser-decodable HEIC / HEIF / AVIF + camera RAW now `pass`.
  //
  // After CD4 unblocked the format gates, the screener must vouch for the
  // now-browser-decodable formats (HEIC, HEIF, AVIF, CR2, NEF, ARW, DNG,
  // ORF, RAF, RW2) with decision:"pass" so the E2EE upload's scan manifest
  // lets them finalize. CR3 + exotic RAW + ambiguous/multi-page TIFF stay
  // needs_desktop_scan; non-image stays block.
  // ───────────────────────────────────────────────────────────────────────

  function isoBmffFtyp(brand: string): Uint8Array {
    const head = [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]; // size + "ftyp"
    const brandBytes = [...brand].map((c) => c.charCodeAt(0));
    return new Uint8Array([...head, ...brandBytes, 0x00, 0x00, 0x00, 0x00]);
  }

  function tiffLE(...trailing: number[]): Uint8Array {
    return new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, ...trailing]);
  }

  it("passes a HEIC file (ftyp heic) as detected_format heic", () => {
    const result = screen(isoBmffFtyp("heic"), { declaredType: "image/heic" });
    expect(result.decision).toBe("pass");
    expect(result.detectedFormat).toBe("heic");
    expect(result.findings.some((f) => f.severity === "high")).toBe(false);
  });

  it("passes a HEIF file (ftyp mif1) as detected_format heic", () => {
    const result = screen(isoBmffFtyp("mif1"), { declaredType: "image/heif" });
    expect(result.decision).toBe("pass");
    expect(result.detectedFormat).toBe("heic");
  });

  it("passes an AVIF file (ftyp avif) as detected_format avif", () => {
    const result = screen(isoBmffFtyp("avif"), { declaredType: "image/avif" });
    expect(result.decision).toBe("pass");
    expect(result.detectedFormat).toBe("avif");
    expect(result.findings.some((f) => f.severity === "high")).toBe(false);
  });

  it("passes a Canon CR2 file (TIFF + 'CR' brand) as detected_format cr2", () => {
    const cr2 = new Uint8Array([
      0x49, 0x49, 0x2a, 0x00,
      0x10, 0x00, 0x00, 0x00,
      0x43, 0x52, // "CR"
    ]);
    const result = screen(cr2, { declaredType: "image/x-canon-cr2" });
    expect(result.decision).toBe("pass");
    expect(result.detectedFormat).toBe("cr2");
  });

  it("passes a Fuji RAF file (FUJIFILMCCD-RAW magic) as detected_format raf", () => {
    const raf = new Uint8Array([...[..."FUJIFILMCCD-RAW"].map((c) => c.charCodeAt(0)), 0x00, 0x00]);
    const result = screen(raf, { declaredType: "" });
    expect(result.decision).toBe("pass");
    expect(result.detectedFormat).toBe("raf");
  });

  it.each([
    ["image/x-nikon-nef", "nef"],
    ["image/x-sony-arw", "arw"],
    ["image/x-adobe-dng", "dng"],
    ["image/x-olympus-orf", "orf"],
    ["image/x-panasonic-rw2", "rw2"],
  ])(
    "passes a TIFF-magic RAW with vendor MIME %s as detected_format %s",
    (declaredType, format) => {
      const result = screen(tiffLE(), { declaredType });
      expect(result.decision).toBe("pass");
      expect(result.detectedFormat).toBe(format);
    },
  );

  it("keeps a plain TIFF (image/tiff) as needs_desktop_scan", () => {
    const result = screen(tiffLE(), { declaredType: "image/tiff" });
    expect(result.decision).toBe("needs_desktop_scan");
    expect(result.detectedFormat).toBe("tiff");
  });

  it("keeps a TIFF-magic file with an unknown declaredType as needs_desktop_scan", () => {
    // Cannot tell NEF/ARW/multi-page TIFF apart by magic alone — without a
    // RAW vendor MIME the screener conservatively routes to the desktop agent.
    const result = screen(tiffLE(), { declaredType: "application/octet-stream" });
    expect(result.decision).toBe("needs_desktop_scan");
    expect(result.detectedFormat).toBe("tiff");
  });

  // ───────────────────────────────────────────────────────────────────────
  // CD5b — TIFF-based RAW disambiguated by FILENAME extension (backstop).
  //
  // Many browsers/OSes report `image/tiff` or "" for camera RAW, so the
  // vendor `image/x-*` MIME branch above never resolves. The CD4 format gate
  // unblocks these BY EXTENSION and the decoder handles them, so thread the
  // filename through and let the extension backstop the MIME path: a NEF/ARW/
  // DNG/ORF/RW2 TIFF header with a generic/empty MIME but a known-RAW
  // declaredName must `pass`. A plain .tif/.tiff (or no RAW extension) stays
  // needs_desktop_scan; CR3/exotic extensions stay desktop-only.
  // ───────────────────────────────────────────────────────────────────────

  it.each([
    ["IMG_1234.nef", "nef"],
    ["IMG_1234.NEF", "nef"],
    ["DSC09876.arw", "arw"],
    ["render.dng", "dng"],
    ["P1000001.orf", "orf"],
    ["P1010101.rw2", "rw2"],
  ])(
    "passes a TIFF-magic RAW with generic image/tiff MIME but declaredName %s as %s",
    (declaredName, format) => {
      const result = screen(tiffLE(), { declaredType: "image/tiff", declaredName });
      expect(result.decision).toBe("pass");
      expect(result.detectedFormat).toBe(format);
    },
  );

  it("passes a TIFF-magic RAW with empty MIME but a known-RAW declaredName", () => {
    const result = screen(tiffLE(), { declaredType: "", declaredName: "capture.NEF" });
    expect(result.decision).toBe("pass");
    expect(result.detectedFormat).toBe("nef");
  });

  it("prefers the vendor MIME over the extension when both resolve", () => {
    // MIME says ARW; the extension backstop only fires when the MIME path
    // fails, so the MIME-derived token wins.
    const result = screen(tiffLE(), { declaredType: "image/x-sony-arw", declaredName: "x.nef" });
    expect(result.decision).toBe("pass");
    expect(result.detectedFormat).toBe("arw");
  });

  it("keeps a plain photo.tiff (image/tiff) as needs_desktop_scan even with a name", () => {
    const result = screen(tiffLE(), { declaredType: "image/tiff", declaredName: "photo.tiff" });
    expect(result.decision).toBe("needs_desktop_scan");
    expect(result.detectedFormat).toBe("tiff");
  });

  it("keeps a plain photo.tif as needs_desktop_scan", () => {
    const result = screen(tiffLE(), { declaredType: "image/tiff", declaredName: "photo.tif" });
    expect(result.decision).toBe("needs_desktop_scan");
    expect(result.detectedFormat).toBe("tiff");
  });

  it("keeps a TIFF-magic file with a non-RAW extension as needs_desktop_scan", () => {
    const result = screen(tiffLE(), { declaredType: "", declaredName: "scan.dat" });
    expect(result.decision).toBe("needs_desktop_scan");
    expect(result.detectedFormat).toBe("tiff");
  });

  it("keeps a TIFF-magic file with no extension as needs_desktop_scan", () => {
    const result = screen(tiffLE(), { declaredType: "", declaredName: "scanwithnoext" });
    expect(result.decision).toBe("needs_desktop_scan");
    expect(result.detectedFormat).toBe("tiff");
  });

  it.each(["capture.cr3", "capture.crw", "capture.x3f", "capture.pef", "capture.nrw"])(
    "keeps desktop-only RAW extension %s as needs_desktop_scan via the TIFF backstop",
    (declaredName) => {
      // These extensions are NOT in the browser-decodable RAW set, so even with
      // TIFF magic + a declaredName they must stay desktop-only.
      const result = screen(tiffLE(), { declaredType: "image/tiff", declaredName });
      expect(result.decision).toBe("needs_desktop_scan");
      expect(result.detectedFormat).toBe("tiff");
    },
  );

  it("keeps a big-endian TIFF (image/tiff) as needs_desktop_scan", () => {
    const tiffBE = new Uint8Array([
      0x4d, 0x4d, 0x00, 0x2a, // TIFF big-endian
      0x00, 0x00, 0x00, 0x08,
    ]);
    const result = screen(tiffBE, { declaredType: "image/tiff" });
    expect(result.decision).toBe("needs_desktop_scan");
    expect(result.detectedFormat).toBe("tiff");
  });

  it("keeps Canon CR3 (ftyp crx ) as needs_desktop_scan", () => {
    const cr3 = isoBmffFtyp("crx ");
    const result = screen(cr3, { declaredType: "image/x-canon-cr3" });
    expect(result.decision).toBe("needs_desktop_scan");
    expect(result.detectedFormat).toBe("cr3");
  });

  it("blocks a PDF (non-image) rather than treating it as a desktop format", () => {
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // "%PDF-1.7"
    const result = screen(pdf, { declaredType: "application/pdf" });
    expect(result.decision).toBe("block");
    expect(result.detectedFormat).toBe("unknown");
    expect(result.findings[0].category).toBe("unsupported_format");
  });

  it("blocks a ZIP (non-image) rather than treating it as a desktop format", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]); // "PK\x03\x04"
    const result = screen(zip, { declaredType: "application/zip" });
    expect(result.decision).toBe("block");
    expect(result.detectedFormat).toBe("unknown");
  });

  it("blocks a JPEG that does not start with SOI", () => {
    const bogus = new Uint8Array([0xff, 0x00, 0xff, 0xd8]); // SOI NOT at offset 0
    const result = screen(bogus, { declaredType: "image/jpeg" });
    // screen() dispatches on the first two bytes so bogus[0]=0xFF bogus[1]=0x00
    // is not dispatched to the JPEG parser — falls through to unknown.
    expect(result.decision).toBe("block");
  });
});
