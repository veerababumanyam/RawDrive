/**
 * CDN Service
 *
 * Generates CDN URLs for media assets when edge decryption CDN is configured.
 * Falls back to standard API URLs when CDN is not available.
 *
 * The CDN uses signed tokens for security:
 * - Token contains: workspace_id, asset_id, variant, expiration, HMAC signature
 * - Edge worker validates signature and decrypts asset from R2
 * - Decrypted content is cached at edge for subsequent requests
 */

import api from './api';

// CDN configuration from environment
const CDN_BASE_URL = import.meta.env.VITE_CDN_BASE_URL || '';
const CDN_ENABLED = Boolean(CDN_BASE_URL);

// Token cache to avoid redundant API calls
interface CachedToken {
  token: string;
  expiresAt: number;
}

// Token TTL buffer (refresh 5 minutes before expiry)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Maximum cache size to prevent memory leaks
const MAX_CACHE_SIZE = 1000;

// LRU-like token cache with size limit
class TokenCache {
  private cache = new Map<string, CachedToken>();
  private accessOrder: string[] = [];

  get(key: string): CachedToken | undefined {
    const value = this.cache.get(key);
    if (value) {
      // Move to end of access order (most recently used)
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      this.accessOrder.push(key);
    }
    return value;
  }

  set(key: string, value: CachedToken): void {
    // Evict oldest entries if at capacity
    while (this.cache.size >= MAX_CACHE_SIZE && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift();
      if (oldest) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, value);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
    this.accessOrder.push(key);
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.accessOrder = this.accessOrder.filter(k => k !== key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  keys(): IterableIterator<string> {
    return this.cache.keys();
  }

  get size(): number {
    return this.cache.size;
  }
}

const tokenCache = new TokenCache();

/**
 * Check if CDN is enabled
 */
export const isCdnEnabled = (): boolean => CDN_ENABLED;

/**
 * Get cache key for token
 */
const getCacheKey = (workspaceId: string, assetId: string, variant: string): string => {
  return `${workspaceId}:${assetId}:${variant}`;
};

/**
 * Check if cached token is still valid
 */
const isTokenValid = (cached: CachedToken | undefined): boolean => {
  if (!cached) return false;
  return Date.now() < cached.expiresAt - TOKEN_REFRESH_BUFFER_MS;
};

/**
 * Generate a signed CDN token for an asset
 *
 * This calls the backend API to generate a signed token that the CDN worker
 * will validate before decrypting the asset.
 */
export const generateCdnToken = async (
  workspaceId: string,
  assetId: string,
  variant: 'thumbnail' | 'preview' | 'original'
): Promise<string> => {
  const cacheKey = getCacheKey(workspaceId, assetId, variant);

  // Check cache first
  const cached = tokenCache.get(cacheKey);
  if (isTokenValid(cached)) {
    return cached!.token;
  }

  // Request new token from backend
  const response = await api.post<{ token: string; expires_at: number }>(
    `/api/v1/workspaces/${workspaceId}/cdn-tokens`,
    {
      asset_id: assetId,
      variant,
    }
  );

  if (response.error || !response.data) {
    throw new Error(response.error?.message || 'Failed to generate CDN token');
  }

  const { token, expires_at } = response.data;

  // Cache the token
  tokenCache.set(cacheKey, {
    token,
    expiresAt: expires_at,
  });

  return token;
};

/**
 * Get a CDN URL for an asset
 *
 * Returns a CDN URL if CDN is enabled and token generation succeeds.
 * Falls back to null if CDN is not available.
 */
export const getCdnUrl = async (
  workspaceId: string,
  assetId: string,
  variant: 'thumbnail' | 'preview' | 'original'
): Promise<string | null> => {
  if (!CDN_ENABLED) {
    return null;
  }

  try {
    const token = await generateCdnToken(workspaceId, assetId, variant);
    return `${CDN_BASE_URL}/cdn/media/${token}`;
  } catch (error) {
    console.warn('[CDN] Failed to generate CDN URL, falling back to API:', error);
    return null;
  }
};

/**
 * Get CDN URLs for multiple assets (batched)
 *
 * More efficient than calling getCdnUrl multiple times.
 */
export const getCdnUrls = async (
  workspaceId: string,
  assetIds: string[],
  variant: 'thumbnail' | 'preview' | 'original'
): Promise<Map<string, string>> => {
  const result = new Map<string, string>();

  if (!CDN_ENABLED || assetIds.length === 0) {
    return result;
  }

  // Separate cached and uncached assets
  const uncachedAssetIds: string[] = [];

  for (const assetId of assetIds) {
    const cacheKey = getCacheKey(workspaceId, assetId, variant);
    const cached = tokenCache.get(cacheKey);

    if (isTokenValid(cached)) {
      result.set(assetId, `${CDN_BASE_URL}/cdn/media/${cached!.token}`);
    } else {
      uncachedAssetIds.push(assetId);
    }
  }

  // Batch request tokens for uncached assets
  if (uncachedAssetIds.length > 0) {
    try {
      const response = await api.post<{
        tokens: Array<{ asset_id: string; token: string; expires_at: number }>;
      }>(`/api/v1/workspaces/${workspaceId}/cdn-tokens/batch`, {
        asset_ids: uncachedAssetIds,
        variant,
      });

      if (response.error || !response.data) {
        throw new Error(response.error?.message || 'Failed to generate batch CDN tokens');
      }

      for (const { asset_id, token, expires_at } of response.data.tokens) {
        // Cache the token
        const cacheKey = getCacheKey(workspaceId, asset_id, variant);
        tokenCache.set(cacheKey, { token, expiresAt: expires_at });

        // Add to result
        result.set(asset_id, `${CDN_BASE_URL}/cdn/media/${token}`);
      }
    } catch (error) {
      console.warn('[CDN] Batch token generation failed:', error);
      // Return partial results (cached tokens only)
    }
  }

  return result;
};

/**
 * Clear token cache for a workspace
 *
 * Call this when a workspace key is rotated or access is revoked.
 */
export const clearCdnCache = (workspaceId?: string): void => {
  if (workspaceId) {
    // Clear tokens for specific workspace
    const keysToDelete: string[] = [];
    const keys = Array.from(tokenCache.keys());
    for (const key of keys) {
      if (key.startsWith(`${workspaceId}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => tokenCache.delete(key));
  } else {
    // Clear all tokens
    tokenCache.clear();
  }
};

/**
 * Preload CDN URLs for assets
 *
 * Useful for prefetching thumbnails before they're needed.
 */
export const preloadCdnUrls = async (
  workspaceId: string,
  assetIds: string[],
  variant: 'thumbnail' | 'preview' | 'original' = 'thumbnail'
): Promise<void> => {
  if (!CDN_ENABLED) return;

  const urls = await getCdnUrls(workspaceId, assetIds, variant);

  // Preload images using Image objects
  const urlValues = Array.from(urls.values());
  for (const url of urlValues) {
    const img = new Image();
    img.src = url;
  }
};

export default {
  isCdnEnabled,
  getCdnUrl,
  getCdnUrls,
  clearCdnCache,
  preloadCdnUrls,
};
