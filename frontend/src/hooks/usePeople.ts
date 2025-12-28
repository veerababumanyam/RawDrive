/**
 * usePeople Hook
 * Manages face groups (people) data fetching and state
 */

import { useState, useEffect, useCallback } from 'react';
import { faceApiService, FaceGroup, FaceGroupWithFaces, MergeSuggestion, MergeResult } from '../services/faceApiService';

interface UsePeopleOptions {
  workspaceId: string;
  galleryId?: string;
  minFaces?: number;
  limit?: number;
  autoFetch?: boolean;
}

interface UsePeopleReturn {
  people: FaceGroup[];
  total: number;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
  namePerson: (groupId: string, name: string) => Promise<void>;
  unassignPerson: (groupId: string) => Promise<void>;
  deletePerson: (groupId: string) => Promise<void>;
  mergeGroups: (sourceId: string, targetId: string) => Promise<FaceGroup>;
  multiMergeGroups: (
    sourceGroupIds: string[],
    targetGroupId: string,
    options?: { representativeFaceId?: string; name?: string }
  ) => Promise<MergeResult>;
  setRepresentativeFace: (groupId: string, faceId: string) => Promise<FaceGroup>;
  getMergeSuggestions: (threshold?: number, limit?: number) => Promise<MergeSuggestion[]>;
}

export const usePeople = ({
  workspaceId,
  galleryId,
  minFaces = 1,
  limit = 200,
  autoFetch = true,
}: UsePeopleOptions): UsePeopleReturn => {
  const [people, setPeople] = useState<FaceGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPeople = useCallback(async () => {
    if (!workspaceId) {
      setPeople([]);
      setTotal(0);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // TODO: Add gallery-specific filtering when API supports it
      const result = await faceApiService.getFaceGroups(workspaceId, {
        minFaces,
        limit,
      });
      setPeople(result.groups);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch people'));
      setPeople([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, galleryId, minFaces, limit]);

  useEffect(() => {
    if (autoFetch) {
      fetchPeople();
    }
  }, [autoFetch, fetchPeople]);

  const namePerson = useCallback(
    async (groupId: string, name: string) => {
      if (!workspaceId) return;
      setError(null);
      try {
        await faceApiService.namePerson(workspaceId, groupId, name);
        // Optimistically update the local state
        setPeople((prev) =>
          prev.map((p) =>
            p.id === groupId ? { ...p, person_name: name } : p
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to name person'));
        throw err;
      }
    },
    [workspaceId]
  );

  const unassignPerson = useCallback(
    async (groupId: string) => {
      if (!workspaceId) return;
      setError(null);
      try {
        await faceApiService.unassignPerson(workspaceId, groupId);
        // Optimistically update the local state
        setPeople((prev) =>
          prev.map((p) =>
            p.id === groupId ? { ...p, person_id: undefined, person_name: undefined } : p
          )
        );
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to unassign person'));
        throw err;
      }
    },
    [workspaceId]
  );

  const deletePerson = useCallback(
    async (groupId: string) => {
      if (!workspaceId) return;
      setError(null);
      try {
        await faceApiService.deleteFaceGroup(workspaceId, groupId);
        // Remove from local state
        setPeople((prev) => prev.filter((p) => p.id !== groupId));
        setTotal((prev) => prev - 1);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to delete person'));
        throw err;
      }
    },
    [workspaceId]
  );

  const mergeGroups = useCallback(
    async (sourceId: string, targetId: string) => {
      if (!workspaceId) throw new Error('Workspace ID required');
      setError(null);
      try {
        const merged = await faceApiService.mergeFaceGroups(workspaceId, sourceId, targetId);
        // Refetch to get updated state
        await fetchPeople();
        return merged;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to merge groups'));
        throw err;
      }
    },
    [workspaceId, fetchPeople]
  );

  // Multi-merge groups with optional primary face selection
  const multiMergeGroups = useCallback(
    async (
      sourceGroupIds: string[],
      targetGroupId: string,
      options?: { representativeFaceId?: string; name?: string }
    ) => {
      if (!workspaceId) throw new Error('Workspace ID required');
      if (sourceGroupIds.length === 0) throw new Error('At least one source group required');

      setError(null);
      try {
        const result = await faceApiService.multiMergeFaceGroups(
          workspaceId,
          sourceGroupIds,
          targetGroupId,
          options
        );
        // Refetch to get updated state
        await fetchPeople();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to merge groups'));
        throw err;
      }
    },
    [workspaceId, fetchPeople]
  );

  // Set representative (primary) face for a group
  const setRepresentativeFace = useCallback(
    async (groupId: string, faceId: string) => {
      if (!workspaceId) throw new Error('Workspace ID required');

      setError(null);
      try {
        const updated = await faceApiService.setRepresentativeFace(
          workspaceId,
          groupId,
          faceId,
          true // recalculate centroid with weighted primary
        );
        // Update local state
        setPeople((prev) =>
          prev.map((p) =>
            p.id === groupId
              ? { ...p, representative_face_id: faceId }
              : p
          )
        );
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to set representative face'));
        throw err;
      }
    },
    [workspaceId]
  );

  // Get merge suggestions based on face similarity
  const getMergeSuggestions = useCallback(
    async (threshold = 0.75, limit = 20) => {
      if (!workspaceId) return [];

      setError(null);
      try {
        const result = await faceApiService.getMergeSuggestions(workspaceId, {
          threshold,
          limit,
        });
        return result.suggestions;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to get merge suggestions'));
        throw err;
      }
    },
    [workspaceId]
  );

  return {
    people,
    total,
    loading,
    error,
    refetch: fetchPeople,
    namePerson,
    unassignPerson,
    deletePerson,
    mergeGroups,
    multiMergeGroups,
    setRepresentativeFace,
    getMergeSuggestions,
  };
};

// Hook for getting a single person's faces
interface UsePersonFacesOptions {
  workspaceId: string;
  groupId?: string;
  autoFetch?: boolean;
}

interface UsePersonFacesReturn {
  group: FaceGroupWithFaces | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const usePersonFaces = ({
  workspaceId,
  groupId,
  autoFetch = true,
}: UsePersonFacesOptions): UsePersonFacesReturn => {
  const [group, setGroup] = useState<FaceGroupWithFaces | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchGroup = useCallback(async () => {
    if (!workspaceId || !groupId) {
      setGroup(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await faceApiService.getFaceGroup(workspaceId, groupId);
      setGroup(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch person faces'));
      setGroup(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, groupId]);

  useEffect(() => {
    if (autoFetch && groupId) {
      fetchGroup();
    }
  }, [autoFetch, groupId, fetchGroup]);

  return {
    group,
    loading,
    error,
    refetch: fetchGroup,
  };
};
