/**
 * Brand Asset Service
 *
 * Service for managing brand assets (logos, icons, etc.) with
 * multi-variant support, automatic optimization, and version tracking.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.6
 */

import apiClient, { type ApiResponse } from '@/services/api';
import type {
  BrandAsset,
  AssetType,
  AssetVariant,
  AssetContext,
  OptimizedFormats,
} from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

export interface AssetUploadResult {
  asset: BrandAsset;
  optimizedFormats: OptimizedFormats;
  warnings?: string[];
}

export interface AssetValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  dimensions?: { width: number; height: number };
  fileSize: number;
}

export interface AssetOptimizationOptions {
  generateWebP?: boolean;
  generateAvif?: boolean;
  generatePng?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

export interface VersionHistoryEntry {
  version: number;
  asset_id: string;
  created_at: string;
  is_current: boolean;
}

type AssetChangeListener = (assets: BrandAsset[]) => void;

// =============================================================================
// Constants
// =============================================================================

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
];

const RECOMMENDED_DIMENSIONS: Record<AssetVariant, { width: number; height: number }> = {
  full: { width: 1200, height: 1200 },
  icon: { width: 512, height: 512 },
  light: { width: 1200, height: 1200 },
  dark: { width: 1200, height: 1200 },
};

// =============================================================================
// Brand Asset Service Class
// =============================================================================

class BrandAssetService {
  private static instance: BrandAssetService;

  private workspaceId: string | null = null;
  private assets: Map<string, BrandAsset> = new Map();
  private listeners: Set<AssetChangeListener> = new Set();

  private constructor() {}

  public static getInstance(): BrandAssetService {
    if (!BrandAssetService.instance) {
      BrandAssetService.instance = new BrandAssetService();
    }
    return BrandAssetService.instance;
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
  // Asset Retrieval Methods
  // ===========================================================================

  /**
   * List all assets for the workspace
   */
  async listAssets(assetType?: AssetType): Promise<BrandAsset[]> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const params = assetType ? `?type=${assetType}` : '';
    const response = await apiClient.get<BrandAsset[]>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets${params}`
    );

    if (response.data) {
      this.assets.clear();
      for (const asset of response.data) {
        this.assets.set(asset.asset_id, asset);
      }
      return response.data;
    }

    return [];
  }

  /**
   * Get a specific asset by ID
   */
  async getAsset(assetId: string): Promise<BrandAsset | null> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    // Check cache first
    if (this.assets.has(assetId)) {
      return this.assets.get(assetId)!;
    }

    const response = await apiClient.get<BrandAsset>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets/${assetId}`
    );

    if (response.data) {
      this.assets.set(response.data.asset_id, response.data);
      return response.data;
    }

    return null;
  }

  /**
   * Get assets by type
   */
  async getAssetsByType(assetType: AssetType): Promise<BrandAsset[]> {
    const allAssets = await this.listAssets(assetType);
    return allAssets.filter((a) => a.asset_type === assetType);
  }

  /**
   * Get current (active) asset for a given type
   */
  async getCurrentAsset(assetType: AssetType): Promise<BrandAsset | null> {
    const assets = await this.getAssetsByType(assetType);
    return assets.find((a) => a.is_current) || null;
  }

  // ===========================================================================
  // Asset Upload Methods
  // ===========================================================================

  /**
   * Validate an asset file before upload
   */
  validateAssetFile(file: File): AssetValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    // Check file type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      errors.push(`Unsupported file type. Allowed: ${ALLOWED_MIME_TYPES.join(', ')}`);
    }

    // Warn about GIF (may have animation issues)
    if (file.type === 'image/gif') {
      warnings.push('GIF animations may not be preserved in all contexts');
    }

    // Recommend PNG for logos (transparency support)
    if (file.type === 'image/jpeg') {
      warnings.push('JPEG does not support transparency. Consider using PNG for logos.');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      fileSize: file.size,
    };
  }

  /**
   * Validate asset dimensions (after loading image)
   */
  async validateAssetDimensions(
    file: File,
    variant: AssetVariant
  ): Promise<{ valid: boolean; width: number; height: number; warnings: string[] }> {
    const warnings: string[] = [];

    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);

        const recommended = RECOMMENDED_DIMENSIONS[variant];
        const { width, height } = img;

        // Check if dimensions are too small
        if (width < recommended.width / 2 || height < recommended.height / 2) {
          warnings.push(
            `Image may appear pixelated. Recommended: ${recommended.width}x${recommended.height}px or larger`
          );
        }

        // Check aspect ratio for icon variant (should be square-ish)
        if (variant === 'icon' && Math.abs(width - height) > 50) {
          warnings.push('Icon should be approximately square');
        }

        resolve({ valid: true, width, height, warnings });
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ valid: false, width: 0, height: 0, warnings: ['Failed to load image'] });
      };

      img.src = url;
    });
  }

  /**
   * Upload a new asset
   */
  async uploadAsset(
    file: File,
    assetType: AssetType,
    variant: AssetVariant,
    options: AssetOptimizationOptions = {}
  ): Promise<ApiResponse<AssetUploadResult>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    // Validate file
    const validation = this.validateAssetFile(file);
    if (!validation.valid) {
      throw new Error(validation.errors.join(', '));
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('asset_type', assetType);
    formData.append('variant', variant);

    // Add optimization options
    if (options.generateWebP !== undefined) {
      formData.append('generate_webp', options.generateWebP.toString());
    }
    if (options.generateAvif !== undefined) {
      formData.append('generate_avif', options.generateAvif.toString());
    }
    if (options.generatePng !== undefined) {
      formData.append('generate_png', options.generatePng.toString());
    }
    if (options.quality !== undefined) {
      formData.append('quality', options.quality.toString());
    }

    const response = await apiClient.upload<AssetUploadResult>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets`,
      formData
    );

    if (response.data?.asset) {
      this.assets.set(response.data.asset.asset_id, response.data.asset);
      this.notifyListeners();
    }

    return response;
  }

  /**
   * Upload multiple variants of an asset
   */
  async uploadAssetVariants(
    files: Map<AssetVariant, File>,
    assetType: AssetType,
    options: AssetOptimizationOptions = {}
  ): Promise<{ successful: BrandAsset[]; failed: Array<{ variant: AssetVariant; error: string }> }> {
    const successful: BrandAsset[] = [];
    const failed: Array<{ variant: AssetVariant; error: string }> = [];

    for (const [variant, file] of files.entries()) {
      try {
        const response = await this.uploadAsset(file, assetType, variant, options);
        if (response.data?.asset) {
          successful.push(response.data.asset);
        }
      } catch (error) {
        failed.push({
          variant,
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    }

    return { successful, failed };
  }

  // ===========================================================================
  // Asset Optimization Methods
  // ===========================================================================

  /**
   * Request optimization for an existing asset
   */
  async optimizeAsset(
    assetId: string,
    options: AssetOptimizationOptions = {}
  ): Promise<ApiResponse<BrandAsset>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const response = await apiClient.post<BrandAsset>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets/${assetId}/optimize`,
      options
    );

    if (response.data) {
      this.assets.set(response.data.asset_id, response.data);
      this.notifyListeners();
    }

    return response;
  }

  /**
   * Generate favicon from logo asset
   */
  async generateFavicon(logoAssetId: string): Promise<ApiResponse<BrandAsset>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const response = await apiClient.post<BrandAsset>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets/${logoAssetId}/generate-favicon`
    );

    if (response.data) {
      this.assets.set(response.data.asset_id, response.data);
      this.notifyListeners();
    }

    return response;
  }

  // ===========================================================================
  // Asset Selection Methods
  // ===========================================================================

  /**
   * Select the best asset variant for a given context
   */
  selectBestAsset(
    assets: BrandAsset[],
    context: AssetContext
  ): BrandAsset | null {
    if (assets.length === 0) return null;

    // Score each asset based on context
    const scored = assets.map((asset) => {
      let score = 0;

      // Prefer current version
      if (asset.is_current) score += 10;

      // Match theme variant
      if (context.theme_variant === 'dark' && asset.variant === 'dark') {
        score += 5;
      } else if (context.theme_variant === 'light' && asset.variant === 'light') {
        score += 5;
      }

      // Match size requirement
      if (context.size_requirement === 'icon' && asset.variant === 'icon') {
        score += 5;
      } else if (context.size_requirement === 'full' && asset.variant === 'full') {
        score += 5;
      }

      // Check recommended_for matches
      if (context.background_color && asset.recommended_for.includes(context.background_color)) {
        score += 3;
      }

      return { asset, score };
    });

    // Sort by score and return best match
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.asset || null;
  }

  /**
   * Get the best logo URL for a given context
   */
  async getBestLogoUrl(context: AssetContext = {}): Promise<string | null> {
    const logos = await this.getAssetsByType('logo');
    const best = this.selectBestAsset(logos, context);

    if (!best) return null;

    // Prefer WebP format if available
    if (best.optimized_formats.webp) {
      return best.optimized_formats.webp;
    }

    return best.object_key;
  }

  // ===========================================================================
  // Asset Deletion Methods
  // ===========================================================================

  /**
   * Delete an asset
   */
  async deleteAsset(assetId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    await apiClient.delete(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets/${assetId}`
    );

    this.assets.delete(assetId);
    this.notifyListeners();
  }

  // ===========================================================================
  // Version Control Methods
  // ===========================================================================

  /**
   * Get version history for an asset type
   */
  async getVersionHistory(assetType: AssetType): Promise<VersionHistoryEntry[]> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const response = await apiClient.get<VersionHistoryEntry[]>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets/history?type=${assetType}`
    );

    return response.data || [];
  }

  /**
   * Restore a previous version of an asset
   */
  async restoreVersion(assetId: string): Promise<ApiResponse<BrandAsset>> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const response = await apiClient.post<BrandAsset>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets/${assetId}/restore`
    );

    if (response.data) {
      // Update cache
      await this.listAssets();
      this.notifyListeners();
    }

    return response;
  }

  // ===========================================================================
  // Bulk Operations
  // ===========================================================================

  /**
   * Replace logo across all galleries
   */
  async bulkReplaceLogo(newLogoAssetId: string): Promise<{ updated: number; failed: number }> {
    if (!this.workspaceId) {
      throw new Error('Workspace not initialized');
    }

    const response = await apiClient.post<{ updated: number; failed: number }>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/assets/bulk-replace-logo`,
      { logo_asset_id: newLogoAssetId }
    );

    return response.data || { updated: 0, failed: 0 };
  }

  // ===========================================================================
  // Subscription Methods
  // ===========================================================================

  /**
   * Subscribe to asset changes
   */
  subscribe(listener: AssetChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify listeners of changes
   */
  private notifyListeners(): void {
    const assets = Array.from(this.assets.values());
    this.listeners.forEach((listener) => {
      try {
        listener(assets);
      } catch (error) {
        console.error('Asset listener error:', error);
      }
    });
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Get recommended dimensions for a variant
   */
  getRecommendedDimensions(variant: AssetVariant): { width: number; height: number } {
    return RECOMMENDED_DIMENSIONS[variant];
  }

  /**
   * Get all allowed MIME types
   */
  getAllowedMimeTypes(): string[] {
    return [...ALLOWED_MIME_TYPES];
  }

  /**
   * Get maximum file size
   */
  getMaxFileSize(): number {
    return MAX_FILE_SIZE;
  }

  /**
   * Reset service state (for testing)
   */
  reset(): void {
    this.assets.clear();
    this.listeners.clear();
    this.workspaceId = null;
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const brandAssetService = BrandAssetService.getInstance();

// Export class for testing
export { BrandAssetService };
