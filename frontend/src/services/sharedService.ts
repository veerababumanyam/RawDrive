/**
 * Shared Dashboard Service
 * API client for Security & Sharing Dashboard operations
 *
 * Provides methods for:
 * - Listing all shared links across workspace
 * - Getting aggregate statistics
 * - Bulk revocation (Kill Switch)
 * - Exporting sharing data
 */

import apiClient from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AccessPolicy {
  password_protected: boolean;
  pin_protected: boolean;
  email_required: boolean;
  download_policy: string;
}

export interface RecentVisitor {
  country_code: string | null;
  device_type: string | null;
  accessed_at: string | null;
}

export interface SharedLinkItem {
  link_id: string;
  gallery_id: string;
  gallery_title: string | null;
  gallery_status: string | null;
  label: string | null;
  status: 'active' | 'expired' | 'revoked';
  target_type: 'gallery' | 'sub_gallery' | 'photo';
  target_id: string | null;
  expires_at: string | null;
  max_accesses: number | null;
  access_count: number;
  last_accessed_at: string | null;
  access_policy: AccessPolicy;
  recent_visitors: RecentVisitor[];
  created_at: string;
  created_by_name: string | null;
}

export interface SharedLinksMeta {
  total: number;
  active_count: number;
  expired_count: number;
  revoked_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface SharedLinksResponse {
  data: SharedLinkItem[];
  meta: SharedLinksMeta;
}

export interface Visitor {
  visitor_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

export interface AccessLogEntry {
  access_id: string;
  accessed_at: string;
  ip_address: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  email_gate_passed: boolean;
  pin_gate_passed: boolean;
  visitor: Visitor | null;
}

export interface SharedLinkDetail extends SharedLinkItem {
  gallery_description: string | null;
  updated_at: string | null;
  created_by_email: string | null;
  accesses: AccessLogEntry[];
}

export interface DeviceBreakdown {
  desktop: number;
  mobile: number;
  tablet: number;
}

export interface DailyAccess {
  date: string;
  count: number;
}

export interface TopGallery {
  gallery_id: string;
  gallery_title: string;
  link_count: number;
  access_count: number;
}

export interface TopCountry {
  country_code: string;
  count: number;
}

export interface SharedStats {
  total_links: number;
  active_links: number;
  expired_links: number;
  revoked_links: number;
  total_accesses_period: number;
  unique_visitors_period: number;
  period_days: number;
  device_breakdown: DeviceBreakdown;
  accesses_by_day: DailyAccess[];
  top_galleries: TopGallery[];
  top_countries: TopCountry[];
}

export interface BulkRevokeFailure {
  link_id: string;
  error: string;
}

export interface BulkRevokeResponse {
  revoked_count: number;
  failed: BulkRevokeFailure[];
}

export interface ListLinksOptions {
  limit?: number;
  offset?: number;
  status?: 'active' | 'expired' | 'revoked' | 'all';
  exclude_revoked?: boolean; // Hide revoked links from list (default: false for backward compatibility)
  gallery_id?: string;
  search?: string;
  sort_by?: 'created_at' | 'access_count' | 'expires_at' | 'last_accessed_at';
  sort_order?: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// Error Handling
// ---------------------------------------------------------------------------

export class SharedServiceError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'SharedServiceError';
    this.code = code;
    this.status = status;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  LINK_NOT_FOUND: 'This link could not be found',
  BULK_OPERATION_FAILED: 'Failed to revoke some links',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
};

function getErrorMessage(code: string, fallback?: string): string {
  return ERROR_MESSAGES[code] || fallback || 'An error occurred';
}

// ---------------------------------------------------------------------------
// Service Class
// ---------------------------------------------------------------------------

export class SharedService {
  /**
   * List all shared links across the workspace
   */
  async listLinks(
    workspaceId: string,
    options?: ListLinksOptions
  ): Promise<SharedLinksResponse> {
    const params = new URLSearchParams();

    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());
    if (options?.status) params.append('status', options.status);
    if (options?.exclude_revoked !== undefined) params.append('exclude_revoked', options.exclude_revoked.toString());
    if (options?.gallery_id) params.append('gallery_id', options.gallery_id);
    if (options?.search) params.append('search', options.search);
    if (options?.sort_by) params.append('sort_by', options.sort_by);
    if (options?.sort_order) params.append('sort_order', options.sort_order);

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/shared/links${query ? `?${query}` : ''}`;

    const response = await apiClient.get<SharedLinksResponse>(endpoint);
    if (response.error) {
      throw new SharedServiceError(
        getErrorMessage(response.error.code, response.error.message),
        response.error.code || 'INTERNAL_ERROR',
        response.error.status || 500
      );
    }
    return response.data!;
  }

  /**
   * Get detailed information for a single link
   */
  async getLinkDetail(
    workspaceId: string,
    linkId: string
  ): Promise<SharedLinkDetail> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/shared/links/${linkId}`;

    const response = await apiClient.get<SharedLinkDetail>(endpoint);
    if (response.error) {
      throw new SharedServiceError(
        getErrorMessage(response.error.code, response.error.message),
        response.error.code || 'INTERNAL_ERROR',
        response.error.status || 500
      );
    }
    return response.data!;
  }

  /**
   * Get aggregate sharing statistics
   */
  async getStats(workspaceId: string, days: number = 30): Promise<SharedStats> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/shared/stats?days=${days}`;

    const response = await apiClient.get<SharedStats>(endpoint);
    if (response.error) {
      throw new SharedServiceError(
        getErrorMessage(response.error.code, response.error.message),
        response.error.code || 'INTERNAL_ERROR',
        response.error.status || 500
      );
    }
    return response.data!;
  }

  /**
   * Revoke a single link
   */
  async revokeLink(workspaceId: string, linkId: string): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/shared/links/${linkId}`;

    const response = await apiClient.delete<{ message: string }>(endpoint);
    if (response.error) {
      throw new SharedServiceError(
        getErrorMessage(response.error.code, response.error.message),
        response.error.code || 'INTERNAL_ERROR',
        response.error.status || 500
      );
    }
  }

  /**
   * Bulk revoke multiple links (Kill Switch)
   */
  async bulkRevoke(
    workspaceId: string,
    linkIds: string[],
    reason?: string
  ): Promise<BulkRevokeResponse> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/shared/bulk-revoke`;

    const response = await apiClient.post<BulkRevokeResponse>(endpoint, {
      link_ids: linkIds,
      reason,
    });
    if (response.error) {
      throw new SharedServiceError(
        getErrorMessage(response.error.code, response.error.message),
        response.error.code || 'INTERNAL_ERROR',
        response.error.status || 500
      );
    }
    return response.data!;
  }

  /**
   * Export sharing data for compliance
   */
  async exportData(
    workspaceId: string,
    options?: {
      format?: 'csv' | 'json';
      date_from?: string;
      date_to?: string;
    }
  ): Promise<Blob> {
    const params = new URLSearchParams();
    if (options?.format) params.append('format', options.format);
    if (options?.date_from) params.append('date_from', options.date_from);
    if (options?.date_to) params.append('date_to', options.date_to);

    const query = params.toString();
    const endpoint = `/api/v1/workspaces/${workspaceId}/shared/export${query ? `?${query}` : ''}`;

    const response = await fetch(endpoint, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new SharedServiceError(
        getErrorMessage(error.code, error.message),
        error.code || 'INTERNAL_ERROR',
        response.status
      );
    }

    return response.blob();
  }

  /**
   * Download export file
   */
  async downloadExport(
    workspaceId: string,
    options?: {
      format?: 'csv' | 'json';
      date_from?: string;
      date_to?: string;
    }
  ): Promise<void> {
    const blob = await this.exportData(workspaceId, options);
    const format = options?.format || 'csv';
    const filename = `sharing_export_${new Date().toISOString().slice(0, 10)}.${format}`;

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
  // Utility Methods
  // ---------------------------------------------------------------------------

  /**
   * Format expiration for display
   */
  formatExpiration(expiresAt: string | null | undefined): string {
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
      return `${days}d remaining`;
    } else if (hours > 0) {
      return `${hours}h remaining`;
    } else {
      return 'Expires soon';
    }
  }

  /**
   * Format access count for display
   */
  formatAccessCount(count: number, max?: number | null): string {
    if (max) {
      return `${count} / ${max}`;
    }
    return count.toString();
  }

  /**
   * Get status badge color
   */
  getStatusColor(status: string): string {
    switch (status) {
      case 'active':
        return 'success';
      case 'expired':
        return 'warning';
      case 'revoked':
        return 'error';
      default:
        return 'default';
    }
  }

  /**
   * Get country name from code
   */
  getCountryName(code: string): string {
    const countries: Record<string, string> = {
      US: 'United States',
      GB: 'United Kingdom',
      CA: 'Canada',
      AU: 'Australia',
      DE: 'Germany',
      FR: 'France',
      IN: 'India',
      JP: 'Japan',
      BR: 'Brazil',
      XX: 'Unknown',
    };
    return countries[code] || code;
  }

  /**
   * Get device icon name
   */
  getDeviceIcon(deviceType: string | null): string {
    switch (deviceType) {
      case 'mobile':
        return 'Smartphone';
      case 'tablet':
        return 'Tablet';
      case 'desktop':
      default:
        return 'Monitor';
    }
  }
}

// Export singleton instance
export const sharedService = new SharedService();
export default sharedService;
