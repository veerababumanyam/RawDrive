import React, { type ReactNode } from 'react';

interface GradientShiftBackgroundProps {
  children: ReactNode;
  className?: string;
}

/**
 * Pure-CSS animated gradient background using background-position keyframes.
 * Reads --theme-primary and --theme-accent CSS custom properties.
 */
export const GradientShiftBackground: React.FC<GradientShiftBackgroundProps> = ({
  children,
  className = '',
}) => {
  return (
    <div
      className={`relative w-full min-h-screen overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(-45deg, var(--theme-primary), var(--theme-accent), var(--theme-primary), var(--theme-accent))',
        backgroundSize: '400% 400%',
        animation: 'gradient-shift 15s ease infinite',
        willChange: 'background-position',
      }}
    >
      <div className="relative z-10 w-full min-h-screen">
        {children}
      </div>

      <style>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
};
