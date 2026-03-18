/**
 * Client Service API Client
 *
 * Auto-generated TypeScript client for the Client Service API.
 *
 * NOTE: This file will be replaced when running `pnpm generate:api-clients`.
 * This is a placeholder showing the expected API structure.
 *
 * // TODO: Generate with orval when OpenAPI spec is available
 *
 * @example
 * ```typescript
 * import { getClients, createClient } from '@rawdrive/api-types/client-service';
 *
 * const clients = await getClients({ workspaceId: 'xxx' });
 * const newClient = await createClient({ name: 'John Doe', email: 'john@example.com' });
 * ```
 */

import { customInstance } from '../lib/axios-instance';

// ============================================================================
// Client Types
// ============================================================================

export interface Client {
  id: string;
  workspace_id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientCreateRequest {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  notes?: string;
}

export interface ClientUpdateRequest {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}

export interface ClientListResponse {
  data: Client[];
  total: number;
  page: number;
  limit: number;
}

// ============================================================================
// API Functions (stubs)
// ============================================================================

export const getClients = (params: { workspace_id: string; page?: number; limit?: number }) =>
  customInstance<ClientListResponse>({ url: `/api/v1/clients`, method: 'get', params });

export const getClient = (clientId: string) =>
  customInstance<Client>({ url: `/api/v1/clients/${clientId}`, method: 'get' });

export const createClient = (data: ClientCreateRequest) =>
  customInstance<Client>({ url: `/api/v1/clients`, method: 'post', data });

export const updateClient = (clientId: string, data: ClientUpdateRequest) =>
  customInstance<Client>({ url: `/api/v1/clients/${clientId}`, method: 'put', data });

export const deleteClient = (clientId: string) =>
  customInstance<void>({ url: `/api/v1/clients/${clientId}`, method: 'delete' });
