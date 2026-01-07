/**
 * Client-Side Encryption Utilities
 * Implements AES-256-CTR encryption using Web Crypto API.
 * Designed for streaming encryption of large files.
 */

// Key derivation constants (must match backend)
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH_BITS = 256;
const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 16;

/**
 * Generate a random 256-bit encryption key
 */
export async function generateEncryptionKey(): Promise<CryptoKey> {
    return window.crypto.subtle.generateKey(
        {
            name: 'AES-CTR',
            length: 256,
        },
        true, // extractable
        ['encrypt', 'decrypt']
    );
}

/**
 * Generate a random Initialization Vector (IV)
 */
export function generateIV(): Uint8Array {
    return window.crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
}

/**
 * Export key to raw bytes (for storage/transmission)
 */
export async function exportKey(key: CryptoKey): Promise<ArrayBuffer> {
    return window.crypto.subtle.exportKey('raw', key);
}

/**
 * Import key from raw bytes
 */
export async function importKey(keyBytes: ArrayBuffer): Promise<CryptoKey> {
    return window.crypto.subtle.importKey(
        'raw',
        keyBytes,
        {
            name: 'AES-CTR',
        },
        true,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt a chunk of data
 * Note: AES-CTR is streamable. Counter/IV handling is critical.
 * For simplistic chunking, we'd need to manage the counter block manually.
 * However, Web Crypto API's AES-CTR implementation increments the counter automatically
 * ONLY within a single encrypt call. It does NOT support streaming state natively across calls easily
 * without manually calculating the counter for each chunk based on the block size (16 bytes).
 *
 * Strategy:
 * We will calculate the counter block for each chunk based on the offset.
 * AES-CTR Counter Block: [Nonc (12 bytes) | Counter (4 bytes)] (typical, but WebCrypto uses full 16 bytes as "counter" array)
 * WebCrypto just takes the 16-byte counter block. It increments the *rightmost* bits.
 *
 * To support random access / chunked encryption:
 * New Counter = Initial IV + (Block Index)
 * Block Index = Offset / 16
 */
export async function encryptChunk(
    key: CryptoKey,
    initialIV: Uint8Array,
    offset: number,
    data: ArrayBuffer | Blob
): Promise<ArrayBuffer> {
    // Convert Blob to ArrayBuffer if needed
    const buffer = data instanceof Blob ? await data.arrayBuffer() : data;

    // Calculate counter for this chunk
    // AES block size is 16 bytes
    const blockIndex = Math.floor(offset / 16);
    const counter = incrementCounter(initialIV, blockIndex);

    return window.crypto.subtle.encrypt(
        {
            name: 'AES-CTR',
            counter: counter as any,
            length: 64, // Number of bits in the counter part (usually 64)
        },
        key,
        buffer
    );
}

/**
 * Increment the counter (IV) by a given value
 * Treats the 16-byte array as a big-endian integer
 */
function incrementCounter(iv: Uint8Array, value: number): Uint8Array {
    const counter = new Uint8Array(iv); // Copy
    const len = counter.length;

    // We add 'value' to the 16-byte integer stored in 'counter'
    // Simplified implementation: assume we only update the last 8 bytes (Safe up to 18 Exabytes)
    // WebCrypto usually expects the counter to be the last 64 bits if length=64 specified in algorithm
    let carry = value;
    for (let i = len - 1; i >= 0 && carry > 0; i--) {
        const sum = counter[i] + (carry & 0xff);
        counter[i] = sum & 0xff;
        carry = (carry >>> 8) + (sum >>> 8);
    }
    return counter;
}

/**
 * Decrypt a chunk
 */
export async function decryptChunk(
    key: CryptoKey,
    initialIV: Uint8Array,
    offset: number,
    data: ArrayBuffer
): Promise<ArrayBuffer> {
    const blockIndex = Math.floor(offset / 16);
    const counter = incrementCounter(initialIV, blockIndex);

    return window.crypto.subtle.decrypt(
        {
            name: 'AES-CTR',
            counter: counter as any,
            length: 64,
        },
        key,
        data
    );
}

import { sha256 } from 'js-sha256';

/**
 * Calculate SHA-256 of a file using streaming (chunked) reading
 * to avoid loading the entire file into memory.
 */
export async function calculateStreamingSHA256(file: File, chunkSize = 10 * 1024 * 1024): Promise<string> {
    const hasher = sha256.create();
    let offset = 0;

    while (offset < file.size) {
        const end = Math.min(offset + chunkSize, file.size);
        const chunk = await file.slice(offset, end).arrayBuffer();
        hasher.update(chunk);
        offset = end;
    }

    return hasher.hex();
}

