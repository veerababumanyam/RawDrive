import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BadgeCheck,
  Calendar,
  Clock,
  CreditCard,
  Gift,
  MessageCircle,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { FadeIn } from '../animations/FadeIn';

/* =============================================================================
   CTASection Component v2.0

   Final "No Escape" CTA section with:
   - Urgency timer
   - Dual CTAs (Start Free + Book Demo)
   - Live social proof
   - Enhanced trust signals
   ============================================================================= */

interface TrustPoint {
  icon: React.ReactNode;
  text: string;
}

interface CTASectionProps {
  className?: string;
  id?: string;
  headline?: string;
  subheadline?: string;
  primaryCTA?: string;
  primaryCTALink?: string;
  secondaryCTA?: string;
  secondaryCTALink?: string;
  trustPoints?: TrustPoint[];
}

const defaultTrustPoints: TrustPoint[] = [
  { icon: <CreditCard size={16} />, text: 'No credit card required' },
  { icon: <Clock size={16} />, text: 'Set up in 2 minutes' },
  { icon: <Shield size={16} />, text: 'Cancel anytime' },
];

// Countdown hook
const useCountdown = (targetHours: number = 24) => {
  const [timeLeft, setTimeLeft] = useState({
    hours: targetHours,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const endTime = new Date();
    endTime.setHours(endTime.getHours() + targetHours);

    const timer = setInterval(() => {
      const now = new Date();
      const diff = endTime.getTime() - now.getTime();

      if (diff <= 0) {
        clearInterval(timer);
        return;
      }

      setTimeLeft({
        hours: Math.floor(diff / (1000 * 60 * 60)),
        minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((diff % (1000 * 60)) / 1000),
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [targetHours]);

  return timeLeft;
};

// Live signup counter simulation
const useLiveSignups = (baseCount: number = 47) => {
  const [count, setCount] = useState(baseCount);

  useEffect(() => {
    const interval = setInterval(() => {
      setCount(prev => prev + 1);
    }, 30000); // New signup every 30 seconds
    return () => clearInterval(interval);
  }, []);

  return count;
};

export const CTASection: React.FC<CTASectionProps> = ({
  className = '',
  id = 'cta',
  headline = 'Ready to 10x Your Workflow?',
  subheadline = 'Join 20,000+ photographers who deliver stunning galleries and wow their clients with RawDrive.',
  primaryCTA = 'Start Free Trial',
  primaryCTALink = '/signup',
  secondaryCTA = 'Book a Demo',
  secondaryCTALink = '/demo',
  trustPoints = defaultTrustPoints,
}) => {
  const countdown = useCountdown(24);
  const recentSignups = useLiveSignups(47);

  return (
    <section
      id={id}
      className={`py-20 lg:py-28 bg-hero-gradient relative overflow-hidden ${className}`}
      aria-labelledby="cta-heading"
    >
      {/* Particle System */}
      <div className="landing-particles" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="landing-particle" />
        ))}
      </div>

      {/* Pattern overlays */}
      <div className="absolute inset-0 hero-pattern-hex opacity-[0.04]" aria-hidden="true" />
      <div className="absolute inset-0 hero-pattern-grid opacity-[0.03]" aria-hidden="true" />

      {/* Gradient Orbs */}
      <div
        className="landing-bg-gradient-orb landing-bg-orb-cyan absolute -top-32 left-1/4 opacity-25"
        aria-hidden="true"
      />
      <div
        className="landing-bg-gradient-orb landing-bg-orb-purple absolute -bottom-32 right-1/4 opacity-25"
        aria-hidden="true"
      />

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <FadeIn direction="up">
          <div className="landing-glass-premium relative overflow-hidden rounded-3xl">
            {/* Premium gradient overlay */}
            <div
              className="absolute inset-0 opacity-60"
              style={{
                background:
                  'radial-gradient(ellipse 60% 50% at 30% 50%, rgba(6, 182, 212, 0.15) 0%, transparent 50%), radial-gradient(ellipse 60% 50% at 70% 50%, rgba(124, 58, 237, 0.12) 0%, transparent 50%)',
              }}
              aria-hidden="true"
            />

            <div className="relative px-6 py-12 sm:px-12 sm:py-16 lg:px-20 lg:py-20">
              {/* Urgency Banner */}
              <div className="flex flex-col items-center gap-4 mb-10">
                {/* Live Activity */}
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="text-sm text-emerald-300">
                    <span className="font-semibold">{recentSignups}</span> photographers signed up today
                  </span>
                </motion.div>

                {/* Timer Badge */}
                <div className="inline-flex items-center gap-4 px-6 py-3 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                  <div className="flex items-center gap-2">
                    <Gift className="w-5 h-5 text-amber-400" />
                    <span className="text-white font-semibold">Offer ends in</span>
                  </div>
                  <div className="landing-countdown">
                    <div className="landing-countdown-unit">
                      <span className="landing-countdown-value">{String(countdown.hours).padStart(2, '0')}</span>
                      <span className="landing-countdown-label">hrs</span>
                    </div>
                    <span className="text-slate-500">:</span>
                    <div className="landing-countdown-unit">
                      <span className="landing-countdown-value">{String(countdown.minutes).padStart(2, '0')}</span>
                      <span className="landing-countdown-label">min</span>
                    </div>
                    <span className="text-slate-500">:</span>
                    <div className="landing-countdown-unit">
                      <span className="landing-countdown-value">{String(countdown.seconds).padStart(2, '0')}</span>
                      <span className="landing-countdown-label">sec</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Headline */}
              <div className="text-center max-w-3xl mx-auto mb-10">
                <h2
                  id="cta-heading"
                  className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-6 leading-tight"
                >
                  {headline}
                </h2>
                <p className="text-lg sm:text-xl text-slate-300">
                  {subheadline}
                </p>
              </div>

              {/* Dual CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
                {/* Primary - Start Free */}
                <Link
                  to={primaryCTALink}
                  className="
                    landing-btn landing-btn-xl landing-btn-primary
                    group w-full sm:w-auto min-w-[220px]
                  "
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Zap size={20} className="fill-current" />
                    {primaryCTA}
                    <ArrowRight
                      size={20}
                      className="transition-transform group-hover:translate-x-1"
                    />
                  </span>
                </Link>

                {/* Secondary - Book Demo */}
                <Link
                  to={secondaryCTALink}
                  className="
                    landing-btn landing-btn-xl landing-btn-outline
                    w-full sm:w-auto min-w-[220px]
                  "
                >
                  <Calendar size={18} className="text-cyan-400" />
                  {secondaryCTA}
                </Link>
              </div>

              {/* Trust Points */}
              <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 mb-10">
                {trustPoints.map((point, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 text-sm text-slate-300"
                  >
                    <span className="text-cyan-400">{point.icon}</span>
                    {point.text}
                  </div>
                ))}
              </div>

              {/* Social Proof Row */}
              <div className="flex flex-col items-center gap-6">
                {/* User Avatars + Rating */}
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex -space-x-3">
                    {[
                      { letter: 'P', bg: 'bg-pink-500' },
                      { letter: 'A', bg: 'bg-cyan-500' },
                      { letter: 'V', bg: 'bg-violet-500' },
                      { letter: 'M', bg: 'bg-amber-500' },
                      { letter: 'S', bg: 'bg-emerald-500' },
                    ].map((avatar) => (
                      <div
                        key={avatar.letter}
                        className={`
                          ${avatar.bg} w-10 h-10 rounded-full
                          border-2 border-slate-900/30
                          flex items-center justify-center
                          text-white text-sm font-bold
                        `}
                        aria-hidden="true"
                      >
                        {avatar.letter}
                      </div>
                    ))}
                    <div className="w-10 h-10 rounded-full bg-slate-700 border-2 border-slate-900/30 flex items-center justify-center text-white text-xs font-bold">
                      +20K
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} size={16} className="text-amber-400 fill-current" />
                      ))}
                    </div>
                    <span className="text-white font-semibold">4.9</span>
                    <span className="text-slate-400 text-sm">from 20,000+ reviews</span>
                  </div>
                </div>

                {/* Guarantee Badge */}
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <BadgeCheck className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-emerald-300 font-medium">
                    30-day money-back guarantee on all paid plans
                  </span>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl mt-4">
                  {[
                    { icon: Users, value: '20K+', label: 'Photographers' },
                    { icon: Sparkles, value: '5M+', label: 'Photos Delivered' },
                    { icon: TrendingUp, value: '99.9%', label: 'Uptime SLA' },
                    { icon: MessageCircle, value: '<2hrs', label: 'Support Response' },
                  ].map((stat) => {
                    const Icon = stat.icon;
                    return (
                      <div
                        key={stat.label}
                        className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 text-center"
                      >
                        <Icon className="w-5 h-5 text-cyan-400 mx-auto mb-2" />
                        <div className="text-white font-bold text-2xl mb-1">{stat.value}</div>
                        <div className="text-slate-500 text-xs">{stat.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </FadeIn>

        {/* Footer micro-text */}
        <FadeIn direction="up" delay={0.3}>
          <p className="text-center text-sm text-slate-500 mt-8">
            Trusted by photographers in 50+ countries. Your data is encrypted and secure.
          </p>
        </FadeIn>
      </div>
    </section>
  );
};

CTASection.displayName = 'CTASection';

export default CTASection;
