import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { staggerItem, staggerItemScale, createStaggerContainer } from './presets';

/* =============================================================================
   StaggerChildren Animation Wrapper

   Container that staggers the animation of its children.
   ============================================================================= */

type StaggerVariant = 'fadeUp' | 'scale';

interface StaggerChildrenProps extends Omit<HTMLMotionProps<'div'>, 'initial' | 'animate' | 'variants'> {
  /** Animation variant for children */
  variant?: StaggerVariant;
  /** Delay between each child animation (seconds) */
  staggerDelay?: number;
  /** Initial delay before animations start (seconds) */
  initialDelay?: number;
  /** Only animate once when entering viewport */
  once?: boolean;
  /** Viewport margin for triggering animation */
  margin?: string;
  /** Children to animate */
  children: React.ReactNode;
  /** Custom class name */
  className?: string;
  /** HTML element to render as */
  as?: 'div' | 'section' | 'ul' | 'ol' | 'nav';
}

const childVariants = {
  fadeUp: staggerItem,
  scale: staggerItemScale,
};

export const StaggerChildren: React.FC<StaggerChildrenProps> = ({
  variant = 'fadeUp',
  staggerDelay = 0.1,
  initialDelay = 0.1,
  once = true,
  margin = '-50px',
  children,
  className = '',
  as = 'div',
  ...props
}) => {
  const containerVariants = createStaggerContainer(staggerDelay, initialDelay);
  const MotionComponent = motion[as] as React.ComponentType<HTMLMotionProps<typeof as>>;

  return (
    <MotionComponent
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin }}
      variants={containerVariants}
      className={className}
      {...props}
    >
      {children}
    </MotionComponent>
  );
};

StaggerChildren.displayName = 'StaggerChildren';

/* =============================================================================
   StaggerItem - Child element for StaggerChildren
   ============================================================================= */

interface StaggerItemProps extends Omit<HTMLMotionProps<'div'>, 'variants'> {
  /** Animation variant */
  variant?: StaggerVariant;
  /** Children to animate */
  children: React.ReactNode;
  /** Custom class name */
  className?: string;
  /** HTML element to render as */
  as?: 'div' | 'li' | 'article' | 'span';
}

export const StaggerItem: React.FC<StaggerItemProps> = ({
  variant = 'fadeUp',
  children,
  className = '',
  as = 'div',
  ...props
}) => {
  const MotionComponent = motion[as] as React.ComponentType<HTMLMotionProps<typeof as>>;

  return (
    <MotionComponent
      variants={childVariants[variant]}
      className={className}
      {...props}
    >
      {children}
    </MotionComponent>
  );
};

StaggerItem.displayName = 'StaggerItem';

export default StaggerChildren;
