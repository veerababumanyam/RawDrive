/**
 * BlurIndicator Component
 *
 * Displays blur detection status and details for a photo.
 * Distinguishes between motion blur, focus blur, and intentional bokeh.
 *
 * Feature: 023-enhanced-smart-curate (US4)
 */

import React from 'react';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Camera,
  Focus,
  Aperture,
  Check,
  X,
  Info,
} from 'lucide-react';
import type { BlurType, BlurSeverity, BlurRegion } from '@/types/curation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlurIndicatorProps {
  /** Whether blur was detected */
  blurDetected: boolean;
  /** Type of blur */
  blurType?: BlurType;
  /** Confidence level (0-1) */
  confidence?: number;
  /** Severity of blur */
  severity?: BlurSeverity;
  /** Region where blur is present */
  region?: BlurRegion;
  /** Whether blur is intentional (artistic) */
  isIntentional?: boolean;
  /** Whether flagged as technical reject */
  isTechnicalReject?: boolean;
  /** Display variant */
  variant?: 'badge' | 'card' | 'inline';
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Show detailed information */
  showDetails?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BLUR_TYPE_CONFIG: Record<BlurType, {
  label: string;
  icon: typeof Camera;
  description: string;
}> = {
  motion: {
    label: 'Motion Blur',
    icon: Camera,
    description: 'Camera shake or subject movement',
  },
  focus: {
    label: 'Focus Blur',
    icon: Focus,
    description: 'Missed focus or wrong focal plane',
  },
  bokeh: {
    label: 'Bokeh',
    icon: Aperture,
    description: 'Intentional artistic blur',
  },
};

const SEVERITY_CONFIG: Record<BlurSeverity, {
  label: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}> = {
  low: {
    label: 'Minor',
    colorClass: 'text-amber-400',
    bgClass: 'bg-amber-500/10',
    borderClass: 'border-amber-500/20',
  },
  medium: {
    label: 'Noticeable',
    colorClass: 'text-orange-400',
    bgClass: 'bg-orange-500/10',
    borderClass: 'border-orange-500/20',
  },
  high: {
    label: 'Severe',
    colorClass: 'text-red-400',
    bgClass: 'bg-red-500/10',
    borderClass: 'border-red-500/20',
  },
};

const REGION_LABELS: Record<BlurRegion, string> = {
  center: 'Center',
  edges: 'Edges',
  full: 'Full Image',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SharpBadgeProps {
  size: 'sm' | 'md' | 'lg';
  className?: string;
}

function SharpBadge({ size, className }: SharpBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        'bg-green-500/10 text-green-400 border border-green-500/20',
        sizeClasses[size],
        className
      )}
    >
      <Check className={cn(size === 'sm' ? 'w-3 h-3' : 'w-4 h-4')} />
      Sharp
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function BlurIndicator({
  blurDetected,
  blurType,
  confidence = 0,
  severity,
  region,
  isIntentional = false,
  isTechnicalReject = false,
  variant = 'badge',
  size = 'md',
  showDetails = false,
  className,
}: BlurIndicatorProps) {
  // If no blur detected, show sharp badge
  if (!blurDetected) {
    if (variant === 'badge' || variant === 'inline') {
      return <SharpBadge size={size} className={className} />;
    }
    return (
      <div className={cn('flex items-center gap-2 text-green-400', className)}>
        <Check className="w-5 h-5" />
        <span className="font-medium">Sharp & Clear</span>
      </div>
    );
  }

  // Get blur type config (default to motion if not specified)
  const typeConfig = blurType ? BLUR_TYPE_CONFIG[blurType] : BLUR_TYPE_CONFIG.motion;
  const severityConfig = severity ? SEVERITY_CONFIG[severity] : SEVERITY_CONFIG.medium;
  const TypeIcon = typeConfig.icon;

  // Size classes
  const sizeClasses = {
    sm: { text: 'text-xs', icon: 'w-3 h-3', padding: 'px-1.5 py-0.5' },
    md: { text: 'text-sm', icon: 'w-4 h-4', padding: 'px-2 py-1' },
    lg: { text: 'text-base', icon: 'w-5 h-5', padding: 'px-3 py-1.5' },
  };
  const sizes = sizeClasses[size];

  // Badge variant (compact)
  if (variant === 'badge') {
    // Intentional blur (bokeh) uses different styling
    if (isIntentional) {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full font-medium',
            'bg-purple-500/10 text-purple-400 border border-purple-500/20',
            sizes.padding,
            sizes.text,
            className
          )}
          title="Intentional artistic blur (bokeh)"
        >
          <Aperture className={sizes.icon} />
          Bokeh
        </span>
      );
    }

    // Technical reject gets special styling
    if (isTechnicalReject) {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full font-medium',
            'bg-red-500/20 text-red-400 border border-red-500/30',
            sizes.padding,
            sizes.text,
            className
          )}
          title="Flagged as technical reject"
        >
          <X className={sizes.icon} />
          Reject
        </span>
      );
    }

    // Standard blur badge
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full font-medium border',
          severityConfig.bgClass,
          severityConfig.colorClass,
          severityConfig.borderClass,
          sizes.padding,
          sizes.text,
          className
        )}
        title={`${typeConfig.label} (${severityConfig.label})`}
      >
        <TypeIcon className={sizes.icon} />
        {severity ? severityConfig.label : 'Blur'}
      </span>
    );
  }

  // Inline variant (for lists)
  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'inline-flex items-center gap-2',
          isIntentional ? 'text-purple-400' : severityConfig.colorClass,
          sizes.text,
          className
        )}
      >
        <TypeIcon className={sizes.icon} />
        <span className="font-medium">{typeConfig.label}</span>
        {severity && !isIntentional && (
          <span className="opacity-75">({severityConfig.label})</span>
        )}
      </div>
    );
  }

  // Card variant (full details)
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        isIntentional
          ? 'bg-purple-500/10 border-purple-500/20'
          : severityConfig.bgClass + ' ' + severityConfig.borderClass,
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isTechnicalReject ? (
            <AlertTriangle className={cn('w-5 h-5', severityConfig.colorClass)} />
          ) : (
            <TypeIcon className={cn('w-5 h-5', isIntentional ? 'text-purple-400' : severityConfig.colorClass)} />
          )}
          <span
            className={cn(
              'font-semibold',
              isIntentional ? 'text-purple-400' : severityConfig.colorClass
            )}
          >
            {isIntentional ? 'Intentional Blur' : typeConfig.label}
          </span>
        </div>
        {!isIntentional && severity && (
          <span
            className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              severityConfig.bgClass,
              severityConfig.colorClass
            )}
          >
            {severityConfig.label}
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-zinc-400 mb-2">{typeConfig.description}</p>

      {/* Details */}
      {showDetails && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
          {confidence > 0 && (
            <span>Confidence: {Math.round(confidence * 100)}%</span>
          )}
          {region && (
            <span>Region: {REGION_LABELS[region]}</span>
          )}
        </div>
      )}

      {/* Technical reject warning */}
      {isTechnicalReject && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-red-400">
          <Info className="w-3 h-3" />
          <span>Flagged as a technical reject candidate</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact Badge Export
// ---------------------------------------------------------------------------

/** Simple blur status badge for tight spaces */
export function BlurBadge({
  blurDetected,
  severity,
  isIntentional,
  className,
}: {
  blurDetected: boolean;
  severity?: BlurSeverity;
  isIntentional?: boolean;
  className?: string;
}) {
  return (
    <BlurIndicator
      blurDetected={blurDetected}
      severity={severity}
      isIntentional={isIntentional}
      variant="badge"
      size="sm"
      className={className}
    />
  );
}

export default BlurIndicator;
