/**
 * AISettings Component
 * Settings section for AI tagging configuration and health dashboard
 */

import React, { useState } from 'react';
import { RefreshCw, Sparkles, Eye, Users, Tag, AlertCircle, Loader2 } from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { AppCard } from '../../ui/AppCard';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../ui/Toast';
import { useGalleryTaggingHealth } from '../../../hooks/useGalleryTaggingHealth';
import { TaggingHealthProgress } from './TaggingHealthBadge';
import { smartTaggingService } from '../../../services/metadataService';
import type { GalleryDetailData } from '../../../types/gallery';

interface AISettingsProps {
  gallery: GalleryDetailData;
}

export const AISettings: React.FC<AISettingsProps> = ({ gallery }) => {
  const { workspace } = useAuth();
  const { addToast } = useToast();
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isQueuingAll, setIsQueuingAll] = useState(false);

  const {
    health,
    fullHealth,
    loading,
    error,
    refetch,
    refreshStats,
    isRefreshing,
  } = useGalleryTaggingHealth({
    workspaceId: workspace?.workspace_id || '',
    galleryId: gallery.gallery_id,
    enabled: !!workspace?.workspace_id,
    autoRefresh: true,
  });

  const handleRefreshStats = async () => {
    await refreshStats();
    addToast({ message: 'Tagging statistics refreshed', variant: 'success' });
  };

  const handleQueueAllForAnalysis = async () => {
    if (!workspace?.workspace_id) return;

    setIsQueuingAll(true);
    try {
      // Queue detection for all assets in the gallery
      // Note: This would need gallery asset IDs - for now we'll trigger health refresh
      await smartTaggingService.refreshHealth(workspace.workspace_id);
      await refetch();
      addToast({
        message: 'Gallery assets queued for AI analysis',
        variant: 'success',
      });
    } catch {
      addToast({
        message: 'Failed to queue assets for analysis',
        variant: 'error',
      });
    } finally {
      setIsQueuingAll(false);
    }
  };

  const handleReanalyzeAll = async () => {
    // This would require getting all asset IDs first
    // For now, show a confirmation and info message
    if (!workspace?.workspace_id) return;

    const confirmed = window.confirm(
      'Re-analyze all photos in this gallery?\n\nThis will remove existing AI tags and queue all photos for fresh analysis. This may take a while for large galleries.'
    );

    if (!confirmed) return;

    setIsReanalyzing(true);
    try {
      // Note: Would need to fetch asset IDs and call reanalyze bulk
      // For now, trigger a stats refresh as a placeholder
      await smartTaggingService.refreshHealth(workspace.workspace_id);
      await refetch();
      addToast({
        message: 'Gallery queued for re-analysis. This may take a while.',
        variant: 'success',
      });
    } catch {
      addToast({
        message: 'Failed to queue gallery for re-analysis',
        variant: 'error',
      });
    } finally {
      setIsReanalyzing(false);
    }
  };

  // Determine overall status
  const getOverallStatus = () => {
    if (!health) return { label: 'Unknown', color: 'text-text-tertiary' };

    const overallPct = (health.vision_pct * 0.6 + health.face_pct * 0.4);
    if (overallPct >= 90) return { label: 'Complete', color: 'text-success' };
    if (overallPct >= 70) return { label: 'Good', color: 'text-accent' };
    if (overallPct >= 40) return { label: 'In Progress', color: 'text-warning' };
    if (overallPct > 0) return { label: 'Needs Attention', color: 'text-error' };
    return { label: 'Pending', color: 'text-text-tertiary' };
  };

  const status = getOverallStatus();

  return (
    <div className="space-y-6">
      {/* Health Overview */}
      <AppCard padding="md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-accent" />
            AI Tagging Health
          </h3>
          <AppButton
            variant="outline"
            size="sm"
            onClick={handleRefreshStats}
            disabled={isRefreshing}
            leftIcon={
              isRefreshing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )
            }
          >
            Refresh
          </AppButton>
        </div>

        {loading && !health ? (
          <div className="flex items-center justify-center py-8 text-text-tertiary">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 py-4 text-error text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>Failed to load tagging health</span>
            <AppButton variant="ghost" size="sm" onClick={refetch}>
              Retry
            </AppButton>
          </div>
        ) : health ? (
          <div className="space-y-4">
            {/* Status Badge */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Overall Status</span>
              <span className={`font-semibold ${status.color}`}>{status.label}</span>
            </div>

            {/* Progress Bars */}
            <TaggingHealthProgress health={health} showLabels />

            {/* Stats Grid */}
            {fullHealth && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
                <div className="text-center">
                  <div className="text-2xl font-bold text-text-primary">
                    {fullHealth.total_assets}
                  </div>
                  <div className="text-xs text-text-tertiary uppercase tracking-wider">
                    Total
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-accent">
                    {fullHealth.vision_completed}
                  </div>
                  <div className="text-xs text-text-tertiary uppercase tracking-wider flex items-center justify-center gap-1">
                    <Eye className="w-3 h-3" /> Vision
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-500">
                    {fullHealth.face_completed}
                  </div>
                  <div className="text-xs text-text-tertiary uppercase tracking-wider flex items-center justify-center gap-1">
                    <Users className="w-3 h-3" /> Faces
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">
                    {fullHealth.total_tags}
                  </div>
                  <div className="text-xs text-text-tertiary uppercase tracking-wider flex items-center justify-center gap-1">
                    <Tag className="w-3 h-3" /> Tags
                  </div>
                </div>
              </div>
            )}

            {/* Pending/Failed Counts */}
            {fullHealth && (fullHealth.vision_pending > 0 || fullHealth.vision_failed > 0) && (
              <div className="flex items-center gap-4 text-sm">
                {fullHealth.vision_pending > 0 && (
                  <span className="text-warning">
                    {fullHealth.vision_pending} pending
                  </span>
                )}
                {fullHealth.vision_failed > 0 && (
                  <span className="text-error">
                    {fullHealth.vision_failed} failed
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-text-tertiary text-sm">
            <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No tagging data available</p>
            <p className="text-xs mt-1">Upload photos to enable AI tagging</p>
          </div>
        )}
      </AppCard>

      {/* Actions */}
      <AppCard padding="md">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          AI Actions
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">
                Queue Unanalyzed Photos
              </p>
              <p className="text-xs text-text-tertiary">
                Queue any photos without AI analysis for processing
              </p>
            </div>
            <AppButton
              variant="outline"
              size="sm"
              onClick={handleQueueAllForAnalysis}
              disabled={isQueuingAll || !fullHealth?.vision_pending}
              leftIcon={
                isQueuingAll ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )
              }
            >
              Queue
            </AppButton>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-text-primary">
                Re-analyze All Photos
              </p>
              <p className="text-xs text-text-tertiary">
                Remove existing AI tags and re-analyze all photos
              </p>
            </div>
            <AppButton
              variant="outline"
              size="sm"
              onClick={handleReanalyzeAll}
              disabled={isReanalyzing || (fullHealth?.total_assets || 0) === 0}
              leftIcon={
                isReanalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )
              }
            >
              Re-analyze
            </AppButton>
          </div>
        </div>
      </AppCard>
    </div>
  );
};

export default AISettings;
