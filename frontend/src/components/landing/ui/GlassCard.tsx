import React, { forwardRef } from 'react';

/* =============================================================================
   GlassCard Component

   A glass morphism card component for the landing page with multiple variants.
   Independent from the workspace UI components.
   ============================================================================= */

export type GlassCardVariant = 'sm' | 'md' | 'lg';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Glass blur intensity variant */
  variant?: GlassCardVariant;
  /** Enable hover effects */
  hoverable?: boolean;
  /** Highlighted card with accent border glow */
  highlighted?: boolean;
  /** Custom blur value in pixels */
  blur?: number;
  /** Custom background opacity (0-1) */
  opacity?: number;
  /** Show border */
  border?: boolean;
  /** Card padding */
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /** Border radius */
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  /** As element type */
  as?: React.ElementType;
}

const variantStyles: Record<GlassCardVariant, { blur: number; opacity: number }> = {
  sm: { blur: 8, opacity: 0.03 },
  md: { blur: 12, opacity: 0.05 },
  lg: { blur: 20, opacity: 0.08 },
};

const paddingStyles: Record<NonNullable<GlassCardProps['padding']>, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
  xl: 'p-8',
};

const roundedStyles: Record<NonNullable<GlassCardProps['rounded']>, string> = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
  '2xl': 'rounded-[2rem]',
  full: 'rounded-full',
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      variant = 'md',
      hoverable = false,
      highlighted = false,
      blur,
      opacity,
      border = true,
      padding = 'lg',
      rounded = 'lg',
      as: Component = 'div',
      className = '',
      style,
      children,
      ...props
    },
    ref
  ) => {
    const variantConfig = variantStyles[variant];
    const effectiveBlur = blur ?? variantConfig.blur;
    const effectiveOpacity = opacity ?? variantConfig.opacity;

    const baseStyles = [
      // Layout
      'relative',
      paddingStyles[padding],
      roundedStyles[rounded],
      // Transition for hover
      'transition-all duration-300 ease-out',
    ];

    if (hoverable) {
      baseStyles.push(
        'cursor-pointer',
        'hover:translate-y-[-4px]',
        'hover:shadow-[0_20px_40px_rgba(0,0,0,0.3)]'
      );
    }

    if (highlighted) {
      baseStyles.push(
        'border-2 border-primary-500',
        'shadow-[0_0_30px_rgba(59,130,246,0.3)]',
        hoverable ? 'hover:shadow-[0_0_40px_rgba(59,130,246,0.4)]' : ''
      );
    }

    const inlineStyles: React.CSSProperties = {
      background: `rgba(255, 255, 255, ${effectiveOpacity})`,
      backdropFilter: `blur(${effectiveBlur}px)`,
      WebkitBackdropFilter: `blur(${effectiveBlur}px)`,
      border: border && !highlighted ? '1px solid rgba(255, 255, 255, 0.1)' : undefined,
      ...style,
    };

    // Add hover background change for hoverable cards
    if (hoverable && !highlighted) {
      baseStyles.push('hover:bg-white/[0.08]', 'hover:border-white/[0.15]');
    }

    return (
      <Component
        ref={ref}
        className={`${baseStyles.filter(Boolean).join(' ')} ${className}`}
        style={inlineStyles}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

GlassCard.displayName = 'GlassCard';

/* =============================================================================
   GlassCard Sub-components
   ============================================================================= */

interface GlassCardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Center the header content */
  centered?: boolean;
}

export const GlassCardHeader: React.FC<GlassCardHeaderProps> = ({
  centered = false,
  className = '',
  children,
  ...props
}) => (
  <div
    className={`mb-4 ${centered ? 'text-center' : ''} ${className}`}
    {...props}
  >
    {children}
  </div>
);

GlassCardHeader.displayName = 'GlassCardHeader';

interface GlassCardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Heading level */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export const GlassCardTitle: React.FC<GlassCardTitleProps> = ({
  as: Component = 'h3',
  className = '',
  children,
  ...props
}) => (
  <Component
    className={`text-xl font-semibold text-white mb-2 ${className}`}
    {...props}
  >
    {children}
  </Component>
);

GlassCardTitle.displayName = 'GlassCardTitle';

interface GlassCardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const GlassCardDescription: React.FC<GlassCardDescriptionProps> = ({
  className = '',
  children,
  ...props
}) => (
  <p className={`text-slate-400 leading-relaxed ${className}`} {...props}>
    {children}
  </p>
);

GlassCardDescription.displayName = 'GlassCardDescription';

interface GlassCardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export const GlassCardContent: React.FC<GlassCardContentProps> = ({
  className = '',
  children,
  ...props
}) => (
  <div className={className} {...props}>
    {children}
  </div>
);

GlassCardContent.displayName = 'GlassCardContent';

interface GlassCardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Center the footer content */
  centered?: boolean;
}

export const GlassCardFooter: React.FC<GlassCardFooterProps> = ({
  centered = false,
  className = '',
  children,
  ...props
}) => (
  <div
    className={`mt-6 pt-4 border-t border-white/10 ${centered ? 'text-center' : ''} ${className}`}
    {...props}
  >
    {children}
  </div>
);

GlassCardFooter.displayName = 'GlassCardFooter';

/* =============================================================================
   Compound Component Export
   ============================================================================= */

export default Object.assign(GlassCard, {
  Header: GlassCardHeader,
  Title: GlassCardTitle,
  Description: GlassCardDescription,
  Content: GlassCardContent,
  Footer: GlassCardFooter,
});
