import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

/* =============================================================================
   AppButton Component

   Primary and Secondary button variants with loading state and micro-interactions.
   ============================================================================= */

export type AppButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'gold' | 'destructive';
export type AppButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
    /** Button content */
    children: React.ReactNode;
    /** Visual variant */
    variant?: AppButtonVariant;
    /** Size variant */
    size?: AppButtonSize;
    /** Loading state */
    isLoading?: boolean;
    /** Left icon */
    iconLeft?: React.ReactNode;
    /** Right icon */
    iconRight?: React.ReactNode;
}

const variantStyles: Record<AppButtonVariant, string> = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    outline: 'btn-outline',
    ghost: 'btn-ghost',
    gold: 'btn-gold',
    destructive: 'btn-destructive',
};

const sizeStyles: Record<AppButtonSize, string> = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3 text-base',
};

export const AppButton: React.FC<AppButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    iconLeft,
    iconRight,
    className = '',
    disabled,
    ...props
}) => {
    return (
        <motion.button
            className={`
        btn ${variantStyles[variant]} ${sizeStyles[size]}
        inline-flex items-center justify-center gap-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
            disabled={disabled || isLoading}
            whileHover={{ scale: disabled || isLoading ? 1 : 1.02 }}
            whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
            {...props}
        >
            {isLoading ? (
                <>
                    <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        ></circle>
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                    </svg>
                    Loading...
                </>
            ) : (
                <>
                    {iconLeft && <span className="flex-shrink-0">{iconLeft}</span>}
                    {children}
                    {iconRight && <span className="flex-shrink-0">{iconRight}</span>}
                </>
            )}
        </motion.button>
    );
};

export default AppButton;
