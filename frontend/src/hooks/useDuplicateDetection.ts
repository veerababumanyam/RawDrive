/**
 * useDuplicateDetection Hook
 * Manages AI-powered duplicate detection for photos and clients
 * Phase 2: AI Duplicate Detection
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DuplicatePhotoMember {
  asset_id: string;
  file_name: string;
  file_size: number;
  perceptual_hash?: string;
  similarity_to_primary?: number;
  is_primary: boolean;
  thumbnail_url?: string;
}

export interface DuplicatePhotoGroup {
  group_id?: string;
  members: DuplicatePhotoMember[];
  similarity_score: number;
  detection_method: 'perceptual_hash';
  status?: 'pending' | 'confirmed' | 'dismissed';
  created_at?: string;
}

export interface DuplicateClientMember {
  client_id: string;
  full_name: string;
  primary_email?: string;
  primary_phone?: string;
  similarity_to_primary?: number;
  is_primary: boolean;
  match_reason?: string;
}

export interface DuplicateClientGroup {
  group_id?: string;
  members: DuplicateClientMember[];
  similarity_score: number;
  detection_method: 'gemini_embedding' | 'levenshtein' | 'hybrid';
  status?: 'pending' | 'confirmed' | 'dismissed';
  created_at?: string;
}

export interface DetectPhotoDuplicatesRequest {
  gallery_id?: string;
  similarity_threshold?: number;
  min_group_size?: number;
}

export interface DetectPhotoDuplicatesResponse {
  duplicate_groups: DuplicatePhotoGroup[];
  total_groups: number;
  total_photos_scanned: number;
  photos_with_duplicates: number;
  credits_used: number;
  credits_remaining: number;
}

export interface DetectClientDuplicatesRequest {
  mode?: 'ai' | 'traditional' | 'hybrid';
  similarity_threshold?: number;
  min_group_size?: number;
}

export interface DetectClientDuplicatesResponse {
  duplicate_groups: DuplicateClientGroup[];
  total_groups: number;
  total_clients_scanned: number;
  clients_with_duplicates: number;
  credits_used: number;
  credits_remaining: number;
}

export interface DuplicateGroupListItem {
  group_id: string;
  workspace_id: string;
  entity_type: 'photo' | 'client';
  detection_method: string;
  similarity_score?: number;
  status: 'pending' | 'confirmed' | 'dismissed';
  member_count: number;
  reviewed_by_user_id?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface DuplicateGroupListResponse {
  groups: DuplicateGroupListItem[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDuplicateDetection(workspaceId: string) {
  const queryClient = useQueryClient();
  const [isDetecting, setIsDetecting] = useState(false);

  // -------------------------------------------------------------------------
  // Photo Duplicate Detection
  // -------------------------------------------------------------------------

  const detectPhotoDuplicates = useMutation<
    DetectPhotoDuplicatesResponse,
    Error,
    DetectPhotoDuplicatesRequest
  >({
    mutationFn: async (request) => {
      setIsDetecting(true);
      try {
        const response = await apiClient.post<DetectPhotoDuplicatesResponse>(
          `/api/v1/workspaces/${workspaceId}/photos/detect-duplicates`,
          request,
          { headers: { 'Content-Type': 'application/json' } }
        );
        if (response.error) {
          throw new Error(response.error.message || 'Failed to detect photo duplicates');
        }
        return response.data!;
      } finally {
        setIsDetecting(false);
      }
    },
    onSuccess: () => {
      // Invalidate duplicate groups query to refresh list
      queryClient.invalidateQueries({ queryKey: ['duplicateGroups', workspaceId] });
    },
  });

  // -------------------------------------------------------------------------
  // Client Duplicate Detection
  // -------------------------------------------------------------------------

  const detectClientDuplicates = useMutation<
    DetectClientDuplicatesResponse,
    Error,
    DetectClientDuplicatesRequest
  >({
    mutationFn: async (request) => {
      setIsDetecting(true);
      try {
        const response = await apiClient.post<DetectClientDuplicatesResponse>(
          `/api/v1/workspaces/${workspaceId}/clients/detect-duplicates-ai`,
          request,
          { headers: { 'Content-Type': 'application/json' } }
        );
        if (response.error) {
          throw new Error(response.error.message || 'Failed to detect client duplicates');
        }
        return response.data!;
      } finally {
        setIsDetecting(false);
      }
    },
    onSuccess: () => {
      // Invalidate duplicate groups query to refresh list
      queryClient.invalidateQueries({ queryKey: ['duplicateGroups', workspaceId] });
    },
  });

  // -------------------------------------------------------------------------
  // Get Duplicate Groups
  // -------------------------------------------------------------------------

  const useDuplicateGroups = useCallback((
    entityType?: 'photo' | 'client',
    status?: 'pending' | 'confirmed' | 'dismissed',
    page: number = 1,
    limit: number = 20
  ) => {
    return useQuery<DuplicateGroupListResponse, Error>({
      queryKey: ['duplicateGroups', workspaceId, entityType, status, page, limit],
      queryFn: async () => {
        const params = new URLSearchParams();
        if (entityType) params.append('entity_type', entityType);
        if (status) params.append('status', status);
        params.append('page', page.toString());
        params.append('limit', limit.toString());

        const response = await apiClient.get<DuplicateGroupListResponse>(
          `/api/v1/workspaces/${workspaceId}/duplicate-groups?${params.toString()}`
        );
        if (response.error) {
          throw new Error(response.error.message || 'Failed to fetch duplicate groups');
        }
        return response.data!;
      },
    });
  }, [workspaceId]);

  // -------------------------------------------------------------------------
  // Confirm Duplicate Group
  // -------------------------------------------------------------------------

  const confirmDuplicateGroup = useMutation<
    void,
    Error,
    { groupId: string }
  >({
    mutationFn: async ({ groupId }) => {
      const response = await apiClient.post(
        `/api/v1/workspaces/${workspaceId}/duplicate-groups/${groupId}/confirm`
      );
      if (response.error) {
        throw new Error(response.error.message || 'Failed to confirm duplicate group');
      }
    },
    onSuccess: () => {
      // Invalidate queries to refresh list
      queryClient.invalidateQueries({ queryKey: ['duplicateGroups', workspaceId] });
    },
  });

  // -------------------------------------------------------------------------
  // Dismiss Duplicate Group
  // -------------------------------------------------------------------------

  const dismissDuplicateGroup = useMutation<
    void,
    Error,
    { groupId: string }
  >({
    mutationFn: async ({ groupId }) => {
      const response = await apiClient.post(
        `/api/v1/workspaces/${workspaceId}/duplicate-groups/${groupId}/dismiss`
      );
      if (response.error) {
        throw new Error(response.error.message || 'Failed to dismiss duplicate group');
      }
    },
    onSuccess: () => {
      // Invalidate queries to refresh list
      queryClient.invalidateQueries({ queryKey: ['duplicateGroups', workspaceId] });
    },
  });

  // -------------------------------------------------------------------------
  // Return API
  // -------------------------------------------------------------------------

  return {
    // Photo duplicates
    detectPhotoDuplicates: detectPhotoDuplicates.mutate,
    detectPhotoDuplicatesAsync: detectPhotoDuplicates.mutateAsync,
    isDetectingPhotos: detectPhotoDuplicates.isPending,
    photoDuplicatesError: detectPhotoDuplicates.error,
    photoDuplicatesData: detectPhotoDuplicates.data,

    // Client duplicates
    detectClientDuplicates: detectClientDuplicates.mutate,
    detectClientDuplicatesAsync: detectClientDuplicates.mutateAsync,
    isDetectingClients: detectClientDuplicates.isPending,
    clientDuplicatesError: detectClientDuplicates.error,
    clientDuplicatesData: detectClientDuplicates.data,

    // Duplicate groups
    useDuplicateGroups,

    // Group actions
    confirmGroup: confirmDuplicateGroup.mutate,
    confirmGroupAsync: confirmDuplicateGroup.mutateAsync,
    isConfirming: confirmDuplicateGroup.isPending,

    dismissGroup: dismissDuplicateGroup.mutate,
    dismissGroupAsync: dismissDuplicateGroup.mutateAsync,
    isDismissing: dismissDuplicateGroup.isPending,

    // Overall state
    isDetecting,
  };
}
