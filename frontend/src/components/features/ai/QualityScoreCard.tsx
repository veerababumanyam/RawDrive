/**
 * QualityScoreCard Component
 *
 * Displays quality analysis scores for a single photo with visual indicators
 * for overall quality, individual metrics, and blur detection.
 *
 * Feature: 023-enhanced-smart-curate (US1, US4)
 */

import React from 'react';
import { cn } from '@/lib/utils';
import {
  Eye,
  Focus,
  Grid3X3,
  Sun,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { PhotoQualityResult } from '@/types/curation';
import { getQualityTier, QUALITY_TIERS } from '@/hooks/useQualityAnalysis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QualityScoreCardProps {
  /** Quality analysis result for the photo */
  quality: PhotoQualityResult;
  /** Whether to show expanded details */
  expanded?: boolean;
  /** Toggle expanded state callback */
  onToggleExpand?: () => void;
  /** Callback when photo is selected */
  onSelect?: (assetId: string) => void;
  /** Whether the photo is selected */
  isSelected?: boolean;
  /** Show thumbnail image */
  thumbnailUrl?: string;
  /** Additional CSS classes */
  className?: string;
  /** Compact mode for grid display */
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Score Bar Component
// ---------------------------------------------------------------------------

interface ScoreBarProps {
  label: string;
  score: number;
  icon: React.ReactNode;
  compact?: boolean;
}

function ScoreBar({ label, score, icon, compact = false }: ScoreBarProps) {
  const tier = getQualityTier(score);
  const tierConfig = QUALITY_TIERS[tier];

  const colorClasses = {
    excellent: 'bg-emerald-500',
    good: 'bg-blue-500',
    fair: 'bg-amber-500',
    poor: 'bg-red-500',
  };

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-zinc-500">{icon}</span>
        <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all', colorClasses[tier])}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="text-xs text-zinc-400 tabular-nums w-7">{Math.round(score)}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-zinc-400">
          {icon}
          <span>{label}</span>
        </div>
        <span className={cn('font-medium tabular-nums', `text-${tierConfig.color}-400`)}>
          {Math.round(score)}
        </span>
      </div>
      <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div
          className={cn('h-full transition-all duration-300', colorClasses[tier])}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blur Badge Component
// ---------------------------------------------------------------------------

interface BlurBadgeProps {
  detected: boolean;
  type?: string;
  severity?: string;
  compact?: boolean;
}

function BlurBadge({ detected, type, severity, compact = false }: BlurBadgeProps) {
  if (!detected) {
    return compact ? null : (
      <div className="flex items-center gap-1.5 text-sm text-green-400">
        <Check className="w-4 h-4" />
        <span>Sharp</span>
      </div>
    );
  }

  const severityColors = {
    low: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    medium: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    high: 'text-red-400 bg-red-500/10 border-red-500/20',
  };

  const colorClass = severityColors[severity as keyof typeof severityColors] || severityColors.medium;

  if (compact) {
    return (
      <div className={cn('px-1.5 py-0.5 rounded text-xs border', colorClass)}>
        Blur
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2 px-2 py-1 rounded-lg border', colorClass)}>
      <AlertTriangle className="w-4 h-4" />
      <div className="text-sm">
        <span className="font-medium">{type || 'Blur'} detected</span>
        {severity && <span className="opacity-75"> ({severity})</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quality Score Card Component
// ---------------------------------------------------------------------------

export function QualityScoreCard({
  quality,
  expanded = false,
  onToggleExpand,
  onSelect,
  isSelected = false,
  thumbnailUrl,
  className,
  compact = false,
}: QualityScoreCardProps) {
  const tier = getQualityTier(quality.overall_score);
  const tierConfig = QUALITY_TIERS[tier];

  const tierColorClasses = {
    excellent: 'border-emerald-500/30 bg-emerald-500/5',
    good: 'border-blue-500/30 bg-blue-500/5',
    fair: 'border-amber-500/30 bg-amber-500/5',
    poor: 'border-red-500/30 bg-red-500/5',
  };

  // Compact card for grid display
  if (compact) {
    return (
      <div
        className={cn(
          'relative rounded-lg border overflow-hidden transition-all cursor-pointer',
          tierColorClasses[tier],
          isSelected && 'ring-2 ring-blue-500',
          className
        )}
        onClick={() => onSelect?.(quality.asset_id)}
      >
        {/* Thumbnail */}
        {thumbnailUrl && (
          <div className="aspect-square bg-zinc-800">
            <img
              src={thumbnailUrl}
              alt="Photo thumbnail"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Quality badge overlay */}
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <div
            className={cn(
              'px-2 py-0.5 rounded-full text-xs font-semibold',
              `bg-${tierConfig.color}-500 text-white`
            )}
          >
            {Math.round(quality.overall_score)}
          </div>
          {quality.blur_detected && (
            <BlurBadge detected compact />
          )}
        </div>

        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute top-2 left-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}

        {/* Score bars */}
        <div className="p-2 space-y-1.5 bg-zinc-900/80 backdrop-blur-sm">
          <ScoreBar
            label="Sharpness"
            score={quality.sharpness_score}
            icon={<Focus className="w-3 h-3" />}
            compact
          />
          <ScoreBar
            label="Exposure"
            score={quality.exposure_score}
            icon={<Sun className="w-3 h-3" />}
            compact
          />
          <ScoreBar
            label="Composition"
            score={quality.composition_score}
            icon={<Grid3X3 className="w-3 h-3" />}
            compact
          />
        </div>
      </div>
    );
  }

  // Full card with expandable details
  return (
    <div
      className={cn(
        'rounded-xl border transition-all',
        tierColorClasses[tier],
        isSelected && 'ring-2 ring-blue-500',
        className
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center gap-4 p-4 cursor-pointer',
          onToggleExpand && 'hover:bg-white/5'
        )}
        onClick={onToggleExpand}
      >
        {/* Thumbnail */}
        {thumbnailUrl && (
          <div className="w-16 h-16 rounded-lg overflow-hidden bg-zinc-800 flex-shrink-0">
            <img
              src={thumbnailUrl}
              alt="Photo thumbnail"
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Score display */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'text-3xl font-bold tabular-nums',
                `text-${tierConfig.color}-400`
              )}
            >
              {Math.round(quality.overall_score)}
            </div>
            <div className="flex flex-col">
              <span className={cn('text-sm font-medium', `text-${tierConfig.color}-400`)}>
                {tierConfig.label}
              </span>
              <span className="text-xs text-zinc-500">Quality Score</span>
            </div>
          </div>
        </div>

        {/* Blur status */}
        <BlurBadge
          detected={quality.blur_detected}
          type={quality.blur_type}
          severity={quality.blur_severity}
        />

        {/* Expand toggle */}
        {onToggleExpand && (
          <button className="p-1 hover:bg-white/10 rounded transition-colors">
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-zinc-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-zinc-400" />
            )}
          </button>
        )}

        {/* Select button */}
        {onSelect && (
          <button
            className={cn(
              'w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all',
              isSelected
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'border-zinc-600 hover:border-blue-500'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(quality.asset_id);
            }}
          >
            {isSelected && <Check className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-zinc-800">
          <div className="pt-4 grid gap-3">
            <ScoreBar
              label="Sharpness"
              score={quality.sharpness_score}
              icon={<Focus className="w-4 h-4" />}
            />
            <ScoreBar
              label="Exposure"
              score={quality.exposure_score}
              icon={<Sun className="w-4 h-4" />}
            />
            <ScoreBar
              label="Composition"
              score={quality.composition_score}
              icon={<Grid3X3 className="w-4 h-4" />}
            />
          </div>


          {/* Detailed Analysis */}
          <div className="pt-4 border-t border-zinc-800 space-y-4">
            <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">AI Analysis</h4>
            
            <div className="grid grid-cols-2 gap-4">
              {quality.event_type && (
                <div className="space-y-1">
                  <span className="text-xs text-zinc-500">Event Type</span>
                  <div className="text-sm font-medium text-zinc-200">{quality.event_type}</div>
                </div>
              )}
              {quality.activity && (
                <div className="space-y-1">
                  <span className="text-xs text-zinc-500">Activity</span>
                  <div className="text-sm font-medium text-zinc-200">{quality.activity}</div>
                </div>
              )}
              {quality.lighting && (
                <div className="space-y-1">
                  <span className="text-xs text-zinc-500">Lighting</span>
                  <div className="text-sm font-medium text-zinc-200 capitalize">{quality.lighting}</div>
                </div>
              )}
              {quality.mood && (
                <div className="space-y-1">
                  <span className="text-xs text-zinc-500">Mood</span>
                  <div className="text-sm font-medium text-zinc-200 capitalize">{quality.mood}</div>
                </div>
              )}
            </div>

            {quality.key_elements && quality.key_elements.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs text-zinc-500">Key Elements</span>
                <div className="flex flex-wrap gap-2">
                  {quality.key_elements.map((element, idx) => (
                    <span key={idx} className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-300">
                      {element}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {quality.semantic_description && (
              <div className="space-y-2">
                <span className="text-xs text-zinc-500">Visual Description</span>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {quality.semantic_description}
                </p>
              </div>
            )}
          </div>

          {/* Technical Metadata */}
          <div className="flex flex-wrap gap-2 text-xs text-zinc-500 pt-2 border-t border-zinc-800">
            {quality.noise_level && (
              <span className="px-2 py-1 bg-zinc-800 rounded">
                Noise: {quality.noise_level}
              </span>
            )}
            {quality.highlights_clipped && (
              <span className="px-2 py-1 bg-amber-500/10 text-amber-400 rounded">
                Highlights clipped
              </span>
            )}
            {quality.shadows_blocked && (
              <span className="px-2 py-1 bg-amber-500/10 text-amber-400 rounded">
                Shadows blocked
              </span>
            )}
            {quality.horizon_tilt_degrees !== undefined && quality.horizon_tilt_degrees !== 0 && (
              <span className="px-2 py-1 bg-zinc-800 rounded">
                Tilt: {quality.horizon_tilt_degrees.toFixed(1)}°
              </span>
            )}
          </div>

          {/* Analyzed timestamp */}
          {quality.analyzed_at && (
            <div className="text-xs text-zinc-600">
              Analyzed {new Date(quality.analyzed_at).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default QualityScoreCard;
