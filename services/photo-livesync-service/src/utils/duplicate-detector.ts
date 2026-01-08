/**
 * Duplicate Detector Utility.
 *
 * Provides SHA-256 hash and perceptual hash (pHash) based duplicate detection
 * for photos imported from cloud storage providers. Supports both exact
 * duplicate detection (byte-identical) and near-duplicate detection (visually
 * similar images).
 *
 * Features:
 * - SHA-256 cryptographic hash for exact duplicate detection
 * - Perceptual hash (pHash) using DCT for near-duplicate detection
 * - Hamming distance calculation for similarity comparison
 * - Configurable similarity thresholds
 * - Batch hash computation for efficiency
 * - Stream-based hashing for large files
 * - Support for multiple image formats via Sharp
 *
 * Hash Types:
 * - SHA-256: 256-bit (64 hex chars) cryptographic hash for exact matching
 * - pHash: 64-bit (16 hex chars) perceptual hash for visual similarity
 *
 * @module utils/duplicate-detector
 */

import * as crypto from 'node:crypto';
import { Readable } from 'node:stream';
import sharp from 'sharp';

// ============================================================================
// Constants
// ============================================================================

/**
 * Size of the downscaled image for pHash computation.
 * 32x32 is standard for DCT-based pHash.
 */
export const PHASH_SIZE = 32;

/**
 * Size of the DCT block used for pHash computation.
 * 8x8 block captures low-frequency components.
 */
export const DCT_SIZE = 8;

/**
 * Hash algorithm used for cryptographic hashing.
 */
export const HASH_ALGORITHM = 'sha256' as const;

/**
 * Default maximum hamming distance for considering images as similar.
 * 10 bits difference out of 64 represents ~84% similarity.
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 10;

/**
 * Strict similarity threshold for very similar images.
 * 5 bits difference out of 64 represents ~92% similarity.
 */
export const STRICT_SIMILARITY_THRESHOLD = 5;

/**
 * Loose similarity threshold for potentially similar images.
 * 15 bits difference out of 64 represents ~77% similarity.
 */
export const LOOSE_SIMILARITY_THRESHOLD = 15;

/**
 * Number of bits in the perceptual hash.
 */
export const PHASH_BITS = 64;

// ============================================================================
// Types
// ============================================================================

/**
 * Result of hash computation.
 */
export interface HashResult {
  /** SHA-256 hash as hex string (64 characters) */
  sha256: string;
  /** Perceptual hash as hex string (16 characters) */
  pHash?: string;
  /** Size of the input in bytes */
  size: number;
}

/**
 * Result of duplicate comparison.
 */
export interface DuplicateComparisonResult {
  /** Whether the images are considered duplicates */
  isDuplicate: boolean;
  /** Type of match found */
  matchType: 'exact' | 'perceptual' | 'none';
  /** SHA-256 hashes match exactly */
  exactMatch: boolean;
  /** Perceptual similarity score (0-64 hamming distance) */
  hammingDistance?: number;
  /** Perceptual similarity percentage (0-100) */
  similarityPercent?: number;
  /** Confidence level of the match */
  confidence: 'high' | 'medium' | 'low' | 'none';
}

/**
 * Options for hash computation.
 */
export interface HashOptions {
  /** Compute perceptual hash (default: true) */
  computePHash?: boolean;
  /** Maximum file size in bytes for pHash computation (default: 100MB) */
  maxPHashSize?: number;
}

/**
 * Options for duplicate comparison.
 */
export interface CompareOptions {
  /** Maximum hamming distance to consider as duplicate (default: 10) */
  similarityThreshold?: number;
  /** Consider exact SHA-256 match as duplicate (default: true) */
  checkExact?: boolean;
  /** Consider perceptual match as duplicate (default: true) */
  checkPerceptual?: boolean;
}

/**
 * Batch hash result for multiple files.
 */
export interface BatchHashResult {
  /** Successfully computed hashes */
  results: Map<string, HashResult>;
  /** Errors encountered during computation */
  errors: Map<string, Error>;
}

/**
 * Group of similar images.
 */
export interface SimilarityGroup {
  /** Representative hash for the group */
  representativeHash: string;
  /** All hashes in this similarity group */
  memberHashes: string[];
  /** Average hamming distance within the group */
  averageDistance: number;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Base duplicate detector error.
 */
export class DuplicateDetectorError extends Error {
  /** Machine-readable error code */
  public readonly code: string;

  constructor(message: string, code: string = 'DUPLICATE_DETECTOR_ERROR') {
    super(message);
    this.name = 'DuplicateDetectorError';
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
 * Error thrown when hash computation fails.
 */
export class HashComputationError extends DuplicateDetectorError {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, 'HASH_COMPUTATION_FAILED');
    this.name = 'HashComputationError';
    this.cause = cause;
  }
}

/**
 * Error thrown when image processing fails.
 */
export class ImageProcessingError extends DuplicateDetectorError {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, 'IMAGE_PROCESSING_FAILED');
    this.name = 'ImageProcessingError';
    this.cause = cause;
  }
}

/**
 * Error thrown when input is invalid.
 */
export class InvalidInputError extends DuplicateDetectorError {
  constructor(message: string) {
    super(message, 'INVALID_INPUT');
    this.name = 'InvalidInputError';
  }
}

// ============================================================================
// SHA-256 Hash Functions
// ============================================================================

/**
 * Compute SHA-256 hash of a buffer.
 *
 * @param buffer - Data to hash
 * @returns SHA-256 hash as hex string (64 characters)
 *
 * @example
 * ```ts
 * const hash = computeSHA256(imageBuffer);
 * // Returns: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
 * ```
 */
export function computeSHA256(buffer: Buffer): string {
  return crypto.createHash(HASH_ALGORITHM).update(buffer).digest('hex');
}

/**
 * Compute SHA-256 hash from a readable stream.
 *
 * Useful for large files to avoid loading entire file into memory.
 *
 * @param stream - Readable stream of data
 * @returns Promise resolving to SHA-256 hash as hex string
 *
 * @example
 * ```ts
 * const fs = require('fs');
 * const stream = fs.createReadStream('/path/to/image.jpg');
 * const hash = await computeSHA256FromStream(stream);
 * ```
 */
export async function computeSHA256FromStream(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(HASH_ALGORITHM);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', (err) =>
      reject(new HashComputationError(`Stream hashing failed: ${err.message}`, err))
    );
  });
}

/**
 * Compute SHA-256 hash from a file path.
 *
 * Uses streaming to handle large files efficiently.
 *
 * @param filePath - Path to the file
 * @returns Promise resolving to SHA-256 hash as hex string
 *
 * @example
 * ```ts
 * const hash = await computeSHA256FromFile('/path/to/image.jpg');
 * ```
 */
export async function computeSHA256FromFile(filePath: string): Promise<string> {
  const fs = await import('node:fs');
  const stream = fs.createReadStream(filePath);
  return computeSHA256FromStream(stream);
}

// ============================================================================
// Perceptual Hash (pHash) Functions
// ============================================================================

/**
 * Precomputed DCT coefficients for efficiency.
 * DCT-II basis functions: cos((2x + 1) * u * PI / 2N)
 */
const dctCoefficients: number[][] = [];

/**
 * Initialize DCT coefficients.
 */
function initDctCoefficients(): void {
  if (dctCoefficients.length > 0) return;

  for (let u = 0; u < PHASH_SIZE; u++) {
    dctCoefficients[u] = [];
    for (let x = 0; x < PHASH_SIZE; x++) {
      dctCoefficients[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * PHASH_SIZE));
    }
  }
}

/**
 * Apply 2D Discrete Cosine Transform (DCT-II) to a matrix.
 *
 * DCT concentrates image information in low-frequency components,
 * making it ideal for perceptual hashing.
 *
 * @param matrix - Input pixel values (PHASH_SIZE x PHASH_SIZE)
 * @returns DCT coefficients matrix
 */
function applyDCT2D(matrix: number[][]): number[][] {
  initDctCoefficients();

  const size = matrix.length;
  const result: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  const temp: number[][] = Array.from({ length: size }, () => Array(size).fill(0));

  // Apply DCT along rows
  for (let y = 0; y < size; y++) {
    for (let u = 0; u < size; u++) {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        sum += matrix[y][x] * dctCoefficients[u][x];
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      temp[y][u] = cu * sum * Math.sqrt(2 / size);
    }
  }

  // Apply DCT along columns
  for (let u = 0; u < size; u++) {
    for (let v = 0; v < size; v++) {
      let sum = 0;
      for (let y = 0; y < size; y++) {
        sum += temp[y][u] * dctCoefficients[v][y];
      }
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      result[v][u] = cv * sum * Math.sqrt(2 / size);
    }
  }

  return result;
}

/**
 * Compute perceptual hash (pHash) from image buffer.
 *
 * Algorithm:
 * 1. Resize image to 32x32 pixels
 * 2. Convert to grayscale
 * 3. Apply 2D DCT
 * 4. Extract top-left 8x8 low-frequency coefficients (excluding DC)
 * 5. Compute median of coefficients
 * 6. Generate 64-bit hash: 1 if coefficient > median, 0 otherwise
 *
 * @param buffer - Image buffer (JPEG, PNG, WebP, TIFF, etc.)
 * @returns Perceptual hash as 16-character hex string (64 bits)
 * @throws {ImageProcessingError} If image processing fails
 *
 * @example
 * ```ts
 * const pHash = await computePHash(imageBuffer);
 * // Returns: 'a4b3c2d1e5f6g7h8'
 * ```
 */
export async function computePHash(buffer: Buffer): Promise<string> {
  try {
    // Resize to 32x32 and convert to grayscale
    const { data, info } = await sharp(buffer)
      .resize(PHASH_SIZE, PHASH_SIZE, {
        fit: 'fill',
        kernel: 'lanczos3',
      })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Verify dimensions
    if (info.width !== PHASH_SIZE || info.height !== PHASH_SIZE) {
      throw new ImageProcessingError(
        `Unexpected image dimensions: ${info.width}x${info.height}`
      );
    }

    // Convert to 2D matrix
    const matrix: number[][] = [];
    for (let y = 0; y < PHASH_SIZE; y++) {
      matrix[y] = [];
      for (let x = 0; x < PHASH_SIZE; x++) {
        matrix[y][x] = data[y * PHASH_SIZE + x];
      }
    }

    // Apply 2D DCT
    const dctMatrix = applyDCT2D(matrix);

    // Extract low-frequency 8x8 block (excluding DC component at [0,0])
    const lowFreq: number[] = [];
    for (let y = 0; y < DCT_SIZE; y++) {
      for (let x = 0; x < DCT_SIZE; x++) {
        if (x === 0 && y === 0) continue; // Skip DC component
        lowFreq.push(dctMatrix[y][x]);
      }
    }

    // Calculate median
    const sorted = [...lowFreq].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

    // Generate hash: 1 if value > median, 0 otherwise
    let hash = BigInt(0);
    for (let i = 0; i < lowFreq.length; i++) {
      if (lowFreq[i] > median) {
        hash |= BigInt(1) << BigInt(i);
      }
    }

    // Pad with leading zeros and ensure exactly 64 bits (16 hex chars)
    // Note: We only have 63 bits due to skipping DC component
    // For full 64 bits, we add one more bit based on DC vs average
    const dcValue = dctMatrix[0][0];
    const avgLowFreq = lowFreq.reduce((a, b) => a + b, 0) / lowFreq.length;
    if (dcValue > avgLowFreq * PHASH_SIZE) {
      hash |= BigInt(1) << BigInt(63);
    }

    return hash.toString(16).padStart(16, '0');
  } catch (error) {
    if (error instanceof DuplicateDetectorError) {
      throw error;
    }
    throw new ImageProcessingError(
      `Failed to compute pHash: ${error instanceof Error ? error.message : String(error)}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Compute perceptual hash from a file path.
 *
 * @param filePath - Path to the image file
 * @returns Promise resolving to perceptual hash as hex string
 *
 * @example
 * ```ts
 * const pHash = await computePHashFromFile('/path/to/image.jpg');
 * ```
 */
export async function computePHashFromFile(filePath: string): Promise<string> {
  const fs = await import('node:fs/promises');
  const buffer = await fs.readFile(filePath);
  return computePHash(buffer);
}

// ============================================================================
// Hamming Distance Functions
// ============================================================================

/**
 * Calculate hamming distance between two hex hash strings.
 *
 * Hamming distance counts the number of positions where the corresponding
 * bits are different. Lower distance means more similar images.
 *
 * @param hash1 - First hash as hex string
 * @param hash2 - Second hash as hex string
 * @returns Number of differing bits (0-64 for 64-bit hashes)
 * @throws {InvalidInputError} If hashes are invalid or different lengths
 *
 * @example
 * ```ts
 * const distance = hammingDistance('0000000000000000', 'ffffffffffffffff');
 * // Returns: 64 (completely different)
 *
 * const distance = hammingDistance('a4b3c2d1e5f6a7b8', 'a4b3c2d1e5f6a7b8');
 * // Returns: 0 (identical)
 * ```
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (!hash1 || !hash2) {
    throw new InvalidInputError('Hash values cannot be empty');
  }

  if (hash1.length !== hash2.length) {
    throw new InvalidInputError(
      `Hash lengths must match: ${hash1.length} vs ${hash2.length}`
    );
  }

  // Validate hex strings
  const hexRegex = /^[0-9a-fA-F]+$/;
  if (!hexRegex.test(hash1) || !hexRegex.test(hash2)) {
    throw new InvalidInputError('Hash values must be valid hexadecimal strings');
  }

  // Convert to BigInt for bit manipulation
  const val1 = BigInt(`0x${hash1}`);
  const val2 = BigInt(`0x${hash2}`);

  // XOR to find differing bits
  let xor = val1 ^ val2;

  // Count set bits (Kernighan's algorithm)
  let distance = 0;
  while (xor > 0n) {
    xor &= xor - 1n;
    distance++;
  }

  return distance;
}

/**
 * Calculate similarity percentage from hamming distance.
 *
 * @param distance - Hamming distance (number of differing bits)
 * @param totalBits - Total number of bits in the hash (default: 64)
 * @returns Similarity percentage (0-100)
 *
 * @example
 * ```ts
 * const similarity = hammingToSimilarity(10); // 84.375%
 * const similarity = hammingToSimilarity(0);  // 100%
 * const similarity = hammingToSimilarity(64); // 0%
 * ```
 */
export function hammingToSimilarity(distance: number, totalBits: number = PHASH_BITS): number {
  if (distance < 0 || distance > totalBits) {
    throw new InvalidInputError(`Distance must be between 0 and ${totalBits}`);
  }
  return ((totalBits - distance) / totalBits) * 100;
}

/**
 * Calculate hamming distance from similarity percentage.
 *
 * @param similarity - Similarity percentage (0-100)
 * @param totalBits - Total number of bits in the hash (default: 64)
 * @returns Hamming distance
 *
 * @example
 * ```ts
 * const distance = similarityToHamming(84.375); // ~10
 * const distance = similarityToHamming(100);    // 0
 * const distance = similarityToHamming(0);      // 64
 * ```
 */
export function similarityToHamming(similarity: number, totalBits: number = PHASH_BITS): number {
  if (similarity < 0 || similarity > 100) {
    throw new InvalidInputError('Similarity must be between 0 and 100');
  }
  return Math.round((100 - similarity) / 100 * totalBits);
}

// ============================================================================
// Combined Hash Functions
// ============================================================================

/**
 * Compute both SHA-256 and perceptual hash for an image.
 *
 * @param buffer - Image buffer
 * @param options - Hash computation options
 * @returns Hash result with both SHA-256 and pHash
 *
 * @example
 * ```ts
 * const result = await computeHashes(imageBuffer);
 * console.log(result.sha256); // SHA-256 hash
 * console.log(result.pHash);  // Perceptual hash
 * console.log(result.size);   // Buffer size in bytes
 * ```
 */
export async function computeHashes(
  buffer: Buffer,
  options: HashOptions = {}
): Promise<HashResult> {
  const {
    computePHash: shouldComputePHash = true,
    maxPHashSize = 100 * 1024 * 1024, // 100MB default
  } = options;

  // Always compute SHA-256
  const sha256 = computeSHA256(buffer);
  const size = buffer.length;

  const result: HashResult = { sha256, size };

  // Compute pHash if enabled and file is not too large
  if (shouldComputePHash && size <= maxPHashSize) {
    try {
      result.pHash = await computePHash(buffer);
    } catch {
      // pHash computation failed - continue without it
      // This can happen for non-image files or corrupted images
    }
  }

  return result;
}

/**
 * Compute both hashes from a file path.
 *
 * @param filePath - Path to the image file
 * @param options - Hash computation options
 * @returns Hash result with both SHA-256 and pHash
 *
 * @example
 * ```ts
 * const result = await computeHashesFromFile('/path/to/image.jpg');
 * ```
 */
export async function computeHashesFromFile(
  filePath: string,
  options: HashOptions = {}
): Promise<HashResult> {
  const fs = await import('node:fs/promises');
  const buffer = await fs.readFile(filePath);
  return computeHashes(buffer, options);
}

// ============================================================================
// Duplicate Comparison Functions
// ============================================================================

/**
 * Compare two hash results to determine if they are duplicates.
 *
 * @param hash1 - First hash result
 * @param hash2 - Second hash result
 * @param options - Comparison options
 * @returns Duplicate comparison result
 *
 * @example
 * ```ts
 * const result1 = await computeHashes(image1Buffer);
 * const result2 = await computeHashes(image2Buffer);
 * const comparison = compareDuplicates(result1, result2);
 *
 * if (comparison.isDuplicate) {
 *   console.log(`Match type: ${comparison.matchType}`);
 *   console.log(`Confidence: ${comparison.confidence}`);
 * }
 * ```
 */
export function compareDuplicates(
  hash1: HashResult,
  hash2: HashResult,
  options: CompareOptions = {}
): DuplicateComparisonResult {
  const {
    similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
    checkExact = true,
    checkPerceptual = true,
  } = options;

  // Check exact SHA-256 match
  const exactMatch = hash1.sha256 === hash2.sha256;

  if (checkExact && exactMatch) {
    return {
      isDuplicate: true,
      matchType: 'exact',
      exactMatch: true,
      confidence: 'high',
    };
  }

  // Check perceptual similarity
  if (checkPerceptual && hash1.pHash && hash2.pHash) {
    const distance = hammingDistance(hash1.pHash, hash2.pHash);
    const similarityPercent = hammingToSimilarity(distance);

    // Determine confidence based on hamming distance
    let confidence: 'high' | 'medium' | 'low' | 'none';
    if (distance <= STRICT_SIMILARITY_THRESHOLD) {
      confidence = 'high';
    } else if (distance <= DEFAULT_SIMILARITY_THRESHOLD) {
      confidence = 'medium';
    } else if (distance <= LOOSE_SIMILARITY_THRESHOLD) {
      confidence = 'low';
    } else {
      confidence = 'none';
    }

    const isDuplicate = distance <= similarityThreshold;

    return {
      isDuplicate,
      matchType: isDuplicate ? 'perceptual' : 'none',
      exactMatch: false,
      hammingDistance: distance,
      similarityPercent,
      confidence,
    };
  }

  return {
    isDuplicate: false,
    matchType: 'none',
    exactMatch: false,
    confidence: 'none',
  };
}

/**
 * Compare an image against a list of existing hashes.
 *
 * @param imageHash - Hash of the image to check
 * @param existingHashes - Array of existing hash results to compare against
 * @param options - Comparison options
 * @returns First match found, or null if no duplicates
 *
 * @example
 * ```ts
 * const newImageHash = await computeHashes(newImageBuffer);
 * const match = findDuplicateInList(newImageHash, existingHashes);
 *
 * if (match) {
 *   console.log(`Found duplicate: ${match.matchHash.sha256}`);
 * }
 * ```
 */
export function findDuplicateInList(
  imageHash: HashResult,
  existingHashes: HashResult[],
  options: CompareOptions = {}
): { matchHash: HashResult; comparison: DuplicateComparisonResult } | null {
  // First, check for exact SHA-256 matches (fast)
  if (options.checkExact !== false) {
    for (const existing of existingHashes) {
      if (existing.sha256 === imageHash.sha256) {
        return {
          matchHash: existing,
          comparison: {
            isDuplicate: true,
            matchType: 'exact',
            exactMatch: true,
            confidence: 'high',
          },
        };
      }
    }
  }

  // Then check perceptual hashes
  if (options.checkPerceptual !== false && imageHash.pHash) {
    for (const existing of existingHashes) {
      if (existing.pHash) {
        const comparison = compareDuplicates(imageHash, existing, {
          ...options,
          checkExact: false, // Already checked
        });

        if (comparison.isDuplicate) {
          return { matchHash: existing, comparison };
        }
      }
    }
  }

  return null;
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Compute hashes for multiple buffers in parallel.
 *
 * @param items - Map of identifier to buffer
 * @param options - Hash computation options
 * @param concurrency - Maximum parallel operations (default: 4)
 * @returns Batch hash result with successes and failures
 *
 * @example
 * ```ts
 * const buffers = new Map([
 *   ['image1.jpg', buffer1],
 *   ['image2.jpg', buffer2],
 *   ['image3.jpg', buffer3],
 * ]);
 *
 * const results = await batchComputeHashes(buffers);
 * for (const [id, hash] of results.results) {
 *   console.log(`${id}: ${hash.sha256}`);
 * }
 * ```
 */
export async function batchComputeHashes(
  items: Map<string, Buffer>,
  options: HashOptions = {},
  concurrency = 4
): Promise<BatchHashResult> {
  const results = new Map<string, HashResult>();
  const errors = new Map<string, Error>();

  const entries = Array.from(items.entries());

  // Process in batches for controlled concurrency
  for (let i = 0; i < entries.length; i += concurrency) {
    const batch = entries.slice(i, i + concurrency);
    const promises = batch.map(async ([id, buffer]) => {
      try {
        const hash = await computeHashes(buffer, options);
        results.set(id, hash);
      } catch (error) {
        errors.set(
          id,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    });

    await Promise.all(promises);
  }

  return { results, errors };
}

/**
 * Find all duplicates within a set of hashes.
 *
 * Groups similar images together based on perceptual hash similarity.
 *
 * @param hashes - Map of identifier to hash result
 * @param options - Comparison options
 * @returns Array of similarity groups
 *
 * @example
 * ```ts
 * const groups = findDuplicateGroups(hashMap);
 * for (const group of groups) {
 *   console.log(`Group with ${group.memberHashes.length} similar images`);
 * }
 * ```
 */
export function findDuplicateGroups(
  hashes: Map<string, HashResult>,
  options: CompareOptions = {}
): SimilarityGroup[] {
  const { similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD } = options;
  const groups: SimilarityGroup[] = [];
  const assigned = new Set<string>();

  const entries = Array.from(hashes.entries());

  for (let i = 0; i < entries.length; i++) {
    const [id1, hash1] = entries[i];

    if (assigned.has(id1)) continue;

    const group: SimilarityGroup = {
      representativeHash: hash1.sha256,
      memberHashes: [id1],
      averageDistance: 0,
    };

    const distances: number[] = [];

    for (let j = i + 1; j < entries.length; j++) {
      const [id2, hash2] = entries[j];

      if (assigned.has(id2)) continue;

      // Check exact match
      if (hash1.sha256 === hash2.sha256) {
        group.memberHashes.push(id2);
        assigned.add(id2);
        distances.push(0);
        continue;
      }

      // Check perceptual similarity
      if (hash1.pHash && hash2.pHash) {
        const distance = hammingDistance(hash1.pHash, hash2.pHash);
        if (distance <= similarityThreshold) {
          group.memberHashes.push(id2);
          assigned.add(id2);
          distances.push(distance);
        }
      }
    }

    // Only add groups with more than one member
    if (group.memberHashes.length > 1) {
      assigned.add(id1);
      group.averageDistance =
        distances.length > 0
          ? distances.reduce((a, b) => a + b, 0) / distances.length
          : 0;
      groups.push(group);
    }
  }

  return groups;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a pHash indicates a similar image.
 *
 * @param pHash1 - First perceptual hash
 * @param pHash2 - Second perceptual hash
 * @param threshold - Maximum hamming distance (default: 10)
 * @returns True if images are similar
 *
 * @example
 * ```ts
 * if (areSimilar(hash1.pHash, hash2.pHash)) {
 *   console.log('Images are visually similar');
 * }
 * ```
 */
export function areSimilar(
  pHash1: string,
  pHash2: string,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): boolean {
  try {
    return hammingDistance(pHash1, pHash2) <= threshold;
  } catch {
    return false;
  }
}

/**
 * Check if two SHA-256 hashes are identical.
 *
 * @param sha256_1 - First SHA-256 hash
 * @param sha256_2 - Second SHA-256 hash
 * @returns True if hashes are identical
 */
export function areIdentical(sha256_1: string, sha256_2: string): boolean {
  return sha256_1.toLowerCase() === sha256_2.toLowerCase();
}

/**
 * Validate a SHA-256 hash string.
 *
 * @param hash - Hash string to validate
 * @returns True if valid SHA-256 hash
 */
export function isValidSHA256(hash: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(hash);
}

/**
 * Validate a perceptual hash string.
 *
 * @param hash - Hash string to validate
 * @returns True if valid pHash (16 hex characters)
 */
export function isValidPHash(hash: string): boolean {
  return /^[a-fA-F0-9]{16}$/.test(hash);
}

/**
 * Get confidence level description.
 *
 * @param confidence - Confidence level
 * @returns Human-readable description
 */
export function getConfidenceDescription(
  confidence: 'high' | 'medium' | 'low' | 'none'
): string {
  switch (confidence) {
    case 'high':
      return 'Very likely the same image (>92% similarity)';
    case 'medium':
      return 'Probably the same image (84-92% similarity)';
    case 'low':
      return 'Possibly the same image (77-84% similarity)';
    case 'none':
      return 'Different images (<77% similarity)';
  }
}

/**
 * Create a duplicate detector instance with preset configuration.
 *
 * @param defaultOptions - Default options for all operations
 * @returns Configured duplicate detector
 *
 * @example
 * ```ts
 * const detector = createDuplicateDetector({
 *   computePHash: true,
 *   similarityThreshold: 8,
 * });
 *
 * const hash = await detector.computeHashes(buffer);
 * const isDup = detector.compareDuplicates(hash1, hash2);
 * ```
 */
export function createDuplicateDetector(defaultOptions: HashOptions & CompareOptions = {}) {
  return {
    computeHashes: (buffer: Buffer) => computeHashes(buffer, defaultOptions),
    computeHashesFromFile: (filePath: string) =>
      computeHashesFromFile(filePath, defaultOptions),
    computeSHA256,
    computePHash,
    compareDuplicates: (hash1: HashResult, hash2: HashResult, options?: CompareOptions) =>
      compareDuplicates(hash1, hash2, { ...defaultOptions, ...options }),
    findDuplicateInList: (
      imageHash: HashResult,
      existingHashes: HashResult[],
      options?: CompareOptions
    ) => findDuplicateInList(imageHash, existingHashes, { ...defaultOptions, ...options }),
    batchComputeHashes: (items: Map<string, Buffer>) =>
      batchComputeHashes(items, defaultOptions),
    findDuplicateGroups: (hashes: Map<string, HashResult>, options?: CompareOptions) =>
      findDuplicateGroups(hashes, { ...defaultOptions, ...options }),
    hammingDistance,
    areSimilar: (pHash1: string, pHash2: string) =>
      areSimilar(pHash1, pHash2, defaultOptions.similarityThreshold),
    areIdentical,
  };
}

// ============================================================================
// Module Exports
// ============================================================================

export default {
  // SHA-256 functions
  computeSHA256,
  computeSHA256FromStream,
  computeSHA256FromFile,

  // pHash functions
  computePHash,
  computePHashFromFile,

  // Combined hash functions
  computeHashes,
  computeHashesFromFile,

  // Hamming distance functions
  hammingDistance,
  hammingToSimilarity,
  similarityToHamming,

  // Comparison functions
  compareDuplicates,
  findDuplicateInList,

  // Batch operations
  batchComputeHashes,
  findDuplicateGroups,

  // Utility functions
  areSimilar,
  areIdentical,
  isValidSHA256,
  isValidPHash,
  getConfidenceDescription,
  createDuplicateDetector,

  // Constants
  PHASH_SIZE,
  DCT_SIZE,
  HASH_ALGORITHM,
  DEFAULT_SIMILARITY_THRESHOLD,
  STRICT_SIMILARITY_THRESHOLD,
  LOOSE_SIMILARITY_THRESHOLD,
  PHASH_BITS,

  // Errors
  DuplicateDetectorError,
  HashComputationError,
  ImageProcessingError,
  InvalidInputError,
};
