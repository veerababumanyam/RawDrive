import { useState, useEffect, useCallback } from 'react';
import type { AIHighlight } from '../components/features/ai/AIHighlightsPanel';
import { curationService } from '../services/curationService';
import { useAuth } from '../contexts/AuthContext';

/* =============================================================================
   useAIHighlights Hook

   Fetches and manages AI-powered highlights and insights:
   - Smart curation recommendations
   - Quality analysis results
   - Face detection summaries
   - Recent AI activity

   Features:
   - Auto-refresh capability
   - Loading states
   - Error handling
   - Workspace and gallery filtering
   ============================================================================= */

export interface UseAIHighlightsOptions {
  workspaceId?: string;
  galleryId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // in milliseconds
  enabled?: boolean;
}

export interface UseAIHighlightsResult {
  highlights: AIHighlight[];
  isLoading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  unreadCount: number;
}

export const useAIHighlights = (
  options: UseAIHighlightsOptions = {}
): UseAIHighlightsResult => {
  const {
    workspaceId: providedWorkspaceId,
    galleryId,
    autoRefresh = false,
    refreshInterval = 60000, // 1 minute default
    enabled = true,
  } = options;

  const { workspace } = useAuth();
  const workspaceId = providedWorkspaceId || workspace?.workspace_id || '';

  const [highlights, setHighlights] = useState<AIHighlight[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchHighlights = useCallback(async () => {
    if (!enabled || !workspaceId) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const aiHighlights: AIHighlight[] = [];

      // Fetch curation sessions if galleryId is provided
      if (galleryId) {
        try {
          const sessions = await curationService.listSessions(workspaceId, galleryId, {
            status: 'completed',
            limit: 5,
          });

          if (sessions.sessions && sessions.sessions.length > 0) {
            // Add highlight for latest curation session
            const latestSession = sessions.sessions[0];
            if (latestSession.status === 'completed' && latestSession.progress?.total_photos) {
              aiHighlights.push({
                id: `curation-${latestSession.session_id}`,
                type: 'curation',
                title: 'Smart Curation Complete',
                description: `Analyzed ${latestSession.progress.analyzed_count || 0} photos. ${latestSession.progress.selected_count || 0} selected as best shots.`,
                count: latestSession.progress.selected_count || 0,
                severity: 'success',
                timestamp: latestSession.completed_at
                  ? new Date(latestSession.completed_at)
                  : undefined,
                action: {
                  label: 'View Results',
                  path: `/workspace/galleries/${galleryId}?tab=smart-curate&session=${latestSession.session_id}`,
                },
              });
            }
          }
        } catch (err) {
          console.warn('Failed to fetch curation sessions:', err);
        }

        // Fetch quality analysis
        try {
          const qualityAnalysis = await curationService.getQualityAnalysis(
            workspaceId,
            galleryId,
            { limit: 100 }
          );

          if (qualityAnalysis.results && qualityAnalysis.results.length > 0) {
            const lowQualityCount =
              qualityAnalysis.results?.filter((r) => r.overall_score < 50 || r.is_technical_reject).length || 0;

            if (lowQualityCount > 0) {
              aiHighlights.push({
                id: `quality-${Date.now()}`,
                type: 'quality',
                title: 'Quality Issues Found',
                description: `${lowQualityCount} photos have quality issues (blur, exposure, etc.)`,
                count: lowQualityCount,
                severity: 'warning',
                action: {
                  label: 'Review Photos',
                  path: `/workspace/galleries/${galleryId}?tab=quality`,
                },
              });
            }
          }
        } catch (err) {
          console.warn('Failed to fetch quality analysis:', err);
        }

        // Fetch similarity groups
        try {
          const similarityGroups = await curationService.getSimilarityGroups(
            workspaceId,
            galleryId,
            { minMembers: 2, limit: 10 }
          );

          if (similarityGroups.groups && similarityGroups.groups.length > 0) {
            const totalGroups = similarityGroups.total || 0;
            aiHighlights.push({
              id: `similarity-${Date.now()}`,
              type: 'faces',
              title: 'Similar Photos Detected',
              description: `Found ${totalGroups} groups of similar photos. Review to pick the best shots.`,
              count: totalGroups,
              severity: 'info',
              action: {
                label: 'Review Groups',
                path: `/workspace/galleries/${galleryId}?tab=similarity`,
              },
            });
          }
        } catch (err) {
          console.warn('Failed to fetch similarity groups:', err);
        }
      }

      // Add mock highlights if no real data (for demonstration)
      if (aiHighlights.length === 0) {
        aiHighlights.push({
          id: 'welcome',
          type: 'analysis',
          title: 'AI Features Ready',
          description:
            'Start using Smart Curation to get AI-powered photo selection and quality insights.',
          severity: 'info',
          action: galleryId
            ? {
                label: 'Get Started',
                path: `/workspace/galleries/${galleryId}?tab=smart-curate`,
              }
            : undefined,
        });
      }

      setHighlights(aiHighlights);
      setUnreadCount(aiHighlights.filter((h) => h.severity === 'warning' || h.severity === 'error').length);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch AI highlights'));
      console.error('Error fetching AI highlights:', err);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, workspaceId, galleryId]);

  // Initial fetch
  useEffect(() => {
    fetchHighlights();
  }, [fetchHighlights]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh || !enabled) {
      return;
    }

    const interval = setInterval(() => {
      fetchHighlights();
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, enabled, refreshInterval, fetchHighlights]);

  return {
    highlights,
    isLoading,
    error,
    refresh: fetchHighlights,
    unreadCount,
  };
};

export default useAIHighlights;
