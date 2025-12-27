/**
 * Magic Link Service
 * API client for Magic Link operations
 *
 * Provides methods for:
 * - Creating and managing magic links (authenticated)
 * - Validating magic link tokens (public)
 * - Downloading QR codes in various formats
 */

import apiClient from './api';
import type {
  MagicLink,
  MagicLinkListResponse,
  MagicLinkStats,
  CreateMagicLinkRequest,
  ValidatedMagicLink,
} from '../types/gallery';

// Error types for user-friendly messages
export class MagicLinkError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'MagicLinkError';
    this.code = code;
    this.status = status;
  }
}

// Error code to user-friendly message mapping
const ERROR_MESSAGES: Record<string, string> = {
  LINK_NOT_FOUND: 'This link could not be found',
  LINK_EXPIRED: 'This link has expired',
  LINK_REVOKED: 'This link is no longer valid',
  LINK_ACCESS_LIMIT: 'This link has reached its maximum number of views',
  SHARING_DISABLED: 'Sharing is not enabled for this gallery',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  LINK_INVALID: 'This link is not valid',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
};

/**
 * Get user-friendly error message from error code
 */
function getErrorMessage(code: string, fallback?: string): string {
  return ERROR_MESSAGES[code] || fallback || 'An error occurred';
}

export class MagicLinkService {
  // ---------------------------------------------------------------------------
  // Authenticated Endpoints (Workspace Admin)
  // ---------------------------------------------------------------------------

  /**
   * List magic links for a gallery
   */
  async listLinks(
    workspaceId: string,
    galleryId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: 'active' | 'expired' | 'revoked';
    }
  ): Promise<MagicLinkListResponse> {
    const params = new URLSearchParams();
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.status) params.append('status', options.status);

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/magic-links${query ? `?${query}` : ''}`;

    const response = await apiClient.get<MagicLinkListResponse>(endpoint);
    if (response.error) {
      throw new MagicLinkError(
        getErrorMessage(response.error.code, response.error.message),
        response.error.code || 'INTERNAL_ERROR',
        response.error.status || 500
      );
    }
    return response.data!;
  }

  /**
   * Create a new magic link
   *
   * IMPORTANT: The returned `token` and `url` are only available in this response.
   * They are not stored in plaintext and cannot be retrieved later.
   * Make sure to save them immediately after creation.
   */
  async createLink(
    workspaceId: string,
    galleryId: string,
    data: CreateMagicLinkRequest
  ): Promise<MagicLink> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/magic-links`;

    const response = await apiClient.post<MagicLink>(endpoint, data);
    if (response.error) {
      throw new MagicLinkError(
        getErrorMessage(response.error.code, response.error.message),
        response.error.code || 'INTERNAL_ERROR',
        response.error.status || 500
      );
    }
    return response.data!;
  }

  /**
   * Get a magic link by ID
   */
  async getLink(
    workspaceId: string,
    galleryId: string,
    linkId: string
  ): Promise<MagicLink> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/magic-links/${linkId}`;

    const response = await apiClient.get<MagicLink>(endpoint);
    if (response.error) {
      throw new MagicLinkError(
        getErrorMessage(response.error.code, response.error.message),
        response.error.code || 'INTERNAL_ERROR',
        response.error.status || 500
      );
    }
    return response.data!;
  }

  /**
   * Revoke a magic link
   */
  async revokeLink(
    workspaceId: string,
    galleryId: string,
    linkId: string
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/magic-links/${linkId}`;

    const response = await apiClient.delete<{ message: string }>(endpoint);
    if (response.error) {
      throw new MagicLinkError(
        getErrorMessage(response.error.code, response.error.message),
        response.error.code || 'INTERNAL_ERROR',
        response.error.status || 500
      );
    }
  }

  /**
   * Get access statistics for a magic link
   */
  async getLinkStats(
    workspaceId: string,
    galleryId: string,
    linkId: string,
    days: number = 30
  ): Promise<MagicLinkStats> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/magic-links/${linkId}/stats?days=${days}`;

    const response = await apiClient.get<MagicLinkStats>(endpoint);
    if (response.error) {
      throw new MagicLinkError(
        getErrorMessage(response.error.code, response.error.message),
        response.error.code || 'INTERNAL_ERROR',
        response.error.status || 500
      );
    }
    return response.data!;
  }

  /**
   * Get QR code for a magic link
   *
   * @param format - Output format: 'png', 'svg', or 'pdf'
   * @param size - Size in pixels (256-4096)
   * @param color - QR code color (hex format, e.g., '#000000')
   * @returns Blob containing the QR code
   */
  async getQRCode(
    workspaceId: string,
    galleryId: string,
    linkId: string,
    options?: {
      format?: 'png' | 'svg' | 'pdf';
      size?: number;
      color?: string;
    }
  ): Promise<Blob> {
    const params = new URLSearchParams();
    if (options?.format) params.append('format', options.format);
    if (options?.size) params.append('size', options.size.toString());
    if (options?.color) params.append('color', options.color);

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/galleries/${galleryId}/magic-links/${linkId}/qr${query ? `?${query}` : ''}`;

    // Use apiClient.fetchRaw to handle base URL and authentication
    const response = await apiClient.fetchRaw(endpoint);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new MagicLinkError(
        getErrorMessage(error.code, error.message),
        error.code || 'INTERNAL_ERROR',
        response.status
      );
    }

    return response.blob();
  }

  /**
   * Download QR code to device
   */
  async downloadQRCode(
    workspaceId: string,
    galleryId: string,
    linkId: string,
    options?: {
      format?: 'png' | 'svg' | 'pdf';
      size?: number;
      color?: string;
      filename?: string;
    }
  ): Promise<void> {
    const blob = await this.getQRCode(workspaceId, galleryId, linkId, options);

    // Create download link
    const format = options?.format || 'png';
    const filename = options?.filename || `qr-code.${format}`;
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Public Endpoints (No Auth Required)
  // ---------------------------------------------------------------------------

  /**
   * Validate a magic link token
   *
   * This is used by the public gallery page to:
   * 1. Verify the link is valid
   * 2. Get gallery data for rendering
   * 3. Check if PIN or email registration is required
   */
  async validateToken(token: string): Promise<ValidatedMagicLink> {
    const endpoint = `/api/v1/public/magic-links/${token}`;

    const response = await apiClient.get<ValidatedMagicLink>(endpoint);
    if (response.error) {
      throw new MagicLinkError(
        getErrorMessage(response.error.code, response.error.message),
        response.error.code || 'LINK_INVALID',
        response.error.status || 404
      );
    }
    return response.data!;
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Copy magic link URL to clipboard
   */
  async copyToClipboard(url: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textArea);
      return success;
    }
  }

  /**
   * Share magic link using Web Share API (mobile-friendly)
   * Falls back to copying to clipboard if not supported
   */
  async share(
    url: string,
    title?: string,
    text?: string
  ): Promise<{ shared: boolean; copied: boolean }> {
    // Check if Web Share API is available
    if (navigator.share) {
      try {
        await navigator.share({
          title: title || 'Gallery Link',
          text: text || 'Check out this gallery',
          url,
        });
        return { shared: true, copied: false };
      } catch (err) {
        // User cancelled or share failed - fallback to clipboard
        if ((err as Error).name !== 'AbortError') {
          console.warn('Share failed, falling back to clipboard', err);
        }
      }
    }

    // Fallback to clipboard
    const copied = await this.copyToClipboard(url);
    return { shared: false, copied };
  }

  /**
   * Format expiration time for display
   */
  formatExpiration(expiresAt: string | undefined): string {
    if (!expiresAt) return 'Never expires';

    const expDate = new Date(expiresAt);
    const now = new Date();

    if (expDate < now) {
      return 'Expired';
    }

    const diff = expDate.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 30) {
      return `Expires ${expDate.toLocaleDateString()}`;
    } else if (days > 0) {
      return `Expires in ${days} day${days === 1 ? '' : 's'}`;
    } else if (hours > 0) {
      return `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
    } else {
      return 'Expires soon';
    }
  }

  /**
   * Format access count for display
   */
  formatAccessCount(count: number, max?: number): string {
    if (max) {
      return `${count} / ${max} views`;
    }
    return `${count} view${count === 1 ? '' : 's'}`;
  }
}

// Export singleton instance
export const magicLinkService = new MagicLinkService();
export default magicLinkService;
