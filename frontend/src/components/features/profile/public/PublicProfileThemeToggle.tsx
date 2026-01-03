import React from 'react';
import { Sun, Moon } from 'lucide-react';
import type { PublicProfileTheme } from '../../../../hooks/usePublicProfileTheme';

/* =============================================================================
   PublicProfileThemeToggle Component

   A floating theme toggle button for public profile pages.
   Displays sun icon in dark mode (click to switch to light)
   Displays moon icon in light mode (click to switch to dark)
   ============================================================================= */

interface PublicProfileThemeToggleProps {
  /** Current theme */
  theme: PublicProfileTheme;
  /** Callback when theme is toggled */
  onToggle: () => void;
  /** Additional CSS classes */
  className?: string;
}

export const PublicProfileThemeToggle: React.FC<PublicProfileThemeToggleProps> = ({
  theme,
  onToggle,
  className = '',
}) => {
  const isDark = theme === 'dark';
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`
        fixed top-4 right-4 z-50
        w-11 h-11 min-w-[44px] min-h-[44px]
        flex items-center justify-center
        rounded-full
        transition-all duration-300 ease-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
        active:scale-95
        
        /* Light mode styling */
        bg-white/80 hover:bg-white/95
        border border-white/40 hover:border-white/60
        shadow-lg hover:shadow-xl
        text-gray-700 hover:text-gray-900
        
        /* Dark mode styling */
        dark:bg-gray-900/80 dark:hover:bg-gray-900/95
        dark:border-white/10 dark:hover:border-white/20
        dark:shadow-[0_4px_14px_rgba(0,0,0,0.3)]
        dark:text-gray-300 dark:hover:text-white
        
        backdrop-blur-xl
        ${className}
      `}
      aria-label={label}
      title={label}
    >
      <span className="sr-only">{label}</span>
      
      {/* Icon with rotation animation */}
      <span 
        className={`
          transform transition-transform duration-300
          ${isDark ? 'rotate-0' : 'rotate-180'}
        `}
      >
        {isDark ? (
          <Sun 
            size={20} 
            className="text-yellow-400"
            aria-hidden="true"
          />
        ) : (
          <Moon 
            size={20} 
            className="text-gray-600 dark:text-gray-400"
            aria-hidden="true"
          />
        )}
      </span>
    </button>
  );
};

export default PublicProfileThemeToggle;
