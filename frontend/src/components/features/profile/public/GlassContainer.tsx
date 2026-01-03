import React, { ReactNode } from 'react';

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
      className={`relative w-full min-h-screen overflow-x-hidden ${className}`}
      style={{
        background: themeGradient || 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'
      }}
    >
      {/* Animated Background Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div 
          className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-blob"
          style={{ backgroundColor: 'var(--theme-primary, #60A5FA)' }}
        />
        <div 
          className="absolute top-[-10%] right-[-10%] w-[50vw] h-[50vw] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-blob animation-delay-2000"
          style={{ backgroundColor: 'var(--theme-accent, #22D3EE)' }}
        />
        <div 
          className="absolute bottom-[-10%] left-[20%] w-[50vw] h-[50vw] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 animate-blob animation-delay-4000"
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
      `}</style>
    </div>
  );
};
