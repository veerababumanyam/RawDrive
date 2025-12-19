import React from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Clock,
  Frown,
  Heart,
  Mail,
  MessageSquare,
  Smile,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';
import { FadeIn } from '../animations/FadeIn';
import { staggerContainer, staggerItem } from '../animations/presets';

/* =============================================================================
   ProblemSolutionSection Component

   Emotional hook section showing pain points vs. solutions.
   Conversion psychology: Problem Agitation Solution (PAS) framework.
   ============================================================================= */

interface PainPoint {
  icon: React.ReactNode;
  problem: string;
  agitation: string;
}

interface Solution {
  icon: React.ReactNode;
  benefit: string;
  result: string;
}

interface ProblemSolutionSectionProps {
  className?: string;
  id?: string;
}

const painPoints: PainPoint[] = [
  {
    icon: <Mail className="w-5 h-5" />,
    problem: 'Email chains killing your workflow?',
    agitation: '"Can you resend the link?" "Which folder?" "Is this the final version?"',
  },
  {
    icon: <Clock className="w-5 h-5" />,
    problem: 'Hours wasted on manual organization?',
    agitation: 'Tagging, sorting, and renaming thousands of photos every shoot.',
  },
  {
    icon: <MessageSquare className="w-5 h-5" />,
    problem: 'Chasing clients for feedback?',
    agitation: '"Just 10 more minutes" turns into weeks of waiting.',
  },
];

const solutions: Solution[] = [
  {
    icon: <Zap className="w-5 h-5" />,
    benefit: '1 link, instant access',
    result: 'Clients pick favorites in minutes, not days',
  },
  {
    icon: <Sparkles className="w-5 h-5" />,
    benefit: 'AI organizes everything',
    result: 'Auto-tagging, face detection, smart search',
  },
  {
    icon: <Heart className="w-5 h-5" />,
    benefit: 'Delight your clients',
    result: 'Beautiful galleries they\'ll share with everyone',
  },
];

export const ProblemSolutionSection: React.FC<ProblemSolutionSectionProps> = ({
  className = '',
  id = 'problem-solution',
}) => {
  return (
    <section
      id={id}
      className={`py-20 lg:py-28 bg-hero-gradient relative overflow-hidden ${className}`}
      aria-labelledby="problem-solution-heading"
    >
      {/* Background elements */}
      <div className="absolute inset-0 hero-pattern-grid opacity-[0.03]" aria-hidden="true" />
      <div
        className="landing-bg-gradient-orb landing-bg-orb-purple absolute top-20 -left-32 opacity-20"
        aria-hidden="true"
      />
      <div
        className="landing-bg-gradient-orb landing-bg-orb-cyan absolute bottom-20 -right-32 opacity-20"
        aria-hidden="true"
      />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <FadeIn direction="up" className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-6">
            <AlertCircle size={16} className="text-amber-400" />
            <span className="text-sm text-slate-200">Sound Familiar?</span>
          </div>
          <h2
            id="problem-solution-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4"
          >
            Stop Struggling with{' '}
            <span className="landing-text-gradient">Client Delivery</span>
          </h2>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto">
            Most photographers lose 12+ hours per week on gallery management.
            There's a better way.
          </p>
        </FadeIn>

        {/* Problem vs Solution Grid */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
          {/* Problems Column */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={staggerContainer}
          >
            <div className="text-center lg:text-left mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full mb-4">
                <Frown size={14} className="text-red-400" />
                <span className="text-sm font-medium text-red-300">The Old Way</span>
              </div>
              <h3 className="text-xl font-semibold text-white">
                Hours of frustration, every single shoot
              </h3>
            </div>

            <div className="space-y-4">
              {painPoints.map((point, _index) => (
                <motion.div key={point.problem} variants={staggerItem}>
                  <GlassCard
                    variant="sm"
                    padding="lg"
                    className="relative overflow-hidden border-red-500/20 hover:border-red-500/30 transition-colors"
                  >
                    {/* Red accent line */}
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-red-500 to-red-600" />

                    <div className="flex items-start gap-4 pl-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                        {point.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <X size={14} className="text-red-400" />
                          <span className="font-medium text-white">{point.problem}</span>
                        </div>
                        <p className="text-sm text-slate-400 italic">
                          {point.agitation}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>

            {/* Pain stat */}
            <motion.div
              variants={staggerItem}
              className="mt-6 text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-3 px-4 py-3 bg-red-500/5 border border-red-500/10 rounded-xl">
                <TrendingUp className="w-5 h-5 text-red-400 rotate-180" />
                <span className="text-sm text-slate-300">
                  <span className="text-red-400 font-bold">67%</span> of photographers
                  report client delivery as their biggest pain point
                </span>
              </div>
            </motion.div>
          </motion.div>

          {/* Arrow Connector (Desktop) - decorative */}
          <div className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20" aria-hidden="true">
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
              className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-xl shadow-cyan-500/30"
            >
              <ArrowRight className="w-7 h-7 text-white" />
            </motion.div>
          </div>

          {/* Mobile Arrow - decorative */}
          <div className="flex lg:hidden justify-center my-4" aria-hidden="true">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 rotate-90"
            >
              <ArrowRight className="w-6 h-6 text-white" />
            </motion.div>
          </div>

          {/* Solutions Column */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-50px' }}
            variants={staggerContainer}
          >
            <div className="text-center lg:text-left mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-4">
                <Smile size={14} className="text-emerald-400" />
                <span className="text-sm font-medium text-emerald-300">The RawDrive Way</span>
              </div>
              <h3 className="text-xl font-semibold text-white">
                Automated, beautiful, and clients love it
              </h3>
            </div>

            <div className="space-y-4">
              {solutions.map((solution, _index) => (
                <motion.div key={solution.benefit} variants={staggerItem}>
                  <GlassCard
                    variant="sm"
                    padding="lg"
                    className="relative overflow-hidden border-emerald-500/20 hover:border-emerald-500/30 transition-colors"
                  >
                    {/* Green accent line */}
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-400 to-cyan-500" />

                    <div className="flex items-start gap-4 pl-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                        {solution.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <CheckCircle size={14} className="text-emerald-400" />
                          <span className="font-medium text-white">{solution.benefit}</span>
                        </div>
                        <p className="text-sm text-slate-400">
                          {solution.result}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>

            {/* Solution stat */}
            <motion.div
              variants={staggerItem}
              className="mt-6 text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-3 px-4 py-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <span className="text-sm text-slate-300">
                  Save <span className="text-emerald-400 font-bold">12+ hours</span> per week
                  on client delivery
                </span>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* Bottom CTA */}
        <FadeIn direction="up" className="mt-16 text-center">
          <GlassCard variant="lg" padding="xl" className="max-w-3xl mx-auto">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="text-center sm:text-left">
                <h4 className="text-lg font-semibold text-white mb-1">
                  Ready to transform your workflow?
                </h4>
                <p className="text-sm text-slate-400">
                  Join 20,000+ photographers who switched to RawDrive
                </p>
              </div>
              <a
                href="/signup"
                className="landing-btn landing-btn-primary landing-btn-lg whitespace-nowrap"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Start Free Trial
                  <ArrowRight size={18} />
                </span>
              </a>
            </div>
          </GlassCard>
        </FadeIn>
      </div>
    </section>
  );
};

ProblemSolutionSection.displayName = 'ProblemSolutionSection';

export default ProblemSolutionSection;
