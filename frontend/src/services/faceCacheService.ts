/**
 * Face Cache Service - Client-side cache integration for smart face tagging.
 *
 * This service provides client-side integration with the multi-tier face caching layer:
 * - Check cache status before requesting face detection
 * - Display cached results when available
 * - Monitor cache hit rates and performance
 * - Trigger cache warming for frequently accessed galleries
 *
 * Performance Benefits:
 * - Cache hit: 50-200ms (vs 5-10s AI API call)
 * - Reduced bandwidth for already-processed photos
 * - Better UX with instant face display
 *
 * @module services/faceCacheService
 */

import { apiClient } from './api';

// ============================================================================
// Types
// ============================================================================

export interface FaceCacheStats {
  workspace_id: string;
  memory_cache: {
    l1_asset_count: number;
    l1_group_count: number;
    l1_embedding_count: number;
  };
  redis_cache: {
    entry_count?: number;
  };
  database_cache: {
    total_entries: number;
    active_entries: number;
    expired_entries: number;
  };
  performance: {
    l1_hits: number;
    l2_hits: number;
    l3_hits: number;
    misses: number;
    hit_rate_percent: number;
    total_writes: number;
  };
}

export interface FaceCacheWarmResult {
  gallery_id: string;
  workspace_id: string;
  attempted: number;
  warmed: number;
  skipped: number;
  failed: number;
}

export interface FaceCacheInvalidateResult {
  workspace_id: string;
  entries_invalidated: number;
  message: string;
}

export interface BiometricConsentStatus {
  workspace_id: string;
  consent_status: string;
  face_detection_enabled: boolean;
  consented_at: string | null;
  is_allowed: boolean;
}

export interface GrantConsentRequest {
  policy_version?: string;
  auto_enable_detection?: boolean;
}

// ============================================================================
// Face Cache Service
// ============================================================================

class FaceCacheService {
  private readonly CACHE_STATS_KEY = (workspaceId: string) =>
    `face_cache_stats:${workspaceId}`;
  private readonly CACHE_STATS_TTL = 5 * 60 * 1000; // 5 minutes

  private readonly CONSENT_STATUS_KEY = (workspaceId: string) =>
    `biometric_consent:${workspaceId}`;
  private readonly CONSENT_STATUS_TTL = 5 * 60 * 1000; // 5 minutes

  // =========================================================================
  // Cache Statistics
  // =========================================================================

  /**
   * Get face cache statistics for a workspace.
   *
   * Returns metrics on cache hit rates, memory usage, and performance
   * improvements from caching.
   *
   * @param workspaceId - The workspace ID
   * @returns Cache statistics
   */
  async getCacheStats(workspaceId: string): Promise<FaceCacheStats> {
    try {
      const response = await apiClient.get<FaceCacheStats>(
        `/api/v1/workspaces/${workspaceId}/cache/stats`
      );

      // Cache the stats locally
      this.setLocalStorage(this.CACHE_STATS_KEY(workspaceId), response, this.CACHE_STATS_TTL);

      return response.data!;
    } catch (error) {
      console.error('Failed to get face cache stats:', error);
      throw error;
    }
  }

  /**
   * Get cached stats from localStorage to avoid API calls.
   *
   * @param workspaceId - The workspace ID
   * @returns Cached stats or null if not available
   */
  getCachedStats(workspaceId: string): FaceCacheStats | null {
    return this.getLocalStorage<FaceCacheStats>(this.CACHE_STATS_KEY(workspaceId));
  }

  // =========================================================================
  // Cache Invalidation
  // =========================================================================

  /**
   * Invalidate all cached face detection data for a workspace.
   *
   * Forces fresh face detection on next access. Useful after:
   * - Updating AI model
   * - Changing detection settings
   * - Manual data refresh
   *
   * @param workspaceId - The workspace ID
   * @returns Invalidated entry count
   */
  async invalidateCache(workspaceId: string): Promise<FaceCacheInvalidateResult> {
    try {
      const response = await apiClient.delete<FaceCacheInvalidateResult>(
        `/api/v1/workspaces/${workspaceId}/cache`
      );

      // Clear local cache stats
      this.removeLocalStorage(this.CACHE_STATS_KEY(workspaceId));

      return response.data!;
    } catch (error) {
      console.error('Failed to invalidate face cache:', error);
      throw error;
    }
  }

  /**
   * Invalidate cache for a specific gallery.
   *
   * @param workspaceId - The workspace ID
   * @param galleryId - The gallery ID
   */
  async invalidateGalleryCache(workspaceId: string, galleryId: string): Promise<void> {
    try {
      await apiClient.delete(`/api/v1/galleries/${galleryId}/cache?workspace_id=${workspaceId}`);

      // Clear local cache stats
      this.removeLocalStorage(this.CACHE_STATS_KEY(workspaceId));
    } catch (error) {
      console.error('Failed to invalidate gallery cache:', error);
      throw error;
    }
  }

  // =========================================================================
  // Cache Warming
  // =========================================================================

  /**
   * Warm cache for a gallery to improve performance.
   *
   * Pre-loads face detection results into L1/L2 cache for
   * frequently accessed galleries.
   *
   * @param workspaceId - The workspace ID
   * @param galleryId - The gallery ID
   * @param limit - Maximum number of assets to warm (default: 100)
   * @returns Warming statistics
   */
  async warmGalleryCache(
    workspaceId: string,
    galleryId: string,
    limit: number = 100
  ): Promise<FaceCacheWarmResult> {
    try {
      const response = await apiClient.post<FaceCacheWarmResult>(
        `/api/v1/galleries/${galleryId}/cache/warm?limit=${limit}`
      );

      return response.data!;
    } catch (error) {
      console.error('Failed to warm gallery cache:', error);
      throw error;
    }
  }

  // =========================================================================
  // Biometric Consent Management
  // =========================================================================

  /**
   * Get biometric consent status for a workspace.
   *
   * Checks if biometric consent has been granted for face detection
   * as required by GDPR Article 9.
   *
   * @param workspaceId - The workspace ID
   * @returns Consent status
   */
  async getConsentStatus(workspaceId: string): Promise<BiometricConsentStatus> {
    try {
      const response = await apiClient.get<BiometricConsentStatus>(
        `/api/v1/workspaces/${workspaceId}/biometric-consent`
      );

      // Cache the status locally
      this.setLocalStorage(
        this.CONSENT_STATUS_KEY(workspaceId),
        response.data,
        this.CONSENT_STATUS_TTL
      );

      return response.data!;
    } catch (error) {
      console.error('Failed to get consent status:', error);
      throw error;
    }
  }

  /**
   * Get cached consent status from localStorage.
   *
   * @param workspaceId - The workspace ID
   * @returns Cached consent status or null if not available
   */
  getCachedConsentStatus(workspaceId: string): BiometricConsentStatus | null {
    return this.getLocalStorage<BiometricConsentStatus>(this.CONSENT_STATUS_KEY(workspaceId));
  }

  /**
   * Grant biometric consent for face detection.
   *
   * Required before any face detection can occur in a workspace.
   *
   * @param workspaceId - The workspace ID
   * @param request - Consent grant details
   * @returns Updated consent status
   */
  async grantConsent(
    workspaceId: string,
    request: GrantConsentRequest = {}
  ): Promise<BiometricConsentStatus> {
    try {
      const response = await apiClient.post<BiometricConsentStatus>(
        `/api/v1/workspaces/${workspaceId}/biometric-consent`,
        request
      );

      // Clear cached status
      this.removeLocalStorage(this.CONSENT_STATUS_KEY(workspaceId));

      return response.data!;
    } catch (error) {
      console.error('Failed to grant consent:', error);
      throw error;
    }
  }

  /**
   * Withdraw biometric consent for a workspace.
   *
   * WARNING: This will disable all face detection and optionally
   * delete all biometric data.
   *
   * @param workspaceId - The workspace ID
   * @param cascadeDelete - Whether to also delete all faces and embeddings
   * @returns Updated consent status
   */
  async withdrawConsent(
    workspaceId: string,
    cascadeDelete: boolean = false
  ): Promise<BiometricConsentStatus> {
    try {
      const response = await apiClient.delete<BiometricConsentStatus>(
        `/api/v1/workspaces/${workspaceId}/biometric-consent?cascade_delete=${cascadeDelete}`
      );

      // Clear cached status
      this.removeLocalStorage(this.CONSENT_STATUS_KEY(workspaceId));

      return response.data!;
    } catch (error) {
      console.error('Failed to withdraw consent:', error);
      throw error;
    }
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Check if face detection is allowed for a workspace.
   *
   * Combines consent status with cache check for quick response.
   *
   * @param workspaceId - The workspace ID
   * @returns True if face detection is allowed
   */
  async isFaceDetectionAllowed(workspaceId: string): Promise<boolean> {
    try {
      // Try cached status first
      const cached = this.getCachedConsentStatus(workspaceId);
      if (cached) {
        return cached.is_allowed;
      }

      // Fetch from API
      const status = await this.getConsentStatus(workspaceId);
      return status.is_allowed;
    } catch (error) {
      console.error('Failed to check face detection allowance:', error);
      return false;
    }
  }

  /**
   * Get cache performance metrics formatted for display.
   *
   * @param workspaceId - The workspace ID
   * @returns Formatted performance metrics
   */
  async getPerformanceMetrics(workspaceId: string): Promise<{
    hitRate: string;
    totalRequests: number;
    cacheHits: number;
    cacheMisses: number;
    performanceGain: string;
  }> {
    const stats = await this.getCacheStats(workspaceId);
    const perf = stats.performance;

    const totalRequests = perf.l1_hits + perf.l2_hits + perf.l3_hits + perf.misses;
    const cacheHits = perf.l1_hits + perf.l2_hits + perf.l3_hits;

    // Calculate performance gain
    // Assume cache hit is 100ms vs 5s API call = 50x faster
    const avgLatencyWithCache = (
      (cacheHits * 0.1 + perf.misses * 5) / totalRequests
    ).toFixed(2);
    const avgLatencyWithoutCache = '5.00';
    const performanceGain = (
      (5 / parseFloat(avgLatencyWithCache))
    ).toFixed(1) + 'x';

    return {
      hitRate: `${perf.hit_rate_percent.toFixed(1)}%`,
      totalRequests,
      cacheHits,
      cacheMisses: perf.misses,
      performanceGain,
    };
  }

  // =========================================================================
  // Local Storage Helpers
  // =========================================================================

  private setLocalStorage<T>(key: string, value: T, ttl: number): void {
    try {
      const item = {
        value,
        expires: Date.now() + ttl,
      };
      localStorage.setItem(key, JSON.stringify(item));
    } catch (error) {
      console.warn('Failed to set localStorage:', error);
    }
  }

  private getLocalStorage<T>(key: string): T | null {
    try {
      const item = localStorage.getItem(key);
      if (!item) return null;

      const parsed = JSON.parse(item);
      if (parsed.expires < Date.now()) {
        localStorage.removeItem(key);
        return null;
      }

      return parsed.value as T;
    } catch (error) {
      console.warn('Failed to get localStorage:', error);
      return null;
    }
  }

  private removeLocalStorage(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove localStorage:', error);
    }
  }
}

// Export singleton instance
export const faceCacheService = new FaceCacheService();
