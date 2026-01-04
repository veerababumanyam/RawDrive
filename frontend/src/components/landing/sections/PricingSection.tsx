import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  Check,
  Crown,
  Rocket,
  Shield,
  Star,
  Zap,
} from 'lucide-react';
import { FadeIn } from '../animations/FadeIn';
import { staggerContainer, staggerItem } from '../animations/presets';
import { TrustSeals } from './SecuritySection';

/* =============================================================================
   PricingSection Component v2.1

   Clean white background pricing matching the design mockup with:
   - 5 pricing tiers: Free, Starter, Professional, Business, Enterprise
   - Monthly/Annual toggle
   - Storage indicators at bottom of cards
   ============================================================================= */

interface PricingTier {
  id: string;
  icon: React.ReactNode;
  name: string;
  description: string;
  price: {
    monthly: number | string;
    annual: number | string;
  };
  features: string[];
  storage: string;
  highlighted?: boolean;
  ctaText: string;
  popular?: boolean;
}

interface PricingSectionProps {
  className?: string;
  id?: string;
  title?: string;
  subtitle?: string;
}

// All 5 pricing tiers matching the design
const pricingTiers: PricingTier[] = [
  {
    id: 'free',
    name: 'Free',
    icon: <Zap size={20} />,
    description: 'Perfect for trying out RawDrive',
    price: {
      monthly: 0,
      annual: 0,
    },
    features: [
      '1 GB storage',
      '3 galleries',
      '5 clients',
      'Unlimited AI (BYO Key)',
      'Save the Date & RSVPs',
      'Basic client portal',
      'Email support',
    ],
    storage: '1 GB',
    ctaText: 'Start Free',
  },
  {
    id: 'starter',
    name: 'Starter',
    icon: <Star size={20} />,
    description: 'For photographers starting out',
    price: {
      monthly: 100,
      annual: 999,
    },
    features: [
      '10 GB storage',
      '10 galleries',
      '20 clients',
      'Unlimited AI (BYO Key)',
      'Save the Date & RSVPs',
      'Custom watermarks',
      'Email support',
    ],
    storage: '10 GB',
    ctaText: 'Get Started',
  },
  {
    id: 'professional',
    name: 'Professional',
    icon: <Crown size={20} />,
    description: 'For professional photographers',
    price: {
      monthly: 500,
      annual: 4999,
    },
    features: [
      '100 GB storage',
      '50 galleries',
      '100 clients',
      'Unlimited AI (BYO Key)',
      'Save the Date & RSVPs',
      'Print album designer',
      'Custom domain',
      'Video support',
      'Priority support',
    ],
    storage: '100 GB',
    highlighted: true,
    popular: true,
    ctaText: 'Get Started',
  },
  {
    id: 'business',
    name: 'Business',
    icon: <Building2 size={20} />,
    description: 'For studios and agencies',
    price: {
      monthly: 2000,
      annual: 19999,
    },
    features: [
      '1 TB storage',
      '200 galleries',
      '500 clients',
      'Unlimited AI (BYO Key)',
      'Save the Date & RSVPs',
      'White-label branding',
      'API access',
      '10 team members',
      'Priority support',
    ],
    storage: '1 TB',
    ctaText: 'Get Started',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    icon: <Rocket size={20} />,
    description: 'For large organizations with custom needs',
    price: {
      monthly: 'Custom',
      annual: 'Custom',
    },
    features: [
      'Custom storage',
      'Unlimited galleries',
      'Unlimited clients',
      'Unlimited AI (BYO Key)',
      'White-label branding',
      'API access',
      'Unlimited team members',
      'Dedicated support',
      'Custom integrations',
    ],
    storage: 'Custom',
    ctaText: 'Contact Sales',
  },
];

// Pricing card component
const PricingCard: React.FC<{
  tier: PricingTier;
  isAnnual: boolean;
}> = ({ tier, isAnnual }) => {
  const isCustomPricing = typeof tier.price.monthly === 'string';
  const currentPrice = isAnnual ? tier.price.annual : tier.price.monthly;
  const isFree = currentPrice === 0;

  const formatPrice = (value: number | string) => {
    if (typeof value === 'string') return value;
    return new Intl.NumberFormat('en-IN').format(value);
  };

  return (
    <motion.div
      whileHover={{ y: tier.highlighted ? -8 : -4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={`
        relative h-full rounded-2xl overflow-visible flex flex-col
        ${tier.highlighted
          ? 'bg-white border-2 border-cyan-500 shadow-xl shadow-cyan-500/10'
          : 'bg-white border border-slate-200 shadow-lg shadow-slate-200/50'
        }
      `}
    >
      {/* Popular badge */}
      {tier.popular && (
        <div className="
          absolute -top-3 left-1/2 -translate-x-1/2 z-10
          px-4 py-1.5 rounded-full
          bg-gradient-to-r from-cyan-500 to-blue-600
          text-white text-xs font-bold
          shadow-lg shadow-cyan-500/30
          whitespace-nowrap
        ">
          Most Popular
        </div>
      )}

      <div className="p-6 flex-1 flex flex-col">
        {/* Plan header */}
        <div className="mb-6">
          <div className={`
            w-10 h-10 mb-3 rounded-xl
            flex items-center justify-center
            ${tier.highlighted
              ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white'
              : 'bg-slate-100 text-slate-600'
            }
          `}>
            {tier.icon}
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-1">{tier.name}</h3>
          <p className="text-sm text-slate-600">{tier.description}</p>
        </div>

        {/* Price */}
        <div className="mb-6">
          <div className="flex items-baseline gap-1">
            {!isCustomPricing && !isFree && (
              <span className="text-slate-600 text-lg">₹</span>
            )}
            <span className={`
              font-bold
              ${isCustomPricing ? 'text-2xl text-slate-900' : 'text-4xl text-slate-900'}
            `}>
              {isFree ? 'Free' : formatPrice(currentPrice)}
            </span>
            {!isCustomPricing && !isFree && (
              <span className="text-slate-600 text-base">/mo</span>
            )}
          </div>
          {isFree && (
            <p className="text-sm text-slate-600 mt-1">3 Months Free</p>
          )}
          {isCustomPricing && (
            <p className="text-sm text-slate-600 mt-1">Contact us for pricing</p>
          )}
        </div>

        {/* CTA */}
        <Link
          to={tier.id === 'enterprise' ? '/contact-sales' : `/signup?plan=${tier.id}`}
          className={`
            w-full py-3 px-4 rounded-lg font-semibold text-center text-sm
            transition-all duration-200 flex items-center justify-center gap-2
            min-h-[44px] mb-6
            ${tier.highlighted
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white hover:from-cyan-600 hover:to-blue-700 shadow-lg shadow-cyan-500/25'
              : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400'
            }
          `}
        >
          {tier.ctaText}
          {tier.id !== 'enterprise' && <ArrowRight size={16} />}
        </Link>

        {/* Features */}
        <ul className="space-y-3 flex-1">
          {tier.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5">
              <Check size={16} className={`
                flex-shrink-0 mt-0.5
                ${tier.highlighted ? 'text-cyan-500' : 'text-emerald-500'}
              `} />
              <span className="text-sm text-slate-600">{feature}</span>
            </li>
          ))}
        </ul>

        {/* Storage indicator at bottom */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-sm text-slate-600">Storage</span>
          <span className="text-sm font-semibold text-slate-900">{tier.storage}</span>
        </div>
      </div>
    </motion.div>
  );
};

export const PricingSection: React.FC<PricingSectionProps> = ({
  className = '',
  id = 'pricing',
  title = 'Simple, Transparent Pricing',
  subtitle = 'Start free, upgrade when you need more. No hidden fees, no surprises.',
}) => {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <section
      id={id}
      className={`landing-light py-20 lg:py-28 bg-white relative overflow-hidden ${className}`}
      aria-labelledby="pricing-heading"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <FadeIn direction="up" className="text-center mb-12">
          <span className="text-cyan-600 font-semibold text-sm mb-3 block">Pricing</span>
          <h2
            id="pricing-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-4"
          >
            {title}
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
            {subtitle}
          </p>

          {/* Billing Toggle */}
          <div 
            className="inline-flex items-center gap-1 p-1.5 bg-slate-100 rounded-full"
            role="radiogroup"
            aria-label="Billing period"
          >
            <button
              onClick={() => setIsAnnual(false)}
              className={`
                px-6 py-2.5 rounded-full font-semibold text-sm transition-all duration-200
                ${!isAnnual
                  ? 'bg-slate-900 shadow-md'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
                }
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2
                min-h-[44px]
              `}
              style={!isAnnual ? { color: '#ffffff' } : undefined}
              role="radio"
              aria-checked={!isAnnual}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`
                px-6 py-2.5 rounded-full font-semibold text-sm transition-all duration-200
                flex items-center gap-2
                ${isAnnual
                  ? 'bg-slate-900 shadow-md'
                  : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200/60'
                }
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2
                min-h-[44px]
              `}
              style={isAnnual ? { color: '#ffffff' } : undefined}
              role="radio"
              aria-checked={isAnnual}
            >
              Annual
              <span className="px-2 py-0.5 text-xs font-bold bg-emerald-500 text-white rounded-full shadow-sm">
                -17%
              </span>
            </button>
          </div>
        </FadeIn>

        {/* Pricing Cards - All 5 tiers */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          variants={staggerContainer}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 items-stretch"
        >
          {pricingTiers.map((tier) => (
            <motion.div
              key={tier.id}
              variants={staggerItem}
              className={tier.highlighted ? 'lg:-mt-4 lg:mb-4' : ''}
            >
              <PricingCard tier={tier} isAnnual={isAnnual} />
            </motion.div>
          ))}
        </motion.div>

        {/* Security Trust Seals */}
        <FadeIn direction="up" delay={0.3} className="mt-12">
          <TrustSeals variant="light" className="mb-8" />
        </FadeIn>

        {/* Trust signals */}
        <FadeIn direction="up" delay={0.35} className="mt-4">
          <div className="flex flex-wrap items-center justify-center gap-8 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Shield size={18} className="text-emerald-500" />
              <span>30-day money-back guarantee</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-amber-500" />
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-2">
              <Star size={18} className="text-cyan-500" />
              <span>4.9/5 from 20,000+ photographers</span>
            </div>
          </div>
        </FadeIn>

        {/* FAQ Link */}
        <FadeIn direction="up" delay={0.4} className="text-center mt-10">
          <p className="text-slate-700">
            Have questions?{' '}
            <a
              href="#faq"
              className="text-cyan-600 hover:text-cyan-700 font-medium underline underline-offset-2 transition-colors"
            >
              Check our FAQ
            </a>{' '}
            or{' '}
            <a
              href="/contact"
              className="text-cyan-600 hover:text-cyan-700 font-medium underline underline-offset-2 transition-colors"
            >
              contact us
            </a>
          </p>
        </FadeIn>
      </div>
    </section>
  );
};

PricingSection.displayName = 'PricingSection';

export default PricingSection;
