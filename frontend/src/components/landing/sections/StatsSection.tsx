import React from 'react';
import { motion } from 'framer-motion';
import { Users, Image, Clock, Star } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { AnimatedCounter } from '../ui/AnimatedCounter';
import { staggerContainer, staggerItem } from '../animations/presets';

/* =============================================================================
   StatsSection Component

   Displays key metrics with animated counters and glass morphism cards.
   ============================================================================= */

interface StatItem {
  icon: React.ReactNode;
  value: number;
  suffix: string;
  label: string;
  decimals?: number;
}

interface StatsSectionProps {
  /** Custom class name */
  className?: string;
  /** Section ID for navigation */
  id?: string;
  /** Stats to display */
  stats?: StatItem[];
}

const defaultStats: StatItem[] = [
  {
    icon: <Users size={24} />,
    value: 20,
    suffix: 'K+',
    label: 'Photographers',
  },
  {
    icon: <Image size={24} />,
    value: 5,
    suffix: 'M+',
    label: 'Photos Delivered',
  },
  {
    icon: <Clock size={24} />,
    value: 99.9,
    suffix: '%',
    label: 'Uptime',
    decimals: 1,
  },
  {
    icon: <Star size={24} />,
    value: 4.9,
    suffix: '/5',
    label: 'User Rating',
    decimals: 1,
  },
];

export const StatsSection: React.FC<StatsSectionProps> = ({
  className = '',
  id = 'stats',
  stats = defaultStats,
}) => {
  return (
    <section
      id={id}
      className={`py-16 lg:py-24 ${className}`}
      aria-label="Statistics"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          variants={staggerContainer}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6"
        >
          {stats.map((stat, index) => (
            <motion.div key={index} variants={staggerItem}>
              <GlassCard
                variant="md"
                hoverable
                padding="lg"
                className="text-center h-full"
              >
                {/* Icon */}
                <div className="
                  inline-flex items-center justify-center
                  w-14 h-14 rounded-xl mb-4
                  bg-gradient-to-br from-primary-500/20 to-accent-500/20
                  text-primary-400
                ">
                  {stat.icon}
                </div>

                {/* Value */}
                <div className="text-3xl sm:text-4xl font-bold text-white mb-2">
                  <AnimatedCounter
                    end={stat.value}
                    suffix={stat.suffix}
                    decimals={stat.decimals || 0}
                    duration={2000}
                    delay={index * 150}
                  />
                </div>

                {/* Label */}
                <div className="text-sm sm:text-base text-slate-400 uppercase tracking-wider">
                  {stat.label}
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

StatsSection.displayName = 'StatsSection';

export default StatsSection;
