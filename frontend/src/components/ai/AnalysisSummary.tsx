/**
 * AnalysisSummary Component
 *
 * Displays analysis results with quality distribution and partial failure handling.
 * Shows warning banner when some photos failed to analyze with retry option.
 *
 * Feature: 025-ai-filter-simplify (T023a)
 */

import React, { useState, useCallback } from 'react';
import { AlertTriangle, RefreshCw, Loader2, CheckCircle2 } from 'lucide-react';
import type { AnalysisSummary as AnalysisSummaryType } from '../../validation/aiFilterSchemas';
import { aiFilterService } from '../../services/aiFilterService';

interface AnalysisSummaryProps {
  summary: AnalysisSummaryType;
  workspaceId?: string;
  galleryId?: string;
  onRetryStarted?: () => void;
}

export const AnalysisSummary: React.FC<AnalysisSummaryProps> = ({
  summary,
  workspaceId,
  galleryId,
  onRetryStarted,
}) => {
  const [retryState, setRetryState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [retryError, setRetryError] = useState<string | null>(null);

  // Calculate distribution percentages
  const total = summary.total_analyzed;
  const hasFailures = summary.failed_count > 0;

  const getPercent = (count: number) => total > 0 ? Math.round((count / total) * 100) : 0;

  const qualityDist = {
    excellent: summary.excellent,
    good: summary.good,
    fair: summary.fair,
    poor: summary.poor,
  };

  const handleRetry = useCallback(async () => {
    if (!workspaceId || !galleryId) return;

    setRetryState('loading');
    setRetryError(null);

    try {
      await aiFilterService.retryFailedAnalysis(workspaceId, galleryId);
      setRetryState('success');
      onRetryStarted?.();
    } catch (err) {
      setRetryState('error');
      setRetryError(err instanceof Error ? err.message : 'Failed to retry analysis');
    }
  }, [workspaceId, galleryId, onRetryStarted]);

  return (
    <div className="w-full p-4 bg-surface rounded-lg border border-border">
      <h3 className="text-lg font-medium text-text-primary mb-4">Analysis Complete</h3>

      {/* Partial Failure Warning Banner (T023a) */}
      {hasFailures && retryState !== 'success' && (
        <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-warning">
                {summary.failed_count} photo{summary.failed_count !== 1 ? 's' : ''} failed to analyze
              </p>
              <p className="text-xs text-text-secondary mt-1">
                {summary.total_analyzed} of {summary.total_photos} photos were analyzed successfully.
                {workspaceId && galleryId && ' You can retry the failed photos.'}
              </p>
              {retryError && (
                <p className="text-xs text-error mt-1">{retryError}</p>
              )}
            </div>
            {workspaceId && galleryId && retryState !== 'loading' && (
              <button
                type="button"
                onClick={handleRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-warning/20 text-warning hover:bg-warning/30 transition-colors"
                aria-label="Retry failed analysis"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry Failed
              </button>
            )}
            {retryState === 'loading' && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-secondary">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Retrying...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Retry Success Message */}
      {retryState === 'success' && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <p className="text-sm text-emerald-600">
              Retry started! {summary.failed_count} photos are being re-analyzed.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-3 bg-surface-highlight rounded">
          <div className="text-xs text-text-secondary uppercase tracking-wide">Total Analyzed</div>
          <div className="text-2xl font-bold text-text-primary">
            {summary.total_analyzed}
            {summary.total_photos > 0 && (
              <span className="text-sm font-normal text-text-tertiary ml-1">
                / {summary.total_photos}
              </span>
            )}
          </div>
        </div>
        <div className="p-3 bg-surface-highlight rounded">
          <div className="text-xs text-text-secondary uppercase tracking-wide">Blurry</div>
          <div className="text-2xl font-bold text-text-primary">{summary.blur_count}</div>
        </div>
      </div>

      <div className="mb-6">
        <h4 className="text-sm font-medium text-text-primary mb-2">Quality Distribution</h4>
        <div className="space-y-2">
          {Object.entries(qualityDist).map(([tier, count]) => (
            <div key={tier} className="flex items-center text-sm">
              <div className="w-24 capitalize text-text-secondary">{tier}</div>
              <div className="flex-1 mx-2">
                <div className="h-2 bg-surface-highlight rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      tier === 'excellent' ? 'bg-green-500' :
                      tier === 'good' ? 'bg-blue-500' :
                      tier === 'fair' ? 'bg-yellow-500' : 'bg-red-400'
                    }`}
                    style={{ width: `${getPercent(count)}%` }}
                  />
                </div>
              </div>
              <div className="w-12 text-right text-text-secondary">{count}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
