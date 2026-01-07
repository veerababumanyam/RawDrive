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
    status?: number;
  };
}

export interface ApiResponse<T> {
  data?: T;
  error?: ApiError['error'];
}

// Type guard for API errors
export function isApiError(error: unknown): error is ApiError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'error' in error &&
    typeof (error as ApiError).error === 'object' &&
    (error as ApiError).error !== null &&
    'code' in (error as ApiError).error &&
    'message' in (error as ApiError).error
  );
}

// Configuration
/**
 * Get the API base URL from environment variable
 * Only uses VITE_API_URL if it's a non-empty string
 * This prevents issues with empty string values that would break relative URLs
 */
export function getApiBaseUrl(): string {
  const viteUrl = import.meta.env.VITE_API_URL;
  // Only use VITE_API_URL if it's a non-empty string
  if (viteUrl && typeof viteUrl === 'string' && viteUrl.trim() !== '') {
    return viteUrl.trim();
  }
  return 'http://localhost:8000';
}

export const API_BASE_URL = getApiBaseUrl();
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 second
const TIMEOUT_MS = 60000; // 60 seconds

// Unauthenticated endpoints that should not trigger session expiration on 401
const UNAUTHENTICATED_ENDPOINTS = [
  '/api/v1/auth/login',
  '/api/v1/auth/signup',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/verify-email',
  '/api/v1/onboarding',
];

// Event for auth state changes - allows React to handle navigation instead of hard redirects
export const AUTH_EVENTS = {
  SESSION_EXPIRED: 'rawdrive:session_expired',
} as const;

/**
 * Emit auth session expired event
 * This allows React components to handle the redirect gracefully
 * instead of doing a hard window.location.href which causes flickering
 */
function emitSessionExpired(): void {
  window.dispatchEvent(new CustomEvent(AUTH_EVENTS.SESSION_EXPIRED, {
    detail: { redirectTo: window.location.pathname }
  }));
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
function calculateRetryDelay(attempt: number): number {
  const baseDelay = RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.25 * baseDelay; // ±25% jitter
  return Math.min(baseDelay + jitter, 30000); // Cap at 30 seconds
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: any): boolean {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Timeout errors - but NOT user-triggered aborts (component unmount, navigation)
  // AbortError from user action has message "signal is aborted without reason" or similar
  // Only retry explicit timeout aborts that have 'timeout' in the message
  if (error.name === 'AbortError') {
    const message = (error.message || '').toLowerCase();
    return message.includes('timeout');
  }
  const message = (error.message || '').toLowerCase();
  if (message.includes('timeout')) {
    return true;
  }

  // 5xx server errors
  if (error.status >= 500 && error.status < 600) {
    return true;
  }

  // 429 Too Many Requests
  if (error.status === 429) {
    return true;
  }

  return false;
}

/**
 * Refresh the access token using the refresh token
 */
export async function refreshAccessToken(): Promise<string | null> {
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
    // Refresh endpoint returns TokenResponse directly (flat), not nested under 'tokens'
    const newTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
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
   * Make an authenticated API request with retry logic
   */
  async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryCount: number = 0
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    // Add auth header if available
    // Don't set Content-Type for FormData - browser will set it with boundary
    const isFormData = options.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...this.getAuthHeader(),
      ...(options.headers as Record<string, string>),
    };

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('Request timed out')), TIMEOUT_MS);

    // Merge custom signal if provided
    if (options.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutId);
        controller.abort();
      } else {
        options.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          controller.abort();
        });
      }
    }

    try {
      let response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 401 - try token refresh
      if (response.status === 401) {
        // Check if this is an unauthenticated endpoint (login, signup, etc.)
        const isUnauthenticatedEndpoint = UNAUTHENTICATED_ENDPOINTS.some(
          (ep) => endpoint.startsWith(ep)
        );

        const newToken = await this.handleTokenRefresh();

        if (newToken) {
          // Retry request with new token
          clearTimeout(timeoutId);
          const retryController = new AbortController();
          const retryTimeoutId = setTimeout(() => retryController.abort(new Error('Request timed out')), TIMEOUT_MS);

          try {
            response = await fetch(url, {
              ...options,
              headers: {
                ...headers,
                Authorization: `Bearer ${newToken}`,
              },
              signal: retryController.signal,
            });
          } finally {
            clearTimeout(retryTimeoutId);
          }
        } else {
          // Only emit session expired for authenticated endpoints
          // For unauthenticated endpoints (like login), return a generic auth error
          if (!isUnauthenticatedEndpoint) {
            // Emit session expired event - let React handle the redirect gracefully
            // This prevents jarring hard redirects that can happen during normal user interactions
            emitSessionExpired();
          }

          return {
            error: {
              code: 'UNAUTHORIZED',
              message: isUnauthenticatedEndpoint
                ? 'Authentication failed'
                : 'Session expired'
            }
          };
        }
      }

      // Parse response
      let data: any = {};
      try {
        const text = await response.text();
        if (text) {
          data = JSON.parse(text);
        }
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        // If response is not JSON, try to extract error message
        if (!response.ok) {
          return {
            error: {
              code: `HTTP_${response.status}`,
              message: `Request failed with status ${response.status}`,
              status: response.status,
            },
          };
        }
      }

      if (!response.ok) {
        // Only log actual errors to console, skip 404s and 409s which are often expected/handled
        // 404: Resource not found (often checked before creating)
        // 409: Conflict (used in create-or-update patterns)
        if (response.status !== 404 && response.status !== 409) {
          console.error('API error response:', {
            status: response.status,
            statusText: response.statusText,
            data,
          });
        }

        // Check if error is retryable and we haven't exceeded max retries
        const baseError = data.error || data.detail || {
          code: `HTTP_${response.status}`,
          message: data.message || response.statusText || 'Request failed',
        };

        const error = {
          ...baseError,
          status: response.status,
        };

        if (isRetryableError(error) && retryCount < MAX_RETRIES) {
          const delay = calculateRetryDelay(retryCount + 1);
          console.log(`Retrying request in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
          await sleep(delay);
          return this.request<T>(endpoint, options, retryCount + 1);
        }

        return { error };
      }

      return { data };
    } catch (error) {
      clearTimeout(timeoutId);

      console.error('API request failed:', error);

      // Check if error is retryable (network/timeout errors)
      if (isRetryableError(error) && retryCount < MAX_RETRIES) {
        const delay = calculateRetryDelay(retryCount + 1);
        console.log(`Retrying request after network error in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        return this.request<T>(endpoint, options, retryCount + 1);
      }

      return {
        error: {
          code: error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network error',
        },
      };
    }
  }

  // Convenience methods with optional headers support
  async get<T>(endpoint: string, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET', headers: options?.headers });
  }

  async post<T>(endpoint: string, body?: unknown, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers: options?.headers,
    });
  }

  async patch<T>(endpoint: string, body?: unknown, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      headers: options?.headers,
    });
  }

  async put<T>(endpoint: string, body?: unknown, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      headers: options?.headers,
    });
  }

  async delete<T>(endpoint: string, data?: unknown, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
      body: data ? JSON.stringify(data) : undefined,
      headers: options?.headers,
    });
  }

  async upload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: formData,
      // Don't set Content-Type - browser will set it with boundary for FormData
    });
  }

  /**
   * Fetch raw response for binary data (images, files, etc.)
   * Returns the raw Response object for handling blobs
   */
  async fetchRaw(endpoint: string): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      ...this.getAuthHeader(),
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      let response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle 401 - try token refresh
      if (response.status === 401) {
        const newToken = await this.handleTokenRefresh();

        if (newToken) {
          const retryController = new AbortController();
          const retryTimeoutId = setTimeout(() => retryController.abort(), TIMEOUT_MS);

          try {
            response = await fetch(url, {
              method: 'GET',
              headers: {
                ...headers,
                Authorization: `Bearer ${newToken}`,
              },
              signal: retryController.signal,
            });
          } finally {
            clearTimeout(retryTimeoutId);
          }
        }
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;
