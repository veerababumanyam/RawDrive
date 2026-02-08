/**
 * useAlbumTemplates Hook
 *
 * Fetches and manages album templates for the album design editor.
 * Handles caching, filtering by album type, and applying templates.
 */

import { useCallback, useEffect, useState } from 'react';
import type { AlbumTemplate, AlbumType, SpreadTemplate } from '@rawdrive/shared-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UseAlbumTemplatesOptions {
  /** Workspace ID */
  workspaceId: string;
  /** Auto-fetch templates on mount */
  autoFetch?: boolean;
  /** Filter by album type */
  albumType?: AlbumType;
}

interface UseAlbumTemplatesReturn {
  /** All templates */
  templates: AlbumTemplate[];
  /** Templates filtered by current album type */
  filteredTemplates: AlbumTemplate[];
  /** Whether templates are loading */
  isLoading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Refresh templates from API */
  refreshTemplates: () => Promise<void>;
  /** Get template by ID */
  getTemplate: (templateId: string) => AlbumTemplate | undefined;
  /** Get spread template by ID */
  getSpreadTemplate: (templateId: string, spreadId: string) => SpreadTemplate | undefined;
  /** Get all spread templates across all album templates */
  getAllSpreadTemplates: () => SpreadTemplate[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAlbumTemplates({
  workspaceId,
  autoFetch = true,
  albumType,
}: UseAlbumTemplatesOptions): UseAlbumTemplatesReturn {
  const [templates, setTemplates] = useState<AlbumTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch templates from API
  const fetchTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${workspaceId}/albums/templates`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch templates');
      }

      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch templates';
      setError(message);
      console.error('Error fetching album templates:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  // Filter templates by album type
  const filteredTemplates = albumType
    ? templates.filter((t) => t.album_type === albumType)
    : templates;

  // Get template by ID
  const getTemplate = useCallback(
    (templateId: string) => {
      return templates.find((t) => t.id === templateId);
    },
    [templates]
  );

  // Get spread template by ID
  const getSpreadTemplate = useCallback(
    (templateId: string, spreadId: string) => {
      const template = templates.find((t) => t.id === templateId);
      return template?.spread_templates.find((s) => s.id === spreadId);
    },
    [templates]
  );

  // Get all spread templates
  const getAllSpreadTemplates = useCallback(() => {
    const spreads: SpreadTemplate[] = [];
    templates.forEach((template) => {
      spreads.push(...template.spread_templates);
    });
    return spreads;
  }, [templates]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchTemplates();
    }
  }, [autoFetch, fetchTemplates]);

  return {
    templates,
    filteredTemplates,
    isLoading,
    error,
    refreshTemplates: fetchTemplates,
    getTemplate,
    getSpreadTemplate,
    getAllSpreadTemplates,
  };
}

export default useAlbumTemplates;
