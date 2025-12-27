import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Share2, Smile, Upload } from 'lucide-react';
import { FadeIn } from '../animations/FadeIn';

/* =============================================================================
   HowItWorksSection Component

   3-step overview used on the landing page (guide: Upload → Share → Delight).
   ============================================================================= */

interface Step {
  number: number;
  icon: React.ElementType;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    number: 1,
    icon: Upload,
    title: 'Upload Your Photos',
    description:
      'Drag and drop your photos or connect your cloud storage. Our AI automatically organizes and tags everything.',
  },
  {
    number: 2,
    icon: Share2,
    title: 'Create & Share Galleries',
    description:
      'Design beautiful galleries with your branding. Share secure links with your clients in seconds.',
  },
  {
    number: 3,
    icon: Smile,
    title: 'Delight Your Clients',
    description:
      'Clients can view, download, and select their favorites. You get notified and deliver with ease.',
  },
];

interface HowItWorksSectionProps {
  className?: string;
  id?: string;
}

export const HowItWorksSection: React.FC<HowItWorksSectionProps> = ({
  className = '',
  id = 'how-it-works',
}) => {
  return (
    <section id={id} className={`py-20 lg:py-32 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 relative overflow-hidden ${className}`} aria-labelledby="how-it-works-heading">
      {/* Background decorative elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.08),transparent_50%)]" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(6,182,212,0.06),transparent_50%)]" aria-hidden="true" />
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn direction="up" className="text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-6">
            <span className="text-sm text-slate-300">How It Works</span>
          </div>
          <h2
            id="how-it-works-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4"
          >
            Get Started in Minutes
          </h2>
          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto">
            Three simple steps to transform your photography workflow.
          </p>
        </FadeIn>

        <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.35, delay: index * 0.12, ease: 'easeOut' }}
                className="relative text-center"
              >
                {/* Connector line (desktop only) */}
                {index < steps.length - 1 && (
                  <div
                    className="hidden md:block absolute top-12 left-[60%] w-[80%] h-[2px] bg-gradient-to-r from-gold-400 to-transparent opacity-70"
                    aria-hidden="true"
                  />
                )}

                <div className="relative inline-flex mb-6">
                  <div
                    className="
                      w-24 h-24 rounded-2xl
                      bg-white/5 border-2 border-gold-500/60
                      flex items-center justify-center
                      shadow-lg shadow-gold-500/10
                      transition-shadow duration-300 hover:shadow-gold-500/25
                    "
                  >
                    <Icon className="w-10 h-10 text-gold-400" aria-hidden="true" />
                  </div>
                  <div
                    className="
                      absolute -top-2 -right-2 w-8 h-8 rounded-full
                      bg-gold-500 text-[#0a1628] font-bold
                      flex items-center justify-center
                      shadow-md shadow-gold-500/30
                    "
                    aria-hidden="true"
                  >
                    {step.number}
                  </div>
                </div>

                <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
                <p className="text-slate-300 leading-relaxed">{step.description}</p>
              </motion.div>
            );
          })}
        </div>

        <div className="flex justify-center mt-12" aria-hidden="true">
          <div className="flex items-center gap-2 text-gold-400 animate-bounce">
            <span className="text-sm font-medium">It’s that simple</span>
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </section>
  );
};

HowItWorksSection.displayName = 'HowItWorksSection';

export default HowItWorksSection;
