import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Cloud,
  Image,
  Shield,
  Sparkles,
  UserCheck,
  Users,
  Mail,
  Play,
  Pause,
} from 'lucide-react';
import { FadeIn } from '../animations/FadeIn';
import { staggerContainer, staggerItem } from '../animations/presets';

/* =============================================================================
   FeaturesSection Component

   Displays feature cards with auto-rotating carousel, 3 relevant images per feature,
   larger fonts for readability, and detailed descriptions.
   ============================================================================= */

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
  detailedDescription: string;
  href?: string;
  category?: string;
  benefits?: string[];
  stat?: string;
  demoImages: string[];
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
  /** Auto-rotate interval in milliseconds */
  autoRotateInterval?: number;
}

const defaultFeatures: Feature[] = [
  {
    icon: <Image size={28} />,
    title: 'AI-Powered Gallery Management',
    description: 'Smart organization powered by artificial intelligence.',
    detailedDescription:
      'Transform how you manage thousands of photos with cutting-edge AI. Our system automatically analyzes images, identifies subjects and scenes, and organizes them into smart collections.',
    benefits: [
      'Automatic photo tagging with AI recognition',
      'Natural language search ("couple by waterfall")',
      'Smart culling suggests your best shots',
      'Batch editing with intelligent presets',
      'Unlimited AI usage with your own API key',
      'Duplicate detection & removal',
    ],
    stat: '10× faster organization',
    href: '/features#ai',
    category: 'ai',
    demoImages: [
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1551650975-87deedd944c3?w=400&h=400&fit=crop',
    ],
  },
  {
    icon: <Mail size={28} />,
    title: 'Digital Invitations & Save the Dates',
    description: 'Beautiful, mobile-responsive digital invitations.',
    detailedDescription:
      'Create stunning invitations that look amazing on any device. Built-in RSVP tracking eliminates spreadsheet chaos with one-tap confirmations and real-time notifications.',
    benefits: [
      'One-tap RSVP with instant confirmation',
      'Automatic guest tracking & reminders',
      'Import from contacts, CSV, or Excel',
      'Seamless gallery branding integration',
      'Dietary requirements & plus-one tracking',
      'Customizable invitation templates',
      'SMS & email delivery options',
      'Real-time response analytics',
    ],
    stat: '3× faster client responses',
    href: '/features#invitations',
    category: 'delivery',
    demoImages: [
      'https://images.unsplash.com/photo-1520854221256-17451cc331bf?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=400&h=400&fit=crop',
    ],
  },
  {
    icon: <Users size={28} />,
    title: 'Beautiful Client Portal',
    description: 'Premium branded galleries for your clients.',
    detailedDescription:
      'Deliver a luxury experience with custom-branded galleries. Clients can browse, favorite, and download photos while your branding shines through every interaction.',
    benefits: [
      'Password-protected private galleries',
      'Your logo, colors & custom domain',
      'Multiple download size options',
      'Favorites & selection tools',
      'Watermarked preview options',
      'Expiring gallery links',
      'Mobile-optimized viewing',
      'Social sharing integration',
    ],
    stat: '99% client satisfaction',
    href: '/features#galleries',
    category: 'delivery',
    demoImages: [
      'https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1519741497674-611481863552?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1591604466107-ec97de577aff?w=400&h=400&fit=crop',
    ],
  },
  // Phase 2 Feature - Print Album Designer (uncomment when ready)
  // {
  //   icon: <BookOpen size={28} />,
  //   title: 'Print Album Designer',
  //   description: 'Drag-and-drop album creation made simple.',
  //   detailedDescription:
  //     'Create stunning print-ready albums with our intuitive designer. Choose from 50+ templates and let AI suggest optimal layouts for your photos.',
  //   benefits: [
  //     'Intuitive drag-and-drop interface',
  //     '50+ professionally designed templates',
  //     'AI auto-layout suggestions',
  //     'Export print-ready PDFs',
  //     'Real-time spread preview',
  //     'Precision crop adjustments',
  //     'Multiple album sizes supported',
  //     'Direct lab integration',
  //   ],
  //   stat: '40% more album sales',
  //   href: '/features#albums',
  //   category: 'design',
  //   demoImages: [
  //     'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400&h=400&fit=crop',
  //     'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400&h=400&fit=crop',
  //     'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop',
  //   ],
  // },
  {
    icon: <Sparkles size={28} />,
    title: 'Face Tagging & Recognition',
    description: 'Find anyone across all your galleries instantly.',
    detailedDescription:
      'Advanced face recognition detects and groups faces across all galleries. Tag once and find every photo of that person—perfect for weddings and events.',
    benefits: [
      'Automatic face detection on upload',
      'Find any person across all galleries',
      'Group photos by individual people',
      'Privacy controls & easy opt-out',
      'Works across multiple events',
      'Merge similar face groups',
      'Guest self-service photo finding',
      'Bulk tagging capabilities',
    ],
    stat: '1M+ faces tagged',
    href: '/features#ai',
    category: 'ai',
    demoImages: [
      'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1523438885200-e635ba2c371e?w=400&h=400&fit=crop',
    ],
  },
  {
    icon: <UserCheck size={28} />,
    title: 'Client Management CRM',
    description: 'All your clients and projects in one place.',
    detailedDescription:
      'Track every client from inquiry to delivery. Store contact info, project history, and preferences. Integrated invoicing and automated reminders keep you organized.',
    benefits: [
      'Comprehensive client profiles',
      'Project timelines with deadlines',
      'Centralized communication history',
      'Integrated invoicing & payments',
      'Automated reminder emails',
      'Contract & document storage',
      'Lead tracking & pipeline',
      'Custom tags & categories',
    ],
    stat: '50% time saved on admin',
    href: '/features#crm',
    category: 'business',
    demoImages: [
      'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=400&h=400&fit=crop',
    ],
  },
  {
    icon: <Cloud size={28} />,
    title: 'Secure Cloud Storage',
    description: 'Enterprise-grade security with global delivery.',
    detailedDescription:
      'Bank-level AES-256 encryption protects your files. Global CDN ensures lightning-fast loading anywhere. Automatic backups and 99.9% uptime guarantee.',
    benefits: [
      'AES-256 encryption at rest & transit',
      'Global CDN for instant loading',
      'Automatic redundant backups',
      '99.9% uptime guarantee SLA',
      'Unlimited bandwidth included',
      'Version history & file recovery',
      'GDPR & CCPA compliant',
      'SOC 2 Type II certified',
    ],
    stat: '99.9% uptime SLA',
    href: '/features#security',
    category: 'security',
    demoImages: [
      'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400&h=400&fit=crop',
    ],
  },
];

export const FeaturesSection: React.FC<FeaturesSectionProps> = ({
  className = '',
  id = 'features',
  title = 'Everything You Need',
  subtitle = 'From gallery delivery to client management, we\'ve got you covered.',
  features = defaultFeatures,
  autoRotateInterval = 6000,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const safeFeatures = useMemo(
    () => (Array.isArray(features) && features.length > 0 ? features : defaultFeatures),
    [features]
  );

  const activeFeature = safeFeatures[Math.min(activeIndex, safeFeatures.length - 1)];

  // Auto-rotate logic
  const startAutoRotate = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % safeFeatures.length);
    }, autoRotateInterval);
  }, [autoRotateInterval, safeFeatures.length]);

  const stopAutoRotate = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Start/stop auto-rotate based on pause state
  useEffect(() => {
    if (!isPaused) {
      startAutoRotate();
    } else {
      stopAutoRotate();
    }
    return () => stopAutoRotate();
  }, [isPaused, startAutoRotate, stopAutoRotate]);

  // Handle manual feature selection
  const handleFeatureClick = (index: number) => {
    setActiveIndex(index);
    // Reset timer when user manually selects
    if (!isPaused) {
      startAutoRotate();
    }
  };

  const togglePause = () => {
    setIsPaused((prev) => !prev);
  };

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
        <FadeIn direction="up" className="text-center mb-12 lg:mb-16">
          <h2
            id="features-heading"
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6"
          >
            {title}
          </h2>
          <p className="text-xl sm:text-2xl text-slate-300 max-w-3xl mx-auto leading-relaxed">
            {subtitle}
          </p>
        </FadeIn>

        {/* Auto-rotate controls */}
        <div className="flex justify-center mb-8">
          <button
            type="button"
            onClick={togglePause}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/20 text-white text-sm font-medium transition-all duration-200"
            aria-label={isPaused ? 'Resume auto-rotate' : 'Pause auto-rotate'}
          >
            {isPaused ? <Play size={16} /> : <Pause size={16} />}
            {isPaused ? 'Resume' : 'Auto-rotating'}
          </button>
        </div>

        {/* Progress indicators */}
        <div className="flex justify-center gap-2 mb-10">
          {safeFeatures.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleFeatureClick(index)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === activeIndex
                  ? 'w-8 bg-gradient-to-r from-primary-500 to-accent-500'
                  : 'w-2 bg-white/30 hover:bg-white/50'
              }`}
              aria-label={`Go to feature ${index + 1}`}
            />
          ))}
        </div>

        {/* Tabs + Preview */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Feature List - Left Side */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={staggerContainer}
            className="space-y-3 px-1 py-1 -mx-1"
          >
            {safeFeatures.map((feature, index) => (
              <motion.button
                key={feature.title}
                type="button"
                variants={staggerItem}
                onClick={() => handleFeatureClick(index)}
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => setIsPaused(false)}
                className={`
                  w-full text-left
                  p-5 rounded-2xl border transition-all duration-300
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                  ${index === activeIndex
                    ? 'bg-white/10 border-primary-500/50 shadow-lg shadow-primary-500/15'
                    : 'bg-white/5 border-white/10 hover:border-white/25 hover:bg-white/8'
                  }
                `}
                aria-pressed={index === activeIndex}
              >
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center shadow-lg transition-all duration-300 ${
                    index === activeIndex
                      ? 'bg-gradient-to-br from-primary-500 to-accent-500 text-white shadow-cyan-500/25'
                      : 'bg-gradient-to-br from-primary-500/30 to-accent-500/30 border border-white/15 text-cyan-300 shadow-cyan-500/10'
                  }`}>
                    {feature.icon}
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-semibold text-xl mb-1">{feature.title}</div>
                    <div className="text-slate-300 text-base">{feature.description}</div>
                    {feature.stat && (
                      <div className="mt-3 inline-flex px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-sm text-slate-200 font-medium">
                        {feature.stat}
                      </div>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </motion.div>

          {/* Feature Detail - Right Side */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="lg:sticky lg:top-24"
          >
            <div className="relative">
              <div
                className="absolute -inset-6 bg-gradient-to-r from-accent-500/15 to-primary-600/10 blur-2xl rounded-3xl"
                aria-hidden="true"
              />
              <div className="relative rounded-3xl overflow-hidden bg-white/5 border border-white/10 backdrop-blur-sm">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeFeature.title}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="p-8 md:p-10"
                  >
                    {/* Header */}
                    <div className="flex items-start gap-5 mb-8">
                      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white shadow-lg shadow-cyan-500/25">
                        {activeFeature.icon}
                      </div>
                      <div>
                        <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                          {activeFeature.title}
                        </h3>
                        {activeFeature.stat && (
                          <span className="inline-flex px-3 py-1 rounded-full bg-gradient-to-r from-primary-500/20 to-accent-500/20 border border-primary-500/30 text-primary-300 text-sm font-semibold">
                            {activeFeature.stat}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Detailed Description - 2-3 lines */}
                    <p className="text-base sm:text-lg text-slate-200 leading-relaxed mb-6">
                      {activeFeature.detailedDescription}
                    </p>

                    {/* Benefits - single column, readable */}
                    {activeFeature.benefits?.length ? (
                      <ul className="grid gap-3 mb-6">
                        {activeFeature.benefits.map((benefit) => (
                          <li key={benefit} className="flex items-start gap-3 text-slate-200 text-base">
                            <span className="mt-2 w-2 h-2 rounded-full bg-gradient-to-r from-accent-400 to-primary-400 flex-shrink-0" />
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {/* Demo Images - 3 images */}
                    <div className="grid grid-cols-3 gap-3 mb-8">
                      {activeFeature.demoImages.slice(0, 3).map((url, i) => (
                        <motion.div
                          key={`${activeFeature.title}-img-${i}`}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.3, delay: i * 0.1 }}
                          className="aspect-square rounded-xl overflow-hidden bg-white/5 border border-white/10 shadow-lg"
                        >
                          <img
                            src={url}
                            alt={`${activeFeature.title} example ${i + 1}`}
                            className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                            decoding="async"
                          />
                        </motion.div>
                      ))}
                    </div>

                    {/* CTA */}
                    <div className="flex flex-col sm:flex-row gap-4">
                      <a
                        href="#pricing"
                        className="
                          inline-flex items-center justify-center gap-2
                          px-8 py-4 rounded-xl
                          bg-gradient-to-r from-primary-600 to-primary-700
                          hover:from-primary-500 hover:to-primary-600
                          text-white font-semibold text-lg
                          transition-all duration-200 hover:-translate-y-0.5
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                          min-h-[56px]
                          shadow-lg shadow-primary-500/25
                        "
                      >
                        Get Started Free
                        <ArrowRight className="w-5 h-5" aria-hidden="true" />
                      </a>
                      {activeFeature.href && (
                        <a
                          href={activeFeature.href}
                          className="
                            inline-flex items-center justify-center
                            px-8 py-4 rounded-xl
                            bg-white/5 hover:bg-white/10
                            border border-white/15 hover:border-white/25
                            text-white font-semibold text-lg
                            transition-all duration-200
                            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                            min-h-[56px]
                          "
                        >
                          Learn More
                        </a>
                      )}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Quick features bar */}
        <div className="mt-16 lg:mt-20 grid md:grid-cols-3 gap-4">
          {[
            { icon: Sparkles, title: 'Lightning fast uploads', desc: 'Optimized pipelines with resumable transfers for any file size.' },
            { icon: Shield, title: 'Bank-level security', desc: 'AES-256 encryption protects your files in transit and at rest.' },
            { icon: Cloud, title: 'Global CDN delivery', desc: 'Your galleries load instantly for clients anywhere in the world.' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-2xl bg-white/5 border border-white/10 p-6 hover:bg-white/8 transition-colors duration-200">
                <div className="flex items-center gap-3 mb-3">
                  <Icon className="w-6 h-6 text-cyan-400" aria-hidden="true" />
                  <div className="text-white font-semibold text-lg">{item.title}</div>
                </div>
                <div className="text-base text-slate-300">{item.desc}</div>
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
