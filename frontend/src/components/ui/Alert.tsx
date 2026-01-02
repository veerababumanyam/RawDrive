import React, { forwardRef } from 'react';
import { AlertCircle, CheckCircle, Info, XCircle } from 'lucide-react';

/* =============================================================================
   Alert Component

   Displays a callout for user attention.
   Supports multiple variants: default, info, success, warning, error.
   ============================================================================= */

export type AlertVariant = 'default' | 'info' | 'success' | 'warning' | 'error';

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  icon?: React.ReactNode;
  showIcon?: boolean;
}

const variantStyles: Record<AlertVariant, string> = {
  default:   'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700',
  info:      'bg-primary-50 text-primary-900 dark:bg-primary-900/30 dark:text-primary-100 border-primary-200 dark:border-primary-800/50',
  success:   'bg-success-50 text-success-900 dark:bg-success-900/30 dark:text-success-100 border-success-200 dark:border-success-800/50',
  warning:   'bg-warning-50 text-warning-900 dark:bg-warning-900/30 dark:text-warning-100 border-warning-200 dark:border-warning-800/50',
  error:     'bg-error-50 text-error-900 dark:bg-error-900/30 dark:text-error-100 border-error-200 dark:border-error-800/50',
};

const iconMap: Record<AlertVariant, React.ComponentType<any>> = {
  default: Info,
  info:    Info,
  success: CheckCircle,
  warning: AlertCircle,
  error:   XCircle,
};

const iconColorStyles: Record<AlertVariant, string> = {
  default: 'text-neutral-600 dark:text-neutral-400',
  info:    'text-primary-600 dark:text-primary-400',
  success: 'text-success-600 dark:text-success-400',
  warning: 'text-warning-600 dark:text-warning-400',
  error:   'text-error-600 dark:text-error-400',
};

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className = '', variant = 'default', title, children, icon, showIcon = true, ...props }, ref) => {
    const IconComponent = iconMap[variant];
    const styles = variantStyles[variant];

    return (
      <div
        ref={ref}
        role="alert"
        className={`relative w-full rounded-lg border p-4 flex gap-3 ${styles} ${className}`}
        {...props}
      >
        {showIcon && (
          <div className="flex-shrink-0">
            {icon ? (
              icon
            ) : (
              <IconComponent className={`h-5 w-5 ${iconColorStyles[variant]}`} />
            )}
          </div>
        )}
        <div className="flex-1">
          {title && <h5 className="mb-1 font-medium leading-none tracking-tight">{title}</h5>}
          <div className="text-sm opacity-90">{children}</div>
        </div>
      </div>
    );
  }
);

Alert.displayName = 'Alert';

export interface AlertDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const AlertDescription = forwardRef<HTMLParagraphElement, AlertDescriptionProps>(
  ({ className = '', ...props }, ref) => (
    <div
      ref={ref}
      className={`text-sm [&_p]:leading-relaxed ${className}`}
      {...props}
    />
  )
);
AlertDescription.displayName = 'AlertDescription';

export interface AlertTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export const AlertTitle = forwardRef<HTMLHeadingElement, AlertTitleProps>(
  ({ className = '', ...props }, ref) => (
    <h5
      ref={ref}
      className={`mb-1 font-medium leading-none tracking-tight ${className}`}
      {...props}
    />
  )
);
AlertTitle.displayName = 'AlertTitle';
