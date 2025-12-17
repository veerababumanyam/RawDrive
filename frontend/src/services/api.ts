/**
 * API Client with authentication interceptors
 * Handles token refresh on 401 responses
 * Requirement 13.3
 */

import { getStoredTokens, setStoredTokens, clearStoredTokens } from './tokenStorage';

// Types
export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId?: string;
    timestamp?: string;
    details?: Record<string, unknown>;
  };
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError['error'];
}

// Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

/**
 * Check if an error is an API error
 */
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as ApiError).error === 'object'
  );
}

/**
 * Refresh the access token using the refresh token
 */
async function refreshAccessToken(): Promise<string | null> {
  const tokens = getStoredTokens();
  if (!tokens?.refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    });

    if (!response.ok) {
      // Refresh failed, clear tokens
      clearStoredTokens();
      return null;
    }

    const data = await response.json();
    const newTokens = {
      accessToken: data.tokens.access_token,
      refreshToken: data.tokens.refresh_token,
      expiresAt: Date.now() + (data.tokens.expires_in || 3600) * 1000,
    };

    setStoredTokens(newTokens);
    return newTokens.accessToken;
  } catch (error) {
    console.error('Token refresh failed:', error);
    clearStoredTokens();
    return null;
  }
}

/**
 * API client with automatic token refresh
 */
class ApiClient {
  private baseUrl: string;
  private isRefreshing: boolean = false;
  private refreshPromise: Promise<string | null> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Get authorization header
   */
  private getAuthHeader(): Record<string, string> {
    const tokens = getStoredTokens();
    if (tokens?.accessToken) {
      return { Authorization: `Bearer ${tokens.accessToken}` };
    }
    return {};
  }

  /**
   * Handle token refresh with deduplication
   */
  private async handleTokenRefresh(): Promise<string | null> {
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise;
    }

    this.isRefreshing = true;
    this.refreshPromise = refreshAccessToken();

    try {
      const token = await this.refreshPromise;
      return token;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  /**
   * Make an authenticated API request
   */
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    // Add auth header if available
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.getAuthHeader(),
      ...(options.headers as Record<string, string>),
    };

    try {
      let response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle 401 - try token refresh
      if (response.status === 401) {
        const newToken = await this.handleTokenRefresh();

        if (newToken) {
          // Retry request with new token
          response = await fetch(url, {
            ...options,
            headers: {
              ...headers,
              Authorization: `Bearer ${newToken}`,
            },
          });
        } else {
          // Redirect to signin
          window.location.href = `/signin?redirect=${encodeURIComponent(window.location.pathname)}`;
          return { error: { code: 'UNAUTHORIZED', message: 'Session expired' } };
        }
      }

      // Parse response
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return { error: data.error || { code: 'UNKNOWN', message: 'Request failed' } };
      }

      return { data };
    } catch (error) {
      console.error('API request failed:', error);
      return {
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network error',
        },
      };
    }
  }

  // Convenience methods
  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

// Export singleton instance
export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;
