import React, { type ReactNode } from 'react';

interface WaveBackgroundProps {
  children: ReactNode;
  className?: string;
}

/**
 * SVG-based wave animation at the bottom of the container.
 * Two overlapping sinusoidal paths with CSS translateX animation.
 */
export const WaveBackground: React.FC<WaveBackgroundProps> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`relative w-full min-h-screen overflow-hidden ${className}`}>
      {/* Wave layer */}
      <div className="absolute bottom-0 left-0 right-0 h-[30vh] pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        <svg
          className="absolute bottom-0 w-[200%] h-full wave-primary"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0,224L48,213.3C96,203,192,181,288,186.7C384,192,480,224,576,234.7C672,245,768,235,864,208C960,181,1056,139,1152,138.7C1248,139,1344,181,1392,202.7L1440,224L1440,320L0,320Z"
            style={{ fill: 'var(--theme-primary)', opacity: 0.2 }}
          />
        </svg>
        <svg
          className="absolute bottom-0 w-[200%] h-full wave-accent"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0,288L48,272C96,256,192,224,288,213.3C384,203,480,213,576,229.3C672,245,768,267,864,261.3C960,256,1056,224,1152,208C1248,192,1344,192,1392,192L1440,192L1440,320L0,320Z"
            style={{ fill: 'var(--theme-accent)', opacity: 0.25 }}
          />
        </svg>
        <svg
          className="absolute bottom-0 w-[200%] h-full wave-tertiary"
          viewBox="0 0 1440 320"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0,256L48,261.3C96,267,192,277,288,272C384,267,480,245,576,240C672,235,768,245,864,250.7C960,256,1056,256,1152,240C1248,224,1344,192,1392,176L1440,160L1440,320L0,320Z"
            style={{ fill: 'var(--theme-primary)', opacity: 0.15 }}
          />
        </svg>
      </div>

      <div className="relative z-10 w-full min-h-screen">
        {children}
      </div>

      <style>{`
        @keyframes wave-shift {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .wave-primary {
          animation: wave-shift 12s linear infinite;
        }
        .wave-accent {
          animation: wave-shift 16s linear infinite reverse;
        }
        .wave-tertiary {
          animation: wave-shift 20s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .wave-primary, .wave-accent, .wave-tertiary {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
};
