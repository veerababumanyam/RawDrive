/**
 * CurationProgress Component
 *
 * Displays progress indicators for curation sessions including:
 * - Overall progress bar
 * - Current processing stage
 * - Photo counts (analyzed, grouped, selected)
 * - Estimated time remaining
 *
 * Feature: 023-enhanced-smart-curate
 */

import React from 'react';
import { cn } from '@/lib/utils';
import type {
  CurationSession,
  CurationSessionProgress,
  CurationStatus,
} from '@/types/curation';
import {
  CURATION_STATUS_LABELS,
  CURATION_STATUS_COLORS,
} from '@/types/curation';

// Stage labels for user-friendly display
const STAGE_LABELS: Record<string, string> = {
  quality_analysis: 'Analyzing Quality',
  embedding_compute: 'Computing Embeddings',
  similarity_grouping: 'Grouping Similar Photos',
  curation_selection: 'Selecting Best Photos',
  completed: 'Complete',
};

// Stage icons (using emoji for simplicity, replace with proper icons in production)
const STAGE_ICONS: Record<string, string> = {
  quality_analysis: '🔍',
  embedding_compute: '🧮',
  similarity_grouping: '🎯',
  curation_selection: '✨',
  completed: '✅',
};

interface CurationProgressProps {
  /** Session data with progress info */
  session: CurationSession;
  /** Show detailed breakdown */
  showDetails?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Compact mode for inline display */
  compact?: boolean;
}

/**
 * Progress indicator component for curation sessions.
 *
 * @example
 * ```tsx
 * <CurationProgress session={activeSession} showDetails />
 * ```
 */
export function CurationProgress({
  session,
  showDetails = false,
  className,
  compact = false,
}: CurationProgressProps) {
  const { status, progress, error_message } = session;
  const { percent, stage, total_photos, analyzed_count, groups_count, selected_count } = progress;

  // Status-based styling
  const isActive = ['analyzing', 'grouping', 'curating'].includes(status);
  const isComplete = status === 'completed';
  const isFailed = status === 'failed';

  // Get stage display info
  const stageLabel = stage ? STAGE_LABELS[stage] || stage : 'Preparing';
  const stageIcon = stage ? STAGE_ICONS[stage] || '⏳' : '⏳';

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="flex-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-500',
              isComplete ? 'bg-green-500' : isFailed ? 'bg-red-500' : 'bg-blue-500'
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-xs text-zinc-400 tabular-nums w-10 text-right">
          {percent}%
        </span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{stageIcon}</span>
          <span className={cn('font-medium', CURATION_STATUS_COLORS[status])}>
            {isActive ? stageLabel : CURATION_STATUS_LABELS[status]}
          </span>
        </div>
        <span className="text-sm text-zinc-400 tabular-nums">
          {percent}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full transition-all duration-500 ease-out',
            isComplete
              ? 'bg-gradient-to-r from-green-500 to-emerald-400'
              : isFailed
              ? 'bg-gradient-to-r from-red-500 to-red-400'
              : 'bg-gradient-to-r from-blue-500 to-indigo-400',
            isActive && 'animate-pulse'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      {/* Error Message */}
      {isFailed && error_message && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <p className="text-sm text-red-400">{error_message}</p>
        </div>
      )}

      {/* Stats */}
      {showDetails && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <StatCard
            label="Total Photos"
            value={total_photos ?? 0}
            active={stage === 'quality_analysis'}
          />
          <StatCard
            label="Analyzed"
            value={analyzed_count}
            active={stage === 'quality_analysis' || stage === 'embedding_compute'}
          />
          <StatCard
            label="Groups"
            value={groups_count ?? 0}
            active={stage === 'similarity_grouping'}
          />
          <StatCard
            label="Selected"
            value={selected_count ?? 0}
            active={stage === 'curation_selection' || isComplete}
            highlight={isComplete}
          />
        </div>
      )}

      {/* Stage Timeline (for detailed view) */}
      {showDetails && isActive && (
        <StageTimeline currentStage={stage} />
      )}
    </div>
  );
}

// Stat card subcomponent
interface StatCardProps {
  label: string;
  value: number;
  active?: boolean;
  highlight?: boolean;
}

function StatCard({ label, value, active, highlight }: StatCardProps) {
  return (
    <div
      className={cn(
        'p-2 rounded-lg text-center transition-colors',
        active
          ? 'bg-blue-500/10 border border-blue-500/20'
          : highlight
          ? 'bg-green-500/10 border border-green-500/20'
          : 'bg-zinc-800/50 border border-zinc-700/50'
      )}
    >
      <div
        className={cn(
          'text-lg font-semibold tabular-nums',
          active ? 'text-blue-400' : highlight ? 'text-green-400' : 'text-zinc-200'
        )}
      >
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

// Stage timeline subcomponent
interface StageTimelineProps {
  currentStage?: string;
}

const STAGES_ORDER = [
  'quality_analysis',
  'embedding_compute',
  'similarity_grouping',
  'curation_selection',
];

function StageTimeline({ currentStage }: StageTimelineProps) {
  const currentIndex = currentStage ? STAGES_ORDER.indexOf(currentStage) : -1;

  return (
    <div className="flex items-center justify-between pt-2">
      {STAGES_ORDER.map((stage, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isPending = index > currentIndex;

        return (
          <React.Fragment key={stage}>
            {/* Stage indicator */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs transition-colors',
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? 'bg-blue-500 text-white animate-pulse'
                    : 'bg-zinc-700 text-zinc-500'
                )}
              >
                {isCompleted ? '✓' : index + 1}
              </div>
              <span
                className={cn(
                  'text-[10px] mt-1 max-w-16 text-center leading-tight',
                  isCurrent ? 'text-blue-400' : 'text-zinc-500'
                )}
              >
                {STAGE_LABELS[stage]?.split(' ').slice(-1)[0] || stage}
              </span>
            </div>

            {/* Connector line */}
            {index < STAGES_ORDER.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-0.5 mx-1',
                  isCompleted ? 'bg-green-500' : 'bg-zinc-700'
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * Mini progress bar for use in cards/lists.
 */
export function CurationProgressMini({
  session,
  className,
}: {
  session: CurationSession;
  className?: string;
}) {
  return <CurationProgress session={session} compact className={className} />;
}

export default CurationProgress;
