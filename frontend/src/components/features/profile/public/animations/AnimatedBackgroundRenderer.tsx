import React, { type ReactNode } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { ThemeTokens } from '../../shared/UnifiedThemeEngine';
import { GradientShiftBackground } from './GradientShiftBackground';
import { ParticleBackground } from './ParticleBackground';
import { WaveBackground } from './WaveBackground';
import { AuroraBackground } from './AuroraBackground';
import { GlassContainer } from '../GlassContainer';

export type AnimationType = 'gradient-shift' | 'particles' | 'wave' | 'aurora' | 'none';

interface AnimatedBackgroundRendererProps {
  animationType?: AnimationType;
  themeTokens: ThemeTokens;
  children: ReactNode;
}

/**
 * Dispatches the correct animated background component based on theme animation_type.
 * Falls back to a static gradient when prefers-reduced-motion is active.
 * Renders GlassContainer (orb animation) for 'none' or undefined.
 */
export const AnimatedBackgroundRenderer: React.FC<AnimatedBackgroundRendererProps> = ({
  animationType,
  themeTokens,
  children,
}) => {
  const prefersReducedMotion = useReducedMotion();

  // Static fallback for reduced motion
  if (prefersReducedMotion) {
    return (
      <div
        className="relative w-full min-h-screen"
        style={{ background: themeTokens['--theme-gradient'] }}
      >
        {children}
      </div>
    );
  }

  switch (animationType) {
    case 'gradient-shift':
      return <GradientShiftBackground>{children}</GradientShiftBackground>;
    case 'particles':
      return <ParticleBackground>{children}</ParticleBackground>;
    case 'wave':
      return <WaveBackground>{children}</WaveBackground>;
    case 'aurora':
      return <AuroraBackground>{children}</AuroraBackground>;
    case 'none':
    default:
      return <GlassContainer>{children}</GlassContainer>;
  }
};
