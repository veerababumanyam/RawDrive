/**
 * API Client for mobile app
 * Handles authentication, token refresh, and API requests
 */

import Constants from 'expo-constants';
import { API_CONFIG } from '../constants';
import { getStoredTokens, setStoredTokens, clearStoredTokens } from './secureStorage';
import type { ApiError, ApiResponse } from '../types';

// Get API URL from config
function getApiBaseUrl(): string {
  const extra = Constants.expoConfig?.extra;
  return extra?.apiUrl || 'http://localhost:8000/api/v1';
}

export const API_BASE_URL = getApiBaseUrl();

// Current workspace ID for header injection
let currentWorkspaceId: string | null = null;

/**
 * Set the current workspace ID for API requests
 */
export function setCurrentWorkspaceId(workspaceId: string | null): void {
  currentWorkspaceId = workspaceId;
}

/**
 * Get the current workspace ID
 */
export function getCurrentWorkspaceId(): string | null {
  return currentWorkspaceId;
}

// Global token refresh coordination
let globalRefreshPromise: Promise<string | null> | null = null;

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate retry delay with exponential backoff and jitter
 */
function calculateRetryDelay(attempt: number): number {
  const baseDelay = API_CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
  const jitter = Math.random() * 0.25 * baseDelay;
  return Math.min(baseDelay + jitter, 30000);
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: any): boolean {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Timeout errors
  if (error.name === 'AbortError') {
    const message = (error.message || '').toLowerCase();
    return message.includes('timeout');
  }

  const message = (error.message || '').toLowerCase();
  if (message.includes('timeout') || message.includes('network')) {
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
  const tokens = await getStoredTokens();
  if (!tokens?.refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    });

    if (!response.ok) {
      let errorDetails = '';
      try {
        const errorData = await response.json();
        errorDetails = JSON.stringify(errorData);
      } catch {
        errorDetails = `Status: ${response.status} ${response.statusText}`;
      }
      console.warn('[Auth] Token refresh failed:', errorDetails);
      await clearStoredTokens();
      return null;
    }

    const data = await response.json();
    const newTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    };

    await setStoredTokens(newTokens);
    return newTokens.accessToken;
  } catch (error) {
    console.error('Token refresh failed:', error);
    await clearStoredTokens();
    return null;
  }
}

/**
 * Coordinated token refresh - ensures only one refresh happens at a time
 */
export async function coordinatedRefreshAccessToken(): Promise<string | null> {
  if (globalRefreshPromise) {
    console.log('[Auth] Token refresh already in progress, waiting...');
    return globalRefreshPromise;
  }

  console.log('[Auth] Starting token refresh...');
  globalRefreshPromise = refreshAccessToken();

  try {
    const token = await globalRefreshPromise;
    return token;
  } finally {
    globalRefreshPromise = null;
  }
}

// Session expired callback
let onSessionExpired: (() => void) | null = null;

/**
 * Set callback for when session expires
 */
export function setOnSessionExpired(callback: () => void): void {
  onSessionExpired = callback;
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
  private async getAuthHeader(): Promise<Record<string, string>> {
    const tokens = await getStoredTokens();
    if (tokens?.accessToken) {
      return { Authorization: `Bearer ${tokens.accessToken}` };
    }
    return {};
  }

  /**
   * Get workspace header if set
   */
  private getWorkspaceHeader(): Record<string, string> {
    if (currentWorkspaceId) {
      return { 'X-Workspace-ID': currentWorkspaceId };
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

    // Add headers
    const isFormData = options.body instanceof FormData;
    const authHeader = await this.getAuthHeader();
    const headers: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeader,
      ...this.getWorkspaceHeader(),
      ...(options.headers as Record<string, string>),
    };

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(new Error('Request timed out')),
      API_CONFIG.TIMEOUT_MS
    );

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
        const newToken = await this.handleTokenRefresh();

        if (newToken) {
          // Retry request with new token
          const retryController = new AbortController();
          const retryTimeoutId = setTimeout(
            () => retryController.abort(new Error('Request timed out')),
            API_CONFIG.TIMEOUT_MS
          );

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
          // Session expired - trigger callback
          if (onSessionExpired) {
            onSessionExpired();
          }

          return {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Session expired',
            },
          };
        }
      }

      // Parse response
      let data: any = {};
      let responseText = '';
      try {
        responseText = await response.text();
        if (responseText) {
          const trimmedText = responseText.trim();
          if (trimmedText && (trimmedText.startsWith('{') || trimmedText.startsWith('['))) {
            data = JSON.parse(trimmedText);
          } else if (!response.ok) {
            const errorMessage = trimmedText || response.statusText || `Request failed with status ${response.status}`;
            return {
              error: {
                code: `HTTP_${response.status}`,
                message: errorMessage,
                status: response.status,
              },
            };
          }
        }
      } catch (parseError) {
        if (!response.ok) {
          const errorMessage = responseText.trim() || response.statusText || `Request failed with status ${response.status}`;
          return {
            error: {
              code: `HTTP_${response.status}`,
              message: errorMessage,
              status: response.status,
            },
          };
        }
        console.warn('Failed to parse JSON response (but status is OK):', parseError);
      }

      if (!response.ok) {
        const baseError = data.error || data.detail || {
          code: `HTTP_${response.status}`,
          message: data.message || response.statusText || 'Request failed',
        };

        const error = {
          ...baseError,
          status: response.status,
        };

        if (isRetryableError(error) && retryCount < API_CONFIG.MAX_RETRIES) {
          const delay = calculateRetryDelay(retryCount + 1);
          console.log(`Retrying request in ${delay}ms (attempt ${retryCount + 1}/${API_CONFIG.MAX_RETRIES})`);
          await sleep(delay);
          return this.request<T>(endpoint, options, retryCount + 1);
        }

        return { error };
      }

      return { data };
    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error('API request failed:', error);

      if (isRetryableError(error) && retryCount < API_CONFIG.MAX_RETRIES) {
        const delay = calculateRetryDelay(retryCount + 1);
        console.log(`Retrying request after error in ${delay}ms (attempt ${retryCount + 1}/${API_CONFIG.MAX_RETRIES})`);
        await sleep(delay);
        return this.request<T>(endpoint, options, retryCount + 1);
      }

      return {
        error: {
          code: error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
          message: error.message || 'Network error',
        },
      };
    }
  }

  // Convenience methods
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
    });
  }
}

// Export singleton instance
export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;
