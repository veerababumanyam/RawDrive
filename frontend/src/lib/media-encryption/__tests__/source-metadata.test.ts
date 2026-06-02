import { describe, expect, it } from "vitest";
import { extractSourceImageMetadata } from "../source-metadata";

describe("extractSourceImageMetadata", () => {
  it("extracts source-side JPEG EXIF fields without server plaintext access", async () => {
    const jpeg = buildJPEGWithExif();
    const payload = new ArrayBuffer(jpeg.byteLength);
    new Uint8Array(payload).set(jpeg);
    const file = new File([payload], "wedding.jpg", {
      type: "image/jpeg",
      lastModified: Date.UTC(2026, 0, 1, 12, 30, 0),
    });

    const metadata = await extractSourceImageMetadata(file, { width: 4000, height: 3000 });

    expect(metadata.original_filename).toBe("wedding.jpg");
    expect(metadata.original_content_type).toBe("image/jpeg");
    expect(metadata.original_size_bytes).toBe(file.size);
    expect(metadata.image_width).toBe(4000);
    expect(metadata.image_height).toBe(3000);
    expect(metadata.camera_make).toBe("Canon");
    expect(metadata.camera_model).toBe("EOS R5");
    expect(metadata.exif_orientation).toBe(6);
    expect(metadata.capture_datetime_original).toBe("2026:01:01 12:30:00");
  });
});

function buildJPEGWithExif(): Uint8Array {
  const tiff = new Uint8Array(160);
  const stringsOffset = 92;
  writeAscii(tiff, stringsOffset, "Canon");
  writeAscii(tiff, stringsOffset + 8, "EOS R5");
  writeAscii(tiff, stringsOffset + 20, "2026:01:01 12:30:00");

  tiff[0] = 0x4d;
  tiff[1] = 0x4d;
  writeU16(tiff, 2, 42);
  writeU32(tiff, 4, 8);

  writeU16(tiff, 8, 4);
  writeEntry(tiff, 10, 0x010f, 2, 6, stringsOffset);
  writeEntry(tiff, 22, 0x0110, 2, 7, stringsOffset + 8);
  writeEntry(tiff, 34, 0x0112, 3, 1, 6, true);
  writeEntry(tiff, 46, 0x8769, 4, 1, 62, true);
  writeU32(tiff, 58, 0);

  writeU16(tiff, 62, 1);
  writeEntry(tiff, 64, 0x9003, 2, 20, stringsOffset + 20);
  writeU32(tiff, 76, 0);

  const exifHeader = bytes("Exif\u0000\u0000");
  const app1Length = 2 + exifHeader.length + tiff.length;
  return concat(
    new Uint8Array([0xff, 0xd8, 0xff, 0xe1, app1Length >> 8, app1Length & 0xff]),
    exifHeader,
    tiff,
    new Uint8Array([0xff, 0xd9]),
  );
}

function writeEntry(
  bytesOut: Uint8Array,
  offset: number,
  tag: number,
  type: number,
  count: number,
  value: number,
  inline = false,
): void {
  writeU16(bytesOut, offset, tag);
  writeU16(bytesOut, offset + 2, type);
  writeU32(bytesOut, offset + 4, count);
  if (inline && type === 3) {
    writeU16(bytesOut, offset + 8, value);
    return;
  }
  writeU32(bytesOut, offset + 8, value);
}

function writeAscii(out: Uint8Array, offset: number, value: string): void {
  const encoded = bytes(`${value}\u0000`);
  out.set(encoded, offset);
}

function writeU16(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >> 8) & 0xff;
  out[offset + 1] = value & 0xff;
}

function writeU32(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >> 24) & 0xff;
  out[offset + 1] = (value >> 16) & 0xff;
  out[offset + 2] = (value >> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
