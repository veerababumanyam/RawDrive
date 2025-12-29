/**
 * useFacesSummary Hook
 * Fetches and aggregates face detection data for a gallery.
 * Creates a Map of assetId -> FaceSummary for efficient lookup in PhotoCard.
 *
 * Features:
 * - Batches API calls to avoid N+1 queries
 * - Caches results with simple in-memory cache
 * - Aggregates faces by photo_id
 * - Resolves person names from face groups
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { faceApiService, Face, FaceGroup } from '../services/faceApiService';
import { useAuth } from '../contexts/AuthContext';
import type { FaceSummary } from '../types/canvas';

interface UseFacesSummaryOptions {
  /** Gallery ID to fetch faces for */
  galleryId: string;
  /** Enable/disable the query */
  enabled?: boolean;
  /** Stale time in milliseconds (default: 5 minutes) */
  staleTime?: number;
}

interface UseFacesSummaryResult {
  /** Map of assetId to FaceSummary */
  faceSummaries: Map<string, FaceSummary>;
  /** Loading state */
  isLoading: boolean;
  /** Error state */
  error: Error | null;
  /** Refetch function */
  refetch: () => void;
}

// Simple in-memory cache with timestamp
interface CacheEntry {
  data: Map<string, FaceSummary>;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Aggregate faces by photo_id and resolve person names
 */
function aggregateFaces(
  faces: Face[],
  groupsMap: Map<string, FaceGroup>
): Map<string, FaceSummary> {
  const summaryMap = new Map<string, FaceSummary>();

  for (const face of faces) {
    const photoId = face.photo_id;

    // Get or create summary for this photo
    let summary = summaryMap.get(photoId);
    if (!summary) {
      summary = {
        faceCount: 0,
        personNames: [],
        faceIds: [],
      };
      summaryMap.set(photoId, summary);
    }

    // Increment face count and add face ID
    summary.faceCount += 1;
    summary.faceIds.push(face.id);

    // Resolve person name from face group
    if (face.face_group_id) {
      const group = groupsMap.get(face.face_group_id);
      if (group?.person_name && !summary.personNames.includes(group.person_name)) {
        summary.personNames.push(group.person_name);
      } else if (group?.name && !summary.personNames.includes(group.name)) {
        // Fall back to group name if no person_name
        summary.personNames.push(group.name);
      }
    }
  }

  return summaryMap;
}

export function useFacesSummary({
  galleryId,
  enabled = true,
  staleTime = 5 * 60 * 1000, // 5 minutes default
}: UseFacesSummaryOptions): UseFacesSummaryResult {
  const { workspace } = useAuth();
  const workspaceId = workspace?.workspace_id;

  const [faceSummaries, setFaceSummaries] = useState<Map<string, FaceSummary>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Track if a fetch is in progress to prevent duplicate calls
  const fetchingRef = useRef(false);

  const fetchFaceSummaries = useCallback(async (forceRefresh = false) => {
    if (!workspaceId || !galleryId || !enabled) {
      setFaceSummaries(new Map());
      return;
    }

    // Check cache first
    const cacheKey = `${workspaceId}:${galleryId}`;
    const cached = cache.get(cacheKey);
    const now = Date.now();

    if (!forceRefresh && cached && (now - cached.timestamp) < staleTime) {
      setFaceSummaries(cached.data);
      return;
    }

    // Prevent duplicate fetches
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch all faces and face groups in parallel
      const [facesResult, groupsResult] = await Promise.all([
        // Fetch all faces for the gallery (with high limit for complete data)
        faceApiService.getGalleryFaces(workspaceId, galleryId, { limit: 10000 }),
        // Fetch all face groups for name resolution
        faceApiService.getFaceGroups(workspaceId, { limit: 1000 }),
      ]);

      // Create a map of groupId -> FaceGroup for fast lookup
      const groupsMap = new Map<string, FaceGroup>();
      for (const group of groupsResult.groups) {
        groupsMap.set(group.id, group);
      }

      // Aggregate faces by photo_id
      const summaries = aggregateFaces(facesResult.faces, groupsMap);

      // Update cache
      cache.set(cacheKey, { data: summaries, timestamp: now });

      setFaceSummaries(summaries);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch face summaries'));
      setFaceSummaries(new Map());
    } finally {
      setIsLoading(false);
      fetchingRef.current = false;
    }
  }, [workspaceId, galleryId, enabled, staleTime]);

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchFaceSummaries();
  }, [fetchFaceSummaries]);

  const refetch = useCallback(() => {
    fetchFaceSummaries(true);
  }, [fetchFaceSummaries]);

  return {
    faceSummaries,
    isLoading,
    error,
    refetch,
  };
}

export default useFacesSummary;
