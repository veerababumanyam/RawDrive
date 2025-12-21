/**
 * Asset Optimization Service
 *
 * Frontend service for requesting and monitoring asset optimization,
 * including WebP/AVIF generation, favicon creation, and bulk operations.
 *
 * Requirements: 7.3, 7.7, 7.9
 */

import apiClient, { type ApiResponse } from '@/services/api';

// =============================================================================
// Types
// =============================================================================

export interface OptimizationJobStatus {
  job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  formats_generated: string[];
  error?: string;
  completed_at?: string;
}

export interface FaviconResult {
  ico_url: string;
  png_16_url: string;
  png_32_url: string;
  png_180_url: string; // Apple touch icon
  png_192_url: string; // Android
  png_512_url: string; // PWA
  manifest_entry: {
    icons: Array<{
      src: string;
      sizes: string;
      type: string;
    }>;
  };
}

export interface BulkReplaceResult {
  total_galleries: number;
  updated_galleries: number;
  failed_galleries: number;
  errors: Array<{
    gallery_id: string;
    error: string;
  }>;
}

export interface OptimizationSettings {
  /** Generate WebP format */
  webp: boolean;
  /** Generate AVIF format */
  avif: boolean;
  /** Generate optimized PNG */
  png: boolean;
  /** JPEG/WebP quality (1-100) */
  quality: number;
  /** Maximum width in pixels */
  max_width: number;
  /** Maximum height in pixels */
  max_height: number;
  /** Preserve aspect ratio */
  preserve_aspect_ratio: boolean;
  /** Strip metadata for privacy */
  strip_metadata: boolean;
}

export interface PreviewContext {
  name: string;
  background: string;
  width: number;
  height: number;
  description: string;
}

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_OPTIMIZATION_SETTINGS: OptimizationSettings = {
  webp: true,
  avif: true,
  png: true,
  quality: 85,
  max_width: 2048,
  max_height: 2048,
  preserve_aspect_ratio: true,
  strip_metadata: false,
};

export const PREVIEW_CONTEXTS: PreviewContext[] = [
  {
    name: 'Header (Light)',
    background: '#FFFFFF',
    width: 200,
    height: 60,
    description: 'Website header on white background',
  },
  {
    name: 'Header (Dark)',
    background: '#1A1A1A',
    width: 200,
    height: 60,
    description: 'Website header on dark background',
  },
  {
    name: 'Footer',
    background: '#F5F5F5',
    width: 120,
    height: 40,
    description: 'Website footer with subtle background',
  },
  {
    name: 'Social Card',
    background: '#FFFFFF',
    width: 400,
    height: 200,
    description: 'Social media share preview',
  },
  {
    name: 'Favicon',
    background: 'transparent',
    width: 32,
    height: 32,
    description: 'Browser tab icon',
  },
  {
    name: 'Gallery Watermark',
    background: 'rgba(255,255,255,0.3)',
    width: 100,
    height: 30,
    description: 'Photo watermark overlay',
  },
];

// =============================================================================
// Asset Optimization Service Class
// =============================================================================

class AssetOptimizationService {
  private static instance: AssetOptimizationService;
  private workspaceId: string | null = null;

  private constructor() {}

  public static getInstance(): AssetOptimizationService {
    if (!AssetOptimizationService.instance) {
      AssetOptimizationService.instance = new AssetOptimizationService();
    }
    return AssetOptimizationService.instance;
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize service with workspace context
   */
  initialize(workspaceId: string): void {
    this.workspaceId = workspaceId;
  }

  // ===========================================================================
  // Format Generation Methods
  // ===========================================================================

  /**
   * Request optimization for an asset with specific formats
   */
  async optimizeAsset(
    assetId: string,
    settings: Partial<OptimizationSettings> = {}
  ): Promise<ApiResponse<OptimizationJobStatus>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const mergedSettings = { ...DEFAULT_OPTIMIZATION_SETTINGS, ...settings };

    return apiClient.post<OptimizationJobStatus>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets/${assetId}/optimize`,
      mergedSettings
    );
  }

  /**
   * Get optimization job status
   */
  async getOptimizationStatus(jobId: string): Promise<ApiResponse<OptimizationJobStatus>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    return apiClient.get<OptimizationJobStatus>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/optimization-jobs/${jobId}`
    );
  }

  /**
   * Poll optimization status until complete
   */
  async waitForOptimization(
    jobId: string,
    onProgress?: (status: OptimizationJobStatus) => void,
    pollInterval = 1000,
    maxWait = 60000
  ): Promise<OptimizationJobStatus> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const response = await this.getOptimizationStatus(jobId);

      if (response.data) {
        onProgress?.(response.data);

        if (response.data.status === 'completed' || response.data.status === 'failed') {
          return response.data;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error('Optimization timed out');
  }

  // ===========================================================================
  // Favicon Generation Methods
  // ===========================================================================

  /**
   * Generate favicon set from logo asset
   */
  async generateFavicons(logoAssetId: string): Promise<ApiResponse<FaviconResult>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    return apiClient.post<FaviconResult>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets/${logoAssetId}/generate-favicons`
    );
  }

  /**
   * Get generated favicon HTML tags
   */
  getFaviconHtmlTags(faviconResult: FaviconResult): string {
    return `
<!-- Favicon -->
<link rel="icon" type="image/x-icon" href="${faviconResult.ico_url}">
<link rel="icon" type="image/png" sizes="16x16" href="${faviconResult.png_16_url}">
<link rel="icon" type="image/png" sizes="32x32" href="${faviconResult.png_32_url}">

<!-- Apple Touch Icon -->
<link rel="apple-touch-icon" sizes="180x180" href="${faviconResult.png_180_url}">

<!-- Android/PWA -->
<link rel="icon" type="image/png" sizes="192x192" href="${faviconResult.png_192_url}">
<link rel="icon" type="image/png" sizes="512x512" href="${faviconResult.png_512_url}">
`.trim();
  }

  // ===========================================================================
  // Bulk Operations
  // ===========================================================================

  /**
   * Replace logo across all galleries in workspace
   */
  async bulkReplaceLogo(
    newLogoAssetId: string,
    options: {
      include_archived?: boolean;
      dry_run?: boolean;
    } = {}
  ): Promise<ApiResponse<BulkReplaceResult>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    return apiClient.post<BulkReplaceResult>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets/bulk-replace-logo`,
      {
        logo_asset_id: newLogoAssetId,
        ...options,
      }
    );
  }

  /**
   * Get preview of bulk replace operation (dry run)
   */
  async previewBulkReplace(newLogoAssetId: string): Promise<BulkReplaceResult> {
    const response = await this.bulkReplaceLogo(newLogoAssetId, { dry_run: true });
    return response.data || { total_galleries: 0, updated_galleries: 0, failed_galleries: 0, errors: [] };
  }

  // ===========================================================================
  // Preview Methods
  // ===========================================================================

  /**
   * Get all preview contexts
   */
  getPreviewContexts(): PreviewContext[] {
    return PREVIEW_CONTEXTS;
  }

  /**
   * Generate preview URL for asset in a specific context
   */
  async getContextPreviewUrl(
    assetId: string,
    context: PreviewContext
  ): Promise<string> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    // Build query params with context
    const params = new URLSearchParams({
      width: context.width.toString(),
      height: context.height.toString(),
      background: context.background,
    });

    const response = await apiClient.get<{ preview_url: string }>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets/${assetId}/preview?${params}`
    );

    return response.data?.preview_url || '';
  }

  // ===========================================================================
  // Image Analysis Methods
  // ===========================================================================

  /**
   * Analyze image for optimization recommendations
   */
  async analyzeAsset(assetId: string): Promise<ApiResponse<{
    current_size_bytes: number;
    estimated_webp_size: number;
    estimated_avif_size: number;
    potential_savings_percent: number;
    has_transparency: boolean;
    has_animation: boolean;
    color_profile: string;
    recommendations: string[];
  }>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    return apiClient.get(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets/${assetId}/analyze`
    );
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get default optimization settings
   */
  getDefaultSettings(): OptimizationSettings {
    return { ...DEFAULT_OPTIMIZATION_SETTINGS };
  }

  /**
   * Calculate estimated file size after optimization
   */
  estimateOptimizedSize(
    originalSizeBytes: number,
    format: 'webp' | 'avif' | 'png',
    quality: number = 85
  ): number {
    // Rough estimates based on typical compression ratios
    const compressionRatios: Record<string, number> = {
      webp: 0.3 + (100 - quality) * 0.005,   // 30-80% of original
      avif: 0.2 + (100 - quality) * 0.004,   // 20-60% of original
      png: 0.9,                                // PNG compression is lossless
    };

    return Math.round(originalSizeBytes * (compressionRatios[format] || 1));
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  /**
   * Reset service state (for testing)
   */
  reset(): void {
    this.workspaceId = null;
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const assetOptimizationService = AssetOptimizationService.getInstance();

// Export class for testing
export { AssetOptimizationService };
