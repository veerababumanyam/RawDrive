import React, { ReactNode } from 'react';

/* =============================================================================
   GlassContainer Component

   Container for public profile pages with animated gradient background orbs.
   Supports both light and dark themes with backdrop-filter fallbacks.

   Feature: 021-public-profile-mobile-responsive-theme
   ============================================================================= */

interface GlassContainerProps {
  children: ReactNode;
  className?: string;
  themeGradient?: string;
}

export const GlassContainer: React.FC<GlassContainerProps> = ({
  children,
  className = '',
  themeGradient
}) => {
  return (
    <div
      className={`
        relative w-full min-h-screen overflow-x-hidden
        bg-gradient-to-br from-slate-50 via-blue-50/50 to-cyan-50/30
        dark:from-gray-950 dark:via-slate-900 dark:to-gray-900
        transition-colors duration-300
        ${className}
      `}
      style={themeGradient ? { background: themeGradient } : undefined}
    >
      {/* Animated Background Orbs - Theme aware with mobile optimization */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
        {/* Primary orb - Reduced size on mobile for performance */}
        <div
          className="
            absolute -top-[15%] -left-[15%]
            w-[60vw] h-[60vw]
            sm:w-[50vw] sm:h-[50vw]
            lg:w-[40vw] lg:h-[40vw]
            rounded-full
            blur-[60px] sm:blur-[80px] lg:blur-[100px]
            animate-blob motion-reduce:animate-none
            mix-blend-multiply dark:mix-blend-screen
            opacity-50 dark:opacity-20
            will-change-transform
          "
          style={{ backgroundColor: 'var(--theme-primary, #60A5FA)' }}
        />
        {/* Accent orb */}
        <div
          className="
            absolute -top-[10%] -right-[15%]
            w-[55vw] h-[55vw]
            sm:w-[45vw] sm:h-[45vw]
            lg:w-[35vw] lg:h-[35vw]
            rounded-full
            blur-[60px] sm:blur-[80px] lg:blur-[100px]
            animate-blob animation-delay-2000 motion-reduce:animate-none
            mix-blend-multiply dark:mix-blend-screen
            opacity-50 dark:opacity-20
            will-change-transform
          "
          style={{ backgroundColor: 'var(--theme-accent, #22D3EE)' }}
        />
        {/* Secondary orb */}
        <div
          className="
            absolute -bottom-[20%] left-[10%]
            w-[50vw] h-[50vw]
            sm:w-[40vw] sm:h-[40vw]
            lg:w-[35vw] lg:h-[35vw]
            rounded-full
            blur-[60px] sm:blur-[80px] lg:blur-[100px]
            animate-blob animation-delay-4000 motion-reduce:animate-none
            mix-blend-multiply dark:mix-blend-screen
            opacity-40 dark:opacity-15
            will-change-transform
          "
          style={{ backgroundColor: 'var(--theme-secondary, #A78BFA)' }}
        />
        {/* Subtle bottom-right accent */}
        <div
          className="
            hidden sm:block
            absolute -bottom-[10%] -right-[10%]
            w-[30vw] h-[30vw]
            rounded-full
            blur-[80px]
            animate-blob animation-delay-4000 motion-reduce:animate-none
            mix-blend-multiply dark:mix-blend-screen
            opacity-30 dark:opacity-10
            will-change-transform
          "
          style={{ backgroundColor: 'var(--theme-primary, #60A5FA)' }}
        />
      </div>

      {/* Glass Overlay Layer - subtle blur for depth */}
      <div className="relative z-10 w-full min-h-screen">
        {children}
      </div>

      <style>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          25% {
            transform: translate(20px, -30px) scale(1.05);
          }
          50% {
            transform: translate(-15px, 15px) scale(0.95);
          }
          75% {
            transform: translate(10px, 20px) scale(1.02);
          }
        }
        .animate-blob {
          animation: blob 12s ease-in-out infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-blob {
            animation: none !important;
          }
        }
        /* GPU acceleration hint */
        .will-change-transform {
          will-change: transform;
        }
      `}</style>
    </div>
  );
};
