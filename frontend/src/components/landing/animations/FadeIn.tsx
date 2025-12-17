import React from 'react';
import { motion, type HTMLMotionProps, type Variants } from 'framer-motion';
import { fadeIn, fadeInUp, fadeInDown, fadeInLeft, fadeInRight } from './presets';

/* =============================================================================
   FadeIn Animation Wrapper

   Provides various fade-in animations for landing page elements.
   Triggers on viewport entry.
   ============================================================================= */

type FadeDirection = 'up' | 'down' | 'left' | 'right' | 'none';

interface FadeInProps extends Omit<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'variants'> {
  /** Direction of the fade animation */
  direction?: FadeDirection;
  /** Delay before animation starts (seconds) */
  delay?: number;
  /** Duration of the animation (seconds) */
  duration?: number;
  /** Distance to travel (pixels) */
  distance?: number;
  /** Only animate once when entering viewport */
  once?: boolean;
  /** Viewport margin for triggering animation */
  margin?: string;
  /** Children to animate */
  children: React.ReactNode;
  /** Custom class name */
  className?: string;
  /** HTML element to render as */
  as?: 'div' | 'section' | 'article' | 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

const directionVariants = {
  up: fadeInUp,
  down: fadeInDown,
  left: fadeInLeft,
  right: fadeInRight,
  none: fadeIn,
};

export const FadeIn: React.FC<FadeInProps> = ({
  direction = 'up',
  delay = 0,
  duration,
  distance,
  once = true,
  margin = '-50px',
  children,
  className = '',
  as = 'div',
  ...props
}) => {
  const baseVariant = directionVariants[direction];

  // Create custom variants if duration or distance is specified
  const customVariants: Variants = React.useMemo(() => {
    if (!duration && !distance) return baseVariant;

    const hidden: Record<string, unknown> = { ...(baseVariant.hidden as Record<string, unknown>) };
    const visible: Record<string, unknown> = { ...(baseVariant.visible as Record<string, unknown>) };

    // Adjust distance
    if (distance !== undefined) {
      if (direction === 'up') hidden.y = distance;
      else if (direction === 'down') hidden.y = -distance;
      else if (direction === 'left') hidden.x = -distance;
      else if (direction === 'right') hidden.x = distance;
    }

    // Adjust duration
    const visibleTransition = visible.transition;
    if (duration !== undefined && typeof visibleTransition === 'object' && visibleTransition !== null) {
      visible.transition = { ...(visibleTransition as Record<string, unknown>), duration };
    }

    return { hidden: hidden as any, visible: visible as any } as Variants;
  }, [baseVariant, direction, duration, distance]);

  // Create the motion component based on the 'as' prop
  const MotionComponent = motion[as] as React.ComponentType<HTMLMotionProps<typeof as>>;

  return (
    <MotionComponent
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin }}
      variants={customVariants}
      transition={{ delay }}
      className={className}
      {...props}
    >
      {children}
    </MotionComponent>
  );
};

FadeIn.displayName = 'FadeIn';

export default FadeIn;
