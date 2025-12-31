import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

/* =============================================================================
   AppButton Component

   A versatile button component with multiple variants, sizes, and states.
   Supports icons, loading states, and full accessibility.
   ============================================================================= */

export type ButtonVariant =
  | 'primary'      // Main actions (Create, Save, Submit) - Deep blue gradient
  | 'secondary'    // Secondary actions (Cancel, Back) - Subtle glass
  | 'outline'      // Tertiary actions - Transparent with border
  | 'ghost'        // Minimal actions (icon buttons) - No background
  | 'destructive'  // Dangerous actions (Delete, Remove) - Red gradient
  | 'gold'         // Premium/Upgrade actions - Rich gold shimmer
  | 'accent'       // Creative/positive actions (New, Add) - Cyan to blue
  | 'success'      // Confirm/Complete actions - Green gradient
  | 'warning'      // Caution actions - Amber gradient
  | 'info'         // Information actions - Soft blue
  | 'glow'         // Glowing effect button
  | 'glass'        // Glassmorphism button
  | 'gradient-border'; // Gradient border button

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
  /** Enable shine effect on hover */
  shine?: boolean;
  /** Enable ripple effect on click */
  ripple?: boolean;
  /** Enable glow pulse animation */
  glowPulse?: boolean;
}

/* =============================================================================
   Modern 2025 Button Variant Styles

   Each variant uses:
   - Layered gradients for depth (top highlight + main gradient)
   - Inner shadows for dimension
   - Colored glow shadows matching the button color
   - Subtle border for definition
   - Micro-interactions on hover/active
   ============================================================================= */

const variantStyles: Record<ButtonVariant, string> = {
  // PRIMARY - Main actions (Create, Save, Submit)
  // Deep blue with layered highlight and cyan glow
  primary: `
    btn-primary
    focus-visible:ring-primary-500
  `,

  // SECONDARY - Secondary actions (Cancel, Back, Close)
  // Subtle glass effect with soft border
  secondary: `
    btn-secondary
    focus-visible:ring-primary-500
  `,

  // OUTLINE - Tertiary actions
  // Transparent with colored border, expands on hover
  outline: `
    btn-outline
    focus-visible:ring-primary-500
  `,

  // GHOST - Minimal actions (icon buttons, subtle links)
  // No background, subtle hover state
  ghost: `
    btn-ghost
    focus-visible:ring-primary-500
  `,

  // DESTRUCTIVE - Dangerous actions (Delete, Remove)
  // Red gradient with warning glow
  destructive: `
    btn-destructive
    focus-visible:ring-error-500
  `,

  // GOLD - Premium/Upgrade actions
  // Rich gold gradient with shimmer effect
  gold: `
    btn-gold
    focus-visible:ring-gold-500
  `,

  // ACCENT - Creative/positive actions (New, Add, Create)
  // Cyan to blue gradient, energetic feel
  accent: `
    btn-accent
    focus-visible:ring-accent-500
  `,

  // SUCCESS - Confirm, Complete, Approve actions
  // Green gradient with positive feel
  success: `
    btn-success
    focus-visible:ring-success-500
  `,

  // WARNING - Caution actions
  // Amber/orange gradient for attention
  warning: `
    btn-warning
    focus-visible:ring-warning-500
  `,

  // INFO - Information, Help actions
  // Softer blue, informational feel
  info: `
    btn-info
    focus-visible:ring-info-500
  `,

  // GLOW - Special glowing effect
  // Pulsing glow animation for attention-grabbing CTAs
  glow: `
    btn-glow
    focus-visible:ring-accent-500
  `,

  // GLASS - Glassmorphism button
  // For use on dark/image backgrounds
  glass: `
    btn-glass
    focus-visible:ring-white/50
  `,

  // GRADIENT-BORDER - Gradient border effect
  // Surface background with animated gradient border
  'gradient-border': `
    btn-gradient-border
    focus-visible:ring-primary-500
  `,
};

// T131: WCAG 2.5.5 Target Size - minimum 44px for touch targets
const sizeStyles: Record<ButtonSize, string> = {
  xs: 'btn-xs min-h-[28px]',
  sm: 'btn-sm min-h-[34px]',
  md: 'min-h-[42px]', // Default size from .btn
  lg: 'btn-lg min-h-[50px]',
  xl: 'btn-xl min-h-[58px]',
  icon: 'btn-icon min-h-[44px] min-w-[44px]',
};

const iconSizeStyles: Record<ButtonSize, string> = {
  xs: 'btn-icon btn-xs min-h-[28px] min-w-[28px]',
  sm: 'btn-icon btn-sm min-h-[34px] min-w-[34px]',
  md: 'btn-icon min-h-[44px] min-w-[44px]',
  lg: 'btn-icon btn-lg min-h-[50px] min-w-[50px]',
  xl: 'btn-icon min-h-[58px] min-w-[58px]',
  icon: 'btn-icon min-h-[44px] min-w-[44px]',
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
      shine = false,
      ripple = false,
      glowPulse = false,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;
    const isIconOnly = size === 'icon' || (!children && (leftIcon || rightIcon));

    // Base styles are now defined in index.css .btn class
    // This ensures consistency with CSS-based button styles
    const baseStyles = `
      btn
      focus-visible:ring-2 focus-visible:ring-offset-2
    `;

    // Modern effect classes
    const effectClasses = [
      shine ? 'btn-shine' : '',
      ripple ? 'ripple active-press' : '',
      glowPulse ? 'glow-pulse' : '',
    ].filter(Boolean).join(' ');

    const classes = [
      baseStyles,
      variantStyles[variant],
      isIconOnly ? iconSizeStyles[size] : sizeStyles[size],
      fullWidth ? 'w-full' : '',
      effectClasses,
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
