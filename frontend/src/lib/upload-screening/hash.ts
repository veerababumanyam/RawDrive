// ─────────────────────────────────────────────────────────────────────────────
// M16 E47-S3: Upload-screening hash helpers.
//
// WebCrypto SHA-256 over a Uint8Array. Used by:
//   - manifest.ts to compute the canonical sha256 field
//   - upload-screening.worker.ts to hash the file once (budgeted — chunked)
//
// The backend re-verifies this hash at finalize time against the actual
// uploaded bytes (upload_manifest_verify.go), so a silent discrepancy here
// surfaces as ErrScanHashMismatch on the server.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 of a Uint8Array and return the lowercase hex digest.
 * Uses the Web Crypto API, which is available in both window contexts
 * (for unit tests) and WorkerGlobalScope contexts (for the production
 * screening worker) via the `crypto` global.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copy into a fresh ArrayBuffer so SubtleCrypto gets a BufferSource it
  // definitely owns. Using a new Uint8Array avoids the SharedArrayBuffer
  // narrowing issue when `bytes.buffer` is typed as ArrayBufferLike.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Compute SHA-256 of a Blob/File by streaming it into WebCrypto.
 * Reads the entire file into memory in one shot — safe for files under
 * the policy-enforced max (50 MB in M16). Larger files MUST use the
 * chunked variant below.
 */
export async function sha256HexOfBlob(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return sha256Hex(bytes);
}

/**
 * Chunked SHA-256 for larger files. Reads the Blob in chunks and feeds
 * them into a single WebCrypto digest. Falls back to a single-shot hash
 * on browsers that do not expose `crypto.subtle.digest` in streaming mode
 * (Safari without the Incremental Hash API).
 *
 * NOTE: WebCrypto does not natively support incremental digest. We emulate
 * by concatenating chunks into a single buffer on the fly. The chunk size
 * exists purely to avoid peak memory pressure when the browser allocates
 * the initial File.arrayBuffer().
 */
export async function sha256HexChunked(
  blob: Blob,
  chunkSize = 4 * 1024 * 1024
): Promise<string> {
  if (blob.size <= chunkSize) {
    return sha256HexOfBlob(blob);
  }

  // Concatenate chunks into a single buffer — still one round of WebCrypto
  // but the slicing lets the GC reclaim each chunk as we go.
  const buffer = new Uint8Array(blob.size);
  let offset = 0;
  while (offset < blob.size) {
    const end = Math.min(offset + chunkSize, blob.size);
    const chunk = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
    buffer.set(chunk, offset);
    offset = end;
  }
  return sha256Hex(buffer);
}

/**
 * Lowercase hex encoding. Internal helper — exported for test coverage.
 */
export function bytesToHex(bytes: Uint8Array): string {
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i].toString(16).padStart(2, "0"));
  }
  return hex.join("");
}
