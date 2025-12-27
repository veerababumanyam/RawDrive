import React from 'react';
import { Check, X } from 'lucide-react';

/* =============================================================================
   PrivacyToggle Component

   A toggle switch for privacy settings with label, description, and status.
   Supports pending state for optimistic updates.
   ============================================================================= */

interface PrivacyToggleProps {
  /** Setting label */
  label: string;
  /** Setting description */
  description: string;
  /** Icon to display */
  icon: React.ReactNode;
  /** Current value */
  checked: boolean;
  /** Change handler */
  onChange: (value: boolean) => void;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Whether the toggle is in pending state (optimistic update) */
  isPending?: boolean;
}

const Toggle: React.FC<{
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  isPending?: boolean;
  label: string;
}> = ({ checked, onChange, disabled, isPending, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    onClick={onChange}
    disabled={disabled}
    className={`
      relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full
      border-2 border-transparent transition-colors duration-200 ease-in-out
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2
      disabled:cursor-not-allowed disabled:opacity-50
      ${checked ? 'bg-primary' : 'bg-border'}
      ${isPending ? 'animate-pulse' : ''}
    `}
  >
    <span
      className={`
        pointer-events-none inline-block h-5 w-5 transform rounded-full
        bg-white shadow ring-0 transition duration-200 ease-in-out
        ${checked ? 'translate-x-5' : 'translate-x-0'}
      `}
    >
      <span
        className={`
          absolute inset-0 flex items-center justify-center transition-opacity
          ${checked ? 'opacity-0' : 'opacity-100'}
        `}
      >
        <X className="w-3 h-3 text-text-tertiary" />
      </span>
      <span
        className={`
          absolute inset-0 flex items-center justify-center transition-opacity
          ${checked ? 'opacity-100' : 'opacity-0'}
        `}
      >
        <Check className="w-3 h-3 text-primary" />
      </span>
    </span>
  </button>
);

export const PrivacyToggle: React.FC<PrivacyToggleProps> = ({
  label,
  description,
  icon,
  checked,
  onChange,
  disabled = false,
  isPending = false,
}) => {
  return (
    <div className="flex items-start justify-between p-4 bg-surface rounded-xl border border-border hover:border-border-focus transition-colors">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-text-primary">{label}</h4>
          <p className="text-sm text-text-secondary mt-0.5">{description}</p>
        </div>
      </div>
      <Toggle
        checked={checked}
        onChange={() => onChange(!checked)}
        disabled={disabled}
        isPending={isPending}
        label={`${checked ? 'Disable' : 'Enable'} ${label.toLowerCase()}`}
      />
    </div>
  );
};

export default PrivacyToggle;
