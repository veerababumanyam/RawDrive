/**
 * Authentication service
 * Handles login, signup, logout and token management
 * Requirements 3.1, 3.2, 4.1, 13.2, 13.4, 13.5
 */

import { apiClient } from './api';
import { 
  getStoredTokens, 
  setStoredTokens, 
  clearStoredTokens,
  type StoredTokens 
} from './tokenStorage';

// Re-export token functions for backward compatibility
export { getStoredTokens, setStoredTokens, clearStoredTokens };

// Types
export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  emailVerified: boolean;
  createdAt: string;
  workspace_id?: string; // Workspace ID from backend
}

export interface Workspace {
  workspace_id: string;
  id?: string; // Legacy alias
  name: string;
  slug: string;
  role: string;
}

export interface AuthTokens extends StoredTokens {}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
  displayName: string;
  workspaceName?: string;
}

export interface AuthResponse {
  user: User & { workspace_id?: string };
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };
  workspace?: Workspace; // Optional - may not be included in response
}

// User/workspace storage keys
const USER_KEY = 'rawdrive_user';
const WORKSPACE_KEY = 'rawdrive_workspace';

/**
 * Get stored user
 */
export function getStoredUser(): User | null {
  const userJson = localStorage.getItem(USER_KEY);
  if (!userJson) return null;

  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

/**
 * Store user
 */
export function setStoredUser(user: User): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Get stored workspace
 */
export function getStoredWorkspace(): Workspace | null {
  const wsJson = localStorage.getItem(WORKSPACE_KEY);
  if (!wsJson) return null;

  try {
    return JSON.parse(wsJson);
  } catch {
    return null;
  }
}

/**
 * Store workspace
 */
export function setStoredWorkspace(workspace: Workspace): void {
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
}

/**
 * Check if user is authenticated (has valid tokens)
 */
export function isAuthenticated(): boolean {
  const tokens = getStoredTokens();
  if (!tokens) return false;

  // Check if access token is expired (with 60s buffer)
  if (tokens.expiresAt && Date.now() > tokens.expiresAt - 60000) {
    // Token expired, but we have refresh token
    return !!tokens.refreshToken;
  }

  return true;
}

/**
 * Check if access token is still valid (not expired)
 * Use this to decide whether to make API calls that require auth
 */
export function hasValidAccessToken(): boolean {
  const tokens = getStoredTokens();
  if (!tokens || !tokens.accessToken) return false;

  // Check if access token is expired (with 60s buffer)
  if (tokens.expiresAt && Date.now() > tokens.expiresAt - 60000) {
    return false;
  }

  return true;
}

/**
 * Login with email and password
 */
export async function login(credentials: LoginCredentials): Promise<{
  success: boolean;
  error?: string;
  user?: User;
  workspace?: Workspace;
}> {
  const response = await apiClient.post<AuthResponse>('/api/v1/auth/login', credentials);

  if (response.error) {
    return {
      success: false,
      error: response.error.message || 'Login failed',
    };
  }

  if (response.data) {
    const { user, tokens, workspace: responseWorkspace } = response.data;

    // Store tokens
    setStoredTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    // Store user
    setStoredUser(user);

    // Fetch workspace if not in response but workspace_id is available
    let workspace = responseWorkspace;
    try {
      if (!workspace && (user as any).workspace_id) {
        console.log('[Login] Fetching workspace for workspace_id:', (user as any).workspace_id);
        workspace = await getWorkspace((user as any).workspace_id) || undefined;
      }
    } catch (error) {
      console.error('[Login] Error fetching workspace:', error);
      // Continue without workspace - don't fail login
    }

    if (workspace) {
      setStoredWorkspace(workspace);
      console.log('[Login] Workspace loaded:', workspace.name);
    } else {
      console.warn('[Login] No workspace available after login');
    }

    return { success: true, user, workspace };
  }

  return { success: false, error: 'Unknown error' };
}

/**
 * Signup with email and password
 */
export async function signup(data: SignupData): Promise<{
  success: boolean;
  error?: string;
  user?: User;
  workspace?: Workspace;
}> {
  const response = await apiClient.post<AuthResponse>('/api/v1/auth/signup', {
    email: data.email,
    password: data.password,
    display_name: data.displayName,
    workspace_name: data.workspaceName,
  });

  if (response.error) {
    return {
      success: false,
      error: response.error.message || 'Signup failed',
    };
  }

  if (response.data) {
    const { user, tokens, workspace: responseWorkspace } = response.data;

    // Store tokens
    setStoredTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    // Store user
    setStoredUser(user);

    // Fetch workspace if not in response but workspace_id is available
    let workspace = responseWorkspace;
    try {
      if (!workspace && (user as any).workspace_id) {
        console.log('[Signup] Fetching workspace for workspace_id:', (user as any).workspace_id);
        workspace = await getWorkspace((user as any).workspace_id) || undefined;
      }
    } catch (error) {
      console.error('[Signup] Error fetching workspace:', error);
      // Continue without workspace - don't fail signup
    }

    if (workspace) {
      setStoredWorkspace(workspace);
      console.log('[Signup] Workspace loaded:', workspace.name);
    } else {
      console.warn('[Signup] No workspace available after signup');
    }

    return { success: true, user, workspace };
  }

  return { success: false, error: 'Unknown error' };
}

/**
 * Logout
 */
export async function logout(): Promise<void> {
  const tokens = getStoredTokens();
  try {
    await apiClient.post('/api/v1/auth/logout', {
      refresh_token: tokens?.refreshToken || '',
    });
  } catch (error) {
    console.error('Logout API call failed:', error);
  } finally {
    // Always clear local tokens
    clearStoredTokens();
  }
}

/**
 * Get Google OAuth URL
 */
export function getGoogleOAuthUrl(redirectTo?: string): string {
  // Use VITE_API_URL if set (even if empty string for relative URLs), otherwise default to localhost for dev
  const baseUrl = import.meta.env.VITE_API_URL !== undefined
    ? import.meta.env.VITE_API_URL
    : 'http://localhost:8000';
  const redirect = redirectTo || window.location.origin + '/workspace';
  return `${baseUrl}/api/v1/auth/oauth/google/start?redirect_uri=${encodeURIComponent(redirect)}`;
}

/**
 * Get current user from API
 */
export async function getCurrentUser(): Promise<User | null> {
  const response = await apiClient.get<{ user: User }>('/api/v1/users/me');

  if (response.data?.user) {
    setStoredUser(response.data.user);
    return response.data.user;
  }

  return null;
}

/**
 * Get workspace by ID
 */
export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  try {
    const response = await apiClient.get<{ workspace: WorkspaceResponse }>(`/api/v1/workspaces/${workspaceId}`);
    
    if (response.error) {
      console.error('Failed to fetch workspace:', response.error);
      return null;
    }

    if (response.data?.workspace) {
      const workspace: Workspace = {
        workspace_id: response.data.workspace.workspace_id,
        name: response.data.workspace.name,
        slug: response.data.workspace.slug,
        role: 'owner', // Default role, could be enhanced to get actual role
      };
      setStoredWorkspace(workspace);
      return workspace;
    }

    return null;
  } catch (error) {
    console.error('Error fetching workspace:', error);
    return null;
  }
}

interface WorkspaceResponse {
  workspace_id: string;
  name: string;
  slug: string;
  status: string;
  default_language: string;
  created_at: string;
  updated_at: string;
}

/**
 * Verify email with token
 */
export async function verifyEmail(token: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await apiClient.post<{ message: string }>('/api/v1/auth/verify-email', {
    token,
  });

  if (response.error) {
    return { success: false, error: response.error.message };
  }

  return { success: true };
}

/**
 * Request password reset
 */
export async function requestPasswordReset(email: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await apiClient.post<{ message: string }>('/api/v1/auth/forgot-password', {
    email,
  });

  if (response.error) {
    return { success: false, error: response.error.message };
  }

  return { success: true };
}

/**
 * Reset password with token
 */
export async function resetPassword(
  token: string,
  newPassword: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const response = await apiClient.post<{ message: string }>('/api/v1/auth/reset-password', {
    token,
    new_password: newPassword,
  });

  if (response.error) {
    return { success: false, error: response.error.message };
  }

  return { success: true };
}
