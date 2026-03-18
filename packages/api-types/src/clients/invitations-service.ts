/**
 * Invitations Service API Client
 *
 * Auto-generated TypeScript client for the Invitations Service API.
 *
 * NOTE: This file will be replaced when running `pnpm generate:api-clients`.
 * This is a placeholder showing the expected API structure.
 *
 * // TODO: Generate with orval when OpenAPI spec is available
 *
 * @example
 * ```typescript
 * import { getInvitations, createInvitation } from '@rawdrive/api-types/invitations-service';
 *
 * const invitations = await getInvitations({ workspaceId: 'xxx' });
 * const invite = await createInvitation({ email: 'user@example.com', role: 'editor' });
 * ```
 */

import { customInstance } from '../lib/axios-instance';

// ============================================================================
// Invitation Types
// ============================================================================

export interface Invitation {
  id: string;
  workspace_id: string;
  email: string;
  role: InvitationRole;
  status: InvitationStatus;
  invited_by: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export type InvitationRole = 'admin' | 'editor' | 'viewer';

export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';

export interface InvitationCreateRequest {
  email: string;
  role: InvitationRole;
  message?: string;
}

export interface InvitationListResponse {
  data: Invitation[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================================
// API Functions (stubs)
// ============================================================================

export const getInvitations = (params: { workspace_id: string; page?: number; limit?: number; status?: InvitationStatus }) =>
  customInstance<InvitationListResponse>({ url: `/api/v1/invitations`, method: 'get', params });

export const getInvitation = (invitationId: string) =>
  customInstance<Invitation>({ url: `/api/v1/invitations/${invitationId}`, method: 'get' });

export const createInvitation = (data: InvitationCreateRequest) =>
  customInstance<Invitation>({ url: `/api/v1/invitations`, method: 'post', data });

export const revokeInvitation = (invitationId: string) =>
  customInstance<void>({ url: `/api/v1/invitations/${invitationId}/revoke`, method: 'post' });

export const acceptInvitation = (token: string) =>
  customInstance<Invitation>({ url: `/api/v1/invitations/accept`, method: 'post', data: { token } });

export const declineInvitation = (token: string) =>
  customInstance<void>({ url: `/api/v1/invitations/decline`, method: 'post', data: { token } });
