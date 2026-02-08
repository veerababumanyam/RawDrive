/**
 * A/B Test Panel Component
 *
 * Displays A/B test details, variants, and results for recommendation experiments.
 */

import React, { useState, useCallback } from 'react';
import {
  Beaker,
  PlayCircle,
  PauseCircle,
  CheckCircle,
  Clock,
  X,
  TrendingUp,
  Users,
  Eye,
  MousePointer,
  Download,
  BarChart3,
  Loader2,
  Trophy,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { AppButton } from '../../ui/AppButton';
import { useToast } from '../../ui/Toast';
import {
  useABTest,
  useABTestResults,
  useStartABTest,
  useConcludeABTest,
} from '../../../hooks/usePortfolioRecommendations';
import type { ABTest, ABTestStatus, ABTestVariant } from '../../../services/portfolioRecommendationService';

/* =============================================================================
   Types
   ============================================================================= */

interface ABTestPanelProps {
  workspaceId: string;
  testId: string;
  onClose?: () => void;
}

/* =============================================================================
   Helper Functions
   ============================================================================= */

const getStatusConfig = (status: ABTestStatus) => {
  const configs: Record<ABTestStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode }> = {
    draft: {
      label: 'Draft',
      color: 'text-neutral-500',
      bgColor: 'bg-neutral-500/10',
      icon: <Clock size={16} />,
    },
    running: {
      label: 'Running',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      icon: <PlayCircle size={16} />,
    },
    paused: {
      label: 'Paused',
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      icon: <PauseCircle size={16} />,
    },
    completed: {
      label: 'Completed',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      icon: <CheckCircle size={16} />,
    },
    cancelled: {
      label: 'Cancelled',
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      icon: <X size={16} />,
    },
  };
  return configs[status] || configs.draft;
};

const formatPercentage = (value: number): string => {
  return `${(value * 100).toFixed(2)}%`;
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/* =============================================================================
   Sub Components
   ============================================================================= */

const VariantCard: React.FC<{
  variant: ABTestVariant;
  index: number;
  isWinner?: boolean;
  isControl?: boolean;
}> = ({ variant, index, isWinner, isControl }) => {
  const clickRate = variant.impressions > 0
    ? (variant.clicks / variant.impressions)
    : 0;
  const conversionRate = variant.clicks > 0
    ? (variant.conversions / variant.clicks)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`p-4 rounded-lg border ${
        isWinner
          ? 'border-green-500/50 bg-green-500/5'
          : 'border-border bg-surface-tertiary'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
            isWinner
              ? 'bg-green-500 text-white'
              : 'bg-primary/10 text-primary'
          }`}>
            {String.fromCharCode(65 + index)}
          </span>
          <div>
            <p className="font-medium text-text-primary">{variant.name}</p>
            {isControl && (
              <span className="text-xs text-text-tertiary">Control</span>
            )}
          </div>
        </div>
        {isWinner && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/20 text-green-500 text-xs font-medium">
            <Trophy size={12} />
            Winner
          </div>
        )}
      </div>

      {variant.description && (
        <p className="text-sm text-text-secondary mb-3">{variant.description}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="p-2 rounded bg-surface-secondary">
          <div className="flex items-center gap-1 text-text-tertiary text-xs mb-1">
            <Eye size={12} />
            Impressions
          </div>
          <p className="text-lg font-bold text-text-primary">
            {variant.impressions.toLocaleString()}
          </p>
        </div>
        <div className="p-2 rounded bg-surface-secondary">
          <div className="flex items-center gap-1 text-text-tertiary text-xs mb-1">
            <MousePointer size={12} />
            Clicks
          </div>
          <p className="text-lg font-bold text-text-primary">
            {variant.clicks.toLocaleString()}
          </p>
        </div>
        <div className="p-2 rounded bg-surface-secondary">
          <div className="flex items-center gap-1 text-text-tertiary text-xs mb-1">
            <TrendingUp size={12} />
            Click Rate
          </div>
          <p className="text-lg font-bold text-text-primary">
            {formatPercentage(clickRate)}
          </p>
        </div>
        <div className="p-2 rounded bg-surface-secondary">
          <div className="flex items-center gap-1 text-text-tertiary text-xs mb-1">
            <Download size={12} />
            Conversions
          </div>
          <p className="text-lg font-bold text-text-primary">
            {variant.conversions.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-tertiary">Conversion Rate</span>
          <span className={`font-medium ${isWinner ? 'text-green-500' : 'text-text-primary'}`}>
            {formatPercentage(conversionRate)}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

/* =============================================================================
   Main Component
   ============================================================================= */

export const ABTestPanel: React.FC<ABTestPanelProps> = ({
  workspaceId,
  testId,
  onClose,
}) => {
  const { addToast } = useToast();

  // Queries
  const { data: test, isLoading: isLoadingTest } = useABTest(workspaceId, testId);
  const { data: results, isLoading: isLoadingResults } = useABTestResults(
    workspaceId,
    testId,
    { enabled: !!test && test.status !== 'draft' }
  );

  // Mutations
  const { mutate: startTest, isPending: isStarting } = useStartABTest(workspaceId);
  const { mutate: concludeTest, isPending: isConcluding } = useConcludeABTest(workspaceId);

  // Handlers
  const handleStart = useCallback(() => {
    startTest(testId, {
      onSuccess: () => {
        addToast({ variant: 'success', message: 'Test started successfully' });
      },
      onError: (error) => {
        addToast({
          variant: 'error',
          message: error instanceof Error ? error.message : 'Failed to start test',
        });
      },
    });
  }, [startTest, testId, addToast]);

  const handleConclude = useCallback((winnerVariantId?: string) => {
    concludeTest(
      { testId, winnerVariant: winnerVariantId },
      {
        onSuccess: () => {
          addToast({ variant: 'success', message: 'Test concluded successfully' });
        },
        onError: (error) => {
          addToast({
            variant: 'error',
            message: error instanceof Error ? error.message : 'Failed to conclude test',
          });
        },
      }
    );
  }, [concludeTest, testId, addToast]);

  if (isLoadingTest) {
    return (
      <div className="bg-surface-secondary rounded-xl border border-border p-8">
        <div className="flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="bg-surface-secondary rounded-xl border border-border p-8 text-center">
        <Beaker size={48} className="mx-auto mb-4 text-text-tertiary opacity-50" />
        <p className="text-text-tertiary">Test not found</p>
      </div>
    );
  }

  const statusConfig = getStatusConfig(test.status);

  return (
    <div className="bg-surface-secondary rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Beaker size={20} className="text-purple-500" />
              <h3 className="font-semibold text-text-primary">{test.name}</h3>
              <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${statusConfig.bgColor} ${statusConfig.color}`}>
                {statusConfig.icon}
                {statusConfig.label}
              </span>
            </div>
            {test.description && (
              <p className="text-sm text-text-tertiary">{test.description}</p>
            )}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-surface-tertiary transition-colors"
            >
              <X size={20} className="text-text-tertiary" />
            </button>
          )}
        </div>

        {/* Meta info */}
        <div className="flex gap-4 mt-3 text-xs text-text-tertiary">
          <span>Created: {formatDate(test.created_at)}</span>
          {test.started_at && <span>Started: {formatDate(test.started_at)}</span>}
          {test.concluded_at && <span>Concluded: {formatDate(test.concluded_at)}</span>}
        </div>
      </div>

      {/* Variants */}
      <div className="p-4">
        <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
          <BarChart3 size={16} className="text-primary" />
          Variants ({test.variants.length})
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {test.variants.map((variant, index) => (
            <VariantCard
              key={variant.variant_id}
              variant={variant}
              index={index}
              isWinner={test.winner_variant_id === variant.variant_id}
              isControl={variant.is_control}
            />
          ))}
        </div>
      </div>

      {/* Statistical Results */}
      {results && (
        <div className="p-4 border-t border-border">
          <h4 className="text-sm font-medium text-text-primary mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-green-500" />
            Statistical Analysis
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-surface-tertiary">
              <p className="text-xs text-text-tertiary mb-1">Total Impressions</p>
              <p className="text-xl font-bold text-text-primary">
                {results.total_impressions.toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-surface-tertiary">
              <p className="text-xs text-text-tertiary mb-1">Total Clicks</p>
              <p className="text-xl font-bold text-text-primary">
                {results.total_clicks.toLocaleString()}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-surface-tertiary">
              <p className="text-xs text-text-tertiary mb-1">P-Value</p>
              <p className={`text-xl font-bold ${
                results.p_value < 0.05 ? 'text-green-500' : 'text-text-primary'
              }`}>
                {results.p_value.toFixed(4)}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-surface-tertiary">
              <p className="text-xs text-text-tertiary mb-1">Statistically Significant</p>
              <p className={`text-xl font-bold ${
                results.is_significant ? 'text-green-500' : 'text-yellow-500'
              }`}>
                {results.is_significant ? 'Yes' : 'No'}
              </p>
            </div>
          </div>
          {results.recommended_winner && (
            <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <p className="text-sm text-green-500 flex items-center gap-2">
                <Trophy size={16} />
                Recommended Winner: {test.variants.find(v => v.variant_id === results.recommended_winner)?.name || 'Unknown'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="p-4 border-t border-border flex items-center justify-between">
        <div className="text-xs text-text-tertiary">
          {test.status === 'running' && (
            <span>Collecting data...</span>
          )}
        </div>
        <div className="flex gap-2">
          {test.status === 'draft' && (
            <AppButton
              variant="primary"
              size="sm"
              leftIcon={isStarting ? <Loader2 size={14} className="animate-spin" /> : <PlayCircle size={14} />}
              onClick={handleStart}
              disabled={isStarting}
            >
              Start Test
            </AppButton>
          )}
          {test.status === 'running' && (
            <AppButton
              variant="secondary"
              size="sm"
              leftIcon={isConcluding ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
              onClick={() => handleConclude(results?.recommended_winner)}
              disabled={isConcluding}
            >
              Conclude Test
            </AppButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default ABTestPanel;
