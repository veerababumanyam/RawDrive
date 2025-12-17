/* =============================================================================
   Animation Presets for Framer Motion

   Centralized animation configurations for the landing page.
   These provide consistent, reusable animations across components.
   ============================================================================= */

import type { Variants, Transition } from 'framer-motion';

/* =============================================================================
   TRANSITIONS
   ============================================================================= */

export const transitions = {
  /** Fast transition for micro-interactions */
  fast: {
    duration: 0.15,
    ease: 'easeOut',
  } as Transition,

  /** Default transition */
  default: {
    duration: 0.3,
    ease: 'easeOut',
  } as Transition,

  /** Smooth transition for larger elements */
  smooth: {
    duration: 0.5,
    ease: [0.4, 0, 0.2, 1],
  } as Transition,

  /** Spring transition for bouncy effects */
  spring: {
    type: 'spring',
    stiffness: 400,
    damping: 17,
  } as Transition,

  /** Soft spring for smoother animations */
  springSmooth: {
    type: 'spring',
    stiffness: 300,
    damping: 25,
  } as Transition,

  /** Bounce transition */
  bounce: {
    type: 'spring',
    stiffness: 500,
    damping: 15,
  } as Transition,
};

/* =============================================================================
   FADE ANIMATIONS
   ============================================================================= */

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: transitions.default,
  },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.smooth,
  },
};

export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.smooth,
  },
};

export const fadeInLeft: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: transitions.smooth,
  },
};

export const fadeInRight: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: transitions.smooth,
  },
};

/* =============================================================================
   SCALE ANIMATIONS
   ============================================================================= */

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transitions.spring,
  },
};

export const scaleInBounce: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transitions.bounce,
  },
};

/* =============================================================================
   SLIDE ANIMATIONS
   ============================================================================= */

export const slideUp: Variants = {
  hidden: { y: '100%', opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: transitions.smooth,
  },
};

export const slideDown: Variants = {
  hidden: { y: '-100%', opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: transitions.smooth,
  },
};

export const slideInLeft: Variants = {
  hidden: { x: '-100%', opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: transitions.smooth,
  },
};

export const slideInRight: Variants = {
  hidden: { x: '100%', opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: transitions.smooth,
  },
};

/* =============================================================================
   STAGGER ANIMATIONS
   ============================================================================= */

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

export const staggerContainerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.05,
    },
  },
};

export const staggerContainerSlow: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: transitions.smooth,
  },
};

export const staggerItemScale: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: transitions.spring,
  },
};

/* =============================================================================
   HOVER ANIMATIONS
   ============================================================================= */

export const hoverScale = {
  scale: 1.02,
  transition: transitions.spring,
};

export const hoverScaleLarge = {
  scale: 1.05,
  transition: transitions.spring,
};

export const hoverLift = {
  y: -4,
  transition: transitions.spring,
};

export const hoverGlow = {
  boxShadow: '0 0 30px rgba(59, 130, 246, 0.4)',
  transition: transitions.default,
};

export const tapScale = {
  scale: 0.98,
};

/* =============================================================================
   SPECIAL ANIMATIONS
   ============================================================================= */

export const floatAnimation: Variants = {
  animate: {
    y: [0, -10, 0],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

export const floatAnimationDelayed: Variants = {
  animate: {
    y: [0, -10, 0],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut',
      delay: 1.5,
    },
  },
};

export const pulseGlow: Variants = {
  animate: {
    boxShadow: [
      '0 0 0 0 rgba(59, 130, 246, 0)',
      '0 0 20px 4px rgba(59, 130, 246, 0.4)',
      '0 0 0 0 rgba(59, 130, 246, 0)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

export const shimmer: Variants = {
  animate: {
    backgroundPosition: ['200% 0', '-200% 0'],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'linear',
    },
  },
};

export const rotateIn: Variants = {
  hidden: { opacity: 0, rotate: -10, scale: 0.9 },
  visible: {
    opacity: 1,
    rotate: 0,
    scale: 1,
    transition: transitions.spring,
  },
};

/* =============================================================================
   PAGE TRANSITIONS
   ============================================================================= */

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    transition: {
      duration: 0.3,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

/* =============================================================================
   MODAL/OVERLAY ANIMATIONS
   ============================================================================= */

export const overlayAnimation: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.2 },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2 },
  },
};

export const modalAnimation: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 10 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: transitions.spring,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    transition: { duration: 0.2 },
  },
};

export const slideDrawer: Variants = {
  hidden: { x: '100%' },
  visible: {
    x: 0,
    transition: transitions.smooth,
  },
  exit: {
    x: '100%',
    transition: { duration: 0.3 },
  },
};

/* =============================================================================
   COUNTER ANIMATION (for stats)
   ============================================================================= */

export const counterAnimation = {
  duration: 2,
  ease: [0.4, 0, 0.2, 1] as [number, number, number, number],
};

/* =============================================================================
   VIEWPORT TRIGGER OPTIONS
   ============================================================================= */

export const viewportOnce = {
  once: true,
  margin: '-50px',
};

export const viewportRepeating = {
  once: false,
  margin: '-100px',
};

/* =============================================================================
   REDUCED MOTION VARIANTS
   ============================================================================= */

export const reducedMotionFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.01 } },
};

/* =============================================================================
   UTILITY FUNCTIONS
   ============================================================================= */

/**
 * Creates a delay for staggered animations
 */
export const createDelay = (index: number, baseDelay = 0.1): number => {
  return index * baseDelay;
};

/**
 * Creates custom stagger container with configurable delays
 */
export const createStaggerContainer = (
  staggerDelay = 0.1,
  initialDelay = 0.1
): Variants => ({
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: staggerDelay,
      delayChildren: initialDelay,
    },
  },
});

/**
 * Check if reduced motion is preferred
 */
export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Get appropriate animation based on reduced motion preference
 */
export const getAnimation = <T extends Variants>(
  animation: T,
  reducedMotionAnimation: T = reducedMotionFade as T
): T => {
  return prefersReducedMotion() ? reducedMotionAnimation : animation;
};
