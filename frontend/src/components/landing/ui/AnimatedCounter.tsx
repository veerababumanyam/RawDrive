import React, { useEffect, useState, useRef } from 'react';
import { motion, useInView, useMotionValue, useSpring, useTransform } from 'framer-motion';

/* =============================================================================
   AnimatedCounter Component

   Animated number counter that triggers on viewport entry.
   Supports prefix, suffix, and decimal formatting.
   ============================================================================= */

interface AnimatedCounterProps {
  /** Target number to count to */
  end: number;
  /** Animation duration in milliseconds */
  duration?: number;
  /** Text to display before the number */
  prefix?: string;
  /** Text to display after the number */
  suffix?: string;
  /** Number of decimal places */
  decimals?: number;
  /** Custom separator for thousands */
  separator?: string;
  /** Delay before animation starts (ms) */
  delay?: number;
  /** Custom class name */
  className?: string;
  /** Start value */
  start?: number;
  /** Only animate once */
  once?: boolean;
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  end,
  duration = 2000,
  prefix = '',
  suffix = '',
  decimals = 0,
  separator = ',',
  delay = 0,
  className = '',
  start = 0,
  once = true,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once, margin: '-50px' });
  const [hasAnimated, setHasAnimated] = useState(false);

  const count = useMotionValue(start);
  const springConfig = { duration: duration / 1000 };
  const spring = useSpring(count, springConfig);

  const display = useTransform(spring, (latest) => {
    const formatted = latest.toFixed(decimals);
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
    return `${prefix}${parts.join('.')}${suffix}`;
  });

  useEffect(() => {
    if (isInView && !hasAnimated) {
      const timeout = setTimeout(() => {
        count.set(end);
        setHasAnimated(true);
      }, delay);
      return () => clearTimeout(timeout);
    }
  }, [isInView, end, count, delay, hasAnimated]);

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
};

AnimatedCounter.displayName = 'AnimatedCounter';

export default AnimatedCounter;
