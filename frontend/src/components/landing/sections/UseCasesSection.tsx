import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  Camera,
  CheckCircle,
  Heart,
  Sparkles,
  Users,
  ArrowRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { FadeIn } from '../animations/FadeIn';
import { GlassCard } from '../ui/GlassCard';

/* =============================================================================
   UseCasesSection Component

   Tabbed use-case showcase (guide: Wedding / Portrait / Event / Commercial).
   Mobile uses horizontal scrolling tabs; desktop uses centered tabs.
   ============================================================================= */

type UseCaseId = 'wedding' | 'portrait' | 'event' | 'commercial';

interface UseCase {
  id: UseCaseId;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  description: string;
  features: string[];
  stats: Array<{ label: string; value: string }>;
  gradientClass: string;
  accentTextClass: string;
}

const USE_CASES: UseCase[] = [
  {
    id: 'wedding',
    icon: Heart,
    title: 'Wedding Photography',
    subtitle: 'Perfect for capturing love stories',
    description:
      'Deliver stunning wedding galleries that couples will cherish forever. Share highlights same-day and let families download their favorites with ease.',
    features: [
      'Same-day gallery previews',
      'Password-protected client access',
      'High-resolution downloads',
      'Face recognition for guests',
      'Print album designer',
    ],
    stats: [
      { label: 'Average delivery', value: '24hrs' },
      { label: 'Client satisfaction', value: '99%' },
    ],
    gradientClass: 'from-gold-500 to-primary-600',
    accentTextClass: 'text-gold-400',
  },
  {
    id: 'portrait',
    icon: Camera,
    title: 'Portrait Sessions',
    subtitle: 'Professional headshots & portraits',
    description:
      'From corporate headshots to family portraits, create beautiful galleries with easy selection tools for your clients to choose their favorites.',
    features: [
      'Client selection tools',
      'Favorites & download lists',
      'Custom watermarks',
      'Before/after retouching views',
      'Direct ordering integration',
    ],
    stats: [
      { label: 'Photos organized', value: '10M+' },
      { label: 'Avg. session time', value: '-50%' },
    ],
    gradientClass: 'from-accent-500 to-primary-600',
    accentTextClass: 'text-accent-400',
  },
  {
    id: 'event',
    icon: Users,
    title: 'Event Coverage',
    subtitle: 'Corporate & social events',
    description:
      'Handle large-scale events with ease. AI-powered face tagging helps guests find themselves, while bulk delivery tools save you hours.',
    features: [
      'AI face tagging & search',
      'Bulk photo organization',
      'Guest self-service downloads',
      'Event-specific branding',
      'Real-time upload & sharing',
    ],
    stats: [
      { label: 'Events covered', value: '50K+' },
      { label: 'Time saved', value: '75%' },
    ],
    gradientClass: 'from-primary-500 to-primary-700',
    accentTextClass: 'text-primary-400',
  },
  {
    id: 'commercial',
    icon: Building2,
    title: 'Commercial Work',
    subtitle: 'Brands, products & architecture',
    description:
      "Deliver professional commercial work with white-label galleries. Custom domains and branding make every delivery match your client's identity.",
    features: [
      'White-label branding',
      'Custom domain support',
      'High-res asset delivery',
      'Usage rights management',
      'Team collaboration tools',
    ],
    stats: [
      { label: 'Brands served', value: '5K+' },
      { label: 'Assets delivered', value: '2M+' },
    ],
    gradientClass: 'from-gold-500 to-gold-700',
    accentTextClass: 'text-gold-400',
  },
];

const USE_CASE_IMAGES: Record<UseCaseId, string[]> = {
  wedding: [
    '/images/use-cases/wedding/wedding-1.jpg',
    '/images/use-cases/wedding/wedding-2.jpg',
    '/images/use-cases/wedding/wedding-3.jpg',
    '/images/use-cases/wedding/wedding-4.jpg',
    '/images/use-cases/wedding/wedding-5.jpg',
    '/images/use-cases/wedding/wedding-6.jpg',
  ],
  portrait: [
    '/images/use-cases/portrait/portrait-1.jpg',
    '/images/use-cases/portrait/portrait-2.jpg',
    '/images/use-cases/portrait/portrait-3.jpg',
    '/images/use-cases/portrait/portrait-4.jpg',
    '/images/use-cases/portrait/portrait-5.jpg',
    '/images/use-cases/portrait/portrait-6.jpg',
  ],
  event: [
    '/images/use-cases/event/event-1.jpg',
    '/images/use-cases/event/event-2.jpg',
    '/images/use-cases/event/event-3.jpg',
    '/images/use-cases/event/event-4.jpg',
    '/images/use-cases/event/event-5.jpg',
    '/images/use-cases/event/event-6.jpg',
  ],
  commercial: [
    '/images/use-cases/commercial/commercial-1.jpg',
    '/images/use-cases/commercial/commercial-2.jpg',
    '/images/use-cases/commercial/commercial-3.jpg',
    '/images/use-cases/commercial/commercial-4.jpg',
    '/images/use-cases/commercial/commercial-5.jpg',
    '/images/use-cases/commercial/commercial-6.jpg',
  ],
};

interface UseCasesSectionProps {
  className?: string;
  id?: string;
}

export const UseCasesSection: React.FC<UseCasesSectionProps> = ({
  className = '',
  id = 'use-cases',
}) => {
  const [activeId, setActiveId] = useState<UseCaseId>('wedding');

  const selectedCase = useMemo(
    () => USE_CASES.find((c) => c.id === activeId) || USE_CASES[0],
    [activeId]
  );

  return (
    <section id={id} className={`py-20 lg:py-32 bg-gradient-to-b from-slate-800 via-slate-900 to-slate-900 relative overflow-hidden ${className}`} aria-labelledby="use-cases-heading">
      {/* Background decorative elements */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(37,99,235,0.1),transparent_50%)]" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(6,182,212,0.08),transparent_50%)]" aria-hidden="true" />
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn direction="up" className="text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-6">
            <Sparkles className="w-4 h-4 text-accent-400" aria-hidden="true" />
            <span className="text-sm text-slate-300">Use Cases</span>
          </div>
          <h2
            id="use-cases-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4"
          >
            Built for Every Photography Style
          </h2>
          <p className="text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto">
            Whether you shoot weddings, portraits, events, or commercial work, RawDrive adapts to your workflow.
          </p>
        </FadeIn>

        {/* Tabs */}
        <div className="mb-10 lg:mb-14">
          <div className="md:hidden overflow-x-auto -mx-4 px-4 no-scrollbar">
            <div className="flex gap-2" style={{ width: 'max-content' }}>
              {USE_CASES.map((useCase) => {
                const Icon = useCase.icon;
                const isActive = useCase.id === activeId;
                return (
                  <button
                    key={useCase.id}
                    type="button"
                    onClick={() => setActiveId(useCase.id)}
                    className={`
                      flex items-center gap-2 px-4 py-3 rounded-xl font-medium whitespace-nowrap
                      transition-all duration-200 min-h-[44px]
                      ${isActive
                        ? `bg-gradient-to-r ${useCase.gradientClass} text-white shadow-lg`
                        : 'bg-white/5 border border-white/10 text-slate-300 hover:border-white/20'
                      }
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                    `}
                    aria-pressed={isActive}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                    <span>{useCase.title.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hidden md:flex justify-center gap-3 flex-wrap">
            {USE_CASES.map((useCase) => {
              const Icon = useCase.icon;
              const isActive = useCase.id === activeId;
              return (
                <button
                  key={useCase.id}
                  type="button"
                  onClick={() => setActiveId(useCase.id)}
                  className={`
                    flex items-center gap-2 px-6 py-3 rounded-xl font-medium
                    transition-all duration-200 min-h-[44px]
                    ${isActive
                      ? `bg-gradient-to-r ${useCase.gradientClass} text-white shadow-lg`
                      : 'bg-white/5 border border-white/10 text-slate-300 hover:border-white/20 hover:text-white'
                    }
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                  `}
                  aria-pressed={isActive}
                >
                  <Icon className="w-5 h-5" aria-hidden="true" />
                  <span>{useCase.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <motion.div
          key={selectedCase.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center"
        >
          {/* Visual */}
          <div className="order-2 lg:order-1">
            <div className="relative">
              <div
                className={`absolute -inset-6 bg-gradient-to-r ${selectedCase.gradientClass} opacity-20 rounded-3xl blur-2xl`}
                aria-hidden="true"
              />

              <GlassCard variant="lg" padding="none" className="relative overflow-hidden">
                <div className={`px-6 py-5 bg-gradient-to-r ${selectedCase.gradientClass}`}>
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-xl bg-white/15 flex items-center justify-center">
                      <selectedCase.icon className="w-7 h-7 text-white" aria-hidden="true" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{selectedCase.title}</h3>
                      <p className="text-white/80 text-sm">{selectedCase.subtitle}</p>
                    </div>
                  </div>
                </div>

                <div className="p-6">
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    {selectedCase.stats.map((stat) => (
                      <div
                        key={stat.label}
                        className="text-center p-4 rounded-xl bg-white/5 border border-white/10"
                      >
                        <div className={`text-2xl font-bold ${selectedCase.accentTextClass}`}>{stat.value}</div>
                        <div className="text-xs text-slate-500 mt-1">{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Sample gallery preview */}
                  <div className="grid grid-cols-3 gap-2">
                    {(USE_CASE_IMAGES[selectedCase.id] || []).map((imgUrl, i) => (
                      <div
                        key={imgUrl}
                        className="aspect-square rounded-lg overflow-hidden bg-white/5 border border-white/10"
                      >
                        <img
                          src={imgUrl}
                          alt={`${selectedCase.title} sample ${i + 1}`}
                          className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </GlassCard>

              <div className="absolute -bottom-4 -right-4">
                <GlassCard variant="sm" padding="sm" className="flex items-center gap-2">
                  <Sparkles className={`w-5 h-5 ${selectedCase.accentTextClass}`} aria-hidden="true" />
                  <span className="text-sm font-medium text-white">AI-Powered</span>
                </GlassCard>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="order-1 lg:order-2">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 ${selectedCase.accentTextClass} text-sm font-medium mb-4`}
            >
              <selectedCase.icon className="w-4 h-4" aria-hidden="true" />
              <span>{selectedCase.title}</span>
            </div>

            <h3 className="text-2xl md:text-3xl font-bold text-white mb-4">
              {selectedCase.subtitle}
            </h3>

            <p className="text-slate-300 mb-7 leading-relaxed">
              {selectedCase.description}
            </p>

            <ul className="space-y-3 mb-8">
              {selectedCase.features.map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full bg-gradient-to-r ${selectedCase.gradientClass} flex items-center justify-center flex-shrink-0`}>
                    <CheckCircle className="w-4 h-4 text-white" aria-hidden="true" />
                  </div>
                  <span className="text-slate-300">{feature}</span>
                </li>
              ))}
            </ul>

            <Link
              to={`/signup?plan=free`}
              className={`
                inline-flex items-center justify-center gap-2
                px-7 py-3.5 rounded-xl font-semibold text-white
                bg-gradient-to-r ${selectedCase.gradientClass}
                shadow-lg transition-all duration-200 hover:-translate-y-0.5
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                min-h-[52px] w-full sm:w-auto
              `}
            >
              Get Started
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
          </div>
        </motion.div>

        {/* Bottom testimonial */}
        <div className="mt-12 lg:mt-16">
          <GlassCard variant="md" padding="xl" className="text-center">
            <p className="text-lg md:text-xl text-slate-300 italic mb-5">
              “RawDrive has completely transformed how I deliver photos to my {selectedCase.title.toLowerCase()} clients. The AI features save me hours every week.”
            </p>
            <div className="flex items-center justify-center gap-3">
              <div className={`w-10 h-10 rounded-full bg-gradient-to-r ${selectedCase.gradientClass} flex items-center justify-center text-white font-bold`}>
                P
              </div>
              <div className="text-left">
                <div className="font-semibold text-white">Professional Photographer</div>
                <div className="text-sm text-slate-500">{selectedCase.title} Specialist</div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </section>
  );
};

UseCasesSection.displayName = 'UseCasesSection';

export default UseCasesSection;
