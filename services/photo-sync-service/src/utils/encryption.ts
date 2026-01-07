/**
 * AES-256-GCM Encryption Utility for Credentials.
 *
 * Provides secure encryption and decryption for sensitive data like OAuth
 * tokens and credentials. Uses AES-256-GCM for authenticated encryption,
 * which provides both confidentiality and integrity protection.
 *
 * Security Features:
 * - AES-256-GCM authenticated encryption (prevents tampering)
 * - Random 96-bit (12-byte) IV for each encryption (NIST recommended)
 * - 128-bit (16-byte) authentication tag
 * - Key derivation using SHA-256 to ensure 32-byte key length
 * - Base64 encoding for safe storage in text fields
 *
 * Format of encrypted data (base64-encoded):
 * [12-byte IV][ciphertext][16-byte auth tag]
 *
 * @module utils/encryption
 */

import * as crypto from 'node:crypto';
import { config } from '../config/index.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Encryption algorithm identifier.
 * AES-256-GCM provides authenticated encryption with associated data (AEAD).
 */
export const ENCRYPTION_ALGORITHM = 'aes-256-gcm' as const;

/**
 * Initialization Vector length in bytes.
 * 96 bits (12 bytes) is the recommended IV size for AES-GCM per NIST SP 800-38D.
 */
export const IV_LENGTH = 12;

/**
 * Authentication tag length in bytes.
 * 128 bits (16 bytes) provides strong authentication.
 */
export const AUTH_TAG_LENGTH = 16;

/**
 * Expected key length in bytes for AES-256.
 */
export const KEY_LENGTH = 32;

// ============================================================================
// Types
// ============================================================================

/**
 * Options for encryption operations.
 */
export interface EncryptionOptions {
  /**
   * Optional custom encryption key.
   * If not provided, uses the configured ENCRYPTION_KEY.
   */
  key?: string | Buffer;
}

/**
 * Result of encryption operation with separated components.
 */
export interface EncryptionResult {
  /** Base64-encoded ciphertext (without IV and auth tag) */
  ciphertext: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Base64-encoded authentication tag */
  authTag: string;
  /** Combined base64-encoded string (IV + ciphertext + authTag) */
  combined: string;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Base encryption error class.
 */
export class EncryptionError extends Error {
  /** Machine-readable error code */
  public readonly code: string;

  constructor(message: string, code: string = 'ENCRYPTION_ERROR') {
    super(message);
    this.name = 'EncryptionError';
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert error to JSON-serializable object.
   */
  toJSON(): { error: string; code: string; message: string } {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
    };
  }
}

/**
 * Error thrown when decryption fails (data tampered or wrong key).
 */
export class DecryptionError extends EncryptionError {
  constructor(message: string = 'Decryption failed') {
    super(message, 'DECRYPTION_FAILED');
    this.name = 'DecryptionError';
  }
}

/**
 * Error thrown when encryption key is missing or invalid.
 */
export class KeyError extends EncryptionError {
  constructor(message: string) {
    super(message, 'KEY_ERROR');
    this.name = 'KeyError';
  }
}

// ============================================================================
// Key Management
// ============================================================================

/**
 * Cached derived key buffer.
 * Using a WeakMap would be ideal but keys are strings, so we use a simple Map
 * with string keys. In practice, there's typically only one key per service.
 */
const keyCache = new Map<string, Buffer>();

/**
 * Derive a 32-byte encryption key from the provided key material.
 *
 * Uses SHA-256 to ensure the key is exactly 32 bytes (256 bits) regardless
 * of input length. This provides a consistent key size while preserving
 * the entropy of the input key.
 *
 * @param keyMaterial - The key material to derive from
 * @returns 32-byte Buffer suitable for AES-256
 *
 * @example
 * ```ts
 * const key = deriveKey('my-secret-key');
 * // Returns 32-byte Buffer
 * ```
 */
export function deriveKey(keyMaterial: string | Buffer): Buffer {
  const keyString = Buffer.isBuffer(keyMaterial)
    ? keyMaterial.toString('utf8')
    : keyMaterial;

  // Check cache first
  const cached = keyCache.get(keyString);
  if (cached) {
    return cached;
  }

  // Derive key using SHA-256
  const derivedKey = crypto.createHash('sha256').update(keyMaterial).digest();

  // Cache the derived key
  keyCache.set(keyString, derivedKey);

  return derivedKey;
}

/**
 * Get the encryption key from configuration.
 *
 * Retrieves the ENCRYPTION_KEY from environment configuration and derives
 * a proper 32-byte key using SHA-256.
 *
 * @returns 32-byte Buffer for AES-256 encryption
 * @throws {KeyError} If ENCRYPTION_KEY is not configured
 *
 * @example
 * ```ts
 * const key = getEncryptionKey();
 * ```
 */
export function getEncryptionKey(): Buffer {
  const key = config.ENCRYPTION_KEY;

  if (!key) {
    throw new KeyError('ENCRYPTION_KEY is not configured');
  }

  return deriveKey(key);
}

/**
 * Validate that a key is suitable for AES-256 encryption.
 *
 * @param key - The key to validate
 * @returns true if the key is valid
 * @throws {KeyError} If the key is invalid
 */
export function validateKey(key: Buffer): boolean {
  if (!Buffer.isBuffer(key)) {
    throw new KeyError('Key must be a Buffer');
  }

  if (key.length !== KEY_LENGTH) {
    throw new KeyError(`Key must be exactly ${KEY_LENGTH} bytes, got ${key.length}`);
  }

  return true;
}

// ============================================================================
// Encryption Functions
// ============================================================================

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * Returns a base64-encoded string containing IV + ciphertext + auth tag.
 * This format is suitable for storage in database text fields.
 *
 * @param plaintext - The text to encrypt
 * @param options - Optional encryption options
 * @returns Base64-encoded encrypted string
 * @throws {KeyError} If encryption key is not available
 * @throws {EncryptionError} If encryption fails
 *
 * @example
 * ```ts
 * // Using default key from config
 * const encrypted = encrypt('my-secret-token');
 *
 * // Using custom key
 * const encrypted = encrypt('my-secret-token', { key: 'custom-key' });
 * ```
 */
export function encrypt(plaintext: string, options: EncryptionOptions = {}): string {
  const key = options.key ? deriveKey(options.key) : getEncryptionKey();
  validateKey(key);

  // Generate random IV (12 bytes for GCM as recommended by NIST)
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  // Encrypt the plaintext
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // Get the authentication tag
  const authTag = cipher.getAuthTag();

  // Combine IV + ciphertext + authTag into a single buffer
  const combined = Buffer.concat([iv, encrypted, authTag]);

  return combined.toString('base64');
}

/**
 * Encrypt with detailed result containing separate components.
 *
 * Useful when you need to store IV and auth tag separately,
 * or when integrating with systems that expect separate values.
 *
 * @param plaintext - The text to encrypt
 * @param options - Optional encryption options
 * @returns Encryption result with separate components
 * @throws {KeyError} If encryption key is not available
 * @throws {EncryptionError} If encryption fails
 *
 * @example
 * ```ts
 * const result = encryptDetailed('my-secret-token');
 * console.log(result.ciphertext); // Base64 ciphertext only
 * console.log(result.iv);         // Base64 IV
 * console.log(result.authTag);    // Base64 auth tag
 * console.log(result.combined);   // Combined base64 string
 * ```
 */
export function encryptDetailed(
  plaintext: string,
  options: EncryptionOptions = {}
): EncryptionResult {
  const key = options.key ? deriveKey(options.key) : getEncryptionKey();
  validateKey(key);

  // Generate random IV
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  // Encrypt the plaintext
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  // Get the authentication tag
  const authTag = cipher.getAuthTag();

  // Combine for the combined format
  const combined = Buffer.concat([iv, encrypted, authTag]);

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    combined: combined.toString('base64'),
  };
}

/**
 * Encrypt binary data using AES-256-GCM.
 *
 * @param data - The data to encrypt
 * @param options - Optional encryption options
 * @returns Buffer containing IV + ciphertext + auth tag
 * @throws {KeyError} If encryption key is not available
 * @throws {EncryptionError} If encryption fails
 *
 * @example
 * ```ts
 * const encrypted = encryptBuffer(Buffer.from('binary data'));
 * ```
 */
export function encryptBuffer(data: Buffer, options: EncryptionOptions = {}): Buffer {
  const key = options.key ? deriveKey(options.key) : getEncryptionKey();
  validateKey(key);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, encrypted, authTag]);
}

// ============================================================================
// Decryption Functions
// ============================================================================

/**
 * Decrypt a base64-encoded encrypted string.
 *
 * Expects the format: base64(IV + ciphertext + auth tag)
 *
 * @param encryptedBase64 - Base64-encoded encrypted data
 * @param options - Optional decryption options
 * @returns Decrypted plaintext string
 * @throws {DecryptionError} If decryption fails (wrong key or tampered data)
 * @throws {KeyError} If encryption key is not available
 *
 * @example
 * ```ts
 * const decrypted = decrypt(encryptedString);
 * ```
 */
export function decrypt(encryptedBase64: string, options: EncryptionOptions = {}): string {
  const key = options.key ? deriveKey(options.key) : getEncryptionKey();
  validateKey(key);

  // Decode from base64
  const combined = Buffer.from(encryptedBase64, 'base64');

  // Validate minimum length
  const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
  if (combined.length < minLength) {
    throw new DecryptionError(
      `Invalid encrypted data: expected at least ${minLength} bytes, got ${combined.length}`
    );
  }

  // Extract components
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH, combined.length - AUTH_TAG_LENGTH);

  // Create decipher
  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    // GCM authentication failure indicates tampering or wrong key
    throw new DecryptionError('Decryption failed: data may have been tampered with or wrong key used');
  }
}

/**
 * Decrypt using separate IV, ciphertext, and auth tag.
 *
 * @param ciphertext - Base64-encoded ciphertext
 * @param iv - Base64-encoded IV
 * @param authTag - Base64-encoded authentication tag
 * @param options - Optional decryption options
 * @returns Decrypted plaintext string
 * @throws {DecryptionError} If decryption fails
 * @throws {KeyError} If encryption key is not available
 *
 * @example
 * ```ts
 * const decrypted = decryptDetailed(
 *   encryptedResult.ciphertext,
 *   encryptedResult.iv,
 *   encryptedResult.authTag
 * );
 * ```
 */
export function decryptDetailed(
  ciphertext: string,
  iv: string,
  authTag: string,
  options: EncryptionOptions = {}
): string {
  const key = options.key ? deriveKey(options.key) : getEncryptionKey();
  validateKey(key);

  const ivBuffer = Buffer.from(iv, 'base64');
  const authTagBuffer = Buffer.from(authTag, 'base64');
  const ciphertextBuffer = Buffer.from(ciphertext, 'base64');

  // Validate lengths
  if (ivBuffer.length !== IV_LENGTH) {
    throw new DecryptionError(`Invalid IV length: expected ${IV_LENGTH} bytes, got ${ivBuffer.length}`);
  }
  if (authTagBuffer.length !== AUTH_TAG_LENGTH) {
    throw new DecryptionError(
      `Invalid auth tag length: expected ${AUTH_TAG_LENGTH} bytes, got ${authTagBuffer.length}`
    );
  }

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(authTagBuffer);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    throw new DecryptionError('Decryption failed: data may have been tampered with or wrong key used');
  }
}

/**
 * Decrypt binary data.
 *
 * Expects the format: IV + ciphertext + auth tag
 *
 * @param encryptedData - Buffer containing encrypted data
 * @param options - Optional decryption options
 * @returns Decrypted data buffer
 * @throws {DecryptionError} If decryption fails
 * @throws {KeyError} If encryption key is not available
 *
 * @example
 * ```ts
 * const decrypted = decryptBuffer(encryptedBuffer);
 * ```
 */
export function decryptBuffer(encryptedData: Buffer, options: EncryptionOptions = {}): Buffer {
  const key = options.key ? deriveKey(options.key) : getEncryptionKey();
  validateKey(key);

  const minLength = IV_LENGTH + AUTH_TAG_LENGTH;
  if (encryptedData.length < minLength) {
    throw new DecryptionError(
      `Invalid encrypted data: expected at least ${minLength} bytes, got ${encryptedData.length}`
    );
  }

  const iv = encryptedData.subarray(0, IV_LENGTH);
  const authTag = encryptedData.subarray(encryptedData.length - AUTH_TAG_LENGTH);
  const ciphertext = encryptedData.subarray(IV_LENGTH, encryptedData.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (error) {
    throw new DecryptionError('Decryption failed: data may have been tampered with or wrong key used');
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if a string appears to be encrypted data.
 *
 * Performs basic validation:
 * - Is valid base64
 * - Has minimum expected length
 *
 * Note: This doesn't guarantee the data is valid encrypted data,
 * only that it could be.
 *
 * @param value - The value to check
 * @returns true if the value appears to be encrypted
 *
 * @example
 * ```ts
 * if (isEncrypted(token)) {
 *   const plaintext = decrypt(token);
 * }
 * ```
 */
export function isEncrypted(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }

  // Check for valid base64 format
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  if (!base64Regex.test(value)) {
    return false;
  }

  try {
    const decoded = Buffer.from(value, 'base64');
    // Must have at least IV + auth tag
    return decoded.length >= IV_LENGTH + AUTH_TAG_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Generate a secure random encryption key.
 *
 * @param encoding - Optional encoding for the key ('hex', 'base64', or undefined for Buffer)
 * @returns Random 32-byte key in the specified format
 *
 * @example
 * ```ts
 * // Generate hex-encoded key (64 characters)
 * const keyHex = generateKey('hex');
 *
 * // Generate base64-encoded key
 * const keyBase64 = generateKey('base64');
 *
 * // Generate raw Buffer
 * const keyBuffer = generateKey();
 * ```
 */
export function generateKey(): Buffer;
export function generateKey(encoding: 'hex' | 'base64'): string;
export function generateKey(encoding?: 'hex' | 'base64'): Buffer | string {
  const key = crypto.randomBytes(KEY_LENGTH);
  if (encoding) {
    return key.toString(encoding);
  }
  return key;
}

/**
 * Generate a random IV suitable for AES-GCM.
 *
 * @returns 12-byte random Buffer
 */
export function generateIV(): Buffer {
  return crypto.randomBytes(IV_LENGTH);
}

/**
 * Securely compare two encrypted values in constant time.
 *
 * This prevents timing attacks when comparing encrypted values.
 *
 * @param a - First encrypted value
 * @param b - Second encrypted value
 * @returns true if the values are equal
 *
 * @example
 * ```ts
 * const isEqual = secureCompare(storedToken, providedToken);
 * ```
 */
export function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'base64');
  const bufB = Buffer.from(b, 'base64');

  // Different lengths means different values
  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Clear the key cache.
 *
 * Call this when rotating keys or during cleanup.
 */
export function clearKeyCache(): void {
  keyCache.clear();
}

// ============================================================================
// Module Exports
// ============================================================================

export default {
  // Main functions
  encrypt,
  decrypt,
  encryptDetailed,
  decryptDetailed,
  encryptBuffer,
  decryptBuffer,

  // Key management
  deriveKey,
  getEncryptionKey,
  validateKey,
  generateKey,
  generateIV,
  clearKeyCache,

  // Utilities
  isEncrypted,
  secureCompare,

  // Constants
  ENCRYPTION_ALGORITHM,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  KEY_LENGTH,

  // Errors
  EncryptionError,
  DecryptionError,
  KeyError,
};
