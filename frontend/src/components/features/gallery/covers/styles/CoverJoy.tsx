/**
 * Joy Premium Cover - Celebratory joyful aesthetic
 *
 * Features:
 * - Vibrant multi-color gradient burst
 * - Rainbow-inspired color progression
 * - Playful confetti-like decorative elements
 * - Energetic, celebratory composition
 */

import React from 'react';
import { GalleryDesignConfig } from '../../../../../types/gallery-design';

interface CoverJoyProps {
  title?: string;
  subtitle?: string;
  coverImageUrl?: string;
  focalPoint: { x: number; y: number };
  overlayOpacity: number;
  config: GalleryDesignConfig;
}

export const CoverJoy = React.forwardRef<HTMLDivElement, CoverJoyProps>(
  ({ title = 'Gallery Title', subtitle = 'Celebrate Life', config }, ref) => {
    return (
      <div
        ref={ref}
        className="w-full h-full relative flex items-center justify-center overflow-hidden"
        style={{
          background: `conic-gradient(from 0deg, #FF6B6B, #FFA94D, #FFD93D, #6BCB77, #4D96FF, #9D5DFF, #FF6B6B)`,
        }}
      >
        {/* Radial gradient overlay for depth */}
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, transparent 0%, rgba(0, 0, 0, 0.2) 100%)`,
          }}
        />

        {/* Confetti elements */}
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full opacity-30"
            style={{
              width: `${Math.random() * 20 + 5}px`,
              height: `${Math.random() * 20 + 5}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              backgroundColor: ['#FF6B6B', '#FFA94D', '#FFD93D', '#6BCB77', '#4D96FF'][
                Math.floor(Math.random() * 5)
              ],
              animation: `float ${3 + Math.random() * 2}s ease-in-out infinite`,
            }}
          />
        ))}

        {/* Content */}
        {config.cover.titleVisible && (
          <div className="relative z-10 text-center px-12 max-w-2xl">
            {/* Decorative circles */}
            <div className="mb-6 flex justify-center gap-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="rounded-full"
                  style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: 'white',
                    opacity: 0.9,
                  }}
                />
              ))}
            </div>

            <h1
              className="text-6xl font-bold text-white mb-3"
              style={{
                fontFamily: 'var(--font-heading)',
                letterSpacing: 'var(--heading-letter-spacing)',
                lineHeight: `var(--heading-line-height)`,
                textShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              }}
            >
              {title}
            </h1>

            {subtitle && (
              <p
                className="text-white/90 text-lg"
                style={{
                  fontFamily: 'var(--font-body)',
                  letterSpacing: 'var(--body-letter-spacing)',
                  lineHeight: `var(--body-line-height)`,
                }}
              >
                {subtitle}
              </p>
            )}

            {/* Festive bottom decoration */}
            <div className="mt-6 flex justify-center gap-2">
              {['🎉', '✨', '🎊'].map((emoji, i) => (
                <span key={i} style={{ fontSize: '24px' }}>
                  {emoji}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Floating animation */}
        <style>{`
          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-20px) rotate(180deg); }
          }
        `}</style>
      </div>
    );
  }
);

CoverJoy.displayName = 'CoverJoy';
export default CoverJoy;
