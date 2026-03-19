import React, { useMemo, type ReactNode } from 'react';
import { motion } from 'framer-motion';

interface ParticleBackgroundProps {
  children: ReactNode;
  className?: string;
  particleCount?: number;
}

interface Particle {
  id: number;
  x: string;
  y: string;
  size: number;
  duration: number;
  delay: number;
}

function generateParticles(count: number): Particle[] {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      id: i,
      x: `${Math.random() * 100}%`,
      y: `${Math.random() * 100}%`,
      size: 4 + Math.random() * 4, // 4-8px
      duration: 8 + Math.random() * 7, // 8-15s
      delay: Math.random() * 5,
    });
  }
  return particles;
}

/**
 * Floating particle animation using Framer Motion.
 * Renders 15-20 translucent circles that drift continuously.
 */
export const ParticleBackground: React.FC<ParticleBackgroundProps> = ({
  children,
  className = '',
  particleCount = 18,
}) => {
  const particles = useMemo(() => generateParticles(particleCount), [particleCount]);

  return (
    <div className={`relative w-full min-h-screen overflow-hidden ${className}`}>
      {/* Particle layer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              backgroundColor: 'var(--theme-accent)',
            }}
            animate={{
              y: [0, -30, 0],
              x: [0, 15, 0],
              opacity: [0.3, 0.7, 0.3],
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full min-h-screen">
        {children}
      </div>
    </div>
  );
};
