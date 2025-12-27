import React from 'react';
import { motion } from 'framer-motion';
import { Check, X, Sparkles, ArrowRight, Shield, Zap, Globe, Crown } from 'lucide-react';
import { staggerContainer, staggerItem, fadeInUp } from '../animations/presets';

/* =============================================================================
   WhySwitchSection Component

   A stunning, modern comparison section showcasing RawDrive vs competitors.
   Features glass morphism, animated gradients, and premium visual effects.
   Mobile-first design with WCAG 2.1 AA accessibility compliance.
   ============================================================================= */

interface ComparisonFeature {
  id: string;
  name: string;
  description: string;
  rawdrive: boolean | string;
  pixieset: boolean | string;
  gdrive: boolean | string;
  isUnique?: boolean;
  icon?: React.ReactNode;
}

interface CompetitorInfo {
  name: string;
  tagline: string;
  price: string;
  priceLabel: string;
  isHighlighted?: boolean;
}

const FEATURES: ComparisonFeature[] = [
  {
    id: 'proofing',
    name: 'Photo Proofing & Delivery',
    description: 'Professional photo delivery with client selection',
    rawdrive: true,
    pixieset: true,
    gdrive: true,
    icon: <Shield className="w-4 h-4" />,
  },
  {
    id: 'face-recognition',
    name: 'AI Face Recognition',
    description: 'Automatic face detection and smart grouping',
    rawdrive: true,
    pixieset: false,
    gdrive: false,
    isUnique: true,
    icon: <Sparkles className="w-4 h-4" />,
  },
  {
    id: 'crm',
    name: 'Integrated CRM',
    description: 'Manage clients, leads, and bookings in one place',
    rawdrive: true,
    pixieset: 'Basic',
    gdrive: false,
    isUnique: true,
    icon: <Zap className="w-4 h-4" />,
  },
  {
    id: 'store',
    name: '0% Commission Store',
    description: 'Sell prints and products with zero platform fees',
    rawdrive: true,
    pixieset: false,
    gdrive: false,
    icon: <Crown className="w-4 h-4" />,
  },
  {
    id: 'contracts',
    name: 'Contracts & Invoices',
    description: 'Built-in contract signing and invoicing',
    rawdrive: true,
    pixieset: 'Add-on',
    gdrive: false,
  },
  {
    id: 'cdn',
    name: 'India-Optimized CDN',
    description: 'Lightning-fast delivery across India',
    rawdrive: true,
    pixieset: false,
    gdrive: false,
    isUnique: true,
    icon: <Globe className="w-4 h-4" />,
  },
  {
    id: 'custom-domain',
    name: 'Custom Domain',
    description: 'Use your own domain for galleries',
    rawdrive: true,
    pixieset: true,
    gdrive: false,
  },
  {
    id: 'white-label',
    name: 'White Labeling',
    description: 'Remove all RawDrive branding',
    rawdrive: true,
    pixieset: 'Higher Tier',
    gdrive: false,
  },
];

const COMPETITORS: Record<string, CompetitorInfo> = {
  rawdrive: {
    name: 'RawDrive',
    tagline: 'All-in-One Platform',
    price: '₹2,000',
    priceLabel: '/month',
    isHighlighted: true,
  },
  pixieset: {
    name: 'Pixieset',
    tagline: 'Galleries Only',
    price: '~₹4,500+',
    priceLabel: '/month',
  },
  gdrive: {
    name: 'Google Drive',
    tagline: 'Storage Only',
    price: '~₹1,600',
    priceLabel: '/month',
  },
};

// Animated background orbs
const BackgroundOrbs: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
    {/* Primary cyan orb */}
    <motion.div
      className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30"
      style={{
        background: 'radial-gradient(circle, var(--color-accent-400) 0%, transparent 70%)',
        filter: 'blur(60px)',
      }}
      animate={{
        x: [0, 30, 0],
        y: [0, -20, 0],
        scale: [1, 1.1, 1],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
    {/* Secondary blue orb */}
    <motion.div
      className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full opacity-25"
      style={{
        background: 'radial-gradient(circle, var(--color-primary-500) 0%, transparent 70%)',
        filter: 'blur(80px)',
      }}
      animate={{
        x: [0, -40, 0],
        y: [0, 30, 0],
        scale: [1, 1.15, 1],
      }}
      transition={{
        duration: 10,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: 1,
      }}
    />
    {/* Tertiary gold orb for premium feel */}
    <motion.div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full opacity-15"
      style={{
        background: 'radial-gradient(circle, var(--color-gold-400) 0%, transparent 70%)',
        filter: 'blur(50px)',
      }}
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.15, 0.25, 0.15],
      }}
      transition={{
        duration: 6,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: 2,
      }}
    />
  </div>
);

// Feature cell component
const FeatureCell: React.FC<{
  value: boolean | string;
  isHighlighted?: boolean;
  competitor: string;
}> = ({ value, isHighlighted, competitor }) => {
  if (value === true) {
    return (
      <motion.div
        className="flex items-center justify-center"
        initial={{ scale: 0 }}
        whileInView={{ scale: 1 }}
        viewport={{ once: true }}
        transition={{ type: 'spring', stiffness: 500, damping: 25 }}
      >
        <div
          className={`
            w-8 h-8 rounded-full flex items-center justify-center
            ${isHighlighted
              ? 'bg-gradient-to-br from-accent-400 to-primary-500 shadow-lg shadow-accent-500/30'
              : 'bg-neutral-200/80 dark:bg-neutral-700/80'
            }
          `}
          role="img"
          aria-label={`${competitor} includes this feature`}
        >
          <Check
            className={`w-5 h-5 ${isHighlighted ? 'text-white' : 'text-neutral-500 dark:text-neutral-400'}`}
            strokeWidth={2.5}
          />
        </div>
      </motion.div>
    );
  }

  if (value === false) {
    return (
      <div
        className="flex items-center justify-center"
        role="img"
        aria-label={`${competitor} does not include this feature`}
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-neutral-100/50 dark:bg-neutral-800/50">
          <X className="w-5 h-5 text-neutral-300 dark:text-neutral-600" strokeWidth={2} />
        </div>
      </div>
    );
  }

  // Text value (like "Basic" or "Add-on")
  return (
    <span
      className={`
        text-sm font-medium px-3 py-1 rounded-full
        ${isHighlighted
          ? 'bg-accent-100/80 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300'
          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
        }
      `}
    >
      {value}
    </span>
  );
};

// Unique badge component
const UniqueBadge: React.FC = () => (
  <motion.span
    className="
      inline-flex items-center gap-1 px-2 py-0.5 ml-2
      text-[10px] font-bold uppercase tracking-wider
      bg-gradient-to-r from-gold-500/20 to-gold-400/20
      text-gold-600 dark:text-gold-400
      border border-gold-400/30 rounded-full
      shadow-sm shadow-gold-500/10
    "
    initial={{ opacity: 0, scale: 0.8 }}
    whileInView={{ opacity: 1, scale: 1 }}
    viewport={{ once: true }}
    whileHover={{ scale: 1.05 }}
  >
    <Sparkles className="w-3 h-3" />
    Unique
  </motion.span>
);

// Mobile card view for each feature
const MobileFeatureCard: React.FC<{ feature: ComparisonFeature; index: number }> = ({
  feature,
}) => (
  <motion.div
    className="
      relative overflow-hidden rounded-2xl p-5
      bg-white/70 dark:bg-neutral-900/70
      backdrop-blur-xl
      border border-white/30 dark:border-white/10
      shadow-xl shadow-neutral-900/5 dark:shadow-black/20
    "
    variants={staggerItem}
    whileHover={{ y: -2, transition: { duration: 0.2 } }}
  >
    {/* Subtle gradient overlay */}
    <div
      className="absolute inset-0 opacity-50"
      style={{
        background: feature.isUnique
          ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.05) 0%, transparent 50%)'
          : 'transparent',
      }}
    />

    <div className="relative">
      {/* Feature name and badge */}
      <div className="flex items-center gap-2 mb-2">
        {feature.icon && (
          <div className="p-1.5 rounded-lg bg-gradient-to-br from-accent-100 to-primary-100 dark:from-accent-900/30 dark:to-primary-900/30">
            {React.cloneElement(feature.icon as React.ReactElement, {
              className: 'w-4 h-4 text-accent-600 dark:text-accent-400',
            })}
          </div>
        )}
        <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
          {feature.name}
        </h3>
        {feature.isUnique && <UniqueBadge />}
      </div>

      <p className="text-sm text-neutral-500 dark:text-neutral-400 mb-4">
        {feature.description}
      </p>

      {/* Comparison grid */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(COMPETITORS).map(([key, comp]) => (
          <div
            key={key}
            className={`
              flex flex-col items-center gap-1.5 p-2 rounded-xl
              ${comp.isHighlighted
                ? 'bg-gradient-to-br from-accent-50 to-primary-50 dark:from-accent-900/20 dark:to-primary-900/20 border border-accent-200/50 dark:border-accent-700/30'
                : 'bg-neutral-50/50 dark:bg-neutral-800/30'
              }
            `}
          >
            <span className={`text-xs font-medium ${comp.isHighlighted ? 'text-accent-600 dark:text-accent-400' : 'text-neutral-500'}`}>
              {comp.name}
            </span>
            <FeatureCell
              value={feature[key as keyof Pick<ComparisonFeature, 'rawdrive' | 'pixieset' | 'gdrive'>]}
              isHighlighted={comp.isHighlighted}
              competitor={comp.name}
            />
          </div>
        ))}
      </div>
    </div>
  </motion.div>
);

// Desktop table header
const TableHeader: React.FC = () => (
  <thead>
    <tr>
      <th
        scope="col"
        className="px-6 py-5 text-left text-xs font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider"
      >
        Features
      </th>
      {Object.entries(COMPETITORS).map(([key, comp]) => (
        <th
          key={key}
          scope="col"
          className={`
            px-6 py-5 text-center relative
            ${comp.isHighlighted ? 'bg-gradient-to-b from-accent-500/10 to-primary-500/5' : ''}
          `}
        >
          {comp.isHighlighted && (
            <motion.div
              className="absolute -top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full
                         bg-gradient-to-r from-accent-500 to-primary-500 text-white text-[10px] font-bold uppercase tracking-wider
                         shadow-lg shadow-accent-500/30"
              initial={{ y: -10, opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              Recommended
            </motion.div>
          )}
          <div className={`text-lg font-bold ${comp.isHighlighted ? 'text-gradient' : 'text-neutral-700 dark:text-neutral-300'}`}>
            {comp.name}
          </div>
          <div className={`text-xs mt-1 ${comp.isHighlighted ? 'text-accent-600 dark:text-accent-400' : 'text-neutral-400'}`}>
            {comp.tagline}
          </div>
        </th>
      ))}
    </tr>
  </thead>
);

// Desktop table row
const TableRow: React.FC<{ feature: ComparisonFeature; index: number }> = ({ feature, index }) => (
  <motion.tr
    className={`
      group transition-colors duration-200
      ${index % 2 === 0
        ? 'bg-white/30 dark:bg-neutral-900/30'
        : 'bg-neutral-50/50 dark:bg-neutral-800/20'
      }
      hover:bg-accent-50/30 dark:hover:bg-accent-900/10
    `}
    initial={{ opacity: 0, x: -20 }}
    whileInView={{ opacity: 1, x: 0 }}
    viewport={{ once: true }}
    transition={{ delay: index * 0.05 }}
  >
    <td className="px-6 py-4">
      <div className="flex items-center gap-3">
        {feature.icon && (
          <div className="
            p-1.5 rounded-lg
            bg-gradient-to-br from-neutral-100 to-neutral-50
            dark:from-neutral-800 dark:to-neutral-900
            group-hover:from-accent-100 group-hover:to-primary-100
            dark:group-hover:from-accent-900/30 dark:group-hover:to-primary-900/30
            transition-all duration-200
          ">
            {React.cloneElement(feature.icon as React.ReactElement, {
              className: 'w-4 h-4 text-neutral-500 dark:text-neutral-400 group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors duration-200',
            })}
          </div>
        )}
        <div>
          <div className="flex items-center">
            <span className="text-sm font-medium text-neutral-900 dark:text-white">
              {feature.name}
            </span>
            {feature.isUnique && <UniqueBadge />}
          </div>
          <span className="text-xs text-neutral-500 dark:text-neutral-400 hidden lg:block">
            {feature.description}
          </span>
        </div>
      </div>
    </td>
    {Object.entries(COMPETITORS).map(([key, comp]) => (
      <td
        key={key}
        className={`
          px-6 py-4 text-center
          ${comp.isHighlighted ? 'bg-gradient-to-b from-accent-500/5 to-transparent' : ''}
        `}
      >
        <FeatureCell
          value={feature[key as keyof Pick<ComparisonFeature, 'rawdrive' | 'pixieset' | 'gdrive'>]}
          isHighlighted={comp.isHighlighted}
          competitor={comp.name}
        />
      </td>
    ))}
  </motion.tr>
);

// Pricing row
const PricingRow: React.FC = () => (
  <motion.tr
    className="
      bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900
      dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950
    "
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ delay: 0.4 }}
  >
    <td className="px-6 py-6">
      <span className="text-sm font-bold text-white">
        Monthly Cost (Equivalent)
      </span>
    </td>
    {Object.entries(COMPETITORS).map(([key, comp]) => (
      <td key={key} className="px-6 py-6 text-center">
        <div className={`
          text-2xl font-bold
          ${comp.isHighlighted
            ? 'text-gradient bg-gradient-to-r from-accent-400 to-primary-400'
            : 'text-neutral-400'
          }
        `}>
          {comp.price}
        </div>
        <div className="text-xs text-neutral-500 mt-1">{comp.priceLabel}</div>
      </td>
    ))}
  </motion.tr>
);

// Main component
export const WhySwitchSection: React.FC = () => {

  return (
    <section
      id="why-switch"
      className="relative py-16 md:py-24 lg:py-32 overflow-hidden bg-gradient-to-b from-neutral-50 to-white dark:from-neutral-950 dark:to-neutral-900"
      aria-labelledby="why-switch-heading"
    >
      <BackgroundOrbs />

      <div className="relative container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          className="text-center mb-12 md:mb-16 lg:mb-20"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
        >
          {/* Badge */}
          <motion.div
            variants={fadeInUp}
            className="inline-flex items-center gap-2 px-4 py-2 mb-6 rounded-full
                       bg-gradient-to-r from-accent-100/80 to-primary-100/80
                       dark:from-accent-900/30 dark:to-primary-900/30
                       border border-accent-200/50 dark:border-accent-700/30
                       backdrop-blur-sm"
          >
            <Sparkles className="w-4 h-4 text-accent-600 dark:text-accent-400" />
            <span className="text-sm font-semibold text-accent-700 dark:text-accent-300">
              Why Switch?
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h2
            id="why-switch-heading"
            variants={fadeInUp}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4 md:mb-6"
          >
            <span className="text-neutral-900 dark:text-white">Stop Paying for </span>
            <span className="text-gradient bg-gradient-to-r from-accent-500 via-primary-500 to-accent-500 bg-[length:200%_auto] animate-gradient">
              5 Different Tools
            </span>
          </motion.h2>

          {/* Subheadline */}
          <motion.p
            variants={fadeInUp}
            className="max-w-2xl mx-auto text-base sm:text-lg text-neutral-600 dark:text-neutral-400"
          >
            RawDrive replaces your gallery host, CRM, contract signer, and file storage—all in one place.
            Save money while getting more features.
          </motion.p>
        </motion.div>

        {/* Mobile View: Cards */}
        <div className="md:hidden">
          <motion.div
            className="grid gap-4"
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            {FEATURES.map((feature, index) => (
              <MobileFeatureCard key={feature.id} feature={feature} index={index} />
            ))}
          </motion.div>

          {/* Mobile Pricing Summary */}
          <motion.div
            className="mt-8 rounded-2xl overflow-hidden bg-gradient-to-br from-neutral-900 to-neutral-800 dark:from-black dark:to-neutral-900 p-6"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h3 className="text-white font-bold text-lg mb-4 text-center">Monthly Cost Comparison</h3>
            <div className="grid grid-cols-3 gap-3">
              {Object.entries(COMPETITORS).map(([key, comp]) => (
                <div
                  key={key}
                  className={`
                    p-4 rounded-xl text-center
                    ${comp.isHighlighted
                      ? 'bg-gradient-to-br from-accent-500/20 to-primary-500/20 border border-accent-400/30'
                      : 'bg-white/5 border border-white/10'
                    }
                  `}
                >
                  <div className="text-xs text-neutral-400 mb-1">{comp.name}</div>
                  <div className={`text-lg font-bold ${comp.isHighlighted ? 'text-accent-400' : 'text-neutral-300'}`}>
                    {comp.price}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Desktop View: Table */}
        <div className="hidden md:block">
          <motion.div
            className="
              relative rounded-3xl overflow-hidden
              bg-white/60 dark:bg-neutral-900/60
              backdrop-blur-2xl
              border border-white/40 dark:border-white/10
              shadow-2xl shadow-neutral-900/10 dark:shadow-black/30
            "
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            {/* Inner glow effect */}
            <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/20 dark:ring-white/5 pointer-events-none" />

            <div className="overflow-x-auto">
              <table className="w-full" role="table">
                <TableHeader />
                <tbody className="divide-y divide-neutral-200/50 dark:divide-neutral-700/50">
                  {FEATURES.map((feature, index) => (
                    <TableRow key={feature.id} feature={feature} index={index} />
                  ))}
                  <PricingRow />
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>

        {/* CTA Section */}
        <motion.div
          className="mt-10 md:mt-16 text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
        >
          {/* Migration badge */}
          <motion.div
            className="
              inline-flex items-center gap-2 mb-6 px-4 py-2.5 rounded-full
              bg-gradient-to-r from-success-50 to-success-100
              dark:from-success-900/30 dark:to-success-800/20
              border border-success-200 dark:border-success-700/30
              shadow-lg shadow-success-500/10
            "
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="w-6 h-6 rounded-full bg-success-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-white" strokeWidth={3} />
            </div>
            <span className="text-sm font-semibold text-success-700 dark:text-success-300">
              Free Migration Assistance Included
            </span>
          </motion.div>

          {/* CTA Button */}
          <div>
            <motion.a
              href="/signup"
              className="
                inline-flex items-center gap-2 px-8 py-4 rounded-full
                bg-gradient-to-r from-accent-500 via-primary-500 to-accent-500
                bg-[length:200%_auto]
                text-white font-bold text-lg
                shadow-xl shadow-accent-500/30
                hover:shadow-2xl hover:shadow-accent-500/40
                transition-shadow duration-300
                animate-gradient
                focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 focus-visible:ring-offset-2
              "
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </motion.a>
          </div>
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            No credit card required • 14-day free trial
          </p>
        </motion.div>
      </div>
    </section>
  );
};

export default WhySwitchSection;
