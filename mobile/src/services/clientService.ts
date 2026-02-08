/**
 * Client service for mobile app
 * Handles client/contact management operations
 */

import { apiClient } from './api';
import type { ApiResponse, Client } from '../types';

// Response types
interface ClientListResponse {
  clients: Array<{
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar_url?: string;
    galleries_count: number;
    last_activity?: string;
  }>;
  total: number;
  page: number;
  page_size: number;
}

interface ClientResponse {
  client: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar_url?: string;
    galleries_count: number;
    last_activity?: string;
    notes?: string;
    created_at: string;
    tags?: string[];
  };
}

// Request types
interface CreateClientRequest {
  name: string;
  email: string;
  phone?: string;
  notes?: string;
  tags?: string[];
}

interface UpdateClientRequest {
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
  tags?: string[];
}

interface ListClientsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: 'name' | 'created_at' | 'last_activity';
  sortOrder?: 'asc' | 'desc';
  tag?: string;
}

/**
 * Transform API response to frontend model
 */
function transformClient(data: ClientListResponse['clients'][0]): Client {
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    phone: data.phone,
    avatarUrl: data.avatar_url,
    galleriesCount: data.galleries_count,
    lastActivity: data.last_activity,
  };
}

/**
 * List clients with pagination and filters
 */
export async function listClients(
  params: ListClientsParams = {}
): Promise<ApiResponse<{ clients: Client[]; total: number; page: number; pageSize: number }>> {
  const queryParams = new URLSearchParams();

  if (params.page) queryParams.set('page', params.page.toString());
  if (params.pageSize) queryParams.set('page_size', params.pageSize.toString());
  if (params.search) queryParams.set('search', params.search);
  if (params.sortBy) queryParams.set('sort_by', params.sortBy);
  if (params.sortOrder) queryParams.set('sort_order', params.sortOrder);
  if (params.tag) queryParams.set('tag', params.tag);

  const queryString = queryParams.toString();
  const endpoint = `/clients${queryString ? `?${queryString}` : ''}`;

  const response = await apiClient.get<ClientListResponse>(endpoint);

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  return {
    data: {
      clients: response.data.clients.map(transformClient),
      total: response.data.total,
      page: response.data.page,
      pageSize: response.data.page_size,
    },
  };
}

/**
 * Get a single client by ID
 */
export async function getClient(clientId: string): Promise<ApiResponse<{
  client: Client & { notes?: string; createdAt: string; tags?: string[] };
}>> {
  const response = await apiClient.get<ClientResponse>(`/clients/${clientId}`);

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  const data = response.data.client;

  return {
    data: {
      client: {
        id: data.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        avatarUrl: data.avatar_url,
        galleriesCount: data.galleries_count,
        lastActivity: data.last_activity,
        notes: data.notes,
        createdAt: data.created_at,
        tags: data.tags,
      },
    },
  };
}

/**
 * Create a new client
 */
export async function createClient(
  data: CreateClientRequest
): Promise<ApiResponse<{ client: Client }>> {
  const response = await apiClient.post<ClientResponse>('/clients', {
    name: data.name,
    email: data.email,
    phone: data.phone,
    notes: data.notes,
    tags: data.tags,
  });

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  return {
    data: {
      client: transformClient(response.data.client),
    },
  };
}

/**
 * Update a client
 */
export async function updateClient(
  clientId: string,
  data: UpdateClientRequest
): Promise<ApiResponse<{ client: Client }>> {
  const response = await apiClient.patch<ClientResponse>(`/clients/${clientId}`, {
    name: data.name,
    email: data.email,
    phone: data.phone,
    notes: data.notes,
    tags: data.tags,
  });

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  return {
    data: {
      client: transformClient(response.data.client),
    },
  };
}

/**
 * Delete a client
 */
export async function deleteClient(clientId: string): Promise<ApiResponse<void>> {
  return apiClient.delete<void>(`/clients/${clientId}`);
}

/**
 * Get client's galleries
 */
export async function getClientGalleries(
  clientId: string,
  params?: { page?: number; pageSize?: number }
): Promise<ApiResponse<{
  galleries: Array<{
    id: string;
    name: string;
    status: string;
    assetCount: number;
    createdAt: string;
  }>;
  total: number;
}>> {
  const queryParams = new URLSearchParams();

  if (params?.page) queryParams.set('page', params.page.toString());
  if (params?.pageSize) queryParams.set('page_size', params.pageSize.toString());

  const queryString = queryParams.toString();
  const endpoint = `/clients/${clientId}/galleries${queryString ? `?${queryString}` : ''}`;

  const response = await apiClient.get<{
    galleries: Array<{
      id: string;
      name: string;
      status: string;
      asset_count: number;
      created_at: string;
    }>;
    total: number;
  }>(endpoint);

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  return {
    data: {
      galleries: response.data.galleries.map((g) => ({
        id: g.id,
        name: g.name,
        status: g.status,
        assetCount: g.asset_count,
        createdAt: g.created_at,
      })),
      total: response.data.total,
    },
  };
}

/**
 * Search clients by name or email
 */
export async function searchClients(
  query: string,
  limit: number = 10
): Promise<ApiResponse<{ clients: Client[] }>> {
  const response = await apiClient.get<{
    clients: ClientListResponse['clients'];
  }>(`/clients/search?q=${encodeURIComponent(query)}&limit=${limit}`);

  if (response.error) {
    return { error: response.error };
  }

  if (!response.data) {
    return { error: { code: 'NO_DATA', message: 'No data returned' } };
  }

  return {
    data: {
      clients: response.data.clients.map(transformClient),
    },
  };
}

/**
 * Get client tags for filtering
 */
export async function getClientTags(): Promise<ApiResponse<{ tags: string[] }>> {
  return apiClient.get<{ tags: string[] }>('/clients/tags');
}
