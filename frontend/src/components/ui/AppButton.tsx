import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

/* =============================================================================
   AppButton Component

   A versatile button component with multiple variants, sizes, and states.
   Supports icons, loading states, and full accessibility.
   ============================================================================= */

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive'
  | 'gold'
  | 'accent';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon';

export interface AppButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual variant of the button */
  variant?: ButtonVariant;
  /** Size of the button */
  size?: ButtonSize;
  /** Show loading spinner and disable interactions */
  isLoading?: boolean;
  /** Loading text to display (sr-only when spinner is shown) */
  loadingText?: string;
  /** Icon to display before the label */
  leftIcon?: React.ReactNode;
  /** Icon to display after the label */
  rightIcon?: React.ReactNode;
  /** Make button full width */
  fullWidth?: boolean;
  /** Render as a different element (e.g., 'a' for links) */
  as?: React.ElementType;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-gradient-to-br from-primary-600 to-primary-700
    text-white
    shadow-sm shadow-primary/30
    hover:from-primary-500 hover:to-primary-600 hover:shadow-md hover:shadow-primary/40 hover:-translate-y-0.5
    active:from-primary-700 active:to-primary-800 active:translate-y-0
    focus-visible:ring-primary-500
  `,
  secondary: `
    bg-surface
    text-text-primary
    border border-border
    shadow-sm
    hover:bg-surface-hover hover:border-border-hover hover:shadow-md
    active:bg-surface-active
    focus-visible:ring-primary-500
  `,
  outline: `
    bg-transparent
    text-primary
    border border-primary
    hover:bg-primary-50
    dark:hover:bg-primary-950
    active:bg-primary-100
    focus-visible:ring-primary-500
  `,
  ghost: `
    bg-transparent
    text-text-secondary
    border border-transparent
    hover:bg-surface-hover hover:text-text-primary
    active:bg-surface-active
    focus-visible:ring-primary-500
  `,
  destructive: `
    bg-gradient-to-br from-error-600 to-error-700
    text-white
    shadow-sm shadow-error/30
    hover:from-error-500 hover:to-error-600 hover:shadow-md
    active:from-error-700 active:to-error-800
    focus-visible:ring-error-500
  `,
  gold: `
    bg-gradient-to-br from-gold-500 to-gold-600
    text-white
    shadow-sm shadow-gold/30
    hover:from-gold-400 hover:to-gold-500 hover:shadow-md hover:shadow-gold/40 hover:-translate-y-0.5
    active:from-gold-600 active:to-gold-700 active:translate-y-0
    focus-visible:ring-gold-500
  `,
  accent: `
    bg-gradient-to-br from-accent-500 to-accent-600
    text-white
    shadow-sm shadow-accent/30
    hover:from-accent-400 hover:to-accent-500 hover:shadow-md hover:-translate-y-0.5
    active:from-accent-600 active:to-accent-700 active:translate-y-0
    focus-visible:ring-accent-500
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: 'px-2 py-1 text-xs gap-1 min-h-[28px]',
  sm: 'px-3 py-1.5 text-sm gap-1.5 min-h-[32px]',
  md: 'px-4 py-2.5 text-sm gap-2 min-h-[40px]',
  lg: 'px-6 py-3 text-base gap-2.5 min-h-[48px]',
  xl: 'px-8 py-4 text-lg gap-3 min-h-[56px]',
  icon: 'p-2 aspect-square min-h-[40px] min-w-[40px]',
};

const iconSizeStyles: Record<ButtonSize, string> = {
  xs: 'p-1 min-h-[24px] min-w-[24px]',
  sm: 'p-1.5 min-h-[28px] min-w-[28px]',
  md: 'p-2 min-h-[40px] min-w-[40px]',
  lg: 'p-3 min-h-[48px] min-w-[48px]',
  xl: 'p-4 min-h-[56px] min-w-[56px]',
  icon: 'p-2 min-h-[40px] min-w-[40px]',
};

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingText,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      children,
      className = '',
      as: Component = 'button',
      type = 'button',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;
    const isIconOnly = size === 'icon' || (!children && (leftIcon || rightIcon));

    const baseStyles = `
      inline-flex items-center justify-center
      font-medium
      rounded-button
      outline-none
      select-none
      whitespace-nowrap
      transition-all duration-150 ease-out
      focus-visible:ring-2 focus-visible:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none
    `;

    const classes = [
      baseStyles,
      variantStyles[variant],
      isIconOnly ? iconSizeStyles[size] : sizeStyles[size],
      fullWidth ? 'w-full' : '',
      className,
    ].filter(Boolean).join(' ');

    return (
      <Component
        ref={ref}
        type={Component === 'button' ? type : undefined}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={isLoading}
        className={classes}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2
              className="animate-spin"
              size={size === 'xs' ? 14 : size === 'sm' ? 16 : size === 'lg' ? 20 : size === 'xl' ? 24 : 18}
              aria-hidden="true"
            />
            {loadingText && <span className="sr-only">{loadingText}</span>}
            {!isIconOnly && loadingText && <span>{loadingText}</span>}
          </>
        ) : (
          <>
            {leftIcon && <span className="flex-shrink-0" aria-hidden="true">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="flex-shrink-0" aria-hidden="true">{rightIcon}</span>}
          </>
        )}
      </Component>
    );
  }
);

AppButton.displayName = 'AppButton';

/* =============================================================================
   Button Group Component
   ============================================================================= */

export interface ButtonGroupProps {
  children: React.ReactNode;
  /** Attach buttons together */
  attached?: boolean;
  /** Direction of button group */
  direction?: 'horizontal' | 'vertical';
  className?: string;
}

export const ButtonGroup: React.FC<ButtonGroupProps> = ({
  children,
  attached = false,
  direction = 'horizontal',
  className = '',
}) => {
  const baseStyles = 'inline-flex';
  const directionStyles = direction === 'vertical' ? 'flex-col' : 'flex-row';
  const gapStyles = attached ? '' : direction === 'vertical' ? 'gap-2' : 'gap-2';

  const attachedStyles = attached
    ? direction === 'vertical'
      ? '[&>*:not(:first-child)]:rounded-t-none [&>*:not(:last-child)]:rounded-b-none [&>*:not(:first-child)]:-mt-px'
      : '[&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none [&>*:not(:first-child)]:-ml-px'
    : '';

  return (
    <div
      className={`${baseStyles} ${directionStyles} ${gapStyles} ${attachedStyles} ${className}`}
      role="group"
    >
      {children}
    </div>
  );
};

export default AppButton;
