/**
 * Signed URL Service
 * Manages signed URL fetching and refresh for secure media access
 */

import apiClient from './api';
import type { SignedUrlResponse } from '../types/gallery';

interface SignedUrlCache {
  [key: string]: {
    url: string;
    expiresAt: number;
  };
}

class SignedUrlService {
  private cache: SignedUrlCache = {};
  private refreshThreshold = 300; // Refresh 5 minutes before expiry

  /**
   * Generate cache key for signed URL
   */
  private getCacheKey(
    workspaceId: string,
    assetId: string,
    variant: 'thumbnail' | 'preview' | 'original',
    download: boolean = false
  ): string {
    return `${workspaceId}:${assetId}:${variant}:${download}`;
  }

  /**
   * Check if URL is expired or near expiry
   */
  private isExpiredOrNearExpiry(expiresAt: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return expiresAt - now < this.refreshThreshold;
  }

  /**
   * Get signed URL for asset variant
   */
  async getSignedUrl(
    workspaceId: string,
    assetId: string,
    variant: 'thumbnail' | 'preview' | 'original' = 'thumbnail',
    download: boolean = false
  ): Promise<string> {
    const cacheKey = this.getCacheKey(workspaceId, assetId, variant, download);

    // Check cache
    const cached = this.cache[cacheKey];
    if (cached && !this.isExpiredOrNearExpiry(cached.expiresAt)) {
      return cached.url;
    }

    // Fetch new signed URL
    const params = new URLSearchParams({
      variant,
      download: download.toString(),
    });

    const endpoint = `/api/v1/workspaces/${workspaceId}/assets/${assetId}/url?${params}`;
    const response = await apiClient.get<SignedUrlResponse>(endpoint);

    if (response.error) {
      throw new Error(response.error.message || 'Failed to fetch signed URL');
    }

    const signedUrl = response.data!;

    // Prepend API base URL to the relative signed URL
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const url = signedUrl.url.startsWith('http')
      ? signedUrl.url
      : `${API_BASE_URL}${signedUrl.url}`;

    // Cache the URL
    this.cache[cacheKey] = {
      url,
      expiresAt: signedUrl.expires_at,
    };

    return url;
  }

  /**
   * Get multiple signed URLs at once (batch request)
   */
  async getSignedUrls(
    workspaceId: string,
    assetIds: string[],
    variant: 'thumbnail' | 'preview' | 'original' = 'thumbnail'
  ): Promise<Map<string, string>> {
    // For now, fetch individually
    // TODO: Implement batch endpoint if needed
    const urls = new Map<string, string>();

    await Promise.all(
      assetIds.map(async (assetId) => {
        try {
          const url = await this.getSignedUrl(workspaceId, assetId, variant);
          urls.set(assetId, url);
        } catch (error) {
          console.error(`Failed to get signed URL for asset ${assetId}:`, error);
        }
      })
    );

    return urls;
  }

  /**
   * Clear cache for specific asset or all assets
   */
  clearCache(workspaceId?: string, assetId?: string): void {
    if (!workspaceId && !assetId) {
      // Clear all
      this.cache = {};
      return;
    }

    // Clear specific asset
    const prefix = workspaceId && assetId ? `${workspaceId}:${assetId}:` : '';
    Object.keys(this.cache).forEach((key) => {
      if (key.startsWith(prefix)) {
        delete this.cache[key];
      }
    });
  }

  /**
   * Clean expired entries from cache
   */
  cleanExpired(): void {
    const now = Math.floor(Date.now() / 1000);
    Object.keys(this.cache).forEach((key) => {
      if (this.cache[key].expiresAt < now) {
        delete this.cache[key];
      }
    });
  }
}

// Export singleton instance
export const signedUrlService = new SignedUrlService();

// Clean expired entries every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    signedUrlService.cleanExpired();
  }, 5 * 60 * 1000);
}

export default signedUrlService;

