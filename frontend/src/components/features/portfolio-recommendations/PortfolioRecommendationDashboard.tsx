/**
 * Portfolio Recommendation Dashboard
 *
 * Main dashboard for AI-powered portfolio recommendations.
 * Displays hero shots, personalized recommendations, A/B tests, and engagement metrics.
 */

import React, { useState, useCallback } from 'react';
import {
  Sparkles,
  Image,
  Users,
  TrendingUp,
  Star,
  Target,
  Beaker,
  RefreshCw,
  Loader2,
  ChevronRight,
  Calendar,
  Zap,
  ThumbsUp,
  ThumbsDown,
  Eye,
  Download,
  BarChart3,
  Layers,
  Clock,
  CheckCircle,
  PlayCircle,
  PauseCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import {
  useTopAssets,
  useHeroShots,
  useABTests,
  useRefreshEngagementScores,
} from '../../../hooks/usePortfolioRecommendations';
import { ABTestStatus } from '@rawdrive/shared-types';
import type {
  TopAsset,
  RecommendationItem,
  ABTest,
} from '../../../services/portfolioRecommendationService';
import { SceneCategory } from '../../../services/portfolioRecommendationService';

/* =============================================================================
   Types
   ============================================================================= */

interface PortfolioRecommendationDashboardProps {
  workspaceId: string;
  onAssetClick?: (assetId: string) => void;
  onGenerateClick?: () => void;
  onABTestClick?: (testId: string) => void;
  compact?: boolean;
}

/* =============================================================================
   Helper Functions
   ============================================================================= */

const getSceneCategoryConfig = (category: SceneCategory) => {
  const configs: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
    [SceneCategory.CEREMONY]: { label: 'Ceremony', icon: <Star size={14} />, color: 'text-amber-500 bg-amber-500/10' },
    [SceneCategory.RECEPTION]: { label: 'Reception', icon: <Sparkles size={14} />, color: 'text-purple-500 bg-purple-500/10' },
    [SceneCategory.PORTRAIT]: { label: 'Portrait', icon: <Users size={14} />, color: 'text-blue-500 bg-blue-500/10' },
    [SceneCategory.DETAIL]: { label: 'Detail', icon: <Image size={14} />, color: 'text-emerald-500 bg-emerald-500/10' },
    [SceneCategory.CANDID]: { label: 'Candid', icon: <Zap size={14} />, color: 'text-rose-500 bg-rose-500/10' },
    [SceneCategory.LANDSCAPE]: { label: 'Landscape', icon: <Layers size={14} />, color: 'text-cyan-500 bg-cyan-500/10' },
    [SceneCategory.GROUP]: { label: 'Group', icon: <Users size={14} />, color: 'text-indigo-500 bg-indigo-500/10' },
    [SceneCategory.COUPLE]: { label: 'Couple', icon: <Users size={14} />, color: 'text-pink-500 bg-pink-500/10' },
    [SceneCategory.FAMILY]: { label: 'Family', icon: <Users size={14} />, color: 'text-orange-500 bg-orange-500/10' },
    [SceneCategory.FOOD]: { label: 'Food', icon: <Image size={14} />, color: 'text-lime-500 bg-lime-500/10' },
    [SceneCategory.VENUE]: { label: 'Venue', icon: <Layers size={14} />, color: 'text-slate-500 bg-slate-500/10' },
    [SceneCategory.OTHER]: { label: 'Other', icon: <Image size={14} />, color: 'text-neutral-500 bg-neutral-500/10' },
  };
  return configs[category] || configs[SceneCategory.OTHER];
};

const getABTestStatusConfig = (status: ABTestStatus) => {
  const configs: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    [ABTestStatus.DRAFT]: { label: 'Draft', color: 'text-neutral-500 bg-neutral-500/10', icon: <Clock size={14} /> },
    [ABTestStatus.RUNNING]: { label: 'Running', color: 'text-green-500 bg-green-500/10', icon: <PlayCircle size={14} /> },
    [ABTestStatus.PAUSED]: { label: 'Paused', color: 'text-yellow-500 bg-yellow-500/10', icon: <PauseCircle size={14} /> },
    [ABTestStatus.COMPLETED]: { label: 'Completed', color: 'text-blue-500 bg-blue-500/10', icon: <CheckCircle size={14} /> },
    [ABTestStatus.CANCELLED]: { label: 'Cancelled', color: 'text-red-500 bg-red-500/10', icon: <Clock size={14} /> },
  };
  return configs[status] || configs[ABTestStatus.DRAFT];
};

const formatEngagementScore = (score: number): string => {
  return score.toFixed(1);
};

const formatPercentage = (value: number): string => {
  return `${(value * 100).toFixed(1)}%`;
};

/* =============================================================================
   Sub Components
   ============================================================================= */

const StatCard: React.FC<{
  label: string;
  value: number | string;
  icon: React.ReactNode;
  trend?: number;
  suffix?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning';
}> = ({ label, value, icon, trend, suffix, variant = 'default' }) => {
  const variantClasses = {
    default: 'border-border',
    primary: 'border-primary/30 bg-primary/5',
    success: 'border-green-500/30 bg-green-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-surface-secondary rounded-xl p-4 border ${variantClasses[variant]}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-text-tertiary text-sm">{label}</span>
        <span className="text-text-tertiary">{icon}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-text-primary">{value}</span>
        {suffix && <span className="text-text-tertiary text-sm">{suffix}</span>}
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-1 text-sm ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          <TrendingUp size={14} className={trend < 0 ? 'rotate-180' : ''} />
          <span>{Math.abs(trend).toFixed(1)}%</span>
        </div>
      )}
    </motion.div>
  );
};

const TopAssetsGrid: React.FC<{
  assets: TopAsset[];
  onAssetClick?: (assetId: string) => void;
  isLoading?: boolean;
}> = ({ assets, onAssetClick, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Star size={16} className="text-amber-500" />
          Top Performing Assets
        </h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Star size={16} className="text-amber-500" />
          Top Performing Assets
        </h3>
        <div className="text-center py-8">
          <Image size={32} className="mx-auto mb-2 text-text-tertiary opacity-50" />
          <p className="text-text-tertiary text-sm">No assets analyzed yet</p>
          <p className="text-text-tertiary text-xs mt-1">Upload photos to get recommendations</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
        <Star size={16} className="text-amber-500" />
        Top Performing Assets
        <span className="ml-auto text-xs text-text-tertiary">{assets.length} assets</span>
      </h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {assets.slice(0, 6).map((asset, index) => {
          const categoryConfig = asset.scene_category
            ? getSceneCategoryConfig(asset.scene_category as SceneCategory)
            : null;

          return (
            <motion.button
              key={asset.asset_id}
              onClick={() => onAssetClick?.(asset.asset_id)}
              className="relative group rounded-lg overflow-hidden aspect-square bg-surface-tertiary"
              whileHover={{ scale: 1.02 }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.05 }}
            >
              {asset.thumbnail_url ? (
                <img
                  src={asset.thumbnail_url}
                  alt={`Top asset ${index + 1}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Image size={24} className="text-text-tertiary" />
                </div>
              )}

              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

              {/* Score badge */}
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded bg-amber-500/90 text-white text-xs font-medium">
                {formatEngagementScore(asset.engagement_score)}
              </div>

              {/* Category badge */}
              {categoryConfig && (
                <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded text-xs flex items-center gap-1 ${categoryConfig.color}`}>
                  {categoryConfig.icon}
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {categoryConfig.label}
                  </span>
                </div>
              )}

              {/* Hover info */}
              <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="px-1.5 py-0.5 rounded bg-white/90 text-black text-xs flex items-center gap-0.5">
                  <Eye size={10} />
                  {asset.view_count}
                </div>
                <div className="px-1.5 py-0.5 rounded bg-white/90 text-black text-xs flex items-center gap-0.5">
                  <Download size={10} />
                  {asset.download_count}
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

const HeroShotsPanel: React.FC<{
  workspaceId: string;
  onAssetClick?: (assetId: string) => void;
}> = ({ workspaceId, onAssetClick }) => {
  const { mutate: fetchHeroShots, data: heroShots, isPending } = useHeroShots(workspaceId);
  const [hasLoaded, setHasLoaded] = useState(false);

  const handleLoad = useCallback(() => {
    fetchHeroShots(
      { limit: 8 },
      {
        onSuccess: () => setHasLoaded(true),
      }
    );
  }, [fetchHeroShots]);

  if (!hasLoaded) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          Hero Shots
        </h3>
        <div className="text-center py-6">
          <Sparkles size={32} className="mx-auto mb-2 text-primary opacity-50" />
          <p className="text-text-tertiary text-sm mb-3">
            AI-selected best shots from your portfolio
          </p>
          <AppButton
            variant="secondary"
            size="sm"
            onClick={handleLoad}
            disabled={isPending}
            leftIcon={isPending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          >
            {isPending ? 'Analyzing...' : 'Find Hero Shots'}
          </AppButton>
        </div>
      </div>
    );
  }

  if (!heroShots?.items || heroShots.items.length === 0) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          Hero Shots
        </h3>
        <div className="text-center py-6">
          <Image size={32} className="mx-auto mb-2 text-text-tertiary opacity-50" />
          <p className="text-text-tertiary text-sm">No hero shots found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
        <Sparkles size={16} className="text-primary" />
        Hero Shots
        <span className="ml-auto text-xs text-text-tertiary">{heroShots.items.length} shots</span>
      </h3>
      <div className="grid grid-cols-4 gap-2">
        {heroShots.items.slice(0, 8).map((item, index) => (
          <motion.button
            key={item.item_id}
            onClick={() => onAssetClick?.(item.asset_id)}
            className="relative group rounded-lg overflow-hidden aspect-square bg-surface-tertiary"
            whileHover={{ scale: 1.05 }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.03 }}
          >
            {item.thumbnail_url ? (
              <img
                src={item.thumbnail_url}
                alt={`Hero shot ${index + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Image size={16} className="text-text-tertiary" />
              </div>
            )}
            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center">
              {index + 1}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

const ABTestsList: React.FC<{
  workspaceId: string;
  onTestClick?: (testId: string) => void;
}> = ({ workspaceId, onTestClick }) => {
  const { data: testsData, isLoading } = useABTests(workspaceId, {
    status: ABTestStatus.RUNNING,
    limit: 5,
  });

  if (isLoading) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Beaker size={16} className="text-purple-500" />
          A/B Tests
        </h3>
        <div className="flex items-center justify-center py-6">
          <Loader2 size={24} className="animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const tests = Array.isArray(testsData) ? testsData : [];

  if (tests.length === 0) {
    return (
      <div className="bg-surface-secondary rounded-xl p-4 border border-border">
        <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
          <Beaker size={16} className="text-purple-500" />
          A/B Tests
        </h3>
        <div className="text-center py-6">
          <Beaker size={32} className="mx-auto mb-2 text-purple-500 opacity-50" />
          <p className="text-text-tertiary text-sm">No active tests</p>
          <p className="text-text-tertiary text-xs mt-1">
            Create tests to optimize recommendations
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
        <Beaker size={16} className="text-purple-500" />
        A/B Tests
        <span className="ml-auto text-xs text-text-tertiary">{tests.length} running</span>
      </h3>
      <div className="space-y-2">
        {tests.map((test) => {
          const statusConfig = getABTestStatusConfig(test.status);
          const totalImpressions = (test.variants || []).reduce((sum, v) => sum + (v.impressions || 0), 0);

          return (
            <motion.button
              key={test.test_id}
              onClick={() => onTestClick?.(test.test_id)}
              className="w-full p-3 rounded-lg hover:bg-surface-tertiary transition-colors text-left"
              whileHover={{ x: 4 }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-text-primary truncate">
                  {test.name}
                </p>
                <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${statusConfig.color}`}>
                  {statusConfig.icon}
                  {statusConfig.label}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-text-tertiary">
                <span>{test.variants?.length || 0} variants</span>
                <span>{totalImpressions.toLocaleString()} impressions</span>
              </div>
              {test.winner_variant_id && (
                <div className="mt-2 px-2 py-1 rounded bg-green-500/10 text-green-500 text-xs">
                  Winner: Variant {(test.variants || []).findIndex((v) => v.variant_id === test.winner_variant_id) + 1}
                </div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

const EngagementMetricsPanel: React.FC<{
  assets: TopAsset[];
}> = ({ assets }) => {
  const totalViews = assets.reduce((sum, a) => sum + (a.view_count || 0), 0);
  const totalDownloads = assets.reduce((sum, a) => sum + (a.download_count || 0), 0);
  const totalFavorites = assets.reduce((sum, a) => sum + (a.favorite_count || 0), 0);
  const avgScore = assets.length > 0
    ? assets.reduce((sum, a) => sum + a.engagement_score, 0) / assets.length
    : 0;

  // Category distribution
  const categoryCount: Partial<Record<string, number>> = {};
  assets.forEach((asset) => {
    if (asset.scene_category) {
      categoryCount[asset.scene_category] = (categoryCount[asset.scene_category] || 0) + 1;
    }
  });

  const topCategories = Object.entries(categoryCount)
    .sort(([, a], [, b]) => (b || 0) - (a || 0))
    .slice(0, 4);

  return (
    <div className="bg-surface-secondary rounded-xl p-4 border border-border">
      <h3 className="text-sm font-medium text-text-primary mb-4 flex items-center gap-2">
        <BarChart3 size={16} className="text-blue-500" />
        Engagement Overview
      </h3>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-surface-tertiary">
          <div className="flex items-center gap-2 text-text-tertiary text-xs mb-1">
            <Eye size={12} />
            Total Views
          </div>
          <p className="text-lg font-bold text-text-primary">{totalViews.toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-lg bg-surface-tertiary">
          <div className="flex items-center gap-2 text-text-tertiary text-xs mb-1">
            <Download size={12} />
            Downloads
          </div>
          <p className="text-lg font-bold text-text-primary">{totalDownloads.toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-lg bg-surface-tertiary">
          <div className="flex items-center gap-2 text-text-tertiary text-xs mb-1">
            <Star size={12} />
            Favorites
          </div>
          <p className="text-lg font-bold text-text-primary">{totalFavorites.toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-lg bg-surface-tertiary">
          <div className="flex items-center gap-2 text-text-tertiary text-xs mb-1">
            <TrendingUp size={12} />
            Avg Score
          </div>
          <p className="text-lg font-bold text-text-primary">{avgScore.toFixed(1)}</p>
        </div>
      </div>

      {topCategories.length > 0 && (
        <>
          <h4 className="text-xs font-medium text-text-tertiary mb-2">Top Categories</h4>
          <div className="flex flex-wrap gap-2">
            {topCategories.map(([category, count]) => {
              const config = getSceneCategoryConfig(category as SceneCategory);
              return (
                <span
                  key={category}
                  className={`px-2 py-1 rounded text-xs flex items-center gap-1 ${config.color}`}
                >
                  {config.icon}
                  {config.label} ({count})
                </span>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

/* =============================================================================
   Main Component
   ============================================================================= */

export const PortfolioRecommendationDashboard: React.FC<PortfolioRecommendationDashboardProps> = ({
  workspaceId,
  onAssetClick,
  onGenerateClick,
  onABTestClick,
  compact = false,
}) => {
  const { addToast } = useToast();

  // Queries
  const {
    data: topAssetsData,
    isLoading: isLoadingTopAssets,
    refetch: refetchTopAssets,
  } = useTopAssets(workspaceId, { limit: 20 });

  const { mutate: refreshScores, isPending: isRefreshing } = useRefreshEngagementScores(workspaceId);

  const topAssets = Array.isArray(topAssetsData) ? topAssetsData : [];

  // Handle refresh
  const handleRefresh = useCallback(() => {
    refreshScores(undefined, {
      onSuccess: () => {
        refetchTopAssets();
        addToast({
          variant: 'success',
          message: 'Engagement scores refreshed successfully',
        });
      },
      onError: (error) => {
        addToast({
          variant: 'error',
          message: error instanceof Error ? error.message : 'Failed to refresh scores',
        });
      },
    });
  }, [refreshScores, refetchTopAssets, addToast]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Sparkles size={20} className="text-primary" />
            Portfolio Recommendations
          </h2>
          <p className="text-sm text-text-tertiary">
            AI-powered insights to optimize your photo selections
          </p>
        </div>
        <div className="flex gap-2">
          <AppButton
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />}
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            Refresh
          </AppButton>
          {onGenerateClick && (
            <AppButton
              variant="primary"
              size="sm"
              leftIcon={<Sparkles size={16} />}
              onClick={onGenerateClick}
            >
              Generate
            </AppButton>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Assets Analyzed"
          value={topAssets.length}
          icon={<Image size={20} />}
        />
        <StatCard
          label="High Performers"
          value={topAssets.filter((a) => a.engagement_score >= 7).length}
          icon={<Star size={20} className="text-amber-500" />}
          variant="success"
        />
        <StatCard
          label="Avg Engagement"
          value={
            topAssets.length > 0
              ? formatEngagementScore(
                  topAssets.reduce((sum, a) => sum + a.engagement_score, 0) / topAssets.length
                )
              : '0'
          }
          icon={<TrendingUp size={20} className="text-green-500" />}
        />
        <StatCard
          label="Categories"
          value={new Set(topAssets.map((a) => a.scene_category).filter(Boolean)).size}
          icon={<Layers size={20} className="text-purple-500" />}
        />
      </div>

      {/* Main Content */}
      {compact ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TopAssetsGrid
            assets={topAssets}
            onAssetClick={onAssetClick}
            isLoading={isLoadingTopAssets}
          />
          <HeroShotsPanel
            workspaceId={workspaceId}
            onAssetClick={onAssetClick}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-4">
            <TopAssetsGrid
              assets={topAssets}
              onAssetClick={onAssetClick}
              isLoading={isLoadingTopAssets}
            />
            <HeroShotsPanel
              workspaceId={workspaceId}
              onAssetClick={onAssetClick}
            />
          </div>

          {/* Right Column */}
          <div className="space-y-4">
            <EngagementMetricsPanel assets={topAssets} />
            <ABTestsList
              workspaceId={workspaceId}
              onTestClick={onABTestClick}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PortfolioRecommendationDashboard;
