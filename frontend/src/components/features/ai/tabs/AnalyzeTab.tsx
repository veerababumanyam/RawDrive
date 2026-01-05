/**
 * AnalyzeTab Component
 *
 * Tab content for AI-powered photo analysis including:
 * - Quality analysis with scores
 * - Blur detection
 * - Tagging health status
 *
 * Feature: 024-ai-tools-hub
 */

import React, { useState, useCallback } from 'react';
import {
  BarChart3,
  Eye,
  AlertTriangle,
  CheckCircle2,
  Tag,
  Play,
  RefreshCw,
  ChevronRight,
  Camera,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { useQualityAnalysis, QUALITY_TIERS } from '@/hooks/useQualityAnalysis';
import { QualityResultsGrid } from '../QualityResultsGrid';
import type { QualityTier, QualityAnalysisSummary } from '@/types/curation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalyzeTabProps {
  workspaceId: string;
  galleryId: string;
  totalPhotos: number;
  onAnalysisComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Sub-Components
// ---------------------------------------------------------------------------

interface TierBadgeProps {
  tier: QualityTier;
  count: number;
  total: number;
}

const TierBadge: React.FC<TierBadgeProps> = ({ tier, count, total }) => {
  const config = QUALITY_TIERS[tier];
  const percentage = total > 0 ? Math.round((count / total) * 100) : 0;

  const colorClasses: Record<QualityTier, string> = {
    excellent: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    good: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    fair: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    poor: 'bg-red-500/10 text-red-600 border-red-500/20',
  };

  return (
    <div
      className={`flex items-center justify-between px-3 py-2 rounded-lg border ${colorClasses[tier]}`}
    >
      <span className="text-sm font-medium">{config.label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">{count}</span>
        <span className="text-xs opacity-70">({percentage}%)</span>
      </div>
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  color?: 'default' | 'success' | 'warning' | 'error';
}

const StatCard: React.FC<StatCardProps> = ({
  icon,
  label,
  value,
  subtext,
  color = 'default',
}) => {
  const colorClasses = {
    default: 'text-text-primary',
    success: 'text-emerald-500',
    warning: 'text-amber-500',
    error: 'text-red-500',
  };

  return (
    <div className="bg-background/50 rounded-lg p-4 border border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-text-secondary">{icon}</span>
        <span className="text-sm text-text-secondary">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</div>
      {subtext && <p className="text-xs text-text-tertiary mt-1">{subtext}</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AnalyzeTab: React.FC<AnalyzeTabProps> = ({
  workspaceId,
  galleryId,
  totalPhotos,
  onAnalysisComplete,
}) => {
  const [showResultsGrid, setShowResultsGrid] = useState(false);

  const {
    results,
    summary,
    progress,
    isLoading,
    isAnalyzing,
    isStarting,
    hasResults,
    progressPercent,
    startAnalysis,
    getBlurredPhotos,
  } = useQualityAnalysis({
    workspaceId,
    galleryId,
    onComplete: () => {
      onAnalysisComplete?.();
    },
  });

  const handleStartAnalysis = useCallback(async () => {
    try {
      await startAnalysis();
    } catch (error) {
      console.error('Failed to start analysis:', error);
    }
  }, [startAnalysis]);

  const blurredPhotos = getBlurredPhotos();

  // Show results grid view
  if (showResultsGrid) {
    return (
      <div className="p-4">
        <button
          onClick={() => setShowResultsGrid(false)}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-4 transition-colors"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          Back to Overview
        </button>
        <QualityResultsGrid
          results={results}
          summary={summary || undefined}
          onSelectionChange={(selectedIds: string[]) => {
            console.log('Selected photos:', selectedIds);
          }}
        />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Quality Analysis Section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold text-text-primary">Quality Analysis</h3>
        </div>

        {isAnalyzing && progress ? (
          /* Progress View - Simple inline progress bar */
          <div className="bg-background/50 rounded-lg p-4 border border-border/50">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Analyzing photos...</span>
                <span className="font-medium">{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-sm text-text-secondary text-center">
                {progress.photos_analyzed} of {progress.photos_total} photos analyzed
              </p>
            </div>
          </div>
        ) : hasResults && summary ? (
          /* Results View */
          <div className="space-y-4">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={<Camera className="w-4 h-4" />}
                label="Analyzed"
                value={summary.total_analyzed}
                subtext={`of ${totalPhotos} photos`}
              />
              <StatCard
                icon={<TrendingUp className="w-4 h-4" />}
                label="Average Score"
                value={Math.round(summary.average_score)}
                subtext="out of 100"
                color={
                  summary.average_score >= 70
                    ? 'success'
                    : summary.average_score >= 50
                    ? 'warning'
                    : 'error'
                }
              />
            </div>

            {/* Tier Distribution */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-text-secondary">Quality Distribution</p>
              <div className="grid grid-cols-2 gap-2">
                <TierBadge
                  tier="excellent"
                  count={summary.excellent_count}
                  total={summary.total_analyzed}
                />
                <TierBadge
                  tier="good"
                  count={summary.good_count}
                  total={summary.total_analyzed}
                />
                <TierBadge
                  tier="fair"
                  count={summary.fair_count}
                  total={summary.total_analyzed}
                />
                <TierBadge
                  tier="poor"
                  count={summary.poor_count}
                  total={summary.total_analyzed}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <AppButton
                variant="primary"
                size="sm"
                onClick={() => setShowResultsGrid(true)}
                className="flex-1"
              >
                <Eye className="w-4 h-4 mr-2" />
                View All Results
              </AppButton>
              <AppButton
                variant="outline"
                size="sm"
                onClick={handleStartAnalysis}
                isLoading={isStarting}
              >
                <RefreshCw className="w-4 h-4" />
              </AppButton>
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="bg-background/50 rounded-lg p-6 border border-border/50 text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h4 className="text-base font-medium text-text-primary mb-2">
              Analyze Photo Quality
            </h4>
            <p className="text-sm text-text-secondary mb-4">
              AI will score each photo for sharpness, exposure, composition, and detect blur.
            </p>
            <AppButton
              variant="primary"
              onClick={handleStartAnalysis}
              isLoading={isStarting || isLoading}
              loadingText="Starting..."
              leftIcon={<Play className="w-4 h-4" />}
            >
              Analyze {totalPhotos} Photos
            </AppButton>
          </div>
        )}
      </section>

      {/* Blur Detection Section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="text-base font-semibold text-text-primary">Blur Detection</h3>
        </div>

        {hasResults ? (
          <div className="bg-background/50 rounded-lg p-4 border border-border/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    blurredPhotos.length > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'
                  }`}
                >
                  {blurredPhotos.length > 0 ? (
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {blurredPhotos.length > 0
                      ? `${blurredPhotos.length} blurred photos detected`
                      : 'All photos are sharp'}
                  </p>
                  <p className="text-xs text-text-secondary">
                    {summary?.total_analyzed
                      ? `${summary.total_analyzed - (summary.blur_count || 0)} sharp photos`
                      : 'Run analysis to detect blur'}
                  </p>
                </div>
              </div>
            </div>

            {blurredPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-border/50">
                <div>
                  <p className="text-lg font-bold text-amber-500">
                    {blurredPhotos.filter((p) => p.blur_type === 'motion').length}
                  </p>
                  <p className="text-xs text-text-secondary">Motion</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-500">
                    {blurredPhotos.filter((p) => p.blur_type === 'focus').length}
                  </p>
                  <p className="text-xs text-text-secondary">Focus</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-500">
                    {blurredPhotos.filter((p) => p.blur_type === 'bokeh').length}
                  </p>
                  <p className="text-xs text-text-secondary">Bokeh</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-background/50 rounded-lg p-4 border border-border/50 text-center">
            <p className="text-sm text-text-secondary">
              Run quality analysis to detect blurred photos
            </p>
          </div>
        )}
      </section>

      {/* Tagging Health Section */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Tag className="w-5 h-5 text-purple-500" />
          <h3 className="text-base font-semibold text-text-primary">Tagging Health</h3>
        </div>

        <div className="bg-background/50 rounded-lg p-4 border border-border/50">
          <div className="space-y-3">
            {/* Vision Analysis */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-text-secondary">Vision Analysis</span>
                <span className="text-sm font-medium text-text-primary">
                  {hasResults ? `${Math.round((summary?.total_analyzed || 0) / totalPhotos * 100)}%` : '0%'}
                </span>
              </div>
              <div className="h-2 bg-background rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-500"
                  style={{
                    width: hasResults
                      ? `${Math.round((summary?.total_analyzed || 0) / totalPhotos * 100)}%`
                      : '0%',
                  }}
                />
              </div>
            </div>

            {/* Tags Applied (placeholder - would need tagging health API) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-text-secondary">Tags Applied</span>
                <span className="text-sm font-medium text-text-primary">--</span>
              </div>
              <div className="h-2 bg-background rounded-full overflow-hidden">
                <div className="h-full bg-purple-500/50 w-0" />
              </div>
            </div>
          </div>

          <p className="text-xs text-text-tertiary mt-3">
            Tags are auto-generated from AI vision analysis
          </p>
        </div>
      </section>
    </div>
  );
};

export default AnalyzeTab;
