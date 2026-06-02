export type SourceImageDimensions = {
  width: number;
  height: number;
};

const METADATA_READ_BUDGET_BYTES = 512 * 1024;

export async function extractSourceImageMetadata(
  file: File,
  dimensions?: SourceImageDimensions,
): Promise<Record<string, unknown>> {
  const metadata: Record<string, unknown> = {
    original_filename: file.name,
    original_content_type: file.type || "application/octet-stream",
    original_size_bytes: file.size,
  };
  if (file.lastModified > 0) {
    metadata.original_last_modified = new Date(file.lastModified).toISOString();
  }
  if (dimensions) {
    metadata.image_width = dimensions.width;
    metadata.image_height = dimensions.height;
  }

  const embedded = await extractEmbeddedMetadata(file);
  return { ...embedded, ...metadata };
}

async function extractEmbeddedMetadata(file: File): Promise<Record<string, unknown>> {
  if (!isLikelyJPEG(file)) {
    return {};
  }
  const bytes = new Uint8Array(await file.slice(0, METADATA_READ_BUDGET_BYTES).arrayBuffer());
  return extractJPEGExifMetadata(bytes);
}

function isLikelyJPEG(file: File): boolean {
  return file.type === "image/jpeg" || file.type === "image/jpg" || /\.jpe?g$/i.test(file.name);
}

export function extractJPEGExifMetadata(bytes: Uint8Array): Record<string, unknown> {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return {};
  }

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return {};
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xda || marker === 0xd9) break;
    if (offset + 2 > bytes.length) break;
    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2) break;
    const segmentStart = offset + 2;
    const segmentEnd = offset + segmentLength;
    if (segmentEnd > bytes.length) break;
    if (marker === 0xe1 && hasExifHeader(bytes, segmentStart)) {
      return parseExifTIFF(bytes, segmentStart + 6, segmentEnd);
    }
    offset = segmentEnd;
  }
  return {};
}

function parseExifTIFF(bytes: Uint8Array, tiffStart: number, limit: number): Record<string, unknown> {
  if (tiffStart + 8 > limit) return {};
  const littleEndian = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
  const bigEndian = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
  if (!littleEndian && !bigEndian) return {};

  const read16 = (offset: number) => littleEndian ? readUint16LE(bytes, offset) : readUint16BE(bytes, offset);
  const read32 = (offset: number) => littleEndian ? readUint32LE(bytes, offset) : readUint32BE(bytes, offset);
  if (read16(tiffStart + 2) !== 42) return {};

  const metadata: Record<string, unknown> = {};
  const firstIFDOffset = read32(tiffStart + 4);
  const exifIFDOffset = parseIFD(bytes, tiffStart, tiffStart + firstIFDOffset, limit, read16, read32, metadata);
  if (exifIFDOffset > 0) {
    parseIFD(bytes, tiffStart, tiffStart + exifIFDOffset, limit, read16, read32, metadata);
  }
  return metadata;
}

function parseIFD(
  bytes: Uint8Array,
  tiffStart: number,
  ifdOffset: number,
  limit: number,
  read16: (offset: number) => number,
  read32: (offset: number) => number,
  metadata: Record<string, unknown>,
): number {
  if (ifdOffset + 2 > limit) return 0;
  const entryCount = read16(ifdOffset);
  const entriesStart = ifdOffset + 2;
  let exifIFDOffset = 0;

  for (let i = 0; i < entryCount; i += 1) {
    const entry = entriesStart + i * 12;
    if (entry + 12 > limit) break;
    const tag = read16(entry);
    const type = read16(entry + 2);
    const count = read32(entry + 4);
    const valueOffset = resolveValueOffset(tiffStart, entry + 8, type, count, read32);
    if (valueOffset < 0 || valueOffset >= limit) continue;

    switch (tag) {
      case 0x010f:
        setString(metadata, "camera_make", readASCII(bytes, valueOffset, count, limit));
        break;
      case 0x0110:
        setString(metadata, "camera_model", readASCII(bytes, valueOffset, count, limit));
        break;
      case 0x0112:
        metadata.exif_orientation = read16(valueOffset);
        break;
      case 0x0131:
        setString(metadata, "software", readASCII(bytes, valueOffset, count, limit));
        break;
      case 0x0132:
        setString(metadata, "capture_datetime", readASCII(bytes, valueOffset, count, limit));
        break;
      case 0x829a:
        metadata.exposure_time = readRational(valueOffset, limit, read32);
        break;
      case 0x829d:
        metadata.f_number = readRational(valueOffset, limit, read32);
        break;
      case 0x8769:
        exifIFDOffset = read32(entry + 8);
        break;
      case 0x8827:
        metadata.iso_speed = read16(valueOffset);
        break;
      case 0x9003:
        setString(metadata, "capture_datetime_original", readASCII(bytes, valueOffset, count, limit));
        break;
      case 0x920a:
        metadata.focal_length = readRational(valueOffset, limit, read32);
        break;
      case 0xa002:
        metadata.pixel_width = readNumericValue(type, valueOffset, read16, read32);
        break;
      case 0xa003:
        metadata.pixel_height = readNumericValue(type, valueOffset, read16, read32);
        break;
      case 0xa434:
        setString(metadata, "lens_model", readASCII(bytes, valueOffset, count, limit));
        break;
      default:
        break;
    }
  }
  return exifIFDOffset;
}

function resolveValueOffset(
  tiffStart: number,
  valueFieldOffset: number,
  type: number,
  count: number,
  read32: (offset: number) => number,
): number {
  const byteLength = typeByteLength(type) * count;
  if (byteLength <= 4) return valueFieldOffset;
  return tiffStart + read32(valueFieldOffset);
}

function typeByteLength(type: number): number {
  switch (type) {
    case 1:
    case 2:
    case 7:
      return 1;
    case 3:
      return 2;
    case 4:
    case 9:
      return 4;
    case 5:
    case 10:
      return 8;
    default:
      return 0;
  }
}

function readASCII(bytes: Uint8Array, offset: number, count: number, limit: number): string {
  const end = Math.min(limit, offset + count);
  let out = "";
  for (let i = offset; i < end; i += 1) {
    if (bytes[i] === 0) break;
    out += String.fromCharCode(bytes[i]);
  }
  return out.trim();
}

function readNumericValue(
  type: number,
  valueOffset: number,
  read16: (offset: number) => number,
  read32: (offset: number) => number,
): number | undefined {
  if (type === 3) return read16(valueOffset);
  if (type === 4) return read32(valueOffset);
  return undefined;
}

function readRational(offset: number, limit: number, read32: (offset: number) => number): number | undefined {
  if (offset + 8 > limit) return undefined;
  const numerator = read32(offset);
  const denominator = read32(offset + 4);
  if (denominator === 0) return undefined;
  return Number((numerator / denominator).toFixed(6));
}

function setString(metadata: Record<string, unknown>, key: string, value: string): void {
  if (value) metadata[key] = value;
}

function hasExifHeader(bytes: Uint8Array, offset: number): boolean {
  return bytes[offset] === 0x45 &&
    bytes[offset + 1] === 0x78 &&
    bytes[offset + 2] === 0x69 &&
    bytes[offset + 3] === 0x66 &&
    bytes[offset + 4] === 0x00 &&
    bytes[offset + 5] === 0x00;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}
