/**
 * Backend API Client
 *
 * Auto-generated TypeScript client for the main Backend API.
 *
 * NOTE: This file will be replaced when running `pnpm generate:api-clients`.
 * This is a placeholder showing the expected API structure.
 *
 * @example
 * ```typescript
 * import { login, getCurrentUser, getWorkspaces } from '@rawdrive/api-types/backend';
 *
 * // Login
 * const tokens = await login({ email: 'user@example.com', password: 'xxx' });
 *
 * // Get current user
 * const user = await getCurrentUser();
 *
 * // List workspaces
 * const workspaces = await getWorkspaces();
 * ```
 */

import { customInstance } from '../lib/axios-instance';

// ============================================================================
// Auth Types
// ============================================================================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface RefreshRequest {
  refresh_token: string;
}

// ============================================================================
// User Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  avatar_url?: string | null;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserUpdateRequest {
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
}

// ============================================================================
// Workspace Types
// ============================================================================

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  logo_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  user_id: string;
  workspace_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  user: User;
  created_at: string;
}

export interface WorkspaceCreateRequest {
  name: string;
  slug?: string;
}

// ============================================================================
// Auth API Functions
// ============================================================================

/**
 * Login with email and password.
 *
 * @param data - Login credentials
 * @returns Token response with access and refresh tokens
 */
export async function login(data: LoginRequest): Promise<TokenResponse> {
  return customInstance<TokenResponse>({
    url: '/api/v1/auth/login',
    method: 'POST',
    data,
  });
}

/**
 * Refresh access token.
 *
 * @param data - Refresh token
 * @returns New token response
 */
export async function refreshToken(data: RefreshRequest): Promise<TokenResponse> {
  return customInstance<TokenResponse>({
    url: '/api/v1/auth/refresh',
    method: 'POST',
    data,
  });
}

/**
 * Logout (invalidate tokens).
 */
export async function logout(): Promise<void> {
  return customInstance<void>({
    url: '/api/v1/auth/logout',
    method: 'POST',
  });
}

// ============================================================================
// User API Functions
// ============================================================================

/**
 * Get the current authenticated user.
 *
 * @returns Current user details
 */
export async function getCurrentUser(): Promise<User> {
  return customInstance<User>({
    url: '/api/v1/users/me',
    method: 'GET',
  });
}

/**
 * Update the current user's profile.
 *
 * @param data - Profile update data
 * @returns Updated user
 */
export async function updateCurrentUser(data: UserUpdateRequest): Promise<User> {
  return customInstance<User>({
    url: '/api/v1/users/me',
    method: 'PATCH',
    data,
  });
}

// ============================================================================
// Workspace API Functions
// ============================================================================

/**
 * Get workspaces for the current user.
 *
 * @returns List of workspaces
 */
export async function getWorkspaces(): Promise<Workspace[]> {
  return customInstance<Workspace[]>({
    url: '/api/v1/workspaces',
    method: 'GET',
  });
}

/**
 * Get a workspace by ID.
 *
 * @param workspaceId - Workspace ID
 * @returns Workspace details
 */
export async function getWorkspace(workspaceId: string): Promise<Workspace> {
  return customInstance<Workspace>({
    url: `/api/v1/workspaces/${workspaceId}`,
    method: 'GET',
  });
}

/**
 * Create a new workspace.
 *
 * @param data - Workspace creation data
 * @returns Created workspace
 */
export async function createWorkspace(data: WorkspaceCreateRequest): Promise<Workspace> {
  return customInstance<Workspace>({
    url: '/api/v1/workspaces',
    method: 'POST',
    data,
  });
}

/**
 * Get members of a workspace.
 *
 * @param workspaceId - Workspace ID
 * @returns List of workspace members
 */
export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  return customInstance<WorkspaceMember[]>({
    url: `/api/v1/workspaces/${workspaceId}/members`,
    method: 'GET',
  });
}
