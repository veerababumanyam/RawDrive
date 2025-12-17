import React from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from './GlassCard';
import { hoverScale, tapScale } from '../animations/presets';

/* =============================================================================
   FeatureCard Component

   Individual feature card with icon, title, and description.
   ============================================================================= */

interface FeatureCardProps {
  /** Feature icon */
  icon: React.ReactNode;
  /** Feature title */
  title: string;
  /** Feature description */
  description: string;
  /** Optional link for the card */
  href?: string;
  /** Custom class name */
  className?: string;
  /** Animation delay */
  delay?: number;
}

export const FeatureCard: React.FC<FeatureCardProps> = ({
  icon,
  title,
  description,
  href,
  className = '',
  delay = 0,
}) => {
  const content = (
    <GlassCard
      variant="md"
      hoverable
      padding="lg"
      className={`h-full ${className}`}
    >
      {/* Icon Container */}
      <div className="
        w-14 h-14 rounded-xl mb-5
        bg-gradient-to-br from-primary-500 to-accent-500
        flex items-center justify-center
        shadow-lg shadow-primary-500/20
      ">
        <span className="text-white" aria-hidden="true">
          {icon}
        </span>
      </div>

      {/* Title */}
      <h3 className="text-xl font-semibold text-white mb-3">
        {title}
      </h3>

      {/* Description */}
      <p className="text-slate-400 leading-relaxed">
        {description}
      </p>

      {/* Learn More Link (if href provided) */}
      {href && (
        <div className="mt-4 pt-4 border-t border-white/10">
          <span className="
            inline-flex items-center gap-1
            text-sm font-medium text-primary-400
            group-hover:text-primary-300 transition-colors
          ">
            Learn more
            <svg
              className="w-4 h-4 transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </span>
        </div>
      )}
    </GlassCard>
  );

  if (href) {
    return (
      <motion.a
        href={href}
        whileHover={hoverScale}
        whileTap={tapScale}
        className="block group"
        style={{ transitionDelay: `${delay}ms` }}
      >
        {content}
      </motion.a>
    );
  }

  return (
    <motion.div
      whileHover={hoverScale}
      whileTap={tapScale}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {content}
    </motion.div>
  );
};

FeatureCard.displayName = 'FeatureCard';

export default FeatureCard;
