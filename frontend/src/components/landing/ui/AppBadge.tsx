import React from 'react';

/* =============================================================================
   AppBadge Component

   Badge for trust signals and status indicators.
   ============================================================================= */

export type AppBadgeVariant = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'outline';

export interface AppBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
    /** Badge content */
    children: React.ReactNode;
    /** Visual variant */
    variant?: AppBadgeVariant;
    /** Optional icon */
    icon?: React.ReactNode;
}

const variantStyles: Record<AppBadgeVariant, string> = {
    primary: 'bg-primary-100 text-primary-800 border-primary-200',
    secondary: 'bg-neutral-100 text-neutral-800 border-neutral-200',
    accent: 'bg-accent-100 text-accent-800 border-accent-200',
    success: 'bg-green-100 text-green-800 border-green-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    error: 'bg-red-100 text-red-800 border-red-200',
    outline: 'bg-transparent border-neutral-300 text-neutral-600',
};

export const AppBadge: React.FC<AppBadgeProps> = ({
    children,
    variant = 'primary',
    icon,
    className = '',
    ...props
}) => {
    return (
        <span
            className={`
        inline-flex items-center gap-1.5 px-2.5 py-0.5
        rounded-full text-xs font-medium border
        ${variantStyles[variant]}
        ${className}
      `}
            {...props}
        >
            {icon && <span className="flex-shrink-0 w-3 h-3 flex items-center justify-center">{icon}</span>}
            {children}
        </span>
    );
};

export default AppBadge;
