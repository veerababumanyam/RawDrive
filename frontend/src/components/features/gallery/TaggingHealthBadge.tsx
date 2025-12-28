/**
 * TaggingHealthBadge Component
 * Shows AI tagging completion status for a gallery or workspace
 */

import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  Loader2,
  RefreshCw,
} from 'lucide-react';

export interface TaggingHealthData {
  badge: 'excellent' | 'good' | 'needs_attention' | 'poor';
  vision_pct: number;
  face_pct: number;
  tag_pct: number;
}

interface TaggingHealthBadgeProps {
  /** Health data from API */
  health?: TaggingHealthData | null;
  /** Loading state */
  loading?: boolean;
  /** Error state */
  error?: boolean;
  /** Show refresh button */
  showRefresh?: boolean;
  /** Callback for refresh */
  onRefresh?: () => void;
  /** Refreshing state */
  isRefreshing?: boolean;
  /** Compact mode (icon only) */
  compact?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const BADGE_CONFIG = {
  excellent: {
    icon: CheckCircle2,
    color: 'text-success',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
    label: 'Complete',
    description: 'All photos analyzed',
  },
  good: {
    icon: Sparkles,
    color: 'text-accent',
    bgColor: 'bg-accent/10',
    borderColor: 'border-accent/30',
    label: 'Good',
    description: 'Most photos analyzed',
  },
  needs_attention: {
    icon: Clock,
    color: 'text-warning',
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
    label: 'In Progress',
    description: 'Analysis in progress',
  },
  poor: {
    icon: AlertCircle,
    color: 'text-error',
    bgColor: 'bg-error/10',
    borderColor: 'border-error/30',
    label: 'Needs Attention',
    description: 'Some analyses failed',
  },
};

const SIZE_CONFIG = {
  sm: {
    icon: 'w-3 h-3',
    text: 'text-xs',
    padding: 'px-2 py-0.5',
    gap: 'gap-1',
  },
  md: {
    icon: 'w-4 h-4',
    text: 'text-sm',
    padding: 'px-2.5 py-1',
    gap: 'gap-1.5',
  },
  lg: {
    icon: 'w-5 h-5',
    text: 'text-base',
    padding: 'px-3 py-1.5',
    gap: 'gap-2',
  },
};

export const TaggingHealthBadge: React.FC<TaggingHealthBadgeProps> = ({
  health,
  loading = false,
  error = false,
  showRefresh = false,
  onRefresh,
  isRefreshing = false,
  compact = false,
  size = 'sm',
}) => {
  const sizeConfig = SIZE_CONFIG[size];

  // Loading state
  if (loading) {
    return (
      <div
        className={`inline-flex items-center ${sizeConfig.gap} ${sizeConfig.padding}
          bg-surface-hover border border-border rounded-full`}
      >
        <Loader2 className={`${sizeConfig.icon} animate-spin text-text-tertiary`} />
        {!compact && (
          <span className={`${sizeConfig.text} text-text-tertiary`}>Loading...</span>
        )}
      </div>
    );
  }

  // Error state
  if (error || !health) {
    return (
      <div
        className={`inline-flex items-center ${sizeConfig.gap} ${sizeConfig.padding}
          bg-error/10 border border-error/30 rounded-full`}
        title="Failed to load tagging health"
      >
        <AlertCircle className={`${sizeConfig.icon} text-error`} />
        {!compact && (
          <span className={`${sizeConfig.text} text-error`}>Error</span>
        )}
      </div>
    );
  }

  const config = BADGE_CONFIG[health.badge];
  const Icon = config.icon;

  // Compute overall percentage (weighted average)
  const overallPct = Math.round(
    health.vision_pct * 0.5 + health.face_pct * 0.3 + health.tag_pct * 0.2
  );

  return (
    <div className="inline-flex items-center gap-2">
      <div
        className={`inline-flex items-center ${sizeConfig.gap} ${sizeConfig.padding}
          ${config.bgColor} border ${config.borderColor} rounded-full`}
        title={`${config.description}\nVision: ${health.vision_pct}%\nFaces: ${health.face_pct}%\nTags: ${health.tag_pct}%`}
      >
        <Icon className={`${sizeConfig.icon} ${config.color}`} />
        {!compact && (
          <>
            <span className={`${sizeConfig.text} ${config.color} font-medium`}>
              {config.label}
            </span>
            <span className={`${sizeConfig.text} text-text-tertiary`}>
              {overallPct}%
            </span>
          </>
        )}
      </div>

      {showRefresh && onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className={`p-1 rounded-full hover:bg-surface-hover text-text-tertiary
            hover:text-text-primary transition-colors disabled:opacity-50`}
          title="Refresh tagging statistics"
        >
          <RefreshCw
            className={`${sizeConfig.icon} ${isRefreshing ? 'animate-spin' : ''}`}
          />
        </button>
      )}
    </div>
  );
};

/**
 * TaggingHealthProgress Component
 * Shows a detailed progress breakdown for tagging health
 */
interface TaggingHealthProgressProps {
  health: TaggingHealthData;
  showLabels?: boolean;
}

export const TaggingHealthProgress: React.FC<TaggingHealthProgressProps> = ({
  health,
  showLabels = true,
}) => {
  const progressBars = [
    { label: 'Vision', value: health.vision_pct, color: 'bg-accent' },
    { label: 'Faces', value: health.face_pct, color: 'bg-purple-500' },
    { label: 'Tags', value: health.tag_pct, color: 'bg-primary' },
  ];

  return (
    <div className="space-y-2">
      {progressBars.map((bar) => (
        <div key={bar.label} className="flex items-center gap-2">
          {showLabels && (
            <span className="text-xs text-text-tertiary w-12">{bar.label}</span>
          )}
          <div className="flex-1 h-1.5 bg-surface-hover rounded-full overflow-hidden">
            <div
              className={`h-full ${bar.color} transition-all duration-500`}
              style={{ width: `${bar.value}%` }}
            />
          </div>
          {showLabels && (
            <span className="text-xs text-text-tertiary w-10 text-right">
              {bar.value}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default TaggingHealthBadge;
