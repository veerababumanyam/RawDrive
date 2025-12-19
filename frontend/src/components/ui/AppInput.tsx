import React, { forwardRef, useId } from 'react';

/* =============================================================================
   AppInput Component

   A comprehensive input component with support for labels, helper text,
   error states, icons, and accessibility features.
   ============================================================================= */

export type InputSize = 'sm' | 'md' | 'lg';
export type InputVariant = 'default' | 'filled' | 'flushed' | 'glass' | 'gradient-focus';

export interface AppInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label text displayed above the input */
  label?: string;
  /** Helper text displayed below the input */
  helperText?: string;
  /** Error message (also sets error styling) */
  error?: string;
  /** Size variant of the input */
  inputSize?: InputSize;
  /** Visual variant */
  variant?: InputVariant;
  /** Icon displayed at the start of the input */
  leftIcon?: React.ReactNode;
  /** Icon displayed at the end of the input */
  rightIcon?: React.ReactNode;
  /** Element displayed at the start (e.g., "$" for currency) */
  leftAddon?: React.ReactNode;
  /** Element displayed at the end (e.g., ".com" for domains) */
  rightAddon?: React.ReactNode;
  /** Make input full width */
  fullWidth?: boolean;
  /** Mark field as required (adds asterisk to label) */
  isRequired?: boolean;
  /** Container className */
  containerClassName?: string;
}

const sizeStyles: Record<InputSize, string> = {
  sm: 'py-1.5 px-2.5 text-xs min-h-[32px]',
  md: 'py-2.5 px-3 text-sm min-h-[40px]',
  lg: 'py-3 px-4 text-base min-h-[48px]',
};

const iconSizeStyles: Record<InputSize, { size: number; padding: string }> = {
  sm: { size: 14, padding: 'pl-8' },
  md: { size: 16, padding: 'pl-10' },
  lg: { size: 20, padding: 'pl-12' },
};

const rightIconPadding: Record<InputSize, string> = {
  sm: 'pr-8',
  md: 'pr-10',
  lg: 'pr-12',
};

export const AppInput = forwardRef<HTMLInputElement, AppInputProps>(
  (
    {
      label,
      helperText,
      error,
      inputSize = 'md',
      variant = 'default',
      leftIcon,
      rightIcon,
      leftAddon,
      rightAddon,
      fullWidth = true,
      isRequired = false,
      disabled,
      id,
      className = '',
      containerClassName = '',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    const hasError = !!error;

    const baseInputStyles = `
      block
      font-sans
      bg-surface
      text-text-primary
      placeholder:text-text-tertiary
      border border-border
      rounded-input
      outline-none
      transition-all duration-150 ease-out
      disabled:bg-background-alt disabled:text-text-disabled disabled:cursor-not-allowed
    `;

    const focusStyles = hasError
      ? 'focus:border-error focus:ring-2 focus:ring-error-100 dark:focus:ring-error-900/30'
      : 'focus:border-border-focus focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/30';

    const hoverStyles = 'hover:border-border-hover disabled:hover:border-border';

    const errorStyles = hasError ? 'border-error' : '';

    const variantStyles: Record<InputVariant, string> = {
      default: '',
      filled: 'bg-background-alt border-transparent focus:bg-surface',
      flushed: 'border-0 border-b rounded-none px-0 focus:ring-0',
      glass: `
        bg-white/5 dark:bg-white/5
        backdrop-blur-md
        border-white/15 dark:border-white/10
        focus:bg-white/10 dark:focus:bg-white/8
        focus:border-accent focus:ring-accent/20
        placeholder:text-text-tertiary/70
      `,
      'gradient-focus': `
        focus:border-transparent
        focus:bg-[linear-gradient(var(--color-surface),var(--color-surface)),linear-gradient(135deg,var(--color-accent-500),var(--color-primary-600))]
        focus:bg-origin-border
        focus:[background-clip:padding-box,border-box]
        focus:ring-0
      `,
    };

    const inputClasses = [
      baseInputStyles,
      sizeStyles[inputSize],
      focusStyles,
      hoverStyles,
      errorStyles,
      variantStyles[variant],
      leftIcon ? iconSizeStyles[inputSize].padding : '',
      rightIcon ? rightIconPadding[inputSize] : '',
      fullWidth ? 'w-full' : '',
      className,
    ].filter(Boolean).join(' ');

    const renderInput = () => (
      <div className="relative">
        {leftIcon && (
          <span
            className={`
              absolute left-3 top-1/2 -translate-y-1/2
              text-text-tertiary
              pointer-events-none
            `}
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={
            hasError ? errorId : helperText ? helperId : undefined
          }
          aria-required={isRequired}
          className={inputClasses}
          {...props}
        />
        {rightIcon && (
          <span
            className={`
              absolute right-3 top-1/2 -translate-y-1/2
              text-text-tertiary
              pointer-events-none
            `}
            aria-hidden="true"
          >
            {rightIcon}
          </span>
        )}
      </div>
    );

    return (
      <div className={`${fullWidth ? 'w-full' : ''} ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className={`
              block text-sm font-medium text-text-primary mb-1.5
              ${isRequired ? "after:content-['_*'] after:text-error" : ''}
            `}
          >
            {label}
          </label>
        )}

        {leftAddon || rightAddon ? (
          <div className="flex">
            {leftAddon && (
              <span
                className={`
                  inline-flex items-center px-3
                  text-text-secondary text-sm
                  bg-background-alt
                  border border-border border-r-0
                  rounded-l-input
                `}
              >
                {leftAddon}
              </span>
            )}
            <div className={`flex-1 ${leftAddon ? '[&_input]:rounded-l-none' : ''} ${rightAddon ? '[&_input]:rounded-r-none' : ''}`}>
              {renderInput()}
            </div>
            {rightAddon && (
              <span
                className={`
                  inline-flex items-center px-3
                  text-text-secondary text-sm
                  bg-background-alt
                  border border-border border-l-0
                  rounded-r-input
                `}
              >
                {rightAddon}
              </span>
            )}
          </div>
        ) : (
          renderInput()
        )}

        {(error || helperText) && (
          <p
            id={hasError ? errorId : helperId}
            className={`
              mt-1 text-xs
              ${hasError ? 'text-error' : 'text-text-tertiary'}
            `}
            role={hasError ? 'alert' : undefined}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

AppInput.displayName = 'AppInput';

/* =============================================================================
   Textarea Component
   ============================================================================= */

export interface AppTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'> {
  label?: string;
  helperText?: string;
  error?: string;
  inputSize?: InputSize;
  fullWidth?: boolean;
  isRequired?: boolean;
  containerClassName?: string;
  /** Auto-resize based on content */
  autoResize?: boolean;
}

export const AppTextarea = forwardRef<HTMLTextAreaElement, AppTextareaProps>(
  (
    {
      label,
      helperText,
      error,
      inputSize = 'md',
      fullWidth = true,
      isRequired = false,
      disabled,
      id,
      className = '',
      containerClassName = '',
      autoResize = false,
      rows = 3,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    const hasError = !!error;

    const handleAutoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (autoResize) {
        e.target.style.height = 'auto';
        e.target.style.height = `${e.target.scrollHeight}px`;
      }
      props.onChange?.(e);
    };

    const textareaSizeStyles: Record<InputSize, string> = {
      sm: 'py-1.5 px-2.5 text-xs',
      md: 'py-2.5 px-3 text-sm',
      lg: 'py-3 px-4 text-base',
    };

    const baseStyles = `
      block
      font-sans
      bg-surface
      text-text-primary
      placeholder:text-text-tertiary
      border border-border
      rounded-input
      outline-none
      transition-all duration-150 ease-out
      resize-vertical
      disabled:bg-background-alt disabled:text-text-disabled disabled:cursor-not-allowed
      ${autoResize ? 'resize-none overflow-hidden' : ''}
    `;

    const focusStyles = hasError
      ? 'focus:border-error focus:ring-2 focus:ring-error-100'
      : 'focus:border-border-focus focus:ring-2 focus:ring-primary-100';

    const textareaClasses = [
      baseStyles,
      textareaSizeStyles[inputSize],
      focusStyles,
      'hover:border-border-hover disabled:hover:border-border',
      hasError ? 'border-error' : '',
      fullWidth ? 'w-full' : '',
      className,
    ].filter(Boolean).join(' ');

    return (
      <div className={`${fullWidth ? 'w-full' : ''} ${containerClassName}`}>
        {label && (
          <label
            htmlFor={inputId}
            className={`
              block text-sm font-medium text-text-primary mb-1.5
              ${isRequired ? "after:content-['_*'] after:text-error" : ''}
            `}
          >
            {label}
          </label>
        )}

        <textarea
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={hasError}
          aria-describedby={hasError ? errorId : helperText ? helperId : undefined}
          aria-required={isRequired}
          rows={rows}
          className={textareaClasses}
          onChange={autoResize ? handleAutoResize : props.onChange}
          {...props}
        />

        {(error || helperText) && (
          <p
            id={hasError ? errorId : helperId}
            className={`
              mt-1 text-xs
              ${hasError ? 'text-error' : 'text-text-tertiary'}
            `}
            role={hasError ? 'alert' : undefined}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

AppTextarea.displayName = 'AppTextarea';

export default AppInput;
