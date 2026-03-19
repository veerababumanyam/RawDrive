import React, { type ReactNode } from 'react';

interface AuroraBackgroundProps {
  children: ReactNode;
  className?: string;
}

/**
 * Aurora-style animated background with 3 large gradient blur orbs
 * on slow, wide-range translate animations (20-30s cycles).
 */
export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`relative w-full min-h-screen overflow-hidden ${className}`}>
      {/* Aurora orbs layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
        <div
          className="aurora-orb aurora-orb-1 absolute w-[70vw] h-[70vw] rounded-full blur-[100px] opacity-30 mix-blend-multiply dark:mix-blend-screen"
          style={{
            top: '-20%',
            left: '-10%',
            backgroundColor: 'var(--theme-primary)',
          }}
        />
        <div
          className="aurora-orb aurora-orb-2 absolute w-[60vw] h-[60vw] rounded-full blur-[100px] opacity-25 mix-blend-multiply dark:mix-blend-screen"
          style={{
            top: '10%',
            right: '-15%',
            backgroundColor: 'var(--theme-accent)',
          }}
        />
        <div
          className="aurora-orb aurora-orb-3 absolute w-[50vw] h-[50vw] rounded-full blur-[100px] opacity-20 mix-blend-multiply dark:mix-blend-screen"
          style={{
            bottom: '-15%',
            left: '20%',
            backgroundColor: 'var(--theme-primary)',
          }}
        />
      </div>

      <div className="relative z-10 w-full min-h-screen">
        {children}
      </div>

      <style>{`
        @keyframes aurora-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(60px, -40px) scale(1.05); }
          50% { transform: translate(-40px, 50px) scale(0.95); }
          75% { transform: translate(80px, 30px) scale(1.02); }
        }
        @keyframes aurora-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(-70px, 40px) scale(1.08); }
          66% { transform: translate(50px, -60px) scale(0.92); }
        }
        @keyframes aurora-3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25% { transform: translate(-50px, -30px) scale(1.06); }
          50% { transform: translate(100px, 20px) scale(0.94); }
          75% { transform: translate(-30px, 60px) scale(1.03); }
        }
        .aurora-orb-1 {
          animation: aurora-1 25s ease-in-out infinite;
          will-change: transform;
        }
        .aurora-orb-2 {
          animation: aurora-2 30s ease-in-out infinite;
          will-change: transform;
        }
        .aurora-orb-3 {
          animation: aurora-3 20s ease-in-out infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .aurora-orb { animation: none !important; }
        }
      `}</style>
    </div>
  );
};
