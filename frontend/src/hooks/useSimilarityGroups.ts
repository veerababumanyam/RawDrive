/**
 * useSimilarityGroups Hook
 *
 * Fetches and manages similarity groups for gallery assets (US5).
 * Enables stacking similar photos and showing best shots.
 *
 * Feature: 025-ai-filter-simplify
 */

import { useState, useEffect, useCallback } from 'react';
import { aiFilterService } from '../services/aiFilterService';
import type { SimilarityGroup, SimilarityGroupsResponse } from '../types/aiFilter';

export interface UseSimilarityGroupsOptions {
  workspaceId?: string;
  galleryId?: string;
  /** Minimum members to include a group (default: 2) */
  minMembers?: number;
  /** Include detailed member info */
  includeMembers?: boolean;
  /** Page number (1-based) */
  page?: number;
  /** Results per page */
  limit?: number;
  /** Enable automatic fetching */
  enabled?: boolean;
}

export interface UseSimilarityGroupsReturn {
  groups: SimilarityGroup[];
  total: number;
  singletonCount: number;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  setBestShot: (groupId: string, assetId: string) => Promise<void>;
  isSetting: boolean;
}

export const useSimilarityGroups = ({
  workspaceId,
  galleryId,
  minMembers = 2,
  includeMembers = false,
  page = 1,
  limit = 50,
  enabled = true,
}: UseSimilarityGroupsOptions): UseSimilarityGroupsReturn => {
  const [groups, setGroups] = useState<SimilarityGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [singletonCount, setSingletonCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSetting, setIsSetting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchGroups = useCallback(async () => {
    if (!workspaceId || !galleryId) {
      setGroups([]);
      setTotal(0);
      setSingletonCount(0);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response: SimilarityGroupsResponse = await aiFilterService.getSimilarityGroups(
        workspaceId,
        galleryId,
        { minMembers, includeMembers, page, limit }
      );
      setGroups(response.groups);
      setTotal(response.total);
      setSingletonCount(response.singleton_count);
    } catch (err) {
      console.error('Failed to fetch similarity groups:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch similarity groups'));
      setGroups([]);
      setTotal(0);
      setSingletonCount(0);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, galleryId, minMembers, includeMembers, page, limit]);

  useEffect(() => {
    if (enabled) {
      fetchGroups();
    }
  }, [fetchGroups, enabled]);

  const setBestShot = useCallback(
    async (groupId: string, assetId: string) => {
      if (!workspaceId || !galleryId) return;

      setIsSetting(true);
      try {
        await aiFilterService.setBestShot(workspaceId, galleryId, groupId, assetId);
        // Optimistically update the local state
        setGroups((prev) =>
          prev.map((group) => {
            if (group.group_id === groupId) {
              return {
                ...group,
                best_asset_id: assetId,
                user_override_asset_id: assetId,
                members: group.members.map((member) => ({
                  ...member,
                  is_best: member.asset_id === assetId,
                  is_user_selected: member.asset_id === assetId,
                })),
              };
            }
            return group;
          })
        );
      } catch (err) {
        console.error('Failed to set best shot:', err);
        throw err;
      } finally {
        setIsSetting(false);
      }
    },
    [workspaceId, galleryId]
  );

  return {
    groups,
    total,
    singletonCount,
    isLoading,
    error,
    refetch: fetchGroups,
    setBestShot,
    isSetting,
  };
};
