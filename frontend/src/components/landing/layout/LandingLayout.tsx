import React from 'react';
import { motion } from 'framer-motion';
import '../../../styles/landing.css';

/* =============================================================================
   LandingLayout Component

   Wrapper component for all public/landing pages.
   Provides the gradient background and decorative elements.
   ============================================================================= */

interface LandingLayoutProps {
  /** Page content */
  children: React.ReactNode;
  /** Custom class name */
  className?: string;
  /** Show decorative background orbs */
  showOrbs?: boolean;
  /** Show background grid */
  showGrid?: boolean;
}

export const LandingLayout: React.FC<LandingLayoutProps> = ({
  children,
  className = '',
  showOrbs = true,
  showGrid = true,
}) => {
  return (
    <div className={`landing-page min-h-screen relative overflow-hidden ${className}`}>
      {/* Background grid pattern */}
      {showGrid && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
            `,
            backgroundSize: '64px 64px',
          }}
          aria-hidden="true"
        />
      )}

      {/* Decorative gradient orbs */}
      {showOrbs && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {/* Blue orb - top left */}
          <motion.div
            className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Cyan orb - top right */}
          <motion.div
            className="absolute -top-20 right-0 w-[400px] h-[400px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(6, 182, 212, 0.12) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 1,
            }}
          />

          {/* Gold orb - bottom left */}
          <motion.div
            className="absolute bottom-40 -left-20 w-[300px] h-[300px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(212, 175, 55, 0.1) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.15, 0.25, 0.15],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: 2,
            }}
          />

          {/* Blue orb - center right */}
          <motion.div
            className="absolute top-1/2 -right-20 w-[350px] h-[350px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
              filter: 'blur(60px)',
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.2, 0.35, 0.2],
            }}
            transition={{
              duration: 15,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Accent orb - bottom right */}
          <motion.div
            className="absolute -bottom-20 right-1/4 w-[400px] h-[400px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)',
              filter: 'blur(80px)',
            }}
            animate={{
              scale: [1, 1.1, 1],
              x: [0, 20, 0],
            }}
            transition={{
              duration: 18,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        </div>
      )}

      {/* Main content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

LandingLayout.displayName = 'LandingLayout';

export default LandingLayout;
