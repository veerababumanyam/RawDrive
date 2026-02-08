/**
 * Authentication service for mobile app
 * Handles login, logout, and session management
 */

import { apiClient, setOnSessionExpired } from './api';
import {
  getStoredTokens,
  setStoredTokens,
  clearStoredTokens,
  setStoredUser,
  getStoredUser,
  setStoredWorkspace,
  getStoredWorkspace,
  isTokenExpired,
} from './secureStorage';
import { getDeviceInfoForApi } from '../utils/deviceFingerprint';
import type {
  User,
  Workspace,
  LoginCredentials,
  AuthResponse,
} from '../types';

// Re-export storage functions
export {
  getStoredTokens,
  setStoredTokens,
  clearStoredTokens,
  getStoredUser,
  getStoredWorkspace,
};

/**
 * Normalize user payload from various API response formats
 */
function normalizeUserPayload(raw: any): User & { workspace_id?: string } {
  const payload = raw?.user ?? raw ?? {};

  const id = payload.user_id ?? payload.id ?? payload.sub ?? '';
  const email = payload.email ?? '';
  const displayName =
    payload.display_name ??
    payload.displayName ??
    payload.name ??
    (email ? email.split('@')[0] : '');
  const avatarUrl = payload.avatar_url ?? payload.avatarUrl ?? undefined;
  const emailVerified =
    payload.email_verified ?? payload.emailVerified ?? payload.verified ?? false;
  const createdAt =
    payload.created_at ?? payload.createdAt ?? new Date().toISOString();
  const workspaceId = payload.workspace_id ?? undefined;

  return {
    id,
    email,
    displayName: displayName || email,
    avatarUrl,
    emailVerified,
    createdAt,
    workspace_id: workspaceId,
  };
}

/**
 * Check if user is authenticated (has valid tokens)
 */
export async function isAuthenticated(): Promise<boolean> {
  const tokens = await getStoredTokens();
  if (!tokens) return false;

  // Check if access token is expired (with 60s buffer)
  const expired = await isTokenExpired(60);
  if (expired) {
    // Token expired, but we have refresh token
    return !!tokens.refreshToken;
  }

  return true;
}

/**
 * Check if access token is still valid (not expired)
 */
export async function hasValidAccessToken(): Promise<boolean> {
  const tokens = await getStoredTokens();
  if (!tokens || !tokens.accessToken) return false;

  return !(await isTokenExpired(60));
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
  // Generate device fingerprint for security tracking
  let deviceData: Awaited<ReturnType<typeof getDeviceInfoForApi>> | undefined;

  try {
    deviceData = await getDeviceInfoForApi();
  } catch (error) {
    console.warn('Failed to generate device fingerprint:', error);
  }

  const response = await apiClient.post<AuthResponse>('/auth/login', {
    email: credentials.email,
    password: credentials.password,
    remember_me: credentials.rememberMe || false,
    ...(deviceData || {}),
  });

  if (response.error) {
    return {
      success: false,
      error: response.error.message || 'Login failed',
    };
  }

  if (response.data) {
    const { user, tokens, workspace: responseWorkspace } = response.data;

    const normalizedUser = normalizeUserPayload(user);

    // Store tokens
    await setStoredTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    });

    // Store user
    await setStoredUser(normalizedUser);

    // Handle workspace
    let workspace = responseWorkspace;
    if (!workspace) {
      const workspaceId = normalizedUser.workspace_id || (user as any).workspace_id;
      if (workspaceId) {
        try {
          console.log('[Login] Fetching workspace for workspace_id:', workspaceId);
          workspace = (await getWorkspace(workspaceId)) || undefined;
        } catch (error) {
          console.error('[Login] Error fetching workspace:', error);
        }
      }
    }

    if (workspace) {
      await setStoredWorkspace(workspace);
      console.log('[Login] Workspace loaded:', workspace.name);
    }

    return { success: true, user: normalizedUser, workspace };
  }

  return { success: false, error: 'Unknown error' };
}

/**
 * Logout - clear tokens and call logout endpoint
 */
export async function logout(): Promise<void> {
  const tokens = await getStoredTokens();
  try {
    await apiClient.post('/auth/logout', {
      refresh_token: tokens?.refreshToken || '',
    });
  } catch (error) {
    console.error('Logout API call failed:', error);
  } finally {
    await clearStoredTokens();
  }
}

/**
 * Get current user from API
 */
export async function getCurrentUser(): Promise<User | null> {
  const response = await apiClient.get<any>('/users/me');

  if (response.data) {
    const normalized = normalizeUserPayload(response.data);
    if (normalized?.id) {
      await setStoredUser(normalized);
      return normalized;
    }
  }

  return null;
}

/**
 * Get workspace by ID
 */
export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  try {
    const response = await apiClient.get<{ workspace: any }>(
      `/workspaces/${workspaceId}`
    );

    if (response.error) {
      console.error('Failed to fetch workspace:', response.error);
      return null;
    }

    if (response.data?.workspace) {
      const workspace: Workspace = {
        workspace_id: response.data.workspace.workspace_id,
        name: response.data.workspace.name,
        slug: response.data.workspace.slug,
        role: 'owner',
      };
      await setStoredWorkspace(workspace);
      return workspace;
    }

    return null;
  } catch (error) {
    console.error('Error fetching workspace:', error);
    return null;
  }
}

/**
 * Get user's workspaces
 */
export async function getUserWorkspaces(): Promise<Workspace[]> {
  try {
    const response = await apiClient.get<{ workspaces: any[] }>('/users/me/workspaces');

    if (response.error || !response.data?.workspaces) {
      return [];
    }

    return response.data.workspaces.map((ws: any) => ({
      workspace_id: ws.workspace_id,
      name: ws.name,
      slug: ws.slug,
      role: ws.role || 'member',
    }));
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    return [];
  }
}

/**
 * Initialize session expired handler
 */
export function initSessionExpiredHandler(onExpired: () => void): void {
  setOnSessionExpired(onExpired);
}
