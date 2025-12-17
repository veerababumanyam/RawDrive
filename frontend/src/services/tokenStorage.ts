/**
 * Token storage utilities
 * Handles browser storage for authentication tokens
 * Separated to avoid circular dependencies
 */

// Token storage keys
const ACCESS_TOKEN_KEY = 'rawdrive_access_token';
const REFRESH_TOKEN_KEY = 'rawdrive_refresh_token';
const EXPIRES_AT_KEY = 'rawdrive_expires_at';
const USER_KEY = 'rawdrive_user';
const WORKSPACE_KEY = 'rawdrive_workspace';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/**
 * Get stored tokens from localStorage
 */
export function getStoredTokens(): StoredTokens | null {
  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  const expiresAt = localStorage.getItem(EXPIRES_AT_KEY);

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: expiresAt ? parseInt(expiresAt, 10) : 0,
  };
}

/**
 * Store tokens in localStorage
 */
export function setStoredTokens(tokens: StoredTokens): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
  localStorage.setItem(EXPIRES_AT_KEY, tokens.expiresAt.toString());
}

/**
 * Clear stored tokens from localStorage
 */
export function clearStoredTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(WORKSPACE_KEY);
}

/**
 * Check if access token is expired or about to expire
 */
export function isTokenExpired(bufferSeconds: number = 60): boolean {
  const tokens = getStoredTokens();
  if (!tokens) return true;
  
  const now = Date.now();
  const expiresAt = tokens.expiresAt;
  
  return now >= (expiresAt - bufferSeconds * 1000);
}
