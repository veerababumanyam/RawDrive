/**
 * React Query hooks for client data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listClients,
  getClient,
  createClient,
  updateClient,
  deleteClient,
  getClientGalleries,
  searchClients,
  getClientTags,
} from '../services/clientService';

// Query keys
export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...clientKeys.lists(), filters] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (id: string) => [...clientKeys.details(), id] as const,
  galleries: (clientId: string) => [...clientKeys.all, 'galleries', clientId] as const,
  search: (query: string) => [...clientKeys.all, 'search', query] as const,
  tags: () => [...clientKeys.all, 'tags'] as const,
};

/**
 * Fetch clients list
 */
export function useClients(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: 'name' | 'created_at' | 'last_activity';
  sortOrder?: 'asc' | 'desc';
  tag?: string;
}) {
  return useQuery({
    queryKey: clientKeys.list(params || {}),
    queryFn: async () => {
      const result = await listClients(params);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
  });
}

/**
 * Fetch single client
 */
export function useClient(clientId: string) {
  return useQuery({
    queryKey: clientKeys.detail(clientId),
    queryFn: async () => {
      const result = await getClient(clientId);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    enabled: !!clientId,
  });
}

/**
 * Fetch client's galleries
 */
export function useClientGalleries(
  clientId: string,
  params?: { page?: number; pageSize?: number }
) {
  return useQuery({
    queryKey: [...clientKeys.galleries(clientId), params],
    queryFn: async () => {
      const result = await getClientGalleries(clientId, params);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    enabled: !!clientId,
  });
}

/**
 * Search clients
 */
export function useSearchClients(query: string, limit?: number) {
  return useQuery({
    queryKey: clientKeys.search(query),
    queryFn: async () => {
      const result = await searchClients(query, limit);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    enabled: query.length >= 2,
  });
}

/**
 * Fetch client tags
 */
export function useClientTags() {
  return useQuery({
    queryKey: clientKeys.tags(),
    queryFn: async () => {
      const result = await getClientTags();
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Create client mutation
 */
export function useCreateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      email: string;
      phone?: string;
      notes?: string;
      tags?: string[];
    }) => {
      const result = await createClient(data);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}

/**
 * Update client mutation
 */
export function useUpdateClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      data,
    }: {
      clientId: string;
      data: {
        name?: string;
        email?: string;
        phone?: string;
        notes?: string;
        tags?: string[];
      };
    }) => {
      const result = await updateClient(clientId, data);
      if (result.error) throw new Error(result.error.message);
      return result.data!;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: clientKeys.detail(variables.clientId) });
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}

/**
 * Delete client mutation
 */
export function useDeleteClient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clientId: string) => {
      const result = await deleteClient(clientId);
      if (result.error) throw new Error(result.error.message);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: clientKeys.lists() });
    },
  });
}
