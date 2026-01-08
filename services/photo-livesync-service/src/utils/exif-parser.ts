/**
 * EXIF Metadata Parser Utility.
 *
 * Provides comprehensive EXIF metadata extraction for photos imported from
 * cloud storage providers (Google Photos, iCloud, Dropbox, Amazon Photos, OneDrive).
 *
 * Features:
 * - Extracts standard EXIF data (camera, lens, exposure, etc.)
 * - Extracts GPS coordinates and location data
 * - Extracts timestamps with timezone handling
 * - Supports JPEG, TIFF, PNG, WebP, HEIC/HEIF, and RAW formats
 * - Handles XMP and IPTC metadata
 * - Graceful handling of corrupted or missing metadata
 * - Normalized output format for consistent database storage
 *
 * Supported EXIF Tags:
 * - Camera: Make, Model, Software
 * - Lens: LensModel, LensMake, FocalLength
 * - Exposure: ExposureTime, FNumber, ISO, ExposureBias
 * - Image: Width, Height, Orientation, ColorSpace
 * - GPS: Latitude, Longitude, Altitude
 * - Date/Time: DateTimeOriginal, CreateDate, ModifyDate
 * - Rights: Copyright, Artist, ImageDescription
 *
 * @module utils/exif-parser
 */

import ExifReader from 'exifreader';

// ============================================================================
// Types
// ============================================================================

/**
 * GPS coordinates with optional altitude.
 */
export interface GpsCoordinates {
  /** Latitude in decimal degrees (positive = North, negative = South) */
  latitude: number;
  /** Longitude in decimal degrees (positive = East, negative = West) */
  longitude: number;
  /** Altitude in meters above sea level (optional) */
  altitude?: number;
  /** Altitude reference: 'above' or 'below' sea level */
  altitudeRef?: 'above' | 'below';
}

/**
 * Camera and lens information.
 */
export interface CameraInfo {
  /** Camera manufacturer (e.g., 'Canon', 'Nikon', 'Sony') */
  make?: string;
  /** Camera model (e.g., 'Canon EOS R5') */
  model?: string;
  /** Software used to process the image */
  software?: string;
  /** Lens manufacturer */
  lensMake?: string;
  /** Lens model */
  lensModel?: string;
  /** Serial number of the camera */
  serialNumber?: string;
}

/**
 * Exposure settings for the photo.
 */
export interface ExposureInfo {
  /** Exposure time in seconds (e.g., 0.001 for 1/1000s) */
  exposureTime?: number;
  /** Exposure time as a human-readable string (e.g., '1/1000') */
  exposureTimeFormatted?: string;
  /** F-number / aperture (e.g., 2.8) */
  fNumber?: number;
  /** ISO sensitivity (e.g., 100, 400, 3200) */
  iso?: number;
  /** Exposure compensation in EV (e.g., -0.67, 0, +1.0) */
  exposureBias?: number;
  /** Exposure mode: 'auto', 'manual', 'aperture', 'shutter', 'program' */
  exposureMode?: string;
  /** Exposure program */
  exposureProgram?: string;
  /** Metering mode used */
  meteringMode?: string;
  /** Flash mode and status */
  flash?: string;
  /** Whether flash was fired */
  flashFired?: boolean;
  /** White balance mode */
  whiteBalance?: string;
}

/**
 * Lens and focal length information.
 */
export interface LensInfo {
  /** Focal length in mm */
  focalLength?: number;
  /** 35mm equivalent focal length */
  focalLength35mm?: number;
  /** Lens model name */
  model?: string;
  /** Lens manufacturer */
  make?: string;
  /** Minimum focal length (for zoom lenses) */
  minFocalLength?: number;
  /** Maximum focal length (for zoom lenses) */
  maxFocalLength?: number;
  /** Maximum aperture at minimum focal length */
  maxApertureMin?: number;
  /** Maximum aperture at maximum focal length */
  maxApertureMax?: number;
}

/**
 * Image dimensions and orientation.
 */
export interface ImageDimensions {
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
  /** EXIF orientation value (1-8) */
  orientation?: number;
  /** Human-readable orientation description */
  orientationDescription?: string;
  /** Color space (e.g., 'sRGB', 'Adobe RGB') */
  colorSpace?: string;
  /** Bit depth per channel */
  bitDepth?: number;
  /** X resolution in DPI */
  xResolution?: number;
  /** Y resolution in DPI */
  yResolution?: number;
}

/**
 * Timestamp information with timezone.
 */
export interface TimestampInfo {
  /** Original capture date/time (when the photo was taken) */
  dateTimeOriginal?: Date;
  /** Date/time when the image was digitized */
  dateTimeDigitized?: Date;
  /** Date/time when the file was last modified */
  dateTimeModified?: Date;
  /** Timezone offset in format '+/-HH:MM' or undefined */
  timezoneOffset?: string;
  /** Raw EXIF date string for dateTimeOriginal */
  rawDateTime?: string;
  /** GPS timestamp if available */
  gpsTimestamp?: Date;
}

/**
 * Copyright and creator information.
 */
export interface RightsInfo {
  /** Copyright notice */
  copyright?: string;
  /** Artist/photographer name */
  artist?: string;
  /** Image title */
  title?: string;
  /** Image description/caption */
  description?: string;
  /** User-defined comment */
  comment?: string;
  /** Keywords/tags associated with the image */
  keywords?: string[];
  /** Rating (0-5 stars) */
  rating?: number;
}

/**
 * Complete parsed EXIF metadata.
 */
export interface ExifMetadata {
  /** Camera and lens information */
  camera: CameraInfo;
  /** Exposure settings */
  exposure: ExposureInfo;
  /** Lens information */
  lens: LensInfo;
  /** Image dimensions and orientation */
  dimensions: ImageDimensions;
  /** GPS coordinates */
  gps?: GpsCoordinates;
  /** Timestamp information */
  timestamps: TimestampInfo;
  /** Copyright and creator info */
  rights: RightsInfo;
  /** File format detected */
  format?: string;
  /** Whether the image has been edited/modified */
  isEdited?: boolean;
  /** Raw EXIF tags for advanced usage */
  raw?: Record<string, unknown>;
}

/**
 * Options for EXIF parsing.
 */
export interface ExifParseOptions {
  /** Include raw EXIF data in the result (default: false) */
  includeRaw?: boolean;
  /** Include thumbnail data if present (default: false) */
  includeThumbnail?: boolean;
  /** Throw on parse errors instead of returning partial data (default: false) */
  throwOnError?: boolean;
  /** Extended parsing for XMP data (default: true) */
  parseXmp?: boolean;
  /** Extended parsing for IPTC data (default: true) */
  parseIptc?: boolean;
}

/**
 * Result of EXIF parsing operation.
 */
export interface ExifParseResult {
  /** Whether parsing was successful */
  success: boolean;
  /** Parsed metadata (may be partial on errors) */
  metadata: ExifMetadata;
  /** Errors encountered during parsing */
  errors: ExifParseError[];
  /** Warnings (non-fatal issues) */
  warnings: string[];
  /** Thumbnail data if requested and available */
  thumbnail?: Buffer;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * EXIF orientation values and their meanings.
 */
export const ORIENTATION_MAP: Record<number, string> = {
  1: 'Normal',
  2: 'Mirrored horizontal',
  3: 'Rotated 180°',
  4: 'Mirrored vertical',
  5: 'Mirrored horizontal and rotated 270°',
  6: 'Rotated 90° CW',
  7: 'Mirrored horizontal and rotated 90°',
  8: 'Rotated 270° CW',
};

/**
 * Exposure program values and their meanings.
 */
export const EXPOSURE_PROGRAM_MAP: Record<number, string> = {
  0: 'Not defined',
  1: 'Manual',
  2: 'Program AE',
  3: 'Aperture priority',
  4: 'Shutter priority',
  5: 'Creative (slow speed)',
  6: 'Action (high speed)',
  7: 'Portrait',
  8: 'Landscape',
};

/**
 * Metering mode values and their meanings.
 */
export const METERING_MODE_MAP: Record<number, string> = {
  0: 'Unknown',
  1: 'Average',
  2: 'Center-weighted',
  3: 'Spot',
  4: 'Multi-spot',
  5: 'Multi-segment',
  6: 'Partial',
  255: 'Other',
};

/**
 * White balance values and their meanings.
 */
export const WHITE_BALANCE_MAP: Record<number, string> = {
  0: 'Auto',
  1: 'Manual',
};

/**
 * Flash values (simplified - actual values are bitfields).
 */
export const FLASH_MAP: Record<number, { fired: boolean; description: string }> = {
  0x00: { fired: false, description: 'No flash' },
  0x01: { fired: true, description: 'Flash fired' },
  0x05: { fired: true, description: 'Flash fired, strobe return not detected' },
  0x07: { fired: true, description: 'Flash fired, strobe return detected' },
  0x08: { fired: false, description: 'Flash did not fire, compulsory mode' },
  0x09: { fired: true, description: 'Flash fired, compulsory mode' },
  0x0d: { fired: true, description: 'Flash fired, compulsory mode, return not detected' },
  0x0f: { fired: true, description: 'Flash fired, compulsory mode, return detected' },
  0x10: { fired: false, description: 'Flash did not fire, compulsory suppression' },
  0x14: { fired: false, description: 'Flash did not fire, auto mode' },
  0x18: { fired: false, description: 'No flash function' },
  0x19: { fired: true, description: 'Flash fired, auto mode' },
  0x1d: { fired: true, description: 'Flash fired, auto mode, return not detected' },
  0x1f: { fired: true, description: 'Flash fired, auto mode, return detected' },
  0x41: { fired: true, description: 'Flash fired, red-eye reduction' },
  0x45: { fired: true, description: 'Flash fired, red-eye reduction, return not detected' },
  0x47: { fired: true, description: 'Flash fired, red-eye reduction, return detected' },
  0x49: { fired: true, description: 'Flash fired, compulsory, red-eye reduction' },
  0x4d: { fired: true, description: 'Flash fired, compulsory, red-eye reduction, return not detected' },
  0x4f: { fired: true, description: 'Flash fired, compulsory, red-eye reduction, return detected' },
  0x59: { fired: true, description: 'Flash fired, auto, red-eye reduction' },
  0x5d: { fired: true, description: 'Flash fired, auto, red-eye reduction, return not detected' },
  0x5f: { fired: true, description: 'Flash fired, auto, red-eye reduction, return detected' },
};

/**
 * Color space values and their meanings.
 */
export const COLOR_SPACE_MAP: Record<number, string> = {
  1: 'sRGB',
  2: 'Adobe RGB',
  65535: 'Uncalibrated',
};

/**
 * Supported file extensions for EXIF parsing.
 */
export const SUPPORTED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.tif',
  '.tiff',
  '.png',
  '.webp',
  '.heic',
  '.heif',
  '.avif',
  '.arw',  // Sony RAW
  '.cr2',  // Canon RAW
  '.cr3',  // Canon RAW (newer)
  '.nef',  // Nikon RAW
  '.orf',  // Olympus RAW
  '.raf',  // Fujifilm RAW
  '.rw2',  // Panasonic RAW
  '.dng',  // Digital Negative
  '.pef',  // Pentax RAW
]);

// ============================================================================
// Errors
// ============================================================================

/**
 * Base EXIF parser error.
 */
export class ExifParserError extends Error {
  /** Machine-readable error code */
  public readonly code: string;

  constructor(message: string, code: string = 'EXIF_PARSER_ERROR') {
    super(message);
    this.name = 'ExifParserError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): { error: string; code: string; message: string } {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * Error thrown when the file format is not supported.
 */
export class UnsupportedFormatError extends ExifParserError {
  public readonly format: string;

  constructor(format: string) {
    super(`Unsupported file format: ${format}`, 'UNSUPPORTED_FORMAT');
    this.name = 'UnsupportedFormatError';
    this.format = format;
  }
}

/**
 * Error thrown when EXIF data is corrupted or unreadable.
 */
export class CorruptedExifError extends ExifParserError {
  public readonly cause: Error;

  constructor(message: string, cause: Error) {
    super(message, 'CORRUPTED_EXIF');
    this.name = 'CorruptedExifError';
    this.cause = cause;
  }
}

/**
 * Error thrown when required EXIF tags are missing.
 */
export class MissingExifError extends ExifParserError {
  public readonly missingTags: string[];

  constructor(missingTags: string[]) {
    super(`Missing required EXIF tags: ${missingTags.join(', ')}`, 'MISSING_EXIF');
    this.name = 'MissingExifError';
    this.missingTags = missingTags;
  }
}

/**
 * Represents a parse error for specific EXIF section.
 */
export interface ExifParseError {
  /** Section where error occurred */
  section: 'camera' | 'exposure' | 'lens' | 'dimensions' | 'gps' | 'timestamps' | 'rights' | 'general';
  /** Error message */
  message: string;
  /** Error code */
  code: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Safely get a value from EXIF data.
 *
 * @param tags - The EXIF tags object
 * @param key - The tag name to retrieve
 * @returns The tag value or undefined
 */
function getTagValue<T = unknown>(
  tags: ExifReader.Tags | ExifReader.ExpandedTags,
  key: string
): T | undefined {
  const tag = (tags as Record<string, ExifReader.NumberTag | ExifReader.StringTag | undefined>)[key];
  if (!tag) return undefined;

  // Handle different tag value types
  if ('value' in tag) {
    return tag.value as T;
  }
  if ('description' in tag) {
    return tag.description as T;
  }
  return undefined;
}

/**
 * Get tag description (human-readable string).
 */
function getTagDescription(
  tags: ExifReader.Tags | ExifReader.ExpandedTags,
  key: string
): string | undefined {
  const tag = (tags as Record<string, { description?: string } | undefined>)[key];
  return tag?.description;
}

/**
 * Parse EXIF date string to Date object.
 *
 * EXIF date format: "YYYY:MM:DD HH:MM:SS"
 * May also include timezone offset: "YYYY:MM:DD HH:MM:SS+HH:MM"
 *
 * @param dateStr - EXIF date string
 * @returns Date object or undefined if parsing fails
 */
export function parseExifDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr || typeof dateStr !== 'string') {
    return undefined;
  }

  // EXIF format: "YYYY:MM:DD HH:MM:SS" or with timezone "YYYY:MM:DD HH:MM:SS+HH:MM"
  const exifDateRegex = /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:([+-]\d{2}:\d{2}))?$/;
  const match = dateStr.match(exifDateRegex);

  if (match) {
    const [, year, month, day, hour, minute, second, timezone] = match;

    // Build ISO date string
    let isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    if (timezone) {
      isoString += timezone;
    }

    const date = new Date(isoString);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Fallback: try parsing as-is
  const fallbackDate = new Date(dateStr);
  return isNaN(fallbackDate.getTime()) ? undefined : fallbackDate;
}

/**
 * Extract timezone offset from EXIF date string.
 *
 * @param dateStr - EXIF date string with potential timezone
 * @returns Timezone offset string (e.g., '+09:00') or undefined
 */
export function extractTimezoneOffset(dateStr: string | undefined): string | undefined {
  if (!dateStr || typeof dateStr !== 'string') {
    return undefined;
  }

  const timezoneRegex = /([+-]\d{2}:\d{2})$/;
  const match = dateStr.match(timezoneRegex);
  return match ? match[1] : undefined;
}

/**
 * Convert GPS coordinates from EXIF format to decimal degrees.
 *
 * EXIF stores GPS as degrees, minutes, seconds (DMS).
 *
 * @param dms - Array of [degrees, minutes, seconds] or single degree value
 * @param ref - Reference direction ('N', 'S', 'E', 'W')
 * @returns Decimal degrees (negative for S/W)
 */
export function convertGpsToDecimal(
  dms: number[] | number | undefined,
  ref: string | undefined
): number | undefined {
  if (dms === undefined) {
    return undefined;
  }

  let decimal: number;

  if (Array.isArray(dms)) {
    // DMS format: [degrees, minutes, seconds]
    const [degrees, minutes = 0, seconds = 0] = dms;
    decimal = degrees + minutes / 60 + seconds / 3600;
  } else if (typeof dms === 'number') {
    // Already in decimal format
    decimal = dms;
  } else {
    return undefined;
  }

  // Apply direction (negative for South and West)
  if (ref === 'S' || ref === 'W') {
    decimal = -decimal;
  }

  // Round to 6 decimal places (approximately 0.1m precision)
  return Math.round(decimal * 1000000) / 1000000;
}

/**
 * Format exposure time as a human-readable string.
 *
 * @param exposureTime - Exposure time in seconds
 * @returns Formatted string (e.g., '1/250', '0.5"', '2"')
 */
export function formatExposureTime(exposureTime: number | undefined): string | undefined {
  if (exposureTime === undefined || exposureTime <= 0) {
    return undefined;
  }

  if (exposureTime >= 1) {
    // 1 second or longer - show as seconds with quote
    return `${exposureTime}"`;
  }

  // Calculate as fraction
  const denominator = Math.round(1 / exposureTime);

  // Common shutter speeds (rounded to standard values)
  const standardSpeeds = [2, 4, 8, 15, 30, 60, 125, 250, 500, 1000, 2000, 4000, 8000];
  const closest = standardSpeeds.reduce((prev, curr) =>
    Math.abs(curr - denominator) < Math.abs(prev - denominator) ? curr : prev
  );

  // Use closest if within 10% of actual
  if (Math.abs(closest - denominator) / denominator < 0.1) {
    return `1/${closest}`;
  }

  return `1/${denominator}`;
}

/**
 * Check if a file extension is supported for EXIF parsing.
 *
 * @param filename - Filename or extension to check
 * @returns true if the format is supported
 */
export function isSupportedFormat(filename: string): boolean {
  const ext = filename.toLowerCase();
  const extension = ext.startsWith('.') ? ext : `.${ext.split('.').pop()}`;
  return SUPPORTED_EXTENSIONS.has(extension);
}

/**
 * Detect if an image has been edited based on EXIF data.
 *
 * Heuristics:
 * - Software tag contains editing software names
 * - History/edit metadata present
 * - Modified date different from original date
 *
 * @param tags - EXIF tags
 * @returns true if the image appears to have been edited
 */
function detectEditedImage(tags: ExifReader.Tags | ExifReader.ExpandedTags): boolean {
  const software = getTagDescription(tags, 'Software') || '';
  const softwareLower = software.toLowerCase();

  // Common editing software
  const editingSoftware = [
    'photoshop',
    'lightroom',
    'capture one',
    'gimp',
    'affinity',
    'luminar',
    'darktable',
    'rawtherapee',
    'dxo',
    'on1',
    'snapseed',
    'vsco',
  ];

  if (editingSoftware.some((s) => softwareLower.includes(s))) {
    return true;
  }

  // Check for XMP history (indicates edits)
  const history = getTagValue(tags, 'xmp:History');
  if (history && Array.isArray(history) && history.length > 1) {
    return true;
  }

  // Check if modified date is significantly different from original
  const dateTimeOriginal = parseExifDate(getTagDescription(tags, 'DateTimeOriginal'));
  const dateTimeModified = parseExifDate(getTagDescription(tags, 'ModifyDate'));

  if (dateTimeOriginal && dateTimeModified) {
    const diffMs = Math.abs(dateTimeModified.getTime() - dateTimeOriginal.getTime());
    // If modified more than 1 hour after original, likely edited
    if (diffMs > 3600000) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// Parser Functions
// ============================================================================

/**
 * Parse camera information from EXIF tags.
 */
function parseCameraInfo(tags: ExifReader.Tags | ExifReader.ExpandedTags): CameraInfo {
  return {
    make: getTagDescription(tags, 'Make')?.trim(),
    model: getTagDescription(tags, 'Model')?.trim(),
    software: getTagDescription(tags, 'Software')?.trim(),
    lensMake: getTagDescription(tags, 'LensMake')?.trim(),
    lensModel:
      getTagDescription(tags, 'LensModel')?.trim() ||
      getTagDescription(tags, 'Lens')?.trim(),
    serialNumber:
      getTagDescription(tags, 'SerialNumber')?.trim() ||
      getTagDescription(tags, 'BodySerialNumber')?.trim(),
  };
}

/**
 * Parse exposure information from EXIF tags.
 */
function parseExposureInfo(tags: ExifReader.Tags | ExifReader.ExpandedTags): ExposureInfo {
  const exposureTime = getTagValue<number>(tags, 'ExposureTime');
  const fNumber = getTagValue<number>(tags, 'FNumber');
  const iso =
    getTagValue<number>(tags, 'ISOSpeedRatings') ||
    getTagValue<number>(tags, 'ISO');
  const exposureBias = getTagValue<number>(tags, 'ExposureBiasValue');
  const exposureProgram = getTagValue<number>(tags, 'ExposureProgram');
  const meteringMode = getTagValue<number>(tags, 'MeteringMode');
  const flash = getTagValue<number>(tags, 'Flash');
  const whiteBalance = getTagValue<number>(tags, 'WhiteBalance');

  // Determine flash info
  let flashInfo: { fired: boolean; description: string } | undefined;
  if (flash !== undefined) {
    flashInfo = FLASH_MAP[flash] || { fired: (flash & 1) === 1, description: getTagDescription(tags, 'Flash') || 'Unknown' };
  }

  return {
    exposureTime,
    exposureTimeFormatted: formatExposureTime(exposureTime),
    fNumber,
    iso,
    exposureBias,
    exposureMode: getTagDescription(tags, 'ExposureMode'),
    exposureProgram:
      exposureProgram !== undefined
        ? EXPOSURE_PROGRAM_MAP[exposureProgram] || getTagDescription(tags, 'ExposureProgram')
        : undefined,
    meteringMode:
      meteringMode !== undefined
        ? METERING_MODE_MAP[meteringMode] || getTagDescription(tags, 'MeteringMode')
        : undefined,
    flash: flashInfo?.description,
    flashFired: flashInfo?.fired,
    whiteBalance:
      whiteBalance !== undefined
        ? WHITE_BALANCE_MAP[whiteBalance] || getTagDescription(tags, 'WhiteBalance')
        : undefined,
  };
}

/**
 * Parse lens information from EXIF tags.
 */
function parseLensInfo(tags: ExifReader.Tags | ExifReader.ExpandedTags): LensInfo {
  const focalLength = getTagValue<number>(tags, 'FocalLength');
  const focalLength35mm = getTagValue<number>(tags, 'FocalLengthIn35mmFilm');
  const lensSpec = getTagValue<number[]>(tags, 'LensSpecification');

  const lensInfo: LensInfo = {
    focalLength,
    focalLength35mm,
    model:
      getTagDescription(tags, 'LensModel')?.trim() ||
      getTagDescription(tags, 'Lens')?.trim(),
    make: getTagDescription(tags, 'LensMake')?.trim(),
  };

  // Parse LensSpecification if available (min focal, max focal, min aperture at min focal, min aperture at max focal)
  if (lensSpec && Array.isArray(lensSpec) && lensSpec.length >= 4) {
    lensInfo.minFocalLength = lensSpec[0];
    lensInfo.maxFocalLength = lensSpec[1];
    lensInfo.maxApertureMin = lensSpec[2];
    lensInfo.maxApertureMax = lensSpec[3];
  }

  return lensInfo;
}

/**
 * Parse image dimensions from EXIF tags.
 */
function parseDimensions(tags: ExifReader.Tags | ExifReader.ExpandedTags): ImageDimensions {
  const orientation = getTagValue<number>(tags, 'Orientation');
  const colorSpace = getTagValue<number>(tags, 'ColorSpace');

  return {
    width:
      getTagValue<number>(tags, 'ImageWidth') ||
      getTagValue<number>(tags, 'PixelXDimension') ||
      getTagValue<number>(tags, 'Image Width'),
    height:
      getTagValue<number>(tags, 'ImageHeight') ||
      getTagValue<number>(tags, 'PixelYDimension') ||
      getTagValue<number>(tags, 'Image Height'),
    orientation,
    orientationDescription:
      orientation !== undefined ? ORIENTATION_MAP[orientation] : undefined,
    colorSpace:
      colorSpace !== undefined
        ? COLOR_SPACE_MAP[colorSpace] || getTagDescription(tags, 'ColorSpace')
        : undefined,
    bitDepth: getTagValue<number>(tags, 'BitsPerSample'),
    xResolution: getTagValue<number>(tags, 'XResolution'),
    yResolution: getTagValue<number>(tags, 'YResolution'),
  };
}

/**
 * Parse GPS coordinates from EXIF tags.
 */
function parseGpsCoordinates(tags: ExifReader.Tags | ExifReader.ExpandedTags): GpsCoordinates | undefined {
  const latitudeRaw = getTagValue<number[]>(tags, 'GPSLatitude');
  const latitudeRef = getTagDescription(tags, 'GPSLatitudeRef');
  const longitudeRaw = getTagValue<number[]>(tags, 'GPSLongitude');
  const longitudeRef = getTagDescription(tags, 'GPSLongitudeRef');

  const latitude = convertGpsToDecimal(latitudeRaw, latitudeRef);
  const longitude = convertGpsToDecimal(longitudeRaw, longitudeRef);

  // Both latitude and longitude are required
  if (latitude === undefined || longitude === undefined) {
    return undefined;
  }

  // Validate coordinates are within valid ranges
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return undefined;
  }

  const result: GpsCoordinates = { latitude, longitude };

  // Parse altitude if available
  const altitudeRaw = getTagValue<number>(tags, 'GPSAltitude');
  const altitudeRef = getTagValue<number>(tags, 'GPSAltitudeRef');

  if (altitudeRaw !== undefined) {
    result.altitude = altitudeRaw;
    result.altitudeRef = altitudeRef === 1 ? 'below' : 'above';
  }

  return result;
}

/**
 * Parse timestamp information from EXIF tags.
 */
function parseTimestamps(tags: ExifReader.Tags | ExifReader.ExpandedTags): TimestampInfo {
  const dateTimeOriginalStr = getTagDescription(tags, 'DateTimeOriginal');
  const dateTimeDigitizedStr =
    getTagDescription(tags, 'DateTimeDigitized') ||
    getTagDescription(tags, 'CreateDate');
  const dateTimeModifiedStr =
    getTagDescription(tags, 'ModifyDate') ||
    getTagDescription(tags, 'DateTime');

  // Try to parse GPS timestamp
  let gpsTimestamp: Date | undefined;
  const gpsDateStamp = getTagDescription(tags, 'GPSDateStamp');
  const gpsTimeStamp = getTagValue<number[]>(tags, 'GPSTimeStamp');

  if (gpsDateStamp && gpsTimeStamp && Array.isArray(gpsTimeStamp)) {
    const [hours, minutes, seconds] = gpsTimeStamp;
    const gpsDateTimeStr = `${gpsDateStamp} ${hours}:${minutes}:${seconds}`;
    gpsTimestamp = parseExifDate(gpsDateTimeStr.replace(/:/g, (m, i) => (i < 10 ? ':' : '-')));
  }

  // Extract timezone from offset tags or from date string
  const timezoneOffset =
    getTagDescription(tags, 'OffsetTimeOriginal') ||
    getTagDescription(tags, 'OffsetTime') ||
    extractTimezoneOffset(dateTimeOriginalStr);

  return {
    dateTimeOriginal: parseExifDate(dateTimeOriginalStr),
    dateTimeDigitized: parseExifDate(dateTimeDigitizedStr),
    dateTimeModified: parseExifDate(dateTimeModifiedStr),
    timezoneOffset,
    rawDateTime: dateTimeOriginalStr,
    gpsTimestamp,
  };
}

/**
 * Parse rights/copyright information from EXIF tags.
 */
function parseRightsInfo(tags: ExifReader.Tags | ExifReader.ExpandedTags): RightsInfo {
  // Parse keywords (may be comma-separated or array)
  let keywords: string[] | undefined;
  const keywordsRaw = getTagDescription(tags, 'Keywords');
  if (keywordsRaw) {
    keywords = keywordsRaw.split(/[,;]/).map((k) => k.trim()).filter(Boolean);
  }

  // Parse rating (0-5)
  let rating = getTagValue<number>(tags, 'Rating');
  if (rating !== undefined && (rating < 0 || rating > 5)) {
    rating = undefined;
  }

  return {
    copyright:
      getTagDescription(tags, 'Copyright')?.trim() ||
      getTagDescription(tags, 'dc:rights')?.trim(),
    artist:
      getTagDescription(tags, 'Artist')?.trim() ||
      getTagDescription(tags, 'dc:creator')?.trim(),
    title:
      getTagDescription(tags, 'XPTitle')?.trim() ||
      getTagDescription(tags, 'dc:title')?.trim(),
    description:
      getTagDescription(tags, 'ImageDescription')?.trim() ||
      getTagDescription(tags, 'dc:description')?.trim() ||
      getTagDescription(tags, 'XPComment')?.trim(),
    comment: getTagDescription(tags, 'UserComment')?.trim(),
    keywords,
    rating,
  };
}

/**
 * Create empty metadata object with default values.
 */
function createEmptyMetadata(): ExifMetadata {
  return {
    camera: {},
    exposure: {},
    lens: {},
    dimensions: {},
    gps: undefined,
    timestamps: {},
    rights: {},
    format: undefined,
    isEdited: false,
    raw: undefined,
  };
}

// ============================================================================
// Main Parser Function
// ============================================================================

/**
 * Parse EXIF metadata from image buffer.
 *
 * @param buffer - Image file buffer
 * @param options - Parse options
 * @returns ExifParseResult with metadata and any errors
 *
 * @example
 * ```ts
 * // Basic usage
 * const result = await parseExifFromBuffer(imageBuffer);
 * if (result.success) {
 *   console.log(result.metadata.camera.model);
 *   console.log(result.metadata.gps?.latitude);
 * }
 *
 * // With options
 * const result = await parseExifFromBuffer(imageBuffer, {
 *   includeRaw: true,
 *   throwOnError: true
 * });
 * ```
 */
export async function parseExifFromBuffer(
  buffer: Buffer,
  options: ExifParseOptions = {}
): Promise<ExifParseResult> {
  const {
    includeRaw = false,
    includeThumbnail = false,
    throwOnError = false,
    parseXmp = true,
    parseIptc = true,
  } = options;

  const errors: ExifParseError[] = [];
  const warnings: string[] = [];
  let metadata = createEmptyMetadata();
  let thumbnail: Buffer | undefined;

  try {
    // Parse EXIF data using exifreader
    const tags = ExifReader.load(buffer, {
      expanded: parseXmp || parseIptc,
      includeUnknown: includeRaw,
    });

    // Merge expanded tags if available
    let mergedTags: ExifReader.Tags | ExifReader.ExpandedTags = tags;
    if ('exif' in tags || 'xmp' in tags || 'iptc' in tags) {
      // Expanded format - merge all sections
      mergedTags = {
        ...('exif' in tags ? tags.exif : {}),
        ...('file' in tags ? tags.file : {}),
        ...('xmp' in tags && parseXmp ? tags.xmp : {}),
        ...('iptc' in tags && parseIptc ? tags.iptc : {}),
        ...('icc' in tags ? tags.icc : {}),
      } as ExifReader.Tags;
    }

    // Parse each section with error handling
    try {
      metadata.camera = parseCameraInfo(mergedTags);
    } catch (err) {
      errors.push({
        section: 'camera',
        message: err instanceof Error ? err.message : 'Unknown error',
        code: 'PARSE_CAMERA_ERROR',
      });
    }

    try {
      metadata.exposure = parseExposureInfo(mergedTags);
    } catch (err) {
      errors.push({
        section: 'exposure',
        message: err instanceof Error ? err.message : 'Unknown error',
        code: 'PARSE_EXPOSURE_ERROR',
      });
    }

    try {
      metadata.lens = parseLensInfo(mergedTags);
    } catch (err) {
      errors.push({
        section: 'lens',
        message: err instanceof Error ? err.message : 'Unknown error',
        code: 'PARSE_LENS_ERROR',
      });
    }

    try {
      metadata.dimensions = parseDimensions(mergedTags);
    } catch (err) {
      errors.push({
        section: 'dimensions',
        message: err instanceof Error ? err.message : 'Unknown error',
        code: 'PARSE_DIMENSIONS_ERROR',
      });
    }

    try {
      metadata.gps = parseGpsCoordinates(mergedTags);
    } catch (err) {
      errors.push({
        section: 'gps',
        message: err instanceof Error ? err.message : 'Unknown error',
        code: 'PARSE_GPS_ERROR',
      });
    }

    try {
      metadata.timestamps = parseTimestamps(mergedTags);
    } catch (err) {
      errors.push({
        section: 'timestamps',
        message: err instanceof Error ? err.message : 'Unknown error',
        code: 'PARSE_TIMESTAMPS_ERROR',
      });
    }

    try {
      metadata.rights = parseRightsInfo(mergedTags);
    } catch (err) {
      errors.push({
        section: 'rights',
        message: err instanceof Error ? err.message : 'Unknown error',
        code: 'PARSE_RIGHTS_ERROR',
      });
    }

    // Detect if image has been edited
    metadata.isEdited = detectEditedImage(mergedTags);

    // Include raw tags if requested
    if (includeRaw) {
      metadata.raw = mergedTags as Record<string, unknown>;
    }

    // Extract thumbnail if requested and available
    if (includeThumbnail && 'Thumbnail' in tags) {
      const thumbnailTag = (tags as { Thumbnail?: { image?: ArrayBuffer } }).Thumbnail;
      if (thumbnailTag?.image) {
        thumbnail = Buffer.from(thumbnailTag.image);
      }
    }

    // Add warnings for missing common fields
    if (!metadata.camera.make && !metadata.camera.model) {
      warnings.push('No camera information found');
    }
    if (!metadata.timestamps.dateTimeOriginal) {
      warnings.push('No original capture date found');
    }
    if (!metadata.dimensions.width || !metadata.dimensions.height) {
      warnings.push('Image dimensions not found in EXIF');
    }

    return {
      success: errors.length === 0,
      metadata,
      errors,
      warnings,
      thumbnail,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));

    if (throwOnError) {
      throw new CorruptedExifError(`Failed to parse EXIF data: ${error.message}`, error);
    }

    errors.push({
      section: 'general',
      message: error.message,
      code: 'PARSE_FAILED',
    });

    return {
      success: false,
      metadata,
      errors,
      warnings,
      thumbnail,
    };
  }
}

/**
 * Parse EXIF metadata from file path.
 *
 * @param filePath - Path to the image file
 * @param options - Parse options
 * @returns ExifParseResult with metadata and any errors
 *
 * @example
 * ```ts
 * const result = await parseExifFromFile('/path/to/photo.jpg');
 * console.log(result.metadata.camera.model);
 * ```
 */
export async function parseExifFromFile(
  filePath: string,
  options: ExifParseOptions = {}
): Promise<ExifParseResult> {
  const fs = await import('node:fs/promises');

  // Check if format is supported
  if (!isSupportedFormat(filePath)) {
    const ext = filePath.split('.').pop() || 'unknown';

    if (options.throwOnError) {
      throw new UnsupportedFormatError(ext);
    }

    return {
      success: false,
      metadata: createEmptyMetadata(),
      errors: [
        {
          section: 'general',
          message: `Unsupported file format: .${ext}`,
          code: 'UNSUPPORTED_FORMAT',
        },
      ],
      warnings: [],
    };
  }

  try {
    const buffer = await fs.readFile(filePath);
    const result = await parseExifFromBuffer(buffer, options);

    // Try to detect format from file extension
    const ext = filePath.toLowerCase().split('.').pop();
    if (ext) {
      result.metadata.format = ext.toUpperCase();
    }

    return result;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));

    if (options.throwOnError) {
      throw new ExifParserError(`Failed to read file: ${error.message}`, 'FILE_READ_ERROR');
    }

    return {
      success: false,
      metadata: createEmptyMetadata(),
      errors: [
        {
          section: 'general',
          message: `Failed to read file: ${error.message}`,
          code: 'FILE_READ_ERROR',
        },
      ],
      warnings: [],
    };
  }
}

/**
 * Extract only GPS coordinates from an image buffer.
 *
 * Optimized for when you only need location data.
 *
 * @param buffer - Image file buffer
 * @returns GPS coordinates or undefined
 */
export async function extractGpsFromBuffer(buffer: Buffer): Promise<GpsCoordinates | undefined> {
  try {
    const tags = ExifReader.load(buffer);
    return parseGpsCoordinates(tags);
  } catch {
    return undefined;
  }
}

/**
 * Extract only capture date from an image buffer.
 *
 * Optimized for when you only need the timestamp.
 *
 * @param buffer - Image file buffer
 * @returns Date object or undefined
 */
export async function extractDateFromBuffer(buffer: Buffer): Promise<Date | undefined> {
  try {
    const tags = ExifReader.load(buffer);
    const timestamps = parseTimestamps(tags);
    return timestamps.dateTimeOriginal || timestamps.dateTimeDigitized || timestamps.dateTimeModified;
  } catch {
    return undefined;
  }
}

/**
 * Check if an image has GPS data without fully parsing.
 *
 * @param buffer - Image file buffer
 * @returns true if GPS data is present
 */
export async function hasGpsData(buffer: Buffer): Promise<boolean> {
  try {
    const tags = ExifReader.load(buffer);
    return getTagValue(tags, 'GPSLatitude') !== undefined && getTagValue(tags, 'GPSLongitude') !== undefined;
  } catch {
    return false;
  }
}

/**
 * Get a quick summary of image metadata.
 *
 * Returns only the most commonly needed fields.
 *
 * @param buffer - Image file buffer
 * @returns Quick summary object
 */
export async function getQuickSummary(buffer: Buffer): Promise<{
  camera?: string;
  dateTaken?: Date;
  dimensions?: { width: number; height: number };
  hasGps: boolean;
  isEdited: boolean;
}> {
  try {
    const result = await parseExifFromBuffer(buffer);
    const { metadata } = result;

    return {
      camera: metadata.camera.model
        ? `${metadata.camera.make || ''} ${metadata.camera.model}`.trim()
        : undefined,
      dateTaken: metadata.timestamps.dateTimeOriginal,
      dimensions:
        metadata.dimensions.width && metadata.dimensions.height
          ? { width: metadata.dimensions.width, height: metadata.dimensions.height }
          : undefined,
      hasGps: metadata.gps !== undefined,
      isEdited: metadata.isEdited || false,
    };
  } catch {
    return {
      hasGps: false,
      isEdited: false,
    };
  }
}

// ============================================================================
// Module Exports
// ============================================================================

export default {
  // Main parsing functions
  parseExifFromBuffer,
  parseExifFromFile,

  // Quick extraction functions
  extractGpsFromBuffer,
  extractDateFromBuffer,
  hasGpsData,
  getQuickSummary,

  // Utility functions
  parseExifDate,
  extractTimezoneOffset,
  convertGpsToDecimal,
  formatExposureTime,
  isSupportedFormat,

  // Constants
  ORIENTATION_MAP,
  EXPOSURE_PROGRAM_MAP,
  METERING_MODE_MAP,
  WHITE_BALANCE_MAP,
  FLASH_MAP,
  COLOR_SPACE_MAP,
  SUPPORTED_EXTENSIONS,

  // Errors
  ExifParserError,
  UnsupportedFormatError,
  CorruptedExifError,
  MissingExifError,
};
