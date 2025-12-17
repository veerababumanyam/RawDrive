import React, { forwardRef, useId, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

/* =============================================================================
   Checkbox Component
   ============================================================================= */

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label text */
  label?: string;
  /** Helper/description text */
  description?: string;
  /** Error state */
  error?: boolean;
  /** Indeterminate state */
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, error = false, indeterminate = false, className = '', id, disabled, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const internalRef = useRef<HTMLInputElement>(null);

    // Handle indeterminate state
    useEffect(() => {
      const input = (ref as React.RefObject<HTMLInputElement>)?.current || internalRef.current;
      if (input) {
        input.indeterminate = indeterminate;
      }
    }, [indeterminate, ref]);

    return (
      <div className={`flex items-start gap-3 ${className}`}>
        <div className="flex items-center h-5">
          <input
            ref={ref || internalRef}
            type="checkbox"
            id={inputId}
            disabled={disabled}
            className={`
              appearance-none
              w-[18px] h-[18px]
              border-[1.5px]
              ${error ? 'border-error' : 'border-border'}
              rounded
              bg-surface
              cursor-pointer
              transition-all duration-150 ease-out

              hover:border-primary
              focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none

              checked:bg-primary checked:border-primary
              checked:bg-[url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z'/%3e%3c/svg%3e")]
              checked:bg-center checked:bg-no-repeat

              indeterminate:bg-primary indeterminate:border-primary
              indeterminate:bg-[url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='white' xmlns='http://www.w3.org/2000/svg'%3e%3crect x='3' y='7' width='10' height='2' rx='1'/%3e%3c/svg%3e")]
              indeterminate:bg-center indeterminate:bg-no-repeat

              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            {...props}
          />
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <label
                htmlFor={inputId}
                className={`
                  text-sm font-medium
                  ${disabled ? 'text-text-disabled cursor-not-allowed' : 'text-text-primary cursor-pointer'}
                `}
              >
                {label}
              </label>
            )}
            {description && (
              <span className="text-xs text-text-tertiary mt-0.5">
                {description}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';

/* =============================================================================
   Radio Component
   ============================================================================= */

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label text */
  label?: string;
  /** Helper/description text */
  description?: string;
  /** Error state */
  error?: boolean;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ label, description, error = false, className = '', id, disabled, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
      <div className={`flex items-start gap-3 ${className}`}>
        <div className="flex items-center h-5">
          <input
            ref={ref}
            type="radio"
            id={inputId}
            disabled={disabled}
            className={`
              appearance-none
              w-[18px] h-[18px]
              border-[1.5px]
              ${error ? 'border-error' : 'border-border'}
              rounded-full
              bg-surface
              cursor-pointer
              transition-all duration-150 ease-out

              hover:border-primary
              focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none

              checked:border-primary checked:border-[5px]

              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            {...props}
          />
        </div>
        {(label || description) && (
          <div className="flex flex-col">
            {label && (
              <label
                htmlFor={inputId}
                className={`
                  text-sm font-medium
                  ${disabled ? 'text-text-disabled cursor-not-allowed' : 'text-text-primary cursor-pointer'}
                `}
              >
                {label}
              </label>
            )}
            {description && (
              <span className="text-xs text-text-tertiary mt-0.5">
                {description}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }
);

Radio.displayName = 'Radio';

/* =============================================================================
   RadioGroup Component
   ============================================================================= */

export interface RadioGroupProps {
  /** Group name (required for radio functionality) */
  name: string;
  /** Currently selected value */
  value?: string;
  /** Callback when selection changes */
  onChange?: (value: string) => void;
  /** Label for the group */
  label?: string;
  /** Error message */
  error?: string;
  /** Layout direction */
  direction?: 'horizontal' | 'vertical';
  children: React.ReactNode;
  className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  value,
  onChange,
  label,
  error,
  direction = 'vertical',
  children,
  className = '',
}) => {
  const groupId = useId();

  return (
    <fieldset className={className} role="radiogroup" aria-labelledby={label ? `${groupId}-label` : undefined}>
      {label && (
        <legend id={`${groupId}-label`} className="text-sm font-medium text-text-primary mb-3">
          {label}
        </legend>
      )}
      <div className={`flex ${direction === 'vertical' ? 'flex-col gap-3' : 'flex-row gap-6 flex-wrap'}`}>
        {React.Children.map(children, (child) => {
          if (React.isValidElement<RadioProps>(child)) {
            return React.cloneElement(child, {
              name,
              checked: child.props.value === value,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                onChange?.(e.target.value);
                child.props.onChange?.(e);
              },
              error: !!error,
            });
          }
          return child;
        })}
      </div>
      {error && (
        <p className="text-xs text-error mt-2" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
};

/* =============================================================================
   Toggle/Switch Component
   ============================================================================= */

export interface ToggleProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Label text */
  label?: string;
  /** Helper/description text */
  description?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Label position */
  labelPosition?: 'left' | 'right';
}

const toggleSizeStyles = {
  sm: { track: 'w-8 h-4', thumb: 'w-3 h-3', translate: 'translate-x-4' },
  md: { track: 'w-11 h-6', thumb: 'w-5 h-5', translate: 'translate-x-5' },
  lg: { track: 'w-14 h-7', thumb: 'w-6 h-6', translate: 'translate-x-7' },
};

export const Toggle = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, description, size = 'md', labelPosition = 'right', className = '', id, disabled, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const styles = toggleSizeStyles[size];

    const toggle = (
      <div className="relative inline-flex flex-shrink-0">
        <input
          ref={ref}
          type="checkbox"
          id={inputId}
          disabled={disabled}
          className="peer sr-only"
          role="switch"
          {...props}
        />
        <span
          className={`
            ${styles.track}
            bg-neutral-300 dark:bg-neutral-600
            rounded-full
            cursor-pointer
            transition-colors duration-200 ease-out
            peer-checked:bg-primary
            peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2
            peer-disabled:opacity-50 peer-disabled:cursor-not-allowed
          `}
        />
        <span
          className={`
            ${styles.thumb}
            absolute top-0.5 left-0.5
            bg-white
            rounded-full
            shadow-sm
            transition-transform duration-200 ease-out
            peer-checked:${styles.translate}
          `}
        />
      </div>
    );

    if (!label && !description) {
      return <div className={className}>{toggle}</div>;
    }

    return (
      <div className={`flex items-start gap-3 ${labelPosition === 'left' ? 'flex-row-reverse justify-end' : ''} ${className}`}>
        {toggle}
        <div className="flex flex-col">
          {label && (
            <label
              htmlFor={inputId}
              className={`
                text-sm font-medium
                ${disabled ? 'text-text-disabled cursor-not-allowed' : 'text-text-primary cursor-pointer'}
              `}
            >
              {label}
            </label>
          )}
          {description && (
            <span className="text-xs text-text-tertiary mt-0.5">
              {description}
            </span>
          )}
        </div>
      </div>
    );
  }
);

Toggle.displayName = 'Toggle';

/* =============================================================================
   Select Component
   ============================================================================= */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Select options */
  options: SelectOption[];
  /** Label text */
  label?: string;
  /** Helper text */
  helperText?: string;
  /** Error message */
  error?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Size variant */
  selectSize?: 'sm' | 'md' | 'lg';
  /** Full width */
  fullWidth?: boolean;
}

const selectSizeStyles = {
  sm: 'py-1.5 px-2.5 text-xs min-h-[32px] pr-8',
  md: 'py-2.5 px-3 text-sm min-h-[40px] pr-10',
  lg: 'py-3 px-4 text-base min-h-[48px] pr-12',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      options,
      label,
      helperText,
      error,
      placeholder,
      selectSize = 'md',
      fullWidth = true,
      className = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id || generatedId;
    const hasError = !!error;

    return (
      <div className={`${fullWidth ? 'w-full' : ''} ${className}`}>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-text-primary mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            className={`
              appearance-none
              ${fullWidth ? 'w-full' : ''}
              ${selectSizeStyles[selectSize]}
              bg-surface
              text-text-primary
              border ${hasError ? 'border-error' : 'border-border'}
              rounded-input
              outline-none
              cursor-pointer
              transition-all duration-150 ease-out

              hover:border-border-hover
              focus:border-border-focus focus:ring-2 ${hasError ? 'focus:ring-error-100' : 'focus:ring-primary-100'}

              disabled:bg-background-alt disabled:text-text-disabled disabled:cursor-not-allowed
            `}
            aria-invalid={hasError}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={selectSize === 'sm' ? 14 : selectSize === 'lg' ? 20 : 16}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none"
          />
        </div>
        {(error || helperText) && (
          <p
            className={`mt-1 text-xs ${hasError ? 'text-error' : 'text-text-tertiary'}`}
            role={hasError ? 'alert' : undefined}
          >
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

/* =============================================================================
   Range Slider Component
   ============================================================================= */

export interface RangeSliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Label text */
  label?: string;
  /** Show value indicator */
  showValue?: boolean;
  /** Format value for display */
  formatValue?: (value: number) => string;
}

export const RangeSlider = forwardRef<HTMLInputElement, RangeSliderProps>(
  ({ label, showValue = true, formatValue, className = '', id, min = 0, max = 100, value, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    const displayValue = formatValue
      ? formatValue(Number(value))
      : String(value);

    const percentage = ((Number(value) - Number(min)) / (Number(max) - Number(min))) * 100;

    return (
      <div className={`${className}`}>
        {(label || showValue) && (
          <div className="flex justify-between items-center mb-2">
            {label && (
              <label htmlFor={inputId} className="text-sm font-medium text-text-primary">
                {label}
              </label>
            )}
            {showValue && (
              <span className="text-sm text-text-secondary">{displayValue}</span>
            )}
          </div>
        )}
        <div className="relative">
          <input
            ref={ref}
            type="range"
            id={inputId}
            min={min}
            max={max}
            value={value}
            className={`
              w-full h-2
              appearance-none
              bg-neutral-200 dark:bg-neutral-700
              rounded-full
              cursor-pointer
              outline-none

              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:h-5
              [&::-webkit-slider-thumb]:bg-primary
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:shadow-md
              [&::-webkit-slider-thumb]:cursor-pointer
              [&::-webkit-slider-thumb]:transition-transform
              [&::-webkit-slider-thumb]:duration-150
              [&::-webkit-slider-thumb]:hover:scale-110

              [&::-moz-range-thumb]:w-5
              [&::-moz-range-thumb]:h-5
              [&::-moz-range-thumb]:bg-primary
              [&::-moz-range-thumb]:border-none
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:shadow-md
              [&::-moz-range-thumb]:cursor-pointer

              focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2

              disabled:opacity-50 disabled:cursor-not-allowed
            `}
            style={{
              background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${percentage}%, var(--color-neutral-200) ${percentage}%, var(--color-neutral-200) 100%)`,
            }}
            {...props}
          />
        </div>
      </div>
    );
  }
);

RangeSlider.displayName = 'RangeSlider';

export default {
  Checkbox,
  Radio,
  RadioGroup,
  Toggle,
  Select,
  RangeSlider,
};
