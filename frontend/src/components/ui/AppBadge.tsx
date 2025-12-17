import React, { forwardRef } from 'react';

/* =============================================================================
   AppBadge Component

   A badge component for displaying status, counts, labels, and tags.
   Supports multiple variants, sizes, and optional dot indicators.
   ============================================================================= */

export type BadgeVariant =
  | 'default'
  | 'primary'
  | 'accent'
  | 'gold'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'outline';

export type BadgeSize = 'sm' | 'md' | 'lg';

export interface AppBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Visual variant of the badge */
  variant?: BadgeVariant;
  /** Size of the badge */
  size?: BadgeSize;
  /** Show dot indicator before text */
  dot?: boolean;
  /** Make badge pill-shaped (more rounded) */
  pill?: boolean;
  /** Icon to display before text */
  icon?: React.ReactNode;
  /** Make badge removable with close button */
  removable?: boolean;
  /** Callback when remove button is clicked */
  onRemove?: () => void;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300',
  accent: 'bg-accent-100 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300',
  gold: 'bg-gold-100 text-gold-700 dark:bg-gold-900/30 dark:text-gold-300',
  success: 'bg-success-100 text-success-700 dark:bg-success-600/20 dark:text-success-500',
  warning: 'bg-warning-100 text-warning-700 dark:bg-warning-600/20 dark:text-warning-500',
  error: 'bg-error-100 text-error-700 dark:bg-error-600/20 dark:text-error-500',
  info: 'bg-info-100 text-info-700 dark:bg-info-600/20 dark:text-info-500',
  outline: 'bg-transparent border border-border text-text-secondary',
};

const dotColorStyles: Record<BadgeVariant, string> = {
  default: 'bg-neutral-500',
  primary: 'bg-primary-500',
  accent: 'bg-accent-500',
  gold: 'bg-gold-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
  info: 'bg-info-500',
  outline: 'bg-text-secondary',
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: 'px-1.5 py-0.5 text-[10px] gap-1',
  md: 'px-2 py-0.5 text-xs gap-1.5',
  lg: 'px-3 py-1 text-sm gap-2',
};

const dotSizeStyles: Record<BadgeSize, string> = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-2.5 h-2.5',
};

export const AppBadge = forwardRef<HTMLSpanElement, AppBadgeProps>(
  (
    {
      variant = 'default',
      size = 'md',
      dot = false,
      pill = true,
      icon,
      removable = false,
      onRemove,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    const baseStyles = `
      inline-flex items-center
      font-medium
      leading-normal
      whitespace-nowrap
    `;

    const radiusStyles = pill ? 'rounded-full' : 'rounded-md';

    const classes = [
      baseStyles,
      variantStyles[variant],
      sizeStyles[size],
      radiusStyles,
      className,
    ].filter(Boolean).join(' ');

    return (
      <span ref={ref} className={classes} {...props}>
        {dot && (
          <span
            className={`rounded-full ${dotSizeStyles[size]} ${dotColorStyles[variant]}`}
            aria-hidden="true"
          />
        )}
        {icon && (
          <span className="flex-shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
        {children}
        {removable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            className={`
              flex-shrink-0
              rounded-full
              hover:bg-black/10 dark:hover:bg-white/10
              transition-colors duration-150
              -mr-0.5 ml-0.5
              p-0.5
              focus-visible:ring-1 focus-visible:ring-current focus-visible:outline-none
            `}
            aria-label="Remove"
          >
            <svg
              className={size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-4 h-4' : 'w-3.5 h-3.5'}
              viewBox="0 0 16 16"
              fill="currentColor"
            >
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
            </svg>
          </button>
        )}
      </span>
    );
  }
);

AppBadge.displayName = 'AppBadge';

/* =============================================================================
   Badge Group Component
   ============================================================================= */

export interface BadgeGroupProps {
  children: React.ReactNode;
  /** Maximum badges to show before collapsing */
  max?: number;
  /** Gap between badges */
  gap?: 'sm' | 'md' | 'lg';
  /** Wrap badges to multiple lines */
  wrap?: boolean;
  className?: string;
}

export const BadgeGroup: React.FC<BadgeGroupProps> = ({
  children,
  max,
  gap = 'md',
  wrap = true,
  className = '',
}) => {
  const childArray = React.Children.toArray(children);
  const visibleChildren = max ? childArray.slice(0, max) : childArray;
  const hiddenCount = max ? Math.max(0, childArray.length - max) : 0;

  const gapStyles: Record<string, string> = {
    sm: 'gap-1',
    md: 'gap-2',
    lg: 'gap-3',
  };

  return (
    <div
      className={`
        inline-flex items-center
        ${gapStyles[gap]}
        ${wrap ? 'flex-wrap' : ''}
        ${className}
      `}
    >
      {visibleChildren}
      {hiddenCount > 0 && (
        <AppBadge variant="default" size="md">
          +{hiddenCount}
        </AppBadge>
      )}
    </div>
  );
};

/* =============================================================================
   Status Badge Presets
   ============================================================================= */

export interface StatusBadgeProps extends Omit<AppBadgeProps, 'variant' | 'dot'> {
  status: 'online' | 'offline' | 'away' | 'busy' | 'pending' | 'active' | 'inactive';
}

const statusConfig: Record<
  StatusBadgeProps['status'],
  { variant: BadgeVariant; label: string }
> = {
  online: { variant: 'success', label: 'Online' },
  offline: { variant: 'default', label: 'Offline' },
  away: { variant: 'warning', label: 'Away' },
  busy: { variant: 'error', label: 'Busy' },
  pending: { variant: 'warning', label: 'Pending' },
  active: { variant: 'success', label: 'Active' },
  inactive: { variant: 'default', label: 'Inactive' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  children,
  ...props
}) => {
  const config = statusConfig[status];

  return (
    <AppBadge variant={config.variant} dot {...props}>
      {children || config.label}
    </AppBadge>
  );
};

/* =============================================================================
   Count Badge Component
   ============================================================================= */

export interface CountBadgeProps {
  count: number;
  max?: number;
  variant?: BadgeVariant;
  size?: BadgeSize;
  className?: string;
}

export const CountBadge: React.FC<CountBadgeProps> = ({
  count,
  max = 99,
  variant = 'primary',
  size = 'sm',
  className = '',
}) => {
  if (count <= 0) return null;

  const displayCount = count > max ? `${max}+` : count.toString();

  return (
    <AppBadge
      variant={variant}
      size={size}
      pill
      className={`min-w-[1.25rem] justify-center ${className}`}
    >
      {displayCount}
    </AppBadge>
  );
};

export default AppBadge;
