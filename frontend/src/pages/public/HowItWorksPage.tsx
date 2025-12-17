import React from 'react';
import { motion } from 'framer-motion';
import { Upload, Palette, Share2, Download, CheckCircle2 } from 'lucide-react';
import {
  LandingLayout,
  LandingHeader,
  LandingFooter,
  CTASection,
  SEOHead,
} from '../../components/landing';
import { FadeIn } from '../../components/landing/animations/FadeIn';
import { GlassCard } from '../../components/landing/ui/GlassCard';
import { staggerContainer, staggerItem } from '../../components/landing/animations/presets';

/* =============================================================================
   HowItWorksPage Component

   Step-by-step guide showing how RawDrive works.
   ============================================================================= */

interface Step {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  details: string[];
}

const steps: Step[] = [
  {
    number: 1,
    icon: <Upload size={28} />,
    title: 'Upload Your Photos',
    description: 'Drag and drop your photos or connect to your cloud storage.',
    details: [
      'Supports RAW, JPEG, PNG, and more',
      'AI auto-tagging on upload',
      'Bulk upload support',
      'Lightroom plugin available',
    ],
  },
  {
    number: 2,
    icon: <Palette size={28} />,
    title: 'Design Your Gallery',
    description: 'Choose from premium themes and customize to match your brand.',
    details: [
      '20+ professional themes',
      'Custom colors and fonts',
      'Add your logo',
      'Mobile-optimized layouts',
    ],
  },
  {
    number: 3,
    icon: <Share2 size={28} />,
    title: 'Share with Clients',
    description: 'Send beautiful gallery links with optional password protection.',
    details: [
      'Custom domain support',
      'Password protection',
      'Expiration dates',
      'Download tracking',
    ],
  },
  {
    number: 4,
    icon: <Download size={28} />,
    title: 'Client Proofing & Delivery',
    description: 'Clients select favorites, you deliver the finals.',
    details: [
      'Favorite marking',
      'Comments on photos',
      'Selection approval',
      'High-res downloads',
    ],
  },
];

const HowItWorksPage: React.FC = () => {
  return (
    <>
      <SEOHead
        title="How It Works"
        description="Learn how RawDrive makes delivering photos to clients simple. Upload, design, share, and deliver in four easy steps."
        keywords={['how to deliver photos', 'photo gallery workflow', 'client proofing']}
        canonicalUrl="/how-it-works"
      />

      <LandingLayout>
        <a
          href="#main-content"
          className="
            sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4
            bg-primary-600 text-white px-4 py-2 rounded-lg z-[100]
            focus:outline-none focus:ring-2 focus:ring-white
          "
        >
          Skip to main content
        </a>

        <LandingHeader />

        <main id="main-content" role="main" className="pt-[72px]">
          {/* Hero */}
          <section className="py-20 lg:py-28 text-center">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <FadeIn direction="up">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
                  How <span className="text-gradient">RawDrive</span> Works
                </h1>
                <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto">
                  From upload to delivery in four simple steps. See how easy it is to impress
                  your clients.
                </p>
              </FadeIn>
            </div>
          </section>

          {/* Steps */}
          <section className="py-12 lg:py-20" id="steps">
            <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-50px' }}
                variants={staggerContainer}
                className="space-y-8 lg:space-y-12"
              >
                {steps.map((step, index) => (
                  <motion.div
                    key={step.number}
                    variants={staggerItem}
                    className={`
                      flex flex-col lg:flex-row items-center gap-8 lg:gap-16
                      ${index % 2 === 1 ? 'lg:flex-row-reverse' : ''}
                    `}
                  >
                    {/* Content */}
                    <div className="flex-1 text-center lg:text-left">
                      <div className="
                        inline-flex items-center gap-3 mb-4
                        text-primary-400 text-sm font-semibold uppercase tracking-wider
                      ">
                        <span className="
                          w-8 h-8 rounded-full bg-primary-500/20
                          flex items-center justify-center text-primary-400
                        ">
                          {step.number}
                        </span>
                        Step {step.number}
                      </div>
                      <h2 className="text-3xl lg:text-4xl font-bold text-white mb-4">
                        {step.title}
                      </h2>
                      <p className="text-lg text-slate-400 mb-6">
                        {step.description}
                      </p>
                      <ul className="space-y-3">
                        {step.details.map((detail, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-3 text-slate-300 justify-center lg:justify-start"
                          >
                            <CheckCircle2 size={18} className="text-accent-400 flex-shrink-0" />
                            {detail}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Visual */}
                    <div className="flex-1 w-full max-w-md lg:max-w-none">
                      <GlassCard
                        variant="lg"
                        padding="xl"
                        className="aspect-video flex items-center justify-center"
                      >
                        <div className="
                          w-20 h-20 rounded-2xl
                          bg-gradient-to-br from-primary-500 to-accent-500
                          flex items-center justify-center text-white
                          shadow-lg shadow-primary-500/30
                        ">
                          {step.icon}
                        </div>
                      </GlassCard>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </section>

          {/* CTA */}
          <CTASection
            headline="Ready to Simplify Your Workflow?"
            subheadline="Get started in minutes. No credit card required."
          />
        </main>

        <LandingFooter />
      </LandingLayout>
    </>
  );
};

export default HowItWorksPage;
