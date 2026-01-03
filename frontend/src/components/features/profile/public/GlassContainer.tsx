import React, { ReactNode } from 'react';

/* =============================================================================
   GlassContainer Component

   Container for public profile pages with animated gradient background orbs.
   Supports both light and dark themes.
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
        bg-gradient-to-br from-blue-50 via-cyan-50 to-white
        dark:from-gray-950 dark:via-gray-900 dark:to-gray-950
        transition-colors duration-500
        ${className}
      `}
      style={themeGradient ? { background: themeGradient } : undefined}
    >
      {/* Animated Background Orbs - Theme aware */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        {/* Primary orb */}
        <div 
          className="
            absolute top-[-10%] left-[-10%] 
            w-[40vw] h-[40vw] sm:w-[50vw] sm:h-[50vw]
            rounded-full filter blur-[60px] sm:blur-[80px]
            animate-blob motion-reduce:animate-none
            mix-blend-multiply dark:mix-blend-screen
            opacity-60 dark:opacity-30
          "
          style={{ backgroundColor: 'var(--theme-primary, #60A5FA)' }}
        />
        {/* Accent orb */}
        <div 
          className="
            absolute top-[-10%] right-[-10%] 
            w-[40vw] h-[40vw] sm:w-[50vw] sm:h-[50vw]
            rounded-full filter blur-[60px] sm:blur-[80px]
            animate-blob animation-delay-2000 motion-reduce:animate-none
            mix-blend-multiply dark:mix-blend-screen
            opacity-60 dark:opacity-30
          "
          style={{ backgroundColor: 'var(--theme-accent, #22D3EE)' }}
        />
        {/* Secondary orb */}
        <div 
          className="
            absolute bottom-[-10%] left-[20%] 
            w-[40vw] h-[40vw] sm:w-[50vw] sm:h-[50vw]
            rounded-full filter blur-[60px] sm:blur-[80px]
            animate-blob animation-delay-4000 motion-reduce:animate-none
            mix-blend-multiply dark:mix-blend-screen
            opacity-60 dark:opacity-30
          "
          style={{ backgroundColor: 'var(--theme-secondary, #94A3B8)' }}
        />
      </div>

      {/* Glass Layer */}
      <div className="relative z-10 w-full min-h-screen backdrop-blur-[2px]">
        {children}
      </div>

      <style>{`
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-blob {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
};
