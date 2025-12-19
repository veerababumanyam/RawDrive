import React, { forwardRef, createContext } from 'react';

/* =============================================================================
   AppCard Component

   A versatile card component with multiple variants and sub-components
   for structured content layout.
   ============================================================================= */

export type CardVariant =
  | 'default'
  | 'elevated'
  | 'outlined'
  | 'flat'
  | 'glass'
  | 'glass-premium'
  | 'gradient-border'
  | 'premium';

export interface AppCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual variant of the card */
  variant?: CardVariant;
  /** Enable hover effects */
  hoverable?: boolean;
  /** Make card clickable with button semantics */
  clickable?: boolean;
  /** Padding size */
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Border radius size */
  radius?: 'sm' | 'md' | 'lg' | 'xl';
  /** Full width */
  fullWidth?: boolean;
  /** Enable glow effect on hover */
  glow?: boolean;
  /** Enable animated gradient border */
  animatedBorder?: boolean;
}

const CardContext = createContext<{ variant: CardVariant }>({ variant: 'default' });

const variantStyles: Record<CardVariant, string> = {
  default: 'bg-surface border border-border shadow-card',
  elevated: 'bg-surface border-none shadow-lg',
  outlined: 'bg-surface border border-border shadow-none',
  flat: 'bg-background-alt border-none shadow-none',
  glass: 'card-glass',
  'glass-premium': 'glass-premium',
  'gradient-border': 'gradient-border bg-surface',
  premium: 'card-premium',
};

const paddingStyles: Record<string, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

const radiusStyles: Record<string, string> = {
  sm: 'rounded-lg',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
};

export const AppCard = forwardRef<HTMLDivElement, AppCardProps>(
  (
    {
      variant = 'default',
      hoverable = false,
      clickable = false,
      padding = 'none',
      radius = 'lg',
      fullWidth = false,
      glow = false,
      animatedBorder = false,
      className = '',
      children,
      onClick,
      ...props
    },
    ref
  ) => {
    const baseStyles = 'overflow-hidden';

    const hoverStyles = hoverable
      ? 'transition-all duration-200 ease-out cursor-pointer hover:shadow-card-hover hover:-translate-y-1 hover:border-border-hover'
      : '';

    const clickableStyles = clickable
      ? 'cursor-pointer focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none'
      : '';

    // Modern effect classes
    const effectClasses = [
      glow ? 'glow-accent-hover' : '',
      animatedBorder ? 'gradient-border-animated' : '',
    ].filter(Boolean).join(' ');

    const classes = [
      baseStyles,
      variantStyles[variant],
      paddingStyles[padding],
      radiusStyles[radius],
      hoverStyles,
      clickableStyles,
      effectClasses,
      fullWidth ? 'w-full' : '',
      className,
    ].filter(Boolean).join(' ');

    return (
      <CardContext.Provider value={{ variant }}>
        <div
          ref={ref}
          className={classes}
          onClick={onClick}
          role={clickable ? 'button' : undefined}
          tabIndex={clickable ? 0 : undefined}
          onKeyDown={
            clickable
              ? (e) => {
                  if (!onClick) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
                  }
                }
              : undefined
          }
          {...props}
        >
          {children}
        </div>
      </CardContext.Provider>
    );
  }
);

AppCard.displayName = 'AppCard';

/* =============================================================================
   Card.Header Sub-component
   ============================================================================= */

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Show bottom border */
  bordered?: boolean;
  /** Actions to display on the right side */
  action?: React.ReactNode;
}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ bordered = true, action, className = '', children, ...props }, ref) => {
    const classes = [
      'px-5 py-4',
      bordered ? 'border-b border-border' : '',
      action ? 'flex items-center justify-between' : '',
      className,
    ].filter(Boolean).join(' ');

    return (
      <div ref={ref} className={classes} {...props}>
        {action ? (
          <>
            <div>{children}</div>
            <div>{action}</div>
          </>
        ) : (
          children
        )}
      </div>
    );
  }
);

CardHeader.displayName = 'CardHeader';

/* =============================================================================
   Card.Content Sub-component
   ============================================================================= */

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Custom padding */
  padding?: 'sm' | 'md' | 'lg';
}

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ padding = 'md', className = '', children, ...props }, ref) => {
    const paddingMap = {
      sm: 'p-3',
      md: 'p-5',
      lg: 'p-6',
    };

    return (
      <div ref={ref} className={`${paddingMap[padding]} ${className}`} {...props}>
        {children}
      </div>
    );
  }
);

CardContent.displayName = 'CardContent';

/* =============================================================================
   Card.Footer Sub-component
   ============================================================================= */

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Show top border */
  bordered?: boolean;
  /** Align content */
  align?: 'left' | 'center' | 'right' | 'between';
}

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ bordered = true, align = 'right', className = '', children, ...props }, ref) => {
    const alignStyles: Record<string, string> = {
      left: 'justify-start',
      center: 'justify-center',
      right: 'justify-end',
      between: 'justify-between',
    };

    const classes = [
      'px-5 py-4 flex items-center gap-3',
      alignStyles[align],
      bordered ? 'border-t border-border bg-background-alt' : '',
      className,
    ].filter(Boolean).join(' ');

    return (
      <div ref={ref} className={classes} {...props}>
        {children}
      </div>
    );
  }
);

CardFooter.displayName = 'CardFooter';

/* =============================================================================
   Card.Title Sub-component
   ============================================================================= */

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** Heading level */
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ as: Component = 'h3', className = '', children, ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={`text-lg font-semibold text-text-primary ${className}`}
        {...props}
      >
        {children}
      </Component>
    );
  }
);

CardTitle.displayName = 'CardTitle';

/* =============================================================================
   Card.Description Sub-component
   ============================================================================= */

export interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ className = '', children, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={`text-sm text-text-secondary mt-1 ${className}`}
        {...props}
      >
        {children}
      </p>
    );
  }
);

CardDescription.displayName = 'CardDescription';

/* =============================================================================
   Card.Image Sub-component
   ============================================================================= */

export interface CardImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Aspect ratio */
  aspectRatio?: 'auto' | 'square' | '4/3' | '16/9' | '3/2' | '2/3';
  /** Object fit */
  fit?: 'cover' | 'contain' | 'fill' | 'none';
  /** Show overlay gradient */
  overlay?: boolean;
}

export const CardImage = forwardRef<HTMLImageElement, CardImageProps>(
  (
    {
      aspectRatio = 'auto',
      fit = 'cover',
      overlay = false,
      className = '',
      alt = '',
      ...props
    },
    ref
  ) => {
    const aspectStyles: Record<string, string> = {
      auto: '',
      square: 'aspect-square',
      '4/3': 'aspect-[4/3]',
      '16/9': 'aspect-video',
      '3/2': 'aspect-[3/2]',
      '2/3': 'aspect-[2/3]',
    };

    const fitStyles: Record<string, string> = {
      cover: 'object-cover',
      contain: 'object-contain',
      fill: 'object-fill',
      none: 'object-none',
    };

    return (
      <div className={`relative overflow-hidden ${aspectStyles[aspectRatio]}`}>
        <img
          ref={ref}
          className={`w-full h-full ${fitStyles[fit]} ${className}`}
          alt={alt}
          {...props}
        />
        {overlay && (
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"
            aria-hidden="true"
          />
        )}
      </div>
    );
  }
);

CardImage.displayName = 'CardImage';

/* =============================================================================
   Compound Export
   ============================================================================= */

const CardCompound = Object.assign(AppCard, {
  Header: CardHeader,
  Content: CardContent,
  Footer: CardFooter,
  Title: CardTitle,
  Description: CardDescription,
  Image: CardImage,
});

export { CardCompound as Card };
export default AppCard;
