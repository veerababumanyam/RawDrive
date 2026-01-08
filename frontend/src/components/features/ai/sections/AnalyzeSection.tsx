/**
 * AnalyzeSection Component
 *
 * Section for AI-powered photo analysis including quality scores,
 * blur detection, and tagging health.
 *
 * Feature: AI Services Consolidation
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
  Camera,
  Sparkles,
  TrendingUp,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { FeatureCard } from '../FeatureCard';
import { QualityResultsGrid } from '../QualityResultsGrid';
import type {
  PhotoQualityResult,
  QualityAnalysisSummary,
  QualityAnalysisProgressResponse,
  QualityTier,
} from '@/types/curation';
import { QUALITY_TIERS } from '@/hooks/useQualityAnalysis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnalyzeSectionProps {
  workspaceId: string;
  galleryId: string;
  totalPhotos: number;
  qualityResults: PhotoQualityResult[];
  qualitySummary: QualityAnalysisSummary | null;
  qualityProgress: QualityAnalysisProgressResponse | null;
  isAnalyzing: boolean;
  isStarting: boolean;
  hasResults: boolean;
  progressPercent: number;
  onStartAnalysis: () => Promise<void>;
  expanded: boolean;
  onToggle: () => void;
}

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

export const AnalyzeSection: React.FC<AnalyzeSectionProps> = ({
  workspaceId,
  galleryId,
  totalPhotos,
  qualityResults,
  qualitySummary,
  qualityProgress,
  isAnalyzing,
  isStarting,
  hasResults,
  progressPercent,
  onStartAnalysis,
  expanded,
  onToggle,
}) => {
  const [showResultsGrid, setShowResultsGrid] = useState(false);

  const handleStartAnalysis = useCallback(async () => {
    try {
      await onStartAnalysis();
    } catch (error) {
      console.error('Failed to start analysis:', error);
    }
  }, [onStartAnalysis]);

  // Get blurred photos
  const blurredPhotos = qualityResults.filter((r) => r.blur_detected);

  // Determine status
  const status: 'idle' | 'active' | 'completed' | 'error' = isAnalyzing
    ? 'active'
    : hasResults
    ? 'completed'
    : 'idle';

  // Get description
  const description = hasResults
    ? `${qualitySummary?.total_analyzed || 0} photos analyzed`
    : 'Quality scores, blur detection, tagging health';

  // Content to render (shared between modal and card)
  const content = showResultsGrid ? (
    <div>
      <button
        onClick={() => setShowResultsGrid(false)}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary mb-4 transition-colors"
      >
        <ChevronRight className="w-4 h-4 rotate-180" />
        Back to Overview
      </button>
      <QualityResultsGrid
        results={qualityResults}
        summary={qualitySummary || undefined}
        onSelectionChange={(selectedIds: string[]) => {
          console.log('Selected photos:', selectedIds);
        }}
      />
    </div>
  ) : (
        <div className="space-y-4">
          {/* Quality Analysis */}
          {isAnalyzing && qualityProgress ? (
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
                  {qualityProgress.photos_analyzed} of {qualityProgress.photos_total} photos analyzed
                </p>
              </div>
            </div>
          ) : hasResults && qualitySummary ? (
            <div className="space-y-4">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  icon={<Camera className="w-4 h-4" />}
                  label="Analyzed"
                  value={qualitySummary.total_analyzed}
                  subtext={`of ${totalPhotos} photos`}
                />
                <StatCard
                  icon={<TrendingUp className="w-4 h-4" />}
                  label="Average Score"
                  value={Math.round(qualitySummary.average_score)}
                  subtext="out of 100"
                  color={
                    qualitySummary.average_score >= 70
                      ? 'success'
                      : qualitySummary.average_score >= 50
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
                    count={qualitySummary.excellent_count}
                    total={qualitySummary.total_analyzed}
                  />
                  <TierBadge
                    tier="good"
                    count={qualitySummary.good_count}
                    total={qualitySummary.total_analyzed}
                  />
                  <TierBadge
                    tier="fair"
                    count={qualitySummary.fair_count}
                    total={qualitySummary.total_analyzed}
                  />
                  <TierBadge
                    tier="poor"
                    count={qualitySummary.poor_count}
                    total={qualitySummary.total_analyzed}
                  />
                </div>
              </div>
            </div>
          ) : (
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
            </div>
          )}

          {/* Blur Detection */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <h4 className="text-sm font-semibold text-text-primary">Blur Detection</h4>
            </div>
            {hasResults ? (
              <div className="bg-background/50 rounded-lg p-4 border border-border/50">
                <div className="flex items-center justify-between">
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
                        {qualitySummary?.total_analyzed
                          ? `${qualitySummary.total_analyzed - (qualitySummary.blur_count || 0)} sharp photos`
                          : 'Run analysis to detect blur'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-background/50 rounded-lg p-4 border border-border/50 text-center">
                <p className="text-sm text-text-secondary">
                  Run quality analysis to detect blurred photos
                </p>
              </div>
            )}
          </div>

          {/* Tagging Health */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-purple-500" />
              <h4 className="text-sm font-semibold text-text-primary">Tagging Health</h4>
            </div>
            <div className="bg-background/50 rounded-lg p-4 border border-border/50">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-text-secondary">Vision Analysis</span>
                    <span className="text-sm font-medium text-text-primary">
                      {hasResults
                        ? `${Math.round((qualitySummary?.total_analyzed || 0) / totalPhotos * 100)}%`
                        : '0%'}
                    </span>
                  </div>
                  <div className="h-2 bg-background rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 transition-all duration-500"
                      style={{
                        width: hasResults
                          ? `${Math.round((qualitySummary?.total_analyzed || 0) / totalPhotos * 100)}%`
                          : '0%',
                      }}
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-text-tertiary mt-3">
                Tags are auto-generated from AI vision analysis
              </p>
            </div>
          </div>
        </div>
      );

  // When used in modal (expanded=true), render without FeatureCard wrapper
  if (expanded) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-text-primary">Analyze</h3>
              <p className="text-sm text-text-secondary">{description}</p>
            </div>
          </div>
          {!hasResults && (
            <AppButton
              variant="primary"
              onClick={handleStartAnalysis}
              isLoading={isStarting}
              leftIcon={<Play className="w-4 h-4" />}
            >
              Analyze {totalPhotos} Photos
            </AppButton>
          )}
          {hasResults && (
            <div className="flex gap-2">
              <AppButton
                variant="outline"
                size="sm"
                onClick={() => setShowResultsGrid(true)}
                leftIcon={<Eye className="w-4 h-4" />}
              >
                View Results
              </AppButton>
              <AppButton
                variant="outline"
                size="sm"
                onClick={handleStartAnalysis}
                isLoading={isStarting}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                Re-analyze
              </AppButton>
            </div>
          )}
        </div>
        {content}
      </div>
    );
  }

  // Legacy FeatureCard wrapper for backward compatibility
  return (
    <FeatureCard
      title="Analyze"
      description={description}
      icon={<BarChart3 className="w-4 h-4" />}
      status={status}
      progress={isAnalyzing ? progressPercent : undefined}
      expanded={expanded}
      onToggle={onToggle}
      primaryAction={
        !hasResults
          ? {
              label: `Analyze ${totalPhotos} Photos`,
              onClick: handleStartAnalysis,
              loading: isStarting,
              icon: <Play className="w-4 h-4" />,
            }
          : undefined
      }
      secondaryActions={
        hasResults
          ? [
              {
                label: 'View Results',
                onClick: () => setShowResultsGrid(true),
                icon: <Eye className="w-4 h-4" />,
              },
              {
                label: 'Re-analyze',
                onClick: handleStartAnalysis,
                icon: <RefreshCw className="w-4 h-4" />,
              },
            ]
          : undefined
      }
    >
      {content}
    </FeatureCard>
  );
};
