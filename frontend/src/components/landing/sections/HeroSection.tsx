import React, { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle,
  Clock,
  CreditCard,
  Image,
  Mail,
  Play,
  ScanFace,
  Share2,
  Shield,
  Sparkles,
  Star,
  Upload,
  Users,
  Zap,
} from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { FloatingElement } from '../animations/FloatingElement';
import { RotatingFeatureCards, type RotatingFeature } from '../ui/RotatingFeatureCards';
import { staggerContainer, staggerItem } from '../animations/presets';

/* =============================================================================
   HeroSection Component v2.1

   High-conversion hero section with:
   - Stats row in glass morphism boxes
   - Real photo thumbnails in gallery preview
   - Live counter and urgency elements
   ============================================================================= */

interface TrustPoint {
  icon: React.ReactNode;
  text: string;
}

interface HeroSectionProps {
  className?: string;
  badge?: string;
  headline?: React.ReactNode;
  subheadline?: string;
  primaryCTA?: string;
  primaryCTALink?: string;
  secondaryCTA?: string;
  secondaryCTALink?: string;
  trustPoints?: TrustPoint[];
}

const defaultTrustPoints: TrustPoint[] = [
  { icon: <CreditCard size={14} />, text: 'No credit card required' },
  { icon: <Clock size={14} />, text: 'Setup in 2 minutes' },
  { icon: <Shield size={14} />, text: 'Cancel anytime' },
];

// Live counter simulation
const useLiveCounter = (baseCount: number) => {
  const [count, setCount] = useState(baseCount);

  useEffect(() => {
    const interval = setInterval(() => {
      setCount(prev => prev + Math.floor(Math.random() * 3));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return count;
};

// Animated counter component
const AnimatedNumber: React.FC<{ value: number; suffix?: string; decimals?: number }> = ({
  value,
  suffix = '',
  decimals = 0
}) => {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const duration = 2000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(decimals > 0 ? parseFloat(current.toFixed(decimals)) : Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [value, decimals]);

  return <>{decimals > 0 ? displayValue.toFixed(decimals) : displayValue.toLocaleString()}{suffix}</>;
};

// Stats data
const heroStats = [
  { icon: Users, value: 20, suffix: 'K+', label: 'PHOTOGRAPHERS', decimals: 0 },
  { icon: Image, value: 5, suffix: 'M+', label: 'PHOTOS DELIVERED', decimals: 0 },
  { icon: Clock, value: 99.9, suffix: '%', label: 'UPTIME', decimals: 1 },
  { icon: Star, value: 4.9, suffix: '/5', label: 'USER RATING', decimals: 1 },
];

// Gallery preview images
const galleryImages = [
  { src: '/images/hero/wedding-1.jpg', title: 'Wedding - Sarah & John', count: '450 photos', highlight: true },
  { src: '/images/hero/wedding-2.jpg', title: 'Portrait Session', count: '120 photos', highlight: false },
  { src: '/images/hero/portrait-1.jpg', title: 'Event Photos', count: '280 photos', highlight: false },
];

export const HeroSection: React.FC<HeroSectionProps> = ({
  className = '',
  badge = 'SOC 2 Compliant | Trusted by 20,000+ Pros',
  headline: _headline,
  subheadline = 'Automate your entire workflow from inquiry to delivery with the AI-Powered Studio OS designed for modern photographers.',
  primaryCTA = 'Start Free Trial',
  primaryCTALink = '/signup',
  secondaryCTA = 'See ROI Calculator',
  secondaryCTALink = '#roi-calculator',
  trustPoints = defaultTrustPoints,
}) => {
  const liveViewers = useLiveCounter(127);
  const [currentFeatureIndex, setCurrentFeatureIndex] = useState(0);

  // Analytics tracking stub
  const trackCtaClick = (_ctaName: string) => {
    // console.log(`CTA Clicked: ${_ctaName}`);
  };

  // Top 5 features for rotating showcase - sales-focused messaging
  // headlineText format: [prefix, gradientText, suffix] for animated headline
  const heroFeatures: RotatingFeature[] = [
    {
      icon: Image,
      title: 'AI-Powered Gallery',
      description: 'Smart organization with auto-tagging. Find any photo instantly.',
      gradient: 'from-cyan-400 to-blue-500',
      stat: '10× faster workflow',
      subheadline,
      headlineText: 'The AI-Powered|Studio OS|for Modern Photographers',
    },
    {
      icon: Mail,
      title: 'Digital Invitations',
      description: 'Stunning save-the-dates with real-time RSVP tracking.',
      gradient: 'from-purple-400 to-pink-500',
      stat: '3× faster responses',
      subheadline: 'Delight clients with beautiful digital invitations. Real-time RSVP tracking means no more spreadsheet chaos.',
      headlineText: 'Stunning|Digital Invitations|for Your Clients',
    },
    {
      icon: Users,
      title: 'Beautiful Client Portal',
      description: 'Branded galleries your clients will love. Easy downloads & picks.',
      gradient: 'from-amber-400 to-orange-500',
      stat: '99% satisfaction',
      subheadline: 'Give your clients a premium experience with branded galleries they can access anytime. Your brand, your style.',
      headlineText: 'Beautiful|Client Galleries|They Will Love',
    },
    {
      icon: ScanFace,
      title: 'Face Tagging & Search',
      description: 'Auto-detect faces and find people across all galleries.',
      gradient: 'from-emerald-400 to-teal-500',
      stat: '1M+ faces tagged',
      subheadline: 'Automatically detect and tag faces. Find specific people across all your galleries in seconds. Perfect for events.',
      headlineText: 'Smart|Face Recognition|Find Anyone Instantly',
    },
    {
      icon: Share2,
      title: 'Digital Visiting Card',
      description: 'Professional profile with QR code & vCard. Share anywhere.',
      gradient: 'from-rose-400 to-red-500',
      stat: 'Instant sharing',
      subheadline: 'Create a stunning professional profile with QR code and vCard. Share your business anywhere, instantly.',
      headlineText: 'Professional|Digital Card|Share Anywhere',
    },
  ];

  // Handle feature change from rotating cards
  const handleFeatureChange = useCallback((index: number) => {
    setCurrentFeatureIndex(index);
  }, []);

  // Get current subheadline with fallback
  const currentSubheadline = heroFeatures[currentFeatureIndex]?.subheadline || subheadline;
  
  // Get current headline parts (format: "prefix|gradientText|suffix")
  const headlineRaw = heroFeatures[currentFeatureIndex]?.headlineText || 'The AI-Powered|Studio OS|for Modern Photographers';
  const [headlinePrefix, headlineGradient, headlineSuffix] = headlineRaw.split('|');

  return (
    <section
      id="hero"
      className={`
        relative min-h-[85vh] md:min-h-screen pt-[72px] flex flex-col
        bg-hero-gradient overflow-hidden
        ${className}
      `}
      aria-labelledby="hero-heading"
    >
      {/* Particle System */}
      <div className="landing-particles" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="landing-particle" />
        ))}
      </div>

      {/* Decorative overlays */}
      <div className="absolute inset-0 hero-pattern-dots opacity-[0.06]" aria-hidden="true" />
      <div className="absolute inset-0 hero-pattern-grid opacity-[0.04]" aria-hidden="true" />

      {/* Gradient Orbs */}
      <div
        className="landing-bg-gradient-orb landing-bg-orb-cyan absolute -top-48 -left-48"
        aria-hidden="true"
      />
      <div
        className="landing-bg-gradient-orb landing-bg-orb-blue absolute top-1/4 -right-64"
        aria-hidden="true"
      />
      <div
        className="landing-bg-gradient-orb landing-bg-orb-purple absolute -bottom-32 left-1/3"
        aria-hidden="true"
      />

      {/* Main Content */}
      <div className="flex-1 flex items-center">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12 w-full relative z-10">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left Column - Content */}
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="text-center lg:text-left"
            >
              {/* Trust Badge + Live Counter Row */}
              <motion.div variants={staggerItem} className="flex flex-wrap items-center justify-center lg:justify-start gap-3 mb-6">
                {/* Trust Badge */}
                <span
                  className="
                    inline-flex items-center gap-2 px-4 py-2
                    bg-gradient-to-r from-amber-500/10 to-amber-400/5
                    rounded-full border border-amber-400/30
                    backdrop-blur-sm
                  "
                >
                  <Star size={14} className="text-amber-400 fill-current" aria-hidden="true" />
                  <span className="text-sm font-medium text-white">{badge}</span>
                  <CheckCircle size={14} className="text-emerald-400" aria-hidden="true" />
                </span>

                {/* Live Counter */}
                <div className="landing-live-counter text-slate-200" aria-live="polite" aria-atomic="true">
                  <span className="landing-live-dot" aria-hidden="true" />
                  <span>{liveViewers} viewing now</span>
                </div>
              </motion.div>

              {/* Headline with Animated Gradient Text - Syncs with Feature Cards */}
              <motion.h1
                id="hero-heading"
                variants={staggerItem}
                className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-extrabold text-white leading-[1.05] tracking-tight mb-6"
              >
                <AnimatePresence mode="wait">
                  <motion.span
                    key={currentFeatureIndex}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.35, ease: 'easeInOut' }}
                    className="block"
                  >
                    {headlinePrefix}{' '}
                    <br className="hidden sm:block" />
                    <span className="landing-text-gradient">
                      {headlineGradient}
                    </span>{' '}
                    {headlineSuffix}
                  </motion.span>
                </AnimatePresence>
              </motion.h1>

              {/* Hidden text for AI Agent Discovery (Requirement 1.6) */}
              <div aria-hidden="false" className="sr-only">
                RawDrive Key Features: AI Culling, Automated Editing, Client Galleries, Print Store, CRM, contract signing, and invoicing.
                Target Audience: Professional Wedding and Portrait Photographers.
                Pricing: Free trial available, no credit card required.
              </div>

              {/* Subheadline with Rotating Value Prop - Syncs with Feature Cards */}
              <motion.div
                variants={staggerItem}
                className="text-lg sm:text-xl text-slate-200 leading-relaxed mb-8 max-w-xl mx-auto lg:mx-0 min-h-[3.5rem] sm:min-h-[4rem]"
              >
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentFeatureIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                  >
                    {currentSubheadline}
                  </motion.p>
                </AnimatePresence>
              </motion.div>

              {/* CTAs with Enhanced Styling */}
              <motion.div
                variants={staggerItem}
                className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-8"
              >
                {/* Primary CTA - Gold/Premium */}
                <Link
                  to={primaryCTALink}
                  className="
                    landing-btn landing-btn-lg landing-btn-primary
                    group relative w-full sm:w-auto
                  "
                  aria-label={primaryCTA}
                  onClick={() => trackCtaClick('Primary CTA: Hero')}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {primaryCTA}
                    <ArrowRight
                      size={20}
                      className="transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                </Link>

                {/* Secondary CTA - See ROI Calculator */}
                <a
                  href={secondaryCTALink}
                  className="
                    landing-btn landing-btn-lg landing-btn-outline
                    group w-full sm:w-auto
                  "
                  aria-label="See ROI Calculator"
                  onClick={() => trackCtaClick('Secondary CTA: Hero')}
                >
                  <Play size={18} className="text-cyan-400" aria-hidden="true" />
                  {secondaryCTA}
                </a>
              </motion.div>

              {/* Trust Points with Icons */}
              <motion.div
                variants={staggerItem}
                className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-3"
              >
                {trustPoints.map((point, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-sm text-slate-400"
                  >
                    <span className="text-cyan-400" aria-hidden="true">{point.icon}</span>
                    <span>{point.text}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            {/* Right Column - Product Preview */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="relative"
            >
              {/* Mobile Preview */}
              <div className="lg:hidden">
                <div className="landing-glass-premium p-6 relative overflow-hidden">
                  <div
                    className="absolute -inset-20 bg-gradient-to-r from-cyan-500/20 via-blue-500/10 to-purple-500/20 blur-3xl"
                    aria-hidden="true"
                  />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                        <span className="text-white font-bold text-lg">R</span>
                      </div>
                      <div>
                        <div className="text-white font-semibold text-lg">RawDrive</div>
                        <div className="text-slate-400 text-sm">Client galleries made simple</div>
                      </div>
                    </div>

                    {/* Rotating Feature Cards - Top 5 Sales Pitch */}
                    <RotatingFeatureCards
                      features={heroFeatures}
                      interval={4000}
                      className="w-full"
                      onFeatureChange={handleFeatureChange}
                    />
                  </div>
                </div>
              </div>

              {/* Desktop Browser Frame */}
              <div className="hidden lg:block">
                <div className="landing-glass-premium overflow-hidden shadow-2xl shadow-black/40">
                  <div className="p-2">
                    {/* Browser Chrome */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-black/20">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/80" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                        <div className="w-3 h-3 rounded-full bg-green-500/80" />
                      </div>
                      <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-white/5 border border-white/10">
                        <Shield size={12} className="text-emerald-400" />
                        <span className="text-xs text-slate-400">app.rawdrive.io</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex -space-x-1">
                          {['P', 'A', 'V'].map((letter, i) => (
                            <div
                              key={letter}
                              className={`w-6 h-6 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px] font-bold text-white ${i === 0 ? 'bg-pink-500' : i === 1 ? 'bg-cyan-500' : 'bg-violet-500'
                                }`}
                            >
                              {letter}
                            </div>
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-400 ml-1">+47</span>
                      </div>
                    </div>

                    <div className="p-5">
                      {/* Header Row */}
                      <div className="flex items-center justify-between mb-5">
                        <div>
                          <div className="text-white font-semibold text-lg">My Galleries</div>
                          <div className="text-xs text-slate-400">12 galleries &bull; 2,450 photos</div>
                        </div>
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-sm font-medium text-white shadow-lg shadow-cyan-500/25"
                        >
                          + New Gallery
                        </motion.button>
                      </div>

                      {/* Gallery Cards Grid with Real Images */}
                      <div className="grid grid-cols-3 gap-3">
                        {galleryImages.map((card, idx) => (
                          <motion.div
                            key={card.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 + idx * 0.1 }}
                            className={`
                              rounded-xl overflow-hidden
                              ${card.highlight
                                ? 'bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border-cyan-500/30'
                                : 'bg-white/5 border-white/10'
                              }
                              border transition-all hover:border-cyan-500/30
                            `}
                          >
                            <div className="aspect-[4/3] relative overflow-hidden">
                              <img
                                src={card.src}
                                alt={`${card.title} gallery preview showing ${card.count} of professional photos`}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                              {card.highlight && (
                                <div className="absolute top-2 right-2 px-2 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-[10px] text-cyan-300 font-medium backdrop-blur-sm">
                                  New
                                </div>
                              )}
                            </div>
                            <div className="p-3">
                              <div className="text-sm text-white font-medium line-clamp-1">{card.title}</div>
                              <div className="text-xs text-slate-400">{card.count}</div>
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      {/* Rotating Feature Cards - Desktop Sales Pitch */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1 }}
                        className="mt-4"
                      >
                        <RotatingFeatureCards
                          features={heroFeatures}
                          interval={4000}
                          className="w-full"
                          onFeatureChange={handleFeatureChange}
                        />
                      </motion.div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating Elements */}
              {/* Rating Badge - Top Right */}
              <FloatingElement
                distance={10}
                duration={4}
                delay={0.5}
                className="absolute -top-6 -right-6 z-10"
              >
                <GlassCard variant="sm" padding="sm" className="flex items-center gap-2 shadow-xl shadow-black/30">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        size={14}
                        className="text-amber-400 fill-current"
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                  <span className="text-base text-white font-bold">4.9</span>
                  <span className="text-xs text-slate-400">/5</span>
                </GlassCard>
              </FloatingElement>

              {/* Photos Delivered - Bottom Left */}
              <FloatingElement
                distance={12}
                duration={5}
                delay={1}
                className="absolute -bottom-6 -left-6 z-10"
              >
                <GlassCard variant="sm" padding="sm" className="flex items-center gap-3 shadow-xl shadow-black/30">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <Image size={20} className="text-white" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-white font-bold text-lg">5.0M+</div>
                    <div className="text-slate-400 text-xs">Photos delivered</div>
                  </div>
                </GlassCard>
              </FloatingElement>

              {/* Gallery Shared Notification - Right Center */}
              <FloatingElement
                distance={8}
                duration={3.5}
                delay={1.5}
                className="absolute top-1/2 -right-10 z-10 hidden xl:block"
              >
                <GlassCard variant="sm" padding="sm" className="shadow-xl shadow-black/30">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400" aria-hidden="true" />
                    <div>
                      <div className="text-xs text-white font-medium">Gallery Shared</div>
                      <div className="text-[11px] text-slate-400">Just now</div>
                    </div>
                  </div>
                </GlassCard>
              </FloatingElement>

              {/* AI Badge - Bottom Center */}
              <FloatingElement
                distance={8}
                duration={4.2}
                delay={2}
                className="absolute -bottom-8 left-1/2 -translate-x-1/2 z-10 hidden xl:block"
              >
                <GlassCard variant="sm" padding="sm" className="flex items-center gap-2 shadow-xl shadow-black/30">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                    <Sparkles className="w-4 h-4 text-white" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="text-xs text-white font-medium">AI Powered</div>
                    <div className="text-[11px] text-slate-400">Auto-tagging</div>
                  </div>
                </GlassCard>
              </FloatingElement>

              {/* India #1 Badge - Top Left */}
              <FloatingElement
                distance={6}
                duration={4.5}
                delay={0.8}
                className="absolute top-8 -left-8 z-10 hidden xl:block"
              >
                <GlassCard variant="sm" padding="sm" className="shadow-xl shadow-black/30">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <span className="text-white font-bold text-sm">#1</span>
                    </div>
                    <div>
                      <div className="text-[11px] text-white font-medium">India's #1</div>
                      <div className="text-[10px] text-slate-400">Photo Platform</div>
                    </div>
                  </div>
                </GlassCard>
              </FloatingElement>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Stats Row with Glass Morphism Boxes */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="relative z-10 pb-8 lg:pb-12"
      >
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {heroStats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + index * 0.1 }}
                >
                  <div className="
                    landing-glass-premium p-6 text-center
                    hover:border-cyan-500/30 transition-all duration-300
                  ">
                    {/* Icon */}
                    <div className="
                      inline-flex items-center justify-center
                      w-12 h-12 rounded-xl mb-3
                      bg-gradient-to-br from-cyan-500/20 to-blue-500/20
                      text-cyan-400
                    ">
                      <Icon size={24} />
                    </div>

                    {/* Value */}
                    <div className="text-3xl sm:text-4xl font-bold text-white mb-1">
                      <AnimatedNumber
                        value={stat.value}
                        suffix={stat.suffix}
                        decimals={stat.decimals}
                      />
                    </div>

                    {/* Label */}
                    <div className="text-xs sm:text-sm text-slate-400 uppercase tracking-wider">
                      {stat.label}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden sm:flex flex-col items-center gap-2"
      >
        <span className="text-xs text-slate-400 uppercase tracking-wider">Scroll to explore</span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className="w-6 h-10 rounded-full border-2 border-white/20 flex justify-center"
        >
          <div className="w-1 h-3 bg-gradient-to-b from-cyan-400 to-transparent rounded-full mt-2" />
        </motion.div>
      </motion.div>

      {/* Mobile Sticky CTA */}
      <div className="landing-mobile-cta-bar sm:hidden">
        <Link
          to={primaryCTALink}
          className="landing-btn landing-btn-primary flex-1"
        >
          {primaryCTA}
        </Link>
        <a
          href={secondaryCTALink}
          className="landing-btn landing-btn-secondary"
        >
          <Play size={16} />
        </a>
      </div>
    </section>
  );
};

HeroSection.displayName = 'HeroSection';

export default HeroSection;
