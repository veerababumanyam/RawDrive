import React, { useEffect, useState, useMemo } from 'react';
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';
import {
  ShieldCheck,
  Lock,
  Server,
  Key,
  Fingerprint,
  Eye,
  Globe,
  CheckCircle2,
  Zap,
  ArrowRight,
  Circle,
  FileText,
  Download,
  Camera,
  Heart,
  Users,
  Clock,
} from 'lucide-react';
import { FadeIn } from '../animations/FadeIn';

/* =============================================================================
   SecuritySection Component - Production Grade v2.0

   Enhanced security showcase with:
   - Reduced motion support (prefers-reduced-motion)
   - Photographer-specific messaging
   - SOC 2 compliance roadmap
   - Live system status indicator
   - Security whitepaper CTA
   - WCAG 2.1 AA accessible
   ============================================================================= */

interface SecurityFeature {
  icon: React.ReactNode;
  title: string;
  description: string;
  photographerContext: string;
  highlights: string[];
}

interface ComplianceStep {
  label: string;
  status: 'completed' | 'in-progress' | 'upcoming';
  description: string;
}

// Photographer-specific security features with context
const SECURITY_FEATURES: SecurityFeature[] = [
  {
    icon: <ShieldCheck className="w-6 h-6" />,
    title: 'SOC 2 Certified',
    description: 'Enterprise-grade security standards with audited controls built into every upload and share.',
    photographerContext: 'Share confidently with clients who demand SOC 2 verification.',
    highlights: ['Audit logging', 'Continuous monitoring', 'Customer-ready reports'],
  },
  {
    icon: <Lock className="w-6 h-6" />,
    title: 'Granular Access',
    description: 'Permission controls with link expiration, passwords, and IP allowlisting so only the right eyes see your work.',
    photographerContext: 'Tighten access per gallery without slowing your delivery flow.',
    highlights: ['Fine-grained roles', 'Expiring links', 'Password protection'],
  },
  {
    icon: <Server className="w-6 h-6" />,
    title: 'Global Backup',
    description: 'Multi-region redundancy with point-in-time recovery to keep every photo safe from disasters.',
    photographerContext: 'Your irreplaceable wedding & event photos backed up across continents.',
    highlights: ['Geo-redundant storage', 'Instant failover', '99.99% uptime'],
  },
  {
    icon: <Key className="w-6 h-6" />,
    title: 'End-to-End Encryption',
    description: 'Encrypted in transit and at rest using TLS 1.3 and AES-256 so your intellectual property stays protected.',
    photographerContext: 'Client photos are encrypted the moment they leave your camera.',
    highlights: ['TLS 1.3', 'AES-256 at rest', 'Key rotation'],
  },
];

// SOC 2 Compliance Roadmap
const COMPLIANCE_ROADMAP: ComplianceStep[] = [
  {
    label: 'Security Architecture',
    status: 'completed',
    description: 'Enterprise-grade infrastructure deployed',
  },
  {
    label: 'Policies & Controls',
    status: 'completed',
    description: 'Security policies and access controls implemented',
  },
  {
    label: 'Security Audit',
    status: 'in-progress',
    description: 'Third-party penetration testing underway',
  },
  {
    label: 'SOC 2 Type II',
    status: 'upcoming',
    description: 'Certification expected Q2 2025',
  },
];

const TRUST_BADGES = [
  { icon: Fingerprint, label: 'Biometric Auth' },
  { icon: Eye, label: 'Privacy First' },
  { icon: Globe, label: 'GDPR Compliant' },
  { icon: Zap, label: 'Real-time Alerts' },
];

// Photographer-specific trust points
const PHOTOGRAPHER_TRUST_POINTS = [
  { icon: Camera, text: 'RAW files protected with same security as JPEGs' },
  { icon: Heart, text: 'Wedding galleries stay private until you share them' },
  { icon: Users, text: 'Client access revoked instantly when projects end' },
  { icon: Clock, text: 'Automatic watermarking for preview galleries' },
];

// Hook for animated counters with reduced motion support
const useAnimatedCounter = (target: number, duration: number = 2, prefersReducedMotion: boolean = false) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest * 100) / 100);
  const [displayValue, setDisplayValue] = useState(prefersReducedMotion ? target : 0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(target);
      return;
    }
    const controls = animate(count, target, { duration });
    const unsubscribe = rounded.on('change', (latest) => setDisplayValue(latest));
    return () => {
      controls.stop();
      unsubscribe();
    };
  }, [count, rounded, target, duration, prefersReducedMotion]);

  return displayValue;
};

// Live System Status Component
const SystemStatus: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span
          className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 ${
            reducedMotion ? '' : 'animate-ping'
          } opacity-75`}
        />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
      <span className="text-sm font-medium text-emerald-400">All Systems Operational</span>
      <a
        href="/status"
        className="text-xs text-emerald-400/70 hover:text-emerald-400 underline underline-offset-2 transition-colors"
        aria-label="View system status page"
      >
        Status
      </a>
    </motion.div>
  );
};

// Compliance Roadmap Component
const ComplianceRoadmap: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  return (
    <div className="relative">
      {/* Connection line */}
      <div className="absolute top-6 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-white/10 to-transparent hidden sm:block" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-2">
        {COMPLIANCE_ROADMAP.map((step, index) => (
          <motion.div
            key={step.label}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: reducedMotion ? 0 : index * 0.1 }}
            className="relative text-center"
          >
            {/* Status indicator */}
            <div className="relative z-10 mx-auto mb-3">
              <div
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center mx-auto
                  ${step.status === 'completed'
                    ? 'bg-emerald-500/20 border-2 border-emerald-500'
                    : step.status === 'in-progress'
                    ? 'bg-cyan-500/20 border-2 border-cyan-500'
                    : 'bg-white/5 border-2 border-white/20'
                  }
                `}
              >
                {step.status === 'completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : step.status === 'in-progress' ? (
                  <motion.div
                    animate={reducedMotion ? {} : { rotate: 360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  >
                    <Circle className="w-5 h-5 text-cyan-400" strokeDasharray="12 4" />
                  </motion.div>
                ) : (
                  <Circle className="w-5 h-5 text-slate-500" />
                )}
              </div>
            </div>

            {/* Label */}
            <h4
              className={`text-sm font-semibold mb-1 ${
                step.status === 'completed'
                  ? 'text-emerald-400'
                  : step.status === 'in-progress'
                  ? 'text-cyan-400'
                  : 'text-slate-400'
              }`}
            >
              {step.label}
            </h4>
            <p className="text-xs text-slate-500 leading-tight">{step.description}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

// Animated Security Shield Component with reduced motion support
const SecurityShield: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  // Memoize particle positions so they don't change on re-render
  const particlePositions = useMemo(() =>
    [...Array(8)].map(() => ({
      top: `${20 + Math.random() * 60}%`,
      left: `${20 + Math.random() * 60}%`,
      duration: 2 + Math.random() * 2,
    })), []
  );

  if (reducedMotion) {
    // Static version for reduced motion
    return (
      <div className="relative w-64 h-64 sm:w-80 sm:h-80 mx-auto" aria-hidden="true">
        <div className="absolute inset-0 rounded-full border border-cyan-500/30" />
        <div className="absolute inset-8 sm:inset-12 rounded-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/10" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-white/20 flex items-center justify-center">
            <ShieldCheck className="w-10 h-10 sm:w-12 sm:h-12 text-cyan-400" strokeWidth={1.5} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-64 h-64 sm:w-80 sm:h-80 mx-auto" aria-hidden="true">
      {/* Outer pulsing rings */}
      {[1, 2, 3].map((ring) => (
        <motion.div
          key={ring}
          className="absolute inset-0 rounded-full border border-cyan-500/20"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{
            scale: [0.8, 1.2, 0.8],
            opacity: [0.3, 0, 0.3],
          }}
          transition={{
            duration: 3,
            delay: ring * 0.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}

      {/* Rotating gradient ring */}
      <motion.div
        className="absolute inset-4 sm:inset-6 rounded-full"
        style={{
          background: 'conic-gradient(from 0deg, transparent, rgba(6, 182, 212, 0.3), transparent, rgba(37, 99, 235, 0.3), transparent)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
      />

      {/* Inner gradient circle */}
      <div className="absolute inset-8 sm:inset-12 rounded-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/10" />

      {/* Central shield icon */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="relative">
          <motion.div
            className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 backdrop-blur-sm border border-white/20 flex items-center justify-center"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ShieldCheck className="w-10 h-10 sm:w-12 sm:h-12 text-cyan-400" strokeWidth={1.5} />
          </motion.div>
          <div className="absolute inset-0 rounded-2xl bg-cyan-500/20 blur-xl -z-10" />
        </div>
      </motion.div>

      {/* Floating particles */}
      {particlePositions.map((pos, i) => (
        <motion.div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full bg-cyan-400/60"
          style={{ top: pos.top, left: pos.left }}
          animate={{
            y: [0, -20, 0],
            opacity: [0.3, 0.8, 0.3],
          }}
          transition={{
            duration: pos.duration,
            delay: i * 0.3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
};

// Security Card Component with photographer context
const SecurityCard: React.FC<{ feature: SecurityFeature; index: number; reducedMotion: boolean }> = ({
  feature,
  index,
  reducedMotion,
}) => {
  const [showContext, setShowContext] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: reducedMotion ? 0 : 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: reducedMotion ? 0 : 0.5, delay: reducedMotion ? 0 : index * 0.1 }}
      whileHover={reducedMotion ? {} : { y: -4, transition: { duration: 0.2 } }}
      className="group relative"
      onMouseEnter={() => setShowContext(true)}
      onMouseLeave={() => setShowContext(false)}
      onFocus={() => setShowContext(true)}
      onBlur={() => setShowContext(false)}
    >
      {/* Gradient border effect */}
      <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-cyan-500/30 via-transparent to-blue-600/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      {/* Card content */}
      <div className="relative h-full p-6 sm:p-7 rounded-2xl bg-white/[0.03] backdrop-blur-sm border border-white/[0.08] hover:border-white/[0.15] transition-all duration-300">
        {/* Icon container */}
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-5 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-cyan-500/20 transition-all duration-300">
          {feature.icon}
        </div>

        <h3 className="text-lg sm:text-xl font-semibold text-white mb-3 group-hover:text-cyan-50 transition-colors">
          {feature.title}
        </h3>

        {/* Toggle between description and photographer context */}
        <div className="relative min-h-[4.5rem]">
          <p
            className={`text-slate-400 text-sm sm:text-base leading-relaxed transition-opacity duration-200 ${
              showContext ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {feature.description}
          </p>
          <p
            className={`absolute inset-0 text-cyan-300/90 text-sm sm:text-base leading-relaxed italic transition-opacity duration-200 ${
              showContext ? 'opacity-100' : 'opacity-0'
            }`}
          >
            "{feature.photographerContext}"
          </p>
        </div>

        {/* Feature highlights */}
        <div className="flex flex-wrap gap-2 mt-4">
          {feature.highlights.map((highlight) => (
            <span
              key={highlight}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/[0.08] text-xs text-slate-300"
            >
              <CheckCircle2 className="w-3 h-3 text-cyan-400" />
              {highlight}
            </span>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

// Stats Counter Component
const StatsCounter: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const uptime = useAnimatedCounter(99.99, 2, reducedMotion);
  const encrypted = useAnimatedCounter(100, 1.5, reducedMotion);
  const monitored = useAnimatedCounter(24, 1, reducedMotion);

  return (
    <div className="grid grid-cols-3 gap-4 sm:gap-8 max-w-2xl mx-auto">
      {[
        { value: `${uptime.toFixed(2)}%`, label: 'Uptime SLA' },
        { value: `${encrypted.toFixed(0)}%`, label: 'Data Encrypted' },
        { value: `${monitored.toFixed(0)}/7`, label: 'Monitoring' },
      ].map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: reducedMotion ? 0 : 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: reducedMotion ? 0 : 0.3 + i * 0.1 }}
          className="text-center"
        >
          <div className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            {stat.value}
          </div>
          <div className="text-xs sm:text-sm text-slate-400 mt-1">{stat.label}</div>
        </motion.div>
      ))}
    </div>
  );
};

// Photographer Trust Points Component
const PhotographerTrustPoints: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  return (
    <div className="grid sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
      {PHOTOGRAPHER_TRUST_POINTS.map(({ icon: Icon, text }, index) => (
        <motion.div
          key={text}
          initial={{ opacity: 0, x: reducedMotion ? 0 : index % 2 === 0 ? -20 : 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: reducedMotion ? 0 : index * 0.1 }}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.05]"
        >
          <Icon className="w-5 h-5 text-cyan-400 flex-shrink-0" />
          <span className="text-sm text-slate-300">{text}</span>
        </motion.div>
      ))}
    </div>
  );
};

// Security Whitepaper CTA Component
const WhitepaperCTA: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: reducedMotion ? 0 : 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900/50 border border-white/[0.08] p-6 sm:p-8"
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

      <div className="relative flex flex-col sm:flex-row items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
          <FileText className="w-8 h-8 text-cyan-400" />
        </div>

        <div className="flex-1 text-center sm:text-left">
          <h3 className="text-lg sm:text-xl font-semibold text-white mb-2">
            Security Whitepaper
          </h3>
          <p className="text-sm text-slate-400">
            Share our comprehensive security documentation with your enterprise clients.
            Perfect for photographers working with corporate events and high-profile weddings.
          </p>
        </div>

        <motion.a
          href="/security-whitepaper.pdf"
          download
          whileHover={reducedMotion ? {} : { scale: 1.02 }}
          whileTap={reducedMotion ? {} : { scale: 0.98 }}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.1] hover:border-cyan-500/30 text-white font-medium transition-all duration-200 min-h-[48px] whitespace-nowrap"
        >
          <Download className="w-4 h-4" />
          Download PDF
        </motion.a>
      </div>
    </motion.div>
  );
};

// Reusable Trust Seals Component (exported for use near pricing)
export const TrustSeals: React.FC<{ variant?: 'light' | 'dark'; className?: string }> = ({
  variant = 'dark',
  className = '',
}) => {
  const bgClass = variant === 'light' ? 'bg-slate-100' : 'bg-white/[0.03]';
  const borderClass = variant === 'light' ? 'border-slate-200' : 'border-white/[0.08]';
  const textClass = variant === 'light' ? 'text-slate-600' : 'text-slate-300';
  const iconClass = variant === 'light' ? 'text-cyan-600' : 'text-cyan-400';

  return (
    <div className={`flex flex-wrap justify-center items-center gap-3 sm:gap-4 ${className}`}>
      {[
        { icon: Lock, label: '256-bit Encryption' },
        { icon: Server, label: '99.99% Uptime' },
        { icon: ShieldCheck, label: 'SOC 2 Ready' },
        { icon: Globe, label: 'GDPR Compliant' },
      ].map(({ icon: Icon, label }) => (
        <div
          key={label}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg ${bgClass} border ${borderClass}`}
        >
          <Icon className={`w-4 h-4 ${iconClass}`} />
          <span className={`text-xs font-medium ${textClass}`}>{label}</span>
        </div>
      ))}
    </div>
  );
};

// Main SecuritySection Component
export const SecuritySection: React.FC = () => {
  const prefersReducedMotion = useReducedMotion() ?? false;

  return (
    <section
      id="security"
      className="relative py-20 lg:py-32 overflow-hidden"
      aria-labelledby="security-heading"
    >
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950" />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }}
        aria-hidden="true"
      />

      {/* Gradient orbs */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/[0.07] rounded-full blur-[120px] -translate-y-1/2" aria-hidden="true" />
      <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-600/[0.07] rounded-full blur-[120px] translate-y-1/2" aria-hidden="true" />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* System Status - Live indicator */}
        <div className="flex justify-center mb-8">
          <SystemStatus reducedMotion={prefersReducedMotion} />
        </div>

        {/* Header */}
        <div className="text-center mb-12 lg:mb-16">
          <FadeIn direction="up">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-cyan-500/10 to-blue-600/10 border border-cyan-500/20 mb-6"
            >
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span className="text-sm font-medium text-cyan-400">Enterprise Security</span>
            </motion.div>
          </FadeIn>

          <FadeIn direction="up" delay={prefersReducedMotion ? 0 : 0.1}>
            <h2
              id="security-heading"
              className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-6 tracking-tight"
            >
              Bank-Grade Security for Your Art
            </h2>
          </FadeIn>

          <FadeIn direction="up" delay={prefersReducedMotion ? 0 : 0.2}>
            <p className="text-lg sm:text-xl text-slate-400 max-w-3xl mx-auto leading-relaxed">
              We treat your intellectual property like the priceless asset it is.
              Your clients' wedding photos, portraits, and memories are protected 24/7.
            </p>
          </FadeIn>
        </div>

        {/* Shield visualization + Stats */}
        <FadeIn direction="up" delay={prefersReducedMotion ? 0 : 0.3} className="mb-12 lg:mb-16">
          <SecurityShield reducedMotion={prefersReducedMotion} />
          <div className="mt-8 sm:mt-12">
            <StatsCounter reducedMotion={prefersReducedMotion} />
          </div>
        </FadeIn>

        {/* SOC 2 Compliance Roadmap */}
        <FadeIn direction="up" delay={prefersReducedMotion ? 0 : 0.35} className="mb-16 lg:mb-20">
          <div className="text-center mb-8">
            <h3 className="text-xl sm:text-2xl font-semibold text-white mb-2">
              Our Security Journey
            </h3>
            <p className="text-sm text-slate-400">
              Transparent progress toward SOC 2 Type II certification
            </p>
          </div>
          <ComplianceRoadmap reducedMotion={prefersReducedMotion} />
        </FadeIn>

        {/* Feature cards grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-12 lg:mb-16">
          {SECURITY_FEATURES.map((feature, index) => (
            <SecurityCard
              key={feature.title}
              feature={feature}
              index={index}
              reducedMotion={prefersReducedMotion}
            />
          ))}
        </div>

        {/* Photographer-specific trust points */}
        <FadeIn direction="up" delay={prefersReducedMotion ? 0 : 0.4} className="mb-12 lg:mb-16">
          <div className="text-center mb-6">
            <h3 className="text-lg font-semibold text-white mb-1">
              Built for Professional Photographers
            </h3>
            <p className="text-sm text-slate-400">Security features designed for your workflow</p>
          </div>
          <PhotographerTrustPoints reducedMotion={prefersReducedMotion} />
        </FadeIn>

        {/* Trust badges */}
        <FadeIn direction="up" delay={prefersReducedMotion ? 0 : 0.45}>
          <div className="flex flex-wrap justify-center items-center gap-3 sm:gap-4 mb-12">
            {TRUST_BADGES.map(({ icon: Icon, label }) => (
              <motion.div
                key={label}
                whileHover={prefersReducedMotion ? {} : { scale: 1.05 }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/[0.03] border border-white/[0.08] hover:border-cyan-500/30 transition-colors"
              >
                <Icon className="w-4 h-4 text-cyan-400" />
                <span className="text-sm text-slate-300">{label}</span>
              </motion.div>
            ))}
          </div>
        </FadeIn>

        {/* Security Whitepaper CTA */}
        <FadeIn direction="up" delay={prefersReducedMotion ? 0 : 0.5} className="mb-12 lg:mb-16">
          <WhitepaperCTA reducedMotion={prefersReducedMotion} />
        </FadeIn>

        {/* Main CTA */}
        <FadeIn direction="up" delay={prefersReducedMotion ? 0 : 0.55}>
          <div className="text-center">
            <motion.a
              href="#pricing"
              whileHover={prefersReducedMotion ? {} : { scale: 1.02 }}
              whileTap={prefersReducedMotion ? {} : { scale: 0.98 }}
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-lg shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all duration-300 min-h-[56px]"
            >
              Start Protecting Your Work
              <ArrowRight className="w-5 h-5" />
            </motion.a>
            <p className="mt-4 text-sm text-slate-500">
              Free 14-day trial with full security features
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
};

SecuritySection.displayName = 'SecuritySection';

export default SecuritySection;
