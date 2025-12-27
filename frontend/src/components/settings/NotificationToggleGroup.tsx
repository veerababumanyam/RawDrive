import React from 'react';
import { Check, X } from 'lucide-react';
import type { NotificationChannelPrefs } from '../../types/userSettings';

/* =============================================================================
   NotificationToggleGroup Component

   A group of notification category toggles for a single channel (email/in-app).
   Displays each notification category with a toggle switch and description.
   ============================================================================= */

export interface NotificationCategory {
  key: keyof NotificationChannelPrefs;
  label: string;
  description: string;
}

interface NotificationToggleGroupProps {
  /** Channel identifier (email, in_app) */
  channel: string;
  /** Channel display title */
  title: string;
  /** Channel description */
  description: string;
  /** Icon to display in header */
  icon: React.ReactNode;
  /** Notification categories to display */
  categories: NotificationCategory[];
  /** Current values for each category */
  values: NotificationChannelPrefs;
  /** Callback when a toggle changes */
  onChange: (channel: string, category: string, value: boolean) => void;
  /** Whether toggles are disabled (loading state) */
  disabled?: boolean;
  /** Categories currently being updated (for optimistic UI) */
  pendingCategories?: string[];
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

export const NotificationToggleGroup: React.FC<NotificationToggleGroupProps> = ({
  channel,
  title,
  description,
  icon,
  categories,
  values,
  onChange,
  disabled = false,
  pendingCategories = [],
}) => {
  return (
    <div className="bg-surface rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface-hover/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
          <div>
            <h3 className="font-medium text-text-primary">{title}</h3>
            <p className="text-sm text-text-secondary">{description}</p>
          </div>
        </div>
      </div>

      {/* Category toggles */}
      <div className="divide-y divide-border">
        {categories.map((category) => {
          const isChecked = values[category.key] ?? true;
          const isPending = pendingCategories.includes(`${channel}:${category.key}`);

          return (
            <div
              key={category.key}
              className="flex items-center justify-between p-4 hover:bg-surface-hover/30 transition-colors"
            >
              <div className="flex-1 min-w-0 pr-4">
                <h4 className="font-medium text-text-primary">{category.label}</h4>
                <p className="text-sm text-text-secondary mt-0.5">{category.description}</p>
              </div>
              <Toggle
                checked={isChecked}
                onChange={() => onChange(channel, category.key, !isChecked)}
                disabled={disabled}
                isPending={isPending}
                label={`${isChecked ? 'Disable' : 'Enable'} ${category.label.toLowerCase()} notifications via ${title.toLowerCase()}`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationToggleGroup;
