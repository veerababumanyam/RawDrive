/**
 * Custom Axios instance for orval-generated API clients.
 *
 * This mutator integrates with RawDrive's authentication system and
 * provides consistent error handling across all API calls.
 */
import type { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';

// Re-export for use in generated clients
export type { AxiosError, AxiosRequestConfig, AxiosResponse };

/**
 * API Error response structure following RawDrive conventions.
 */
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

/**
 * Custom axios instance that handles authentication and error formatting.
 *
 * This function is used by orval-generated clients as a mutator.
 * It integrates with the application's auth token management.
 *
 * @example
 * ```typescript
 * // Generated client usage
 * import { getGalleries } from '@rawdrive/api-types/gallery-service';
 *
 * const { data } = await getGalleries({
 *   workspaceId: 'xxx',
 *   page: 1,
 *   limit: 20,
 * });
 * ```
 */
export const customInstance = async <T>(
  config: AxiosRequestConfig,
  options?: { signal?: AbortSignal }
): Promise<T> => {
  // Dynamic import to avoid circular dependencies
  // This allows the frontend to provide the axios instance
  const axios = (await import('axios')).default;

  // Get base URL from environment or default to localhost for dev
  const baseURL = getBaseUrl();

  // Get auth token if available
  const token = await getAuthToken();

  // Build the request config
  const requestConfig: AxiosRequestConfig = {
    ...config,
    baseURL,
    signal: options?.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...config.headers,
    },
  };

  try {
    const response: AxiosResponse<T> = await axios.request(requestConfig);
    return response.data;
  } catch (error) {
    const axiosError = error as AxiosError<ApiError>;

    // Handle 401 - trigger token refresh
    if (axiosError.response?.status === 401) {
      const newToken = await refreshAuthToken();
      if (newToken) {
        // Retry with new token
        requestConfig.headers = {
          ...requestConfig.headers,
          Authorization: `Bearer ${newToken}`,
        };
        const retryResponse: AxiosResponse<T> = await axios.request(requestConfig);
        return retryResponse.data;
      }
    }

    // Rethrow with formatted error
    throw formatError(axiosError);
  }
};

/**
 * Get the API base URL from environment.
 * Supports both browser and Node.js environments.
 */
function getBaseUrl(): string {
  // Browser environment (Vite)
  if (typeof window !== 'undefined' && import.meta?.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Node.js environment
  if (typeof process !== 'undefined' && process.env?.API_BASE_URL) {
    return process.env.API_BASE_URL;
  }

  // Default for local development
  return 'http://localhost';
}

/**
 * Get the current auth token.
 * This hooks into the application's token storage.
 */
async function getAuthToken(): Promise<string | null> {
  // Browser environment - use localStorage
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const storedTokens = localStorage.getItem('rawdrive_tokens');
    if (storedTokens) {
      try {
        const tokens = JSON.parse(storedTokens);
        return tokens.accessToken || null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Refresh the auth token.
 * Returns the new token or null if refresh failed.
 */
async function refreshAuthToken(): Promise<string | null> {
  // Browser environment
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const storedTokens = localStorage.getItem('rawdrive_tokens');
    if (storedTokens) {
      try {
        const tokens = JSON.parse(storedTokens);
        const refreshToken = tokens.refreshToken;

        if (!refreshToken) return null;

        const axios = (await import('axios')).default;
        const response = await axios.post(`${getBaseUrl()}/api/v1/auth/refresh`, {
          refresh_token: refreshToken,
        });

        const newTokens = {
          accessToken: response.data.access_token,
          refreshToken: response.data.refresh_token,
          expiresAt: Date.now() + (response.data.expires_in || 3600) * 1000,
        };

        localStorage.setItem('rawdrive_tokens', JSON.stringify(newTokens));
        return newTokens.accessToken;
      } catch {
        // Clear tokens on refresh failure
        localStorage.removeItem('rawdrive_tokens');
        return null;
      }
    }
  }
  return null;
}

/**
 * Format axios error to consistent API error structure.
 */
function formatError(error: AxiosError<ApiError>): Error {
  if (error.response?.data?.error) {
    const apiError = error.response.data.error;
    const err = new Error(apiError.message);
    (err as any).code = apiError.code;
    (err as any).status = error.response.status;
    (err as any).details = apiError.details;
    (err as any).requestId = apiError.requestId;
    return err;
  }

  if (error.response) {
    const err = new Error(error.message || `Request failed with status ${error.response.status}`);
    (err as any).code = `HTTP_${error.response.status}`;
    (err as any).status = error.response.status;
    return err;
  }

  if (error.request) {
    const err = new Error('Network error - no response received');
    (err as any).code = 'NETWORK_ERROR';
    return err;
  }

  return error;
}

export default customInstance;
