import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { GlassCard } from './GlassCard';

/* =============================================================================
   PricingCard Component

   Displays pricing plan with features, price, and CTA.
   ============================================================================= */

interface PricingTier {
  id: string;
  icon?: React.ReactNode;
  name: string;
  description: string;
  price: {
    monthly: number;
    annual: number;
  };
  features: string[];
  highlighted?: boolean;
  ctaText?: string;
  badgeText?: string;
}

interface PricingCardProps {
  /** Pricing tier data */
  tier: PricingTier;
  /** Show annual or monthly pricing */
  isAnnual: boolean;
  /** Custom class name */
  className?: string;
}

export const PricingCard: React.FC<PricingCardProps> = ({
  tier,
  isAnnual,
  className = '',
}) => {
  const isCustomPricing = tier.price.monthly < 0 || tier.price.annual < 0;
  const currentPrice = isAnnual ? tier.price.annual : tier.price.monthly;
  const savings = isAnnual && !isCustomPricing && tier.price.monthly > 0
    ? Math.round(((tier.price.monthly * 12 - tier.price.annual) / (tier.price.monthly * 12)) * 100)
    : 0;

  const formatter = useMemo(() => new Intl.NumberFormat('en-IN'), []);
  const formatPrice = (value: number) => formatter.format(value);
  const accentColor = tier.highlighted ? '#0ea5e9' : '#e2e8f0';

  return (
    <motion.div
      whileHover={{ y: tier.highlighted ? -8 : -4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`relative h-full ${className}`}
      style={{
        borderRadius: '24px',
        background: 'rgba(255,255,255,0.82)',
        boxShadow: tier.highlighted
          ? '0 20px 50px rgba(14,165,233,0.18)'
          : '0 12px 35px rgba(15,23,42,0.08)',
        border: `1.5px solid ${accentColor}`,
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Highlighted Badge */}
      {(tier.highlighted || tier.badgeText) && (
        <div className="
          absolute -top-4 left-1/2 -translate-x-1/2 z-10
          px-4 py-1.5 rounded-full
          bg-gradient-to-r from-primary-600 to-accent-500
          text-white text-xs font-semibold uppercase tracking-wide
          shadow-lg shadow-primary-500/30
        ">
          {tier.badgeText || 'Most Popular'}
        </div>
      )}

      <GlassCard
        variant={tier.highlighted ? 'lg' : 'md'}
        highlighted={false}
        padding="xl"
        className="h-full flex flex-col text-center bg-transparent !border-transparent"
        style={{ boxShadow: 'none', background: 'transparent' }}
      >
        {/* Plan Name */}
        <div className="flex items-center justify-center gap-3 mb-2">
          {tier.icon ? (
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-accent-300">
              {tier.icon}
            </div>
          ) : null}
          <h3 className="text-xl font-semibold text-slate-900">{tier.name}</h3>
        </div>

        {/* Description */}
        <p className="text-slate-500 text-sm mb-6">
          {tier.description}
        </p>

        {/* Price */}
        <div className="mb-6">
          <div className="flex items-baseline justify-center gap-1">
            {!isCustomPricing ? (
              <span className="text-slate-600 text-lg">₹</span>
            ) : null}
            <motion.span
              key={currentPrice}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl font-bold text-slate-900"
            >
              {isCustomPricing ? 'Custom' : formatPrice(currentPrice)}
            </motion.span>
            <span className="text-slate-500 text-lg">
              {isCustomPricing ? '' : isAnnual ? '/yr' : '/mo'}
            </span>
          </div>

          {isAnnual && savings > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-2 text-sm text-primary-600"
            >
              Save {savings}% with annual billing
            </motion.div>
          )}

          {!isAnnual && !isCustomPricing && tier.price.annual > 0 && (
            <div className="mt-2 text-sm text-slate-500">
              ₹{formatPrice(tier.price.annual)}/yr billed annually
            </div>
          )}
        </div>

        {/* CTA Button */}
        <Link
          to={`/signup?plan=${tier.id}`}
          className={`
            w-full py-3 px-6 rounded-xl
            font-semibold text-center
            transition-all duration-200
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
            min-h-[48px] flex items-center justify-center
            ${tier.highlighted
              ? 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-300/60'
              : 'bg-white text-slate-900 hover:bg-slate-50 border border-slate-200'
            }
          `}
        >
          {tier.ctaText || (currentPrice === 0 ? 'Start Free' : 'Start Trial')}
        </Link>

        {/* Features List */}
        <div className="mt-8 pt-6 border-t border-slate-100 flex-grow">
          <ul className="space-y-4 text-left">
            {tier.features.map((feature, index) => (
              <li key={index} className="flex items-start gap-3">
                <div className="
                  flex-shrink-0 w-5 h-5 rounded-full
                  bg-primary-50 text-primary-600 border border-primary-100
                  flex items-center justify-center mt-0.5
                ">
                  <Check size={12} />
                </div>
                <span className="text-slate-700 text-sm leading-relaxed">
                  {feature}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </GlassCard>
    </motion.div>
  );
};

PricingCard.displayName = 'PricingCard';

export default PricingCard;
