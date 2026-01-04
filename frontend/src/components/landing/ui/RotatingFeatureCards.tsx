import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

/* =============================================================================
   RotatingFeatureCards Component

   Auto-rotating feature showcase cards for the hero section.
   Displays top features with smooth transitions and glassmorphism styling.
   
   Features:
   - Auto-rotation with configurable interval (default 4s)
   - Pause on hover for better UX
   - Progress indicator dots for navigation
   - Smooth fade and slide animations
   - Full light/dark theme support
   - Glassmorphism design matching existing UI
   ============================================================================= */

export interface RotatingFeature {
  /** Lucide icon component */
  icon: LucideIcon;
  /** Feature title */
  title: string;
  /** Short compelling description */
  description: string;
  /** Gradient color classes (from-X to-Y) */
  gradient: string;
  /** Optional stat badge */
  stat?: string;
  /** Optional subheadline for hero sync */
  subheadline?: string;
  /** Optional headline text for hero sync (e.g., "Gallery OS") */
  headlineText?: string;
}

interface RotatingFeatureCardsProps {
  /** Array of features to rotate through */
  features: RotatingFeature[];
  /** Rotation interval in milliseconds */
  interval?: number;
  /** Custom class name */
  className?: string;
  /** Callback when feature changes */
  onFeatureChange?: (index: number) => void;
}

// Animation variants for card transitions
const cardVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
    scale: 0.95,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1],
    },
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 60 : -60,
    opacity: 0,
    scale: 0.95,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  }),
};

// Progress bar animation
const progressVariants = {
  initial: { scaleX: 0 },
  animate: (duration: number) => ({
    scaleX: 1,
    transition: {
      duration: duration / 1000,
      ease: 'linear',
    },
  }),
};

export const RotatingFeatureCards: React.FC<RotatingFeatureCardsProps> = ({
  features,
  interval = 4000,
  className = '',
  onFeatureChange,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [progressKey, setProgressKey] = useState(0);

  // Navigate to next feature
  const goToNext = useCallback(() => {
    setDirection(1);
    const nextIndex = (currentIndex + 1) % features.length;
    setCurrentIndex(nextIndex);
    setProgressKey((prev) => prev + 1);
    onFeatureChange?.(nextIndex);
  }, [features.length, currentIndex, onFeatureChange]);

  // Navigate to specific feature
  const goToFeature = useCallback((index: number) => {
    if (index === currentIndex) return;
    setDirection(index > currentIndex ? 1 : -1);
    setCurrentIndex(index);
    setProgressKey((prev) => prev + 1);
    onFeatureChange?.(index);
  }, [currentIndex, onFeatureChange]);

  // Auto-rotation effect
  useEffect(() => {
    if (isPaused || features.length <= 1) return;

    const timer = setInterval(goToNext, interval);
    return () => clearInterval(timer);
  }, [isPaused, interval, goToNext, features.length]);

  // Guard against empty features array
  if (!features || features.length === 0) return null;

  const currentFeature = features[currentIndex];
  const Icon = currentFeature.icon;

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      role="region"
      aria-label="Feature showcase"
      aria-roledescription="carousel"
    >
      {/* Feature Card */}
      <div className="relative overflow-hidden rounded-2xl">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={cardVariants}
            initial="enter"
            animate="center"
            exit="exit"
            className="
              relative p-5
              bg-gradient-to-br from-white/10 to-white/5
              backdrop-blur-xl
              border border-white/15
              rounded-2xl
              shadow-[0_8px_32px_rgba(0,0,0,0.12)]
            "
            role="group"
            aria-roledescription="slide"
            aria-label={`${currentIndex + 1} of ${features.length}: ${currentFeature.title}`}
          >
            {/* Glow Effect */}
            <div
              className={`
                absolute -inset-1 opacity-20 blur-2xl rounded-2xl
                bg-gradient-to-br ${currentFeature.gradient}
              `}
              aria-hidden="true"
            />

            {/* Content */}
            <div className="relative z-10 flex items-start gap-4">
              {/* Icon */}
              <div
                className={`
                  flex-shrink-0 w-12 h-12 rounded-xl
                  bg-gradient-to-br ${currentFeature.gradient}
                  flex items-center justify-center
                  shadow-lg
                `}
              >
                <Icon className="w-6 h-6 text-white" aria-hidden="true" />
              </div>

              {/* Text Content */}
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold text-base leading-tight mb-1 line-clamp-1">
                  {currentFeature.title}
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed line-clamp-2">
                  {currentFeature.description}
                </p>

                {/* Stat Badge */}
                {currentFeature.stat && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/10 border border-white/15">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs text-slate-200 font-medium">
                      {currentFeature.stat}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            {!isPaused && (
              <motion.div
                key={progressKey}
                variants={progressVariants}
                initial="initial"
                animate="animate"
                custom={interval}
                className={`
                  absolute bottom-0 left-0 right-0 h-0.5
                  bg-gradient-to-r ${currentFeature.gradient}
                  origin-left
                `}
                aria-hidden="true"
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation Dots */}
      <div
        className="flex items-center justify-center gap-2 mt-4"
        role="tablist"
        aria-label="Feature navigation"
      >
        {features.map((feature, index) => (
          <button
            key={feature.title}
            type="button"
            onClick={() => goToFeature(index)}
            className={`
              relative w-2 h-2 rounded-full transition-all duration-300
              focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
              ${index === currentIndex
                ? 'bg-cyan-400 scale-125 shadow-[0_0_8px_rgba(34,211,238,0.5)]'
                : 'bg-white/30 hover:bg-white/50'
              }
            `}
            role="tab"
            aria-selected={index === currentIndex}
            aria-label={`Go to ${feature.title}`}
            tabIndex={index === currentIndex ? 0 : -1}
          />
        ))}
      </div>

      {/* Screen reader announcement for current slide */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Showing feature {currentIndex + 1} of {features.length}: {currentFeature.title}
      </div>
    </div>
  );
};

RotatingFeatureCards.displayName = 'RotatingFeatureCards';

export default RotatingFeatureCards;
