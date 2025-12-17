import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';

/* =============================================================================
   FloatingElement Animation Wrapper

   Creates a continuous floating animation effect for decorative elements.
   ============================================================================= */

interface FloatingElementProps extends Omit<HTMLMotionProps<'div'>, 'animate'> {
  /** Vertical float distance (pixels) */
  distance?: number;
  /** Duration of one complete float cycle (seconds) */
  duration?: number;
  /** Delay before animation starts (seconds) */
  delay?: number;
  /** Also apply horizontal movement */
  horizontal?: boolean;
  /** Horizontal distance if enabled (pixels) */
  horizontalDistance?: number;
  /** Children to animate */
  children: React.ReactNode;
  /** Custom class name */
  className?: string;
  /** Disable animation (for reduced motion) */
  disabled?: boolean;
}

export const FloatingElement: React.FC<FloatingElementProps> = ({
  distance = 10,
  duration = 3,
  delay = 0,
  horizontal = false,
  horizontalDistance = 5,
  children,
  className = '',
  disabled = false,
  ...props
}) => {
  const floatAnimation = React.useMemo(() => {
    if (disabled) return {};

    const baseAnimation: {
      y: number[];
      x?: number[];
      transition: {
        y: { duration: number; repeat: number; ease: string; delay: number };
        x?: { duration: number; repeat: number; ease: string; delay: number };
      };
    } = {
      y: [0, -distance, 0],
      transition: {
        y: {
          duration,
          repeat: Infinity,
          ease: 'easeInOut',
          delay,
        },
      },
    };

    if (horizontal) {
      baseAnimation.x = [0, horizontalDistance, 0, -horizontalDistance, 0];
      baseAnimation.transition.x = {
        duration: duration * 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
        delay,
      };
    }

    return baseAnimation;
  }, [distance, duration, delay, horizontal, horizontalDistance, disabled]);

  return (
    <motion.div
      animate={floatAnimation}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
};

FloatingElement.displayName = 'FloatingElement';

export default FloatingElement;
