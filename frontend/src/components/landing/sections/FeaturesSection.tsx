import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Cloud,
  Image,
  Shield,
  Sparkles,
  UserCheck,
  Users,
} from 'lucide-react';
import { FadeIn } from '../animations/FadeIn';
import { staggerContainer, staggerItem } from '../animations/presets';

/* =============================================================================
   FeaturesSection Component

   Displays feature cards in a grid layout with stagger animations.
   ============================================================================= */

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  href?: string;
  category?: string;
  benefits?: string[];
  stat?: string;
  demoImages?: string[];
}

interface FeaturesSectionProps {
  /** Custom class name */
  className?: string;
  /** Section ID for navigation */
  id?: string;
  /** Section title */
  title?: string;
  /** Section subtitle */
  subtitle?: string;
  /** Features to display */
  features?: Feature[];
}

const demoImages = [
  '/images/features/feature-1.jpg',
  '/images/features/feature-2.jpg',
  '/images/features/feature-3.jpg',
  '/images/features/feature-4.jpg',
  '/images/features/feature-5.jpg',
  '/images/features/feature-6.jpg',
];

const defaultFeatures: Feature[] = [
  {
    icon: <Image size={24} />,
    title: 'AI-Powered Gallery Management',
    description:
      'Organize thousands of photos effortlessly with intelligent tagging and smart search. Our AI understands your photos and makes them searchable.',
    benefits: [
      'Automatic photo tagging with AI',
      'Smart search by content, colors, faces',
      'Bulk organization & batch editing',
      'Custom collections & albums',
    ],
    stat: '10× faster organization',
    href: '/features#ai',
    category: 'ai',
    demoImages,
  },
  {
    icon: <Users size={24} />,
    title: 'Beautiful Client Portal',
    description:
      "Give your clients a premium experience with branded galleries they can access anytime. Your brand, your style, your client's delight.",
    benefits: [
      'Password-protected galleries',
      'Custom branding & colors',
      'Easy photo downloads',
      'Favorites & selection tools',
    ],
    stat: '99% client satisfaction',
    href: '/features#galleries',
    category: 'delivery',
    demoImages,
  },
  {
    icon: <BookOpen size={24} />,
    title: 'Print Album Designer',
    description:
      'Create stunning print-ready albums with our intuitive drag-and-drop designer. From concept to print in minutes, not hours.',
    benefits: [
      'Intuitive drag-and-drop interface',
      '50+ pre-made templates',
      'AI auto-layout suggestions',
      'Print-ready PDF exports',
    ],
    stat: '40% more album sales',
    href: '/features#albums',
    category: 'design',
    demoImages,
  },
  {
    icon: <Sparkles size={24} />,
    title: 'Face Tagging & Search',
    description:
      'Automatically detect and tag faces, making it easy to find specific people across all your galleries. Perfect for events.',
    benefits: [
      'Automatic face detection',
      'Person-based search',
      'Group similar faces together',
      'Privacy controls built-in',
    ],
    stat: '1M+ faces tagged',
    href: '/features#ai',
    category: 'ai',
    demoImages,
  },
  {
    icon: <UserCheck size={24} />,
    title: 'Client Management',
    description:
      'Keep track of all your clients, projects, and deliveries in one organized dashboard. Never lose track of a project again.',
    benefits: [
      'Detailed client profiles',
      'Project tracking & timelines',
      'Communication history',
      'Invoice & payment integration',
    ],
    stat: '50% time saved',
    href: '/features#crm',
    category: 'business',
    demoImages,
  },
  {
    icon: <Cloud size={24} />,
    title: 'Secure Cloud Storage',
    description:
      'Store and deliver your photos with enterprise-grade security and lightning-fast delivery via our global CDN.',
    benefits: ['Unlimited bandwidth', 'Global CDN delivery', 'Automatic backups', '99.9% uptime guarantee'],
    stat: '99.9% uptime SLA',
    href: '/features#security',
    category: 'security',
    demoImages,
  },
];

export const FeaturesSection: React.FC<FeaturesSectionProps> = ({
  className = '',
  id = 'features',
  title = 'Everything You Need',
  subtitle = 'From gallery delivery to client management, we\'ve got you covered.',
  features = defaultFeatures,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);

  const safeFeatures = useMemo(
    () => (Array.isArray(features) && features.length > 0 ? features : defaultFeatures),
    [features]
  );

  const activeFeature = safeFeatures[Math.min(activeIndex, safeFeatures.length - 1)];

  return (
    <section
      id={id}
      className={`py-20 lg:py-32 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-900 relative overflow-hidden ${className}`}
      aria-labelledby="features-heading"
    >
      {/* Background decorative elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.1),transparent_50%)]" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(6,182,212,0.08),transparent_50%)]" aria-hidden="true" />
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <FadeIn direction="up" className="text-center mb-16">
          <h2
            id="features-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4"
          >
            {title}
          </h2>
          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto">
            {subtitle}
          </p>
        </FadeIn>

        {/* Tabs + Preview */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={staggerContainer}
            className="space-y-3"
          >
            {safeFeatures.map((feature, index) => (
              <motion.button
                key={feature.title}
                type="button"
                variants={staggerItem}
                onClick={() => setActiveIndex(index)}
                className={
                  `
                    w-full text-left
                    p-5 rounded-2xl border transition-all duration-200
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                    ${index === activeIndex
                      ? 'bg-white/8 border-primary-500/40 shadow-lg shadow-primary-500/10'
                      : 'bg-white/5 border-white/10 hover:border-white/20'
                    }
                  `
                }
                aria-pressed={index === activeIndex}
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500/30 to-accent-500/30 border border-white/15 flex items-center justify-center text-cyan-300 shadow-lg shadow-cyan-500/10">
                    {feature.icon}
                  </div>
                  <div>
                    <div className="text-white font-semibold text-lg">{feature.title}</div>
                    <div className="text-slate-300 text-sm mt-1 line-clamp-2">{feature.description}</div>
                    {feature.stat ? (
                      <div className="mt-3 inline-flex px-2.5 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-slate-200 font-medium">
                        {feature.stat}
                      </div>
                    ) : null}
                  </div>
                </div>
              </motion.button>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            <div className="relative">
              <div
                className="absolute -inset-6 bg-gradient-to-r from-accent-500/15 to-primary-600/10 blur-2xl rounded-3xl"
                aria-hidden="true"
              />
              <div className="relative rounded-3xl overflow-hidden bg-white/5 border border-white/10">
                <div className="p-6 md:p-8">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25">
                      {activeFeature.icon}
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white">{activeFeature.title}</h3>
                      <p className="text-slate-300 mt-1">{activeFeature.description}</p>
                    </div>
                  </div>

                  {/* Benefits */}
                  {activeFeature.benefits?.length ? (
                    <ul className="grid sm:grid-cols-2 gap-3 mb-8">
                      {activeFeature.benefits.map((benefit) => (
                        <li key={benefit} className="flex items-start gap-2 text-slate-300 text-sm">
                          <span className="mt-0.5 w-2 h-2 rounded-full bg-accent-400 flex-shrink-0" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {/* Demo images */}
                  <div className="grid grid-cols-3 gap-2">
                    {(activeFeature.demoImages || demoImages).slice(0, 6).map((url, i) => (
                      <div
                        key={`${url}-${i}`}
                        className="aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10"
                      >
                        <img
                          src={url}
                          alt={`${activeFeature.title} demo ${i + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div className="mt-8 flex flex-col sm:flex-row gap-3">
                    <a
                      href="#pricing"
                      className="
                        inline-flex items-center justify-center gap-2
                        px-6 py-3 rounded-xl
                        bg-gradient-to-r from-primary-600 to-primary-700
                        hover:from-primary-500 hover:to-primary-600
                        text-white font-semibold
                        transition-all duration-200
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                        min-h-[48px]
                      "
                    >
                      See Pricing & Get Started
                      <ArrowRight className="w-5 h-5" aria-hidden="true" />
                    </a>
                    {activeFeature.href ? (
                      <a
                        href={activeFeature.href}
                        className="
                          inline-flex items-center justify-center
                          px-6 py-3 rounded-xl
                          bg-white/5 hover:bg-white/10
                          border border-white/10 hover:border-white/20
                          text-white font-semibold
                          transition-all duration-200
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                          min-h-[48px]
                        "
                      >
                        Learn More
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Quick features bar */}
        <div className="mt-12 lg:mt-16 grid md:grid-cols-3 gap-4">
          {[
            { icon: Sparkles, title: 'Lightning fast uploads', desc: 'Optimized pipelines and resumable transfers.' },
            { icon: Shield, title: 'Bank-level security', desc: 'Encryption in transit and at rest.' },
            { icon: Cloud, title: 'Global CDN delivery', desc: 'Fast galleries worldwide for every client.' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-2xl bg-white/5 border border-white/10 p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Icon className="w-5 h-5 text-cyan-400" aria-hidden="true" />
                  <div className="text-white font-semibold">{item.title}</div>
                </div>
                <div className="text-sm text-slate-300">{item.desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

FeaturesSection.displayName = 'FeaturesSection';

export default FeaturesSection;
