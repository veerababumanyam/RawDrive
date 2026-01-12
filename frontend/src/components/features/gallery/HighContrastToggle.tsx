/**
 * HighContrastToggle - Accessibility toggle for WCAG AAA high contrast mode
 *
 * Features:
 * - Single-click toggle with visual feedback
 * - Persistent preference via localStorage
 * - Screen reader announcements
 * - Respects system preference as default
 *
 * Feature: 027-gallery-feature-completion
 * User Story: US3 - High Contrast Mode
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import { useHighContrast } from '@/hooks/useHighContrast';

interface HighContrastToggleProps {
  /** Optional className for styling */
  className?: string;
  /** Whether to show label text (default: true) */
  showLabel?: boolean;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Toggle button for high contrast accessibility mode
 */
export function HighContrastToggle({
  className = '',
  showLabel = true,
  size = 'md',
}: HighContrastToggleProps) {
  const { t } = useTranslation('gallery');
  const { isHighContrast, toggleHighContrast } = useHighContrast();

  const handleClick = useCallback(() => {
    toggleHighContrast();

    // Announce change to screen readers
    const message = isHighContrast
      ? t('accessibility.highContrastDisabled', 'High contrast mode disabled')
      : t('accessibility.highContrastEnabled', 'High contrast mode enabled');

    // Create and announce via live region
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    document.body.appendChild(announcement);

    // Remove after announcement
    setTimeout(() => announcement.remove(), 1000);
  }, [isHighContrast, toggleHighContrast, t]);

  const sizeClasses = {
    sm: 'p-1.5 text-sm',
    md: 'p-2 text-base',
    lg: 'p-3 text-lg',
  };

  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`
        inline-flex items-center gap-2 rounded-lg font-medium transition-all
        ${sizeClasses[size]}
        ${
          isHighContrast
            ? 'bg-white text-black border-2 border-black hover:bg-yellow-300'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600'
        }
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500
        ${className}
      `}
      aria-pressed={isHighContrast}
      aria-label={
        isHighContrast
          ? t('accessibility.disableHighContrast', 'Disable high contrast mode')
          : t('accessibility.enableHighContrast', 'Enable high contrast mode')
      }
      title={
        isHighContrast
          ? t('accessibility.disableHighContrast', 'Disable high contrast mode')
          : t('accessibility.enableHighContrast', 'Enable high contrast mode')
      }
    >
      {isHighContrast ? (
        <EyeOff className={iconSizes[size]} aria-hidden="true" />
      ) : (
        <Eye className={iconSizes[size]} aria-hidden="true" />
      )}
      {showLabel && (
        <span className="hidden sm:inline">
          {isHighContrast
            ? t('accessibility.highContrastOn', 'High Contrast On')
            : t('accessibility.highContrast', 'High Contrast')}
        </span>
      )}
    </button>
  );
}

export default HighContrastToggle;
