/**
 * Preview Sharing Service
 *
 * Service for creating, managing, and tracking preview links
 * for profile sharing with external stakeholders.
 *
 * Requirements: 9.1, 9.2, 9.8, 9.9, 9.10
 */

import apiClient, { type ApiResponse } from '@/services/api';
import type {
  PreviewLink,
  PreviewExpiration,
  CreatePreviewLinkOptions,
  PreviewComment,
} from '@/types/profileEditor';

// =============================================================================
// Types
// =============================================================================

export interface PreviewViewStats {
  total_views: number;
  unique_viewers: number;
  views_by_day: { date: string; count: number }[];
  last_viewed_at?: string;
}

export interface PreviewAccessResult {
  success: boolean;
  profile?: {
    profile_id: string;
    workspace_id: string;
    data: Record<string, unknown>;
  };
  error?: 'expired' | 'revoked' | 'password_required' | 'invalid_password' | 'not_found';
  requires_password: boolean;
}

export interface PreviewLinkListOptions {
  include_revoked?: boolean;
  include_expired?: boolean;
  limit?: number;
  offset?: number;
}

type PreviewLinkChangeListener = (links: PreviewLink[]) => void;

// =============================================================================
// Constants
// =============================================================================

const EXPIRATION_MS: Record<PreviewExpiration, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

// =============================================================================
// Preview Sharing Service Class
// =============================================================================

class PreviewSharingService {
  private static instance: PreviewSharingService;

  private workspaceId: string | null = null;
  private profileId: string | null = null;
  private links: Map<string, PreviewLink> = new Map();
  private listeners: Set<PreviewLinkChangeListener> = new Set();

  private constructor() {}

  public static getInstance(): PreviewSharingService {
    if (!PreviewSharingService.instance) {
      PreviewSharingService.instance = new PreviewSharingService();
    }
    return PreviewSharingService.instance;
  }

  // ===========================================================================
  // Initialization
  // ===========================================================================

  /**
   * Initialize service with workspace and profile context
   */
  initialize(workspaceId: string, profileId: string): void {
    this.workspaceId = workspaceId;
    this.profileId = profileId;
  }

  // ===========================================================================
  // Preview Link Creation
  // ===========================================================================

  /**
   * Create a new preview link
   * Requirement 9.1: Preview link generation with expiration
   */
  async createPreviewLink(
    options: CreatePreviewLinkOptions
  ): Promise<ApiResponse<PreviewLink>> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const expiresAt = new Date(Date.now() + EXPIRATION_MS[options.expiration]);

    const response = await apiClient.post<PreviewLink>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/preview-links`,
      {
        profile_id: this.profileId,
        expires_at: expiresAt.toISOString(),
        password: options.password,
      }
    );

    if (response.data) {
      this.links.set(response.data.link_id, response.data);
      this.notifyListeners();
    }

    return response;
  }

  /**
   * Create a quick share link with default 7-day expiration
   */
  async createQuickShareLink(): Promise<PreviewLink | null> {
    const response = await this.createPreviewLink({ expiration: '7d' });
    return response.data || null;
  }

  // ===========================================================================
  // Preview Link Retrieval
  // ===========================================================================

  /**
   * Get all preview links for the profile
   * Requirement 9.2: List and manage preview links
   */
  async listPreviewLinks(
    options: PreviewLinkListOptions = {}
  ): Promise<PreviewLink[]> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const params = new URLSearchParams();
    params.set('profile_id', this.profileId);

    if (options.include_revoked !== undefined) {
      params.set('include_revoked', options.include_revoked.toString());
    }
    if (options.include_expired !== undefined) {
      params.set('include_expired', options.include_expired.toString());
    }
    if (options.limit) {
      params.set('limit', options.limit.toString());
    }
    if (options.offset) {
      params.set('offset', options.offset.toString());
    }

    const queryString = params.toString();
    const url = `/v1/workspaces/${this.workspaceId}/profile-editor/preview-links${queryString ? `?${queryString}` : ''}`;

    const response = await apiClient.get<PreviewLink[]>(url);

    if (response.data) {
      this.links.clear();
      for (const link of response.data) {
        this.links.set(link.link_id, link);
      }
      this.notifyListeners();
      return response.data;
    }

    return [];
  }

  /**
   * Get a specific preview link by ID
   */
  async getPreviewLink(linkId: string): Promise<PreviewLink | null> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    // Check cache first
    if (this.links.has(linkId)) {
      return this.links.get(linkId)!;
    }

    const response = await apiClient.get<PreviewLink>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/preview-links/${linkId}`
    );

    if (response.data) {
      this.links.set(response.data.link_id, response.data);
      return response.data;
    }

    return null;
  }

  /**
   * Get preview by token (for external access)
   * Requirement 9.8: Preview access by token
   */
  async getPreviewByToken(
    token: string,
    password?: string
  ): Promise<PreviewAccessResult> {
    const response = await apiClient.post<PreviewAccessResult>(
      `/v1/public/preview/${token}`,
      { password }
    );

    if (!response.data) {
      return {
        success: false,
        error: 'not_found',
        requires_password: false,
      };
    }

    return response.data;
  }

  /**
   * Get active (non-revoked, non-expired) links
   */
  getActiveLinks(): PreviewLink[] {
    const now = new Date();
    return Array.from(this.links.values()).filter((link) => {
      if (link.is_revoked) return false;
      const expiresAt = new Date(link.expires_at);
      return expiresAt > now;
    });
  }

  // ===========================================================================
  // Preview Link Management
  // ===========================================================================

  /**
   * Revoke a preview link
   * Requirement 9.9: Preview link revocation
   */
  async revokePreviewLink(linkId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    await apiClient.post(
      `/v1/workspaces/${this.workspaceId}/profile-editor/preview-links/${linkId}/revoke`
    );

    // Update local cache
    const link = this.links.get(linkId);
    if (link) {
      this.links.set(linkId, {
        ...link,
        is_revoked: true,
        revoked_at: new Date().toISOString(),
      });
      this.notifyListeners();
    }
  }

  /**
   * Revoke all active preview links
   */
  async revokeAllLinks(): Promise<number> {
    if (!this.workspaceId || !this.profileId) {
      throw new Error('Service not initialized');
    }

    const response = await apiClient.post<{ revoked_count: number }>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/preview-links/revoke-all`,
      { profile_id: this.profileId }
    );

    if (response.data) {
      // Mark all as revoked in cache
      const now = new Date().toISOString();
      for (const [id, link] of this.links.entries()) {
        if (!link.is_revoked) {
          this.links.set(id, {
            ...link,
            is_revoked: true,
            revoked_at: now,
          });
        }
      }
      this.notifyListeners();
      return response.data.revoked_count;
    }

    return 0;
  }

  /**
   * Delete a preview link permanently
   */
  async deletePreviewLink(linkId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    await apiClient.delete(
      `/v1/workspaces/${this.workspaceId}/profile-editor/preview-links/${linkId}`
    );

    this.links.delete(linkId);
    this.notifyListeners();
  }

  /**
   * Update preview link password
   */
  async updatePassword(
    linkId: string,
    password: string | null
  ): Promise<ApiResponse<PreviewLink>> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    const response = await apiClient.patch<PreviewLink>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/preview-links/${linkId}`,
      { password }
    );

    if (response.data) {
      this.links.set(response.data.link_id, response.data);
      this.notifyListeners();
    }

    return response;
  }

  /**
   * Extend preview link expiration
   */
  async extendExpiration(
    linkId: string,
    newExpiration: PreviewExpiration
  ): Promise<ApiResponse<PreviewLink>> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    const expiresAt = new Date(Date.now() + EXPIRATION_MS[newExpiration]);

    const response = await apiClient.patch<PreviewLink>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/preview-links/${linkId}`,
      { expires_at: expiresAt.toISOString() }
    );

    if (response.data) {
      this.links.set(response.data.link_id, response.data);
      this.notifyListeners();
    }

    return response;
  }

  // ===========================================================================
  // View Tracking
  // ===========================================================================

  /**
   * Get view statistics for a preview link
   * Requirement 9.10: View tracking
   */
  async getViewStats(linkId: string): Promise<PreviewViewStats | null> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    const response = await apiClient.get<PreviewViewStats>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/preview-links/${linkId}/stats`
    );

    return response.data || null;
  }

  /**
   * Track a view (called when preview is accessed)
   */
  async trackView(token: string): Promise<void> {
    await apiClient.post(`/v1/public/preview/${token}/track`, {
      event: 'view',
    });
  }

  // ===========================================================================
  // Comments & Feedback
  // ===========================================================================

  /**
   * Get comments for a preview link
   */
  async getComments(linkId: string): Promise<PreviewComment[]> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    const response = await apiClient.get<PreviewComment[]>(
      `/v1/workspaces/${this.workspaceId}/profile-editor/preview-links/${linkId}/comments`
    );

    return response.data || [];
  }

  /**
   * Add a comment to a preview (for external viewers)
   */
  async addComment(
    token: string,
    content: string,
    options: {
      commenter_name?: string;
      commenter_email?: string;
      element_selector?: string;
    } = {}
  ): Promise<ApiResponse<PreviewComment>> {
    return apiClient.post<PreviewComment>(
      `/v1/public/preview/${token}/comments`,
      {
        content,
        ...options,
      }
    );
  }

  /**
   * Resolve a comment
   */
  async resolveComment(linkId: string, commentId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    await apiClient.post(
      `/v1/workspaces/${this.workspaceId}/profile-editor/preview-links/${linkId}/comments/${commentId}/resolve`
    );
  }

  /**
   * Delete a comment
   */
  async deleteComment(linkId: string, commentId: string): Promise<void> {
    if (!this.workspaceId) {
      throw new Error('Service not initialized');
    }

    await apiClient.delete(
      `/v1/workspaces/${this.workspaceId}/profile-editor/preview-links/${linkId}/comments/${commentId}`
    );
  }

  // ===========================================================================
  // Subscription Methods
  // ===========================================================================

  /**
   * Subscribe to preview link changes
   */
  subscribe(listener: PreviewLinkChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify listeners of changes
   */
  private notifyListeners(): void {
    const links = Array.from(this.links.values());
    this.listeners.forEach((listener) => {
      try {
        listener(links);
      } catch (error) {
        console.error('Preview link listener error:', error);
      }
    });
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Check if a preview link is expired
   */
  isExpired(link: PreviewLink): boolean {
    return new Date(link.expires_at) < new Date();
  }

  /**
   * Check if a preview link is active (not revoked and not expired)
   */
  isActive(link: PreviewLink): boolean {
    return !link.is_revoked && !this.isExpired(link);
  }

  /**
   * Format expiration for display
   */
  formatExpiration(link: PreviewLink): string {
    const expiresAt = new Date(link.expires_at);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();

    if (diffMs <= 0) {
      return 'Expired';
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 24) {
      return `Expires in ${diffHours} hour${diffHours !== 1 ? 's' : ''}`;
    }

    return `Expires in ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
  }

  /**
   * Get status label for a preview link
   */
  getStatusLabel(link: PreviewLink): { label: string; variant: 'success' | 'warning' | 'error' } {
    if (link.is_revoked) {
      return { label: 'Revoked', variant: 'error' };
    }

    const expiresAt = new Date(link.expires_at);
    const now = new Date();
    const diffMs = expiresAt.getTime() - now.getTime();

    if (diffMs <= 0) {
      return { label: 'Expired', variant: 'error' };
    }

    // Less than 24 hours remaining
    if (diffMs < 24 * 60 * 60 * 1000) {
      return { label: 'Expiring Soon', variant: 'warning' };
    }

    return { label: 'Active', variant: 'success' };
  }

  /**
   * Generate shareable URL for clipboard
   */
  getShareableUrl(link: PreviewLink): string {
    return link.url;
  }

  /**
   * Copy link to clipboard
   */
  async copyToClipboard(link: PreviewLink): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(link.url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cached links
   */
  getCachedLinks(): PreviewLink[] {
    return Array.from(this.links.values());
  }

  /**
   * Reset service state (for testing)
   */
  reset(): void {
    this.links.clear();
    this.listeners.clear();
    this.workspaceId = null;
    this.profileId = null;
  }
}

// =============================================================================
// Export Singleton Instance
// =============================================================================

export const previewSharingService = PreviewSharingService.getInstance();

// Export class for testing
export { PreviewSharingService };
