/**
 * SHA256 Utility
 * Client-side SHA256 hash calculation using Web Crypto API
 * Used for duplicate detection before upload
 */

/**
 * Calculate SHA256 hash of a file
 * @param file File to hash
 * @returns Promise resolving to hex-encoded SHA256 hash (64 characters)
 */
export async function calculateSHA256(file: File): Promise<string> {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Calculate SHA256 hash using Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);

    // Convert ArrayBuffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    return hashHex;
  } catch (error) {
    // Re-throw with context
    throw new Error(
      `Failed to calculate SHA256 hash: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Calculate SHA256 hash for multiple files in parallel
 * @param files Array of files to hash
 * @returns Promise resolving to Map of File -> SHA256 hash
 */
export async function calculateSHA256Batch(
  files: File[]
): Promise<Map<File, string>> {
  const results = new Map<File, string>();

  // Calculate hashes in parallel
  const promises = files.map(async (file) => {
    try {
      const hash = await calculateSHA256(file);
      return { file, hash };
    } catch (error) {
      // Log error but continue with other files
      console.error(`Failed to hash file ${file.name}:`, error);
      return { file, hash: null };
    }
  });

  const resolved = await Promise.all(promises);

  // Build map (skip files that failed to hash)
  for (const { file, hash } of resolved) {
    if (hash) {
      results.set(file, hash);
    }
  }

  return results;
}

