import { afterEach, describe, expect, it, vi } from "vitest";

import {
  decodeRaw,
  endsWithJpegEoi,
  extractRafPreview,
  extractRawPreview,
  extractTiffRawPreview,
  hasJpegSoi,
  selectLargestJpegCandidate,
  type JpegCandidate,
} from "../raw-preview";

// ---------------------------------------------------------------------------
// Synthetic fixture builders. We hand-write real little-endian TIFF structures
// so the REAL utif2 parser walks them — this exercises the actual IFD/SubIFD
// traversal and preview-selection logic end to end (no utif2 mock).
// ---------------------------------------------------------------------------

/** A minimal valid JPEG: SOI + a few filler bytes + EOI, of the given size. */
function jpegBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(Math.max(4, size));
  bytes[0] = 0xff;
  bytes[1] = 0xd8; // SOI
  for (let i = 2; i < bytes.length - 2; i += 1) bytes[i] = 0x42;
  bytes[bytes.length - 2] = 0xff;
  bytes[bytes.length - 1] = 0xd9; // EOI
  return bytes;
}

function writeUint16LE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}
function writeUint32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

type IfdEntry = { tag: number; type: number; count: number; value: number };

/**
 * Builds a little-endian TIFF with two IFDs chained via the next-IFD pointer:
 *   IFD0  → JPEGInterchangeFormat/Length pointing at the THUMBNAIL JPEG.
 *   IFD0 also declares a SubIFD (t330) → the SubIFD's
 *          JPEGInterchangeFormat/Length point at the larger PREVIEW JPEG.
 * Both JPEGs are appended after all IFD bytes; their absolute offsets are wired
 * into the tag values, exactly as a real CR2/NEF/ARW would.
 */
function buildTiffWithPreviewAndThumb(opts: {
  thumb: Uint8Array;
  preview: Uint8Array;
}): ArrayBuffer {
  const { thumb, preview } = opts;

  // Layout plan (all offsets little-endian, absolute from buffer start):
  //   0x00  TIFF header (8 bytes): "II" 2A 00 + IFD0 offset.
  //   0x08  IFD0.
  //   ....  SubIFD.
  //   ....  thumbnail JPEG.
  //   ....  preview JPEG.
  const headerSize = 8;
  const ifd0Offset = headerSize;

  // IFD0 entries: JPEGInterchangeFormat(513), JPEGInterchangeFormatLength(514),
  //               SubIFDs(330). Each IFD: 2-byte count + N*12 entries + 4-byte next.
  const ifd0EntryCount = 3;
  const ifd0Size = 2 + ifd0EntryCount * 12 + 4;
  const subIfdOffset = ifd0Offset + ifd0Size;

  // SubIFD entries: Compression(259)=JPEG, StripOffsets(273), StripByteCounts(279).
  const subEntryCount = 3;
  const subIfdSize = 2 + subEntryCount * 12 + 4;

  const thumbOffset = subIfdOffset + subIfdSize;
  const previewOffset = thumbOffset + thumb.length;
  const total = previewOffset + preview.length;

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // TIFF header.
  u8[0] = 0x49; // 'I'
  u8[1] = 0x49; // 'I'
  writeUint16LE(view, 2, 42); // magic 0x2A
  writeUint32LE(view, 4, ifd0Offset);

  // IFD0.
  const ifd0Entries: IfdEntry[] = [
    { tag: 0x0201, type: 4, count: 1, value: thumbOffset }, // JPEGInterchangeFormat (513)
    { tag: 0x0202, type: 4, count: 1, value: thumb.length }, // JPEGInterchangeFormatLength (514)
    { tag: 0x014a, type: 4, count: 1, value: subIfdOffset }, // SubIFDs (330)
  ];
  writeIfd(view, ifd0Offset, ifd0Entries, 0);

  // SubIFD: full-res preview as a JPEG-compressed strip.
  const subEntries: IfdEntry[] = [
    { tag: 0x0103, type: 3, count: 1, value: 7 }, // Compression (259) = 7 (JPEG)
    { tag: 0x0111, type: 4, count: 1, value: previewOffset }, // StripOffsets (273)
    { tag: 0x0117, type: 4, count: 1, value: preview.length }, // StripByteCounts (279)
  ];
  writeIfd(view, subIfdOffset, subEntries, 0);

  // Embedded JPEG bytes.
  u8.set(thumb, thumbOffset);
  u8.set(preview, previewOffset);

  return buffer;
}

function writeIfd(
  view: DataView,
  offset: number,
  entries: IfdEntry[],
  nextIfdOffset: number,
): void {
  writeUint16LE(view, offset, entries.length);
  let pos = offset + 2;
  for (const entry of entries) {
    writeUint16LE(view, pos, entry.tag);
    writeUint16LE(view, pos + 2, entry.type);
    writeUint32LE(view, pos + 4, entry.count);
    // For SHORT (type 3, 1 value) and LONG (type 4, 1 value) the value fits in
    // the 4-byte value field inline.
    writeUint32LE(view, pos + 8, entry.value);
    pos += 12;
  }
  writeUint32LE(view, pos, nextIfdOffset);
}

/**
 * Builds a RAF (Fuji) file: the `FUJIFILMCCD-RAW` magic, a big-endian uint32
 * JPEG offset at 0x54 and length at 0x58, and the embedded JPEG at that offset.
 */
function buildRaf(jpeg: Uint8Array): ArrayBuffer {
  const jpegOffset = 0x100; // comfortably past the header table.
  const total = jpegOffset + jpeg.length;
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  const magic = "FUJIFILMCCD-RAW";
  for (let i = 0; i < magic.length; i += 1) u8[i] = magic.charCodeAt(i);

  view.setUint32(0x54, jpegOffset, false); // big-endian offset
  view.setUint32(0x58, jpeg.length, false); // big-endian length
  u8.set(jpeg, jpegOffset);
  return buffer;
}

function blobFrom(buffer: ArrayBuffer, type: string): Blob {
  return new Blob([buffer], { type });
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------------
// createImageBitmap stub (jsdom has none).
// ---------------------------------------------------------------------------

type FakeBitmap = { width: number; height: number; close: ReturnType<typeof vi.fn> };

function installImageBitmap(
  impl: (source: unknown) => Promise<FakeBitmap>,
): ReturnType<typeof vi.fn> {
  const mock = vi.fn(impl);
  (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = mock;
  return mock;
}

afterEach(() => {
  delete (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// selectLargestJpegCandidate — pure unit.
// ---------------------------------------------------------------------------

describe("selectLargestJpegCandidate", () => {
  it("picks the candidate with the largest length", () => {
    // A buffer with three SOI-prefixed regions of differing sizes.
    const bytes = new Uint8Array(300);
    for (const off of [0, 50, 150]) {
      bytes[off] = 0xff;
      bytes[off + 1] = 0xd8;
    }
    const candidates: JpegCandidate[] = [
      { offset: 0, length: 40 },
      { offset: 50, length: 90 }, // largest
      { offset: 150, length: 30 },
    ];
    expect(selectLargestJpegCandidate(candidates, bytes)).toEqual({ offset: 50, length: 90 });
  });

  it("ignores candidates that do not start with the JPEG SOI marker", () => {
    const bytes = new Uint8Array(200);
    bytes[0] = 0xff;
    bytes[1] = 0xd8; // valid SOI, small
    // offset 50 is NOT SOI (zeros), but is the largest by length → must be skipped.
    const candidates: JpegCandidate[] = [
      { offset: 0, length: 20 },
      { offset: 50, length: 120 },
    ];
    expect(selectLargestJpegCandidate(candidates, bytes)).toEqual({ offset: 0, length: 20 });
  });

  it("ignores candidates whose range exceeds the buffer", () => {
    const bytes = new Uint8Array(40);
    bytes[0] = 0xff;
    bytes[1] = 0xd8;
    const candidates: JpegCandidate[] = [
      { offset: 0, length: 10 },
      { offset: 0, length: 9999 }, // overruns the buffer → skipped
    ];
    expect(selectLargestJpegCandidate(candidates, bytes)).toEqual({ offset: 0, length: 10 });
  });

  it("returns null when no candidate is usable", () => {
    const bytes = new Uint8Array(64); // all zeros, no SOI anywhere
    const candidates: JpegCandidate[] = [
      { offset: 0, length: 10 },
      { offset: 20, length: 5 },
    ];
    expect(selectLargestJpegCandidate(candidates, bytes)).toBeNull();
  });

  it("returns null for an empty candidate list", () => {
    expect(selectLargestJpegCandidate([], new Uint8Array(8))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SOI / EOI marker helpers.
// ---------------------------------------------------------------------------

describe("hasJpegSoi / endsWithJpegEoi", () => {
  it("detects the SOI marker at an offset", () => {
    const bytes = new Uint8Array([0x00, 0xff, 0xd8, 0x00]);
    expect(hasJpegSoi(bytes, 1)).toBe(true);
    expect(hasJpegSoi(bytes, 0)).toBe(false);
  });

  it("detects the EOI marker at the end of a range", () => {
    const jpeg = jpegBytes(16);
    expect(endsWithJpegEoi(jpeg, 0, jpeg.length)).toBe(true);
    expect(endsWithJpegEoi(jpeg, 0, jpeg.length - 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extractTiffRawPreview — real utif2 against hand-built TIFF.
// ---------------------------------------------------------------------------

describe("extractTiffRawPreview", () => {
  it("returns the LARGER preview JPEG, not the smaller thumbnail", async () => {
    const thumb = jpegBytes(64); // small embedded thumbnail
    const preview = jpegBytes(512); // larger full-res preview in the SubIFD
    const buffer = buildTiffWithPreviewAndThumb({ thumb, preview });

    const blob = await extractTiffRawPreview(buffer);

    expect(blob).not.toBeNull();
    expect(blob!.type).toBe("image/jpeg");
    expect(blob!.size).toBe(preview.length);
    const out = await blobBytes(blob!);
    expect(hasJpegSoi(out, 0)).toBe(true);
    expect(endsWithJpegEoi(out, 0, out.length)).toBe(true);
  });

  it("returns the largest available JPEG when only a thumbnail exists", async () => {
    // Same builder but make the "preview" smaller than the "thumb" so the
    // thumbnail (in IFD0) is the largest usable JPEG.
    const thumb = jpegBytes(400);
    const preview = jpegBytes(32);
    const buffer = buildTiffWithPreviewAndThumb({ thumb, preview });

    const blob = await extractTiffRawPreview(buffer);

    expect(blob).not.toBeNull();
    expect(blob!.size).toBe(thumb.length);
  });

  it("returns null for a TIFF with no embedded JPEG", async () => {
    // Minimal valid little-endian TIFF: header + an empty IFD0, no JPEG tags.
    const buffer = new ArrayBuffer(16);
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    u8[0] = 0x49;
    u8[1] = 0x49;
    writeUint16LE(view, 2, 42);
    writeUint32LE(view, 4, 8); // IFD0 at offset 8
    writeUint16LE(view, 8, 0); // zero entries
    writeUint32LE(view, 10, 0); // no next IFD

    const blob = await extractTiffRawPreview(buffer);
    expect(blob).toBeNull();
  });

  it("returns null on a parse error (garbage bytes)", async () => {
    const buffer = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]).buffer;
    await expect(extractTiffRawPreview(buffer)).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractRafPreview — hand-built Fuji header.
// ---------------------------------------------------------------------------

describe("extractRafPreview", () => {
  it("extracts the embedded JPEG named by the RAF header table", () => {
    const jpeg = jpegBytes(256);
    const buffer = buildRaf(jpeg);

    const blob = extractRafPreview(buffer);

    expect(blob).not.toBeNull();
    expect(blob!.type).toBe("image/jpeg");
    expect(blob!.size).toBe(jpeg.length);
  });

  it("returns null when the magic is not RAF", () => {
    const buffer = new Uint8Array(0x100).buffer; // zeros, no magic
    expect(extractRafPreview(buffer)).toBeNull();
  });

  it("returns null when the header points outside the buffer", () => {
    const buffer = new ArrayBuffer(0x60);
    const view = new DataView(buffer);
    const u8 = new Uint8Array(buffer);
    const magic = "FUJIFILMCCD-RAW";
    for (let i = 0; i < magic.length; i += 1) u8[i] = magic.charCodeAt(i);
    view.setUint32(0x54, 0x9000, false); // offset way past the buffer
    view.setUint32(0x58, 1024, false);
    expect(extractRafPreview(buffer)).toBeNull();
  });

  it("returns null when the named bytes are not a JPEG (no SOI)", () => {
    const jpeg = jpegBytes(64);
    const buffer = buildRaf(jpeg);
    // Corrupt the SOI marker at the JPEG offset.
    new Uint8Array(buffer)[0x100] = 0x00;
    expect(extractRafPreview(buffer)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractRawPreview — detection routing + graceful null contract.
// ---------------------------------------------------------------------------

describe("extractRawPreview", () => {
  it("routes a TIFF-based RAW (by extension) through the TIFF extractor", async () => {
    const thumb = jpegBytes(64);
    const preview = jpegBytes(512);
    const buffer = buildTiffWithPreviewAndThumb({ thumb, preview });
    const file = blobFrom(buffer, "application/octet-stream");

    const blob = await extractRawPreview(file, "cr2");
    expect(blob).not.toBeNull();
    expect(blob!.size).toBe(preview.length);
  });

  it("does not trust file.type — routes by extension even with a bogus MIME", async () => {
    const buffer = buildTiffWithPreviewAndThumb({
      thumb: jpegBytes(32),
      preview: jpegBytes(300),
    });
    // A misleading MIME type must NOT change routing; the .nef extension wins.
    const file = blobFrom(buffer, "image/jpeg");
    const blob = await extractRawPreview(file, ".NEF");
    expect(blob).not.toBeNull();
    expect(blob!.size).toBe(300);
  });

  it("routes a RAF file by its magic regardless of extension", async () => {
    const jpeg = jpegBytes(200);
    const file = blobFrom(buildRaf(jpeg), "application/octet-stream");
    const blob = await extractRawPreview(file); // no ext provided
    expect(blob).not.toBeNull();
    expect(blob!.size).toBe(jpeg.length);
  });

  it("returns null for CR3 / ISO-BMFF (ftyp) → Desktop fallback", async () => {
    // ....ftyp crx ... — an ISO-BMFF container like CR3.
    const bytes = new Uint8Array(32);
    bytes.set([0x00, 0x00, 0x00, 0x18], 0); // box size
    bytes.set([0x66, 0x74, 0x79, 0x70], 4); // "ftyp"
    bytes.set([0x63, 0x72, 0x78, 0x20], 8); // "crx "
    const file = blobFrom(bytes.buffer, "image/x-canon-cr3");
    await expect(extractRawPreview(file, "cr3")).resolves.toBeNull();
  });

  it("returns null for a plain TIFF with a non-RAW extension", async () => {
    const buffer = buildTiffWithPreviewAndThumb({
      thumb: jpegBytes(32),
      preview: jpegBytes(300),
    });
    // TIFF magic present, but extension is not a known RAW → leave to other paths.
    const file = blobFrom(buffer, "image/tiff");
    await expect(extractRawPreview(file, "xyz")).resolves.toBeNull();
  });

  it("returns null for empty / garbage input without throwing", async () => {
    await expect(extractRawPreview(blobFrom(new ArrayBuffer(0), ""))).resolves.toBeNull();
    await expect(
      extractRawPreview(blobFrom(new Uint8Array([1, 2, 3]).buffer, ""), "cr2"),
    ).resolves.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// decodeRaw — preview → ImageBitmap, with the null-fallback contract.
// ---------------------------------------------------------------------------

describe("decodeRaw", () => {
  it("decodes the extracted preview into an ImageBitmap", async () => {
    const probe = installImageBitmap(async () => ({ width: 4000, height: 3000, close: vi.fn() }));
    const buffer = buildTiffWithPreviewAndThumb({
      thumb: jpegBytes(64),
      preview: jpegBytes(512),
    });
    const file = blobFrom(buffer, "application/octet-stream");

    const bitmap = await decodeRaw(file, "arw");

    expect(bitmap).not.toBeNull();
    expect(bitmap!.width).toBe(4000);
    expect(probe).toHaveBeenCalledTimes(1);
    // The preview Blob (image/jpeg) is what gets handed to createImageBitmap.
    const passed = probe.mock.calls[0][0] as Blob;
    expect(passed).toBeInstanceOf(Blob);
    expect(passed.type).toBe("image/jpeg");
  });

  it("returns null when no preview can be extracted (unsupported)", async () => {
    const probe = installImageBitmap(async () => ({ width: 1, height: 1, close: vi.fn() }));
    const file = blobFrom(new Uint8Array([1, 2, 3, 4]).buffer, "");
    const bitmap = await decodeRaw(file, "cr3");
    expect(bitmap).toBeNull();
    expect(probe).not.toHaveBeenCalled();
  });

  it("returns null when createImageBitmap throws on the preview", async () => {
    installImageBitmap(async () => {
      throw new Error("decode failed");
    });
    const buffer = buildTiffWithPreviewAndThumb({
      thumb: jpegBytes(64),
      preview: jpegBytes(256),
    });
    const file = blobFrom(buffer, "application/octet-stream");
    await expect(decodeRaw(file, "dng")).resolves.toBeNull();
  });

  it("returns null when createImageBitmap is unavailable (non-DOM)", async () => {
    delete (globalThis as unknown as { createImageBitmap?: unknown }).createImageBitmap;
    const buffer = buildTiffWithPreviewAndThumb({
      thumb: jpegBytes(64),
      preview: jpegBytes(256),
    });
    const file = blobFrom(buffer, "application/octet-stream");
    await expect(decodeRaw(file, "orf")).resolves.toBeNull();
  });
});
