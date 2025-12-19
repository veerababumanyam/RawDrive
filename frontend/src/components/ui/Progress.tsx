import React, { forwardRef } from 'react';

/* =============================================================================
   Progress Bar Component
   ============================================================================= */

export type ProgressVariant = 'default' | 'primary' | 'accent' | 'success' | 'warning' | 'error';
export type ProgressSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ProgressProps {
  /** Current progress value (0-100) */
  value: number;
  /** Maximum value */
  max?: number;
  /** Visual variant */
  variant?: ProgressVariant;
  /** Size variant */
  size?: ProgressSize;
  /** Show percentage label */
  showLabel?: boolean;
  /** Custom label text */
  label?: string;
  /** Show striped animation */
  striped?: boolean;
  /** Animate stripes */
  animated?: boolean;
  /** Indeterminate state (loading) */
  indeterminate?: boolean;
  className?: string;
}

const variantStyles: Record<ProgressVariant, string> = {
  default: 'bg-gradient-to-r from-primary to-accent',
  primary: 'bg-primary',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-error',
};

const sizeStyles: Record<ProgressSize, string> = {
  xs: 'h-1',
  sm: 'h-2',
  md: 'h-3',
  lg: 'h-4',
};

const trackSizeStyles: Record<ProgressSize, string> = {
  xs: 'h-1',
  sm: 'h-2',
  md: 'h-3',
  lg: 'h-4',
};

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  (
    {
      value,
      max = 100,
      variant = 'default',
      size = 'md',
      showLabel = false,
      label,
      striped = false,
      animated = false,
      indeterminate = false,
      className = '',
    },
    ref
  ) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
    const displayLabel = label || `${Math.round(percentage)}%`;

    const stripedStyles = striped
      ? `
        bg-[length:1rem_1rem]
        bg-[linear-gradient(45deg,rgba(255,255,255,.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,.15)_50%,rgba(255,255,255,.15)_75%,transparent_75%,transparent)]
      `
      : '';

    const animatedStyles = animated && striped ? 'animate-[progress-stripes_1s_linear_infinite]' : '';

    const indeterminateStyles = indeterminate
      ? 'w-1/3 animate-[progress-indeterminate_1.5s_ease-in-out_infinite]'
      : '';

    return (
      <div ref={ref} className={`w-full ${className}`}>
        {showLabel && (
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-sm text-text-secondary">{label || 'Progress'}</span>
            <span className="text-sm font-medium text-text-primary">{displayLabel}</span>
          </div>
        )}
        <div
          className={`
            w-full
            ${trackSizeStyles[size]}
            bg-neutral-200 dark:bg-neutral-700
            rounded-full
            overflow-hidden
          `}
          role="progressbar"
          aria-valuenow={indeterminate ? undefined : value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={displayLabel}
        >
          <div
            className={`
              ${sizeStyles[size]}
              ${variantStyles[variant]}
              ${stripedStyles}
              ${animatedStyles}
              ${indeterminateStyles}
              rounded-full
              transition-all duration-300 ease-out
            `}
            style={indeterminate ? undefined : { width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);

Progress.displayName = 'Progress';

/* =============================================================================
   Circular Progress Component
   ============================================================================= */

export interface CircularProgressProps {
  /** Current progress value (0-100) */
  value?: number;
  /** Size in pixels */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Visual variant */
  variant?: ProgressVariant;
  /** Show percentage in center */
  showLabel?: boolean;
  /** Indeterminate spinning state */
  indeterminate?: boolean;
  className?: string;
}

const circularVariantColors: Record<ProgressVariant, string> = {
  default: 'stroke-primary',
  primary: 'stroke-primary',
  accent: 'stroke-accent',
  success: 'stroke-success',
  warning: 'stroke-warning',
  error: 'stroke-error',
};

export const CircularProgress: React.FC<CircularProgressProps> = ({
  value = 0,
  size = 48,
  strokeWidth = 4,
  variant = 'default',
  showLabel = false,
  indeterminate = false,
  className = '',
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const percentage = Math.min(Math.max(value, 0), 100);
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : value}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg
        className={indeterminate ? 'animate-spin' : '-rotate-90'}
        width={size}
        height={size}
      >
        {/* Background circle */}
        <circle
          className="stroke-neutral-200 dark:stroke-neutral-700"
          fill="none"
          strokeWidth={strokeWidth}
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        {/* Progress circle */}
        <circle
          className={`
            ${circularVariantColors[variant]}
            transition-[stroke-dashoffset] duration-300 ease-out
          `}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          strokeDasharray={circumference}
          strokeDashoffset={indeterminate ? circumference * 0.75 : offset}
        />
      </svg>
      {showLabel && !indeterminate && (
        <span className="absolute text-xs font-medium text-text-primary">
          {Math.round(percentage)}%
        </span>
      )}
    </div>
  );
};

/* =============================================================================
   Spinner Component
   ============================================================================= */

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface SpinnerProps {
  /** Size variant */
  size?: SpinnerSize;
  /** Visual variant */
  variant?: 'default' | 'primary' | 'white';
  /** Accessible label */
  label?: string;
  className?: string;
}

const spinnerSizeStyles: Record<SpinnerSize, { size: string; border: string }> = {
  xs: { size: 'w-4 h-4', border: 'border-[1.5px]' },
  sm: { size: 'w-5 h-5', border: 'border-2' },
  md: { size: 'w-6 h-6', border: 'border-2' },
  lg: { size: 'w-8 h-8', border: 'border-[3px]' },
  xl: { size: 'w-12 h-12', border: 'border-4' },
};

const spinnerVariantStyles: Record<string, string> = {
  default: 'border-neutral-300 border-t-primary dark:border-neutral-600 dark:border-t-primary',
  primary: 'border-primary-200 border-t-primary',
  white: 'border-white/30 border-t-white',
};

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'md',
  variant = 'default',
  label = 'Loading',
  className = '',
}) => {
  const { size: sizeClass, border } = spinnerSizeStyles[size];

  return (
    <div
      className={`
        ${sizeClass}
        ${border}
        ${spinnerVariantStyles[variant]}
        rounded-full
        animate-spin
        ${className}
      `}
      role="status"
      aria-label={label}
    >
      <span className="sr-only">{label}</span>
    </div>
  );
};

/* =============================================================================
   Skeleton Component
   ============================================================================= */

export interface SkeletonProps {
  /** Width (CSS value or Tailwind class) */
  width?: string;
  /** Height (CSS value or Tailwind class) */
  height?: string;
  /** Shape variant */
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  /** Enable animation */
  animated?: boolean;
  /** Animation style: pulse (fade) or shimmer (sweep) */
  animation?: 'pulse' | 'shimmer';
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width,
  height,
  variant = 'text',
  animated = true,
  animation = 'shimmer',
  className = '',
}) => {
  const variantStyles: Record<string, string> = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: 'rounded-none',
    rounded: 'rounded-lg',
  };

  const animationStyles = animated
    ? animation === 'shimmer'
      ? 'skeleton-shimmer'
      : 'skeleton-pulse bg-neutral-200 dark:bg-neutral-700'
    : 'bg-neutral-200 dark:bg-neutral-700';

  const baseStyles = `
    ${animationStyles}
    ${variantStyles[variant]}
  `;

  const style: React.CSSProperties = {};
  if (width) style.width = width;
  if (height) style.height = height;

  // Default height for text variant
  if (variant === 'text' && !height) {
    style.height = '1rem';
  }

  // For circular, make width = height if only one is provided
  if (variant === 'circular') {
    if (width && !height) style.height = width;
    if (height && !width) style.width = height;
  }

  return <div className={`${baseStyles} ${className}`} style={style} aria-hidden="true" />;
};

/* =============================================================================
   Skeleton Group Component (for common patterns)
   ============================================================================= */

export interface SkeletonGroupProps {
  /** Number of skeleton items */
  count?: number;
  /** Gap between items */
  gap?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export const SkeletonGroup: React.FC<SkeletonGroupProps> = ({
  count = 1,
  gap = 'md',
  className = '',
  children,
}) => {
  const gapStyles = {
    sm: 'gap-2',
    md: 'gap-3',
    lg: 'gap-4',
  };

  if (children) {
    return (
      <div className={`flex flex-col ${gapStyles[gap]} ${className}`}>
        {children}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${gapStyles[gap]} ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant="text" width="100%" />
      ))}
    </div>
  );
};

/* =============================================================================
   Pre-built Skeleton Patterns
   ============================================================================= */

export interface SkeletonCardProps {
  /** Additional className */
  className?: string;
  /** Use glass effect background */
  glass?: boolean;
  /** Image aspect ratio */
  imageAspect?: '16/9' | '4/3' | 'square';
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  className = '',
  glass = false,
  imageAspect = '16/9',
}) => {
  const aspectStyles = {
    '16/9': 'aspect-video',
    '4/3': 'aspect-[4/3]',
    square: 'aspect-square',
  };

  const containerClass = glass
    ? 'p-4 card-glass rounded-card'
    : 'p-4 border border-border rounded-card bg-surface';

  return (
    <div className={`${containerClass} ${className}`}>
      <Skeleton variant="rounded" className={`${aspectStyles[imageAspect]} mb-4 w-full`} />
      <Skeleton variant="text" width="75%" className="mb-2" />
      <Skeleton variant="text" width="50%" />
    </div>
  );
};

export const SkeletonAvatar: React.FC<{ size?: number; className?: string }> = ({
  size = 40,
  className = '',
}) => (
  <Skeleton
    variant="circular"
    width={`${size}px`}
    height={`${size}px`}
    className={className}
  />
);

export const SkeletonListItem: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <SkeletonAvatar size={40} />
    <div className="flex-1">
      <Skeleton variant="text" width="60%" className="mb-1" />
      <Skeleton variant="text" width="40%" height="0.75rem" />
    </div>
  </div>
);

/* =============================================================================
   CSS Keyframes (add to index.css if not using Tailwind animate plugin)
   ============================================================================= */

// Add these to your index.css:
// @keyframes progress-stripes {
//   from { background-position: 1rem 0; }
//   to { background-position: 0 0; }
// }
//
// @keyframes progress-indeterminate {
//   0% { transform: translateX(-100%); }
//   100% { transform: translateX(400%); }
// }

export default Progress;
