import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Image,
  Star,
  Users,
} from 'lucide-react';
import { FadeIn } from '../animations/FadeIn';
import { GlassCard } from '../ui/GlassCard';

/* =============================================================================
   TestimonialsSection Component

   Carousel/grid of customer testimonials with navigation controls.
   ============================================================================= */

interface Testimonial {
  quote: string;
  author: {
    name: string;
    title: string;
    company?: string;
    photo?: string;
  };
  rating: number;
  category?: string;
  stat?: string;
}

interface TestimonialsSectionProps {
  /** Custom class name */
  className?: string;
  /** Section ID for navigation */
  id?: string;
  /** Section title */
  title?: string;
  /** Section subtitle */
  subtitle?: string;
  /** Trust badge text */
  trustBadge?: string;
  /** Testimonials to display */
  testimonials?: Testimonial[];
}

const defaultTestimonials: Testimonial[] = [
  {
    quote:
      "RawDrive transformed how I deliver photos to my clients. The AI tagging saves me hours of work every week, and my clients absolutely love the beautiful galleries. It's been a game-changer for my business.",
    author: {
      name: 'Priya Sharma',
      title: 'Wedding Photographer',
      company: 'Priya Studios',
      photo: '/images/testimonials/priya.jpg',
    },
    category: 'Wedding',
    rating: 5,
    stat: '10hrs saved weekly',
  },
  {
    quote:
      "The print album designer is incredible. I've increased my album sales by 40% since switching to RawDrive. The templates are gorgeous and clients can see proofs instantly.",
    author: {
      name: 'Rahul Verma',
      title: 'Portrait Photographer',
      company: 'Verma Photography',
      photo: '/images/testimonials/rahul.jpg',
    },
    category: 'Portrait',
    rating: 5,
    stat: '40% more sales',
  },
  {
    quote:
      'Client management is so easy now. I can track all my clients, galleries, and deliveries in one place. The face recognition feature is perfect for corporate events!',
    author: {
      name: 'Ananya Patel',
      title: 'Event Photographer',
      company: 'Moments by Ananya',
      photo: '/images/testimonials/ananya.jpg',
    },
    category: 'Event',
    rating: 5,
    stat: '500+ events managed',
  },
  {
    quote:
      'The white-label branding and custom domain features are exactly what my agency clients need. Professional, seamless, and they love it.',
    author: {
      name: 'Vikram Singh',
      title: 'Commercial Photographer',
      company: 'Singh Visuals',
      photo: '/images/testimonials/vikram.jpg',
    },
    category: 'Commercial',
    rating: 5,
    stat: '25+ brand clients',
  },
  {
    quote:
      'Finally, a platform that handles both photos and videos beautifully! My couples can relive their entire wedding day in one stunning gallery.',
    author: {
      name: 'Meera Kapoor',
      title: 'Wedding Videographer',
      company: 'Meera Films',
      photo: '/images/testimonials/meera.jpg',
    },
    category: 'Wedding',
    rating: 5,
    stat: '200+ weddings',
  },
];

const logoBadges = [
  { label: 'Wedding Photography Association', gradient: 'from-gold-500/20 to-primary-600/10' },
  { label: 'PhotoPro Magazine', gradient: 'from-accent-500/20 to-primary-600/10' },
  { label: 'Creative Lens Awards', gradient: 'from-gold-500/15 to-gold-700/10' },
  { label: 'Adobe Partners', gradient: 'from-primary-500/20 to-primary-700/10' },
  { label: 'Google Photos', gradient: 'from-success-500/20 to-success-700/10' },
  { label: 'Professional Photographers', gradient: 'from-primary-600/15 to-accent-600/10' },
];

export const TestimonialsSection: React.FC<TestimonialsSectionProps> = ({
  className = '',
  id = 'testimonials',
  title = 'Loved by Photographers',
  subtitle = 'See what professional photographers are saying about RawDrive.',
  trustBadge = 'Trusted by 20,000+ photographers worldwide',
  testimonials = defaultTestimonials,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isAutoPaused, setIsAutoPaused] = useState(false);

  const pauseTimeoutRef = useRef<number | null>(null);

  const safeTestimonials = useMemo(
    () => (Array.isArray(testimonials) && testimonials.length > 0 ? testimonials : defaultTestimonials),
    [testimonials]
  );

  const totalItems = safeTestimonials.length;

  // When user interacts, pause auto-advance for 30s
  const pauseAutoRotate = () => {
    setIsAutoPaused(true);
    if (pauseTimeoutRef.current) {
      window.clearTimeout(pauseTimeoutRef.current);
    }
    pauseTimeoutRef.current = window.setTimeout(() => {
      setIsAutoPaused(false);
      pauseTimeoutRef.current = null;
    }, 30000); // 30 seconds pause
  };

  const handlePrevious = () => {
    pauseAutoRotate();
    setDirection(-1);
    setCurrentIndex((prev) => (prev === 0 ? totalItems - 1 : prev - 1));
  };

  const handleNext = () => {
    pauseAutoRotate();
    setDirection(1);
    setCurrentIndex((prev) => (prev === totalItems - 1 ? 0 : prev + 1));
  };

  // Throttle auto-advance: only rotate every 20s, and pause after user interaction for 30s
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isAutoPaused) return;
    if (totalItems <= 1) return;

    const id = window.setInterval(() => {
      setDirection(1);
      setCurrentIndex((prev) => (prev === totalItems - 1 ? 0 : prev + 1));
    }, 20000); // 20 seconds per slide

    return () => window.clearInterval(id);
  }, [isAutoPaused, totalItems]);

  useEffect(() => {
    return () => {
      if (pauseTimeoutRef.current) {
        window.clearTimeout(pauseTimeoutRef.current);
        pauseTimeoutRef.current = null;
      }
    };
  }, []);

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -300 : 300,
      opacity: 0,
    }),
  };

  return (
    <section
      id={id}
      className={`py-20 lg:py-32 bg-white/[0.02] ${className}`}
      aria-labelledby="testimonials-heading"
    >
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <FadeIn direction="up" className="text-center mb-12">
          {/* Trust Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-6">
            <Users size={16} className="text-primary-400" />
            <span className="text-sm text-slate-300">{trustBadge}</span>
          </div>

          <h2
            id="testimonials-heading"
            className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4"
          >
            {title}
          </h2>
          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto">
            {subtitle}
          </p>
        </FadeIn>

        {/* Stats bar */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-10">
          {[
            { icon: Users, value: '20,000+', label: 'Happy Photographers' },
            { icon: Image, value: '5M+', label: 'Photos Delivered' },
            { icon: Star, value: '4.9/5', label: 'Average Rating' },
            { icon: Globe, value: '50+', label: 'Countries' },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <GlassCard key={stat.label} variant="sm" padding="lg" className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 mb-3">
                  <Icon className="w-5 h-5 text-accent-400" aria-hidden="true" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-white">{stat.value}</div>
                <div className="text-xs sm:text-sm text-slate-500 mt-1">{stat.label}</div>
              </GlassCard>
            );
          })}
        </div>

        {/* Mobile: carousel */}
        <div className="md:hidden relative">
          <div className="overflow-hidden">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={currentIndex}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <TestimonialTile testimonial={safeTestimonials[currentIndex]} featured />
              </motion.div>
            </AnimatePresence>
          </div>

          {totalItems > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                type="button"
                onClick={handlePrevious}
                className="
                  p-3 rounded-full
                  bg-white/5 hover:bg-white/10
                  border border-white/10 hover:border-white/20
                  text-white transition-all duration-200
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                  min-h-[48px] min-w-[48px]
                "
                aria-label="Previous testimonial"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="flex items-center gap-2">
                {Array.from({ length: totalItems }).map((_, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      pauseAutoRotate();
                      setDirection(idx > currentIndex ? 1 : -1);
                      setCurrentIndex(idx);
                    }}
                    className={`
                      w-2 h-2 rounded-full transition-all duration-200
                      ${idx === currentIndex ? 'bg-primary-500 w-6' : 'bg-white/20 hover:bg-white/40'}
                    `}
                    aria-label={`Go to testimonial ${idx + 1}`}
                    aria-current={idx === currentIndex ? 'true' : undefined}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={handleNext}
                className="
                  p-3 rounded-full
                  bg-white/5 hover:bg-white/10
                  border border-white/10 hover:border-white/20
                  text-white transition-all duration-200
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500
                  min-h-[48px] min-w-[48px]
                "
                aria-label="Next testimonial"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          )}
        </div>

        {/* Desktop: featured grid */}
        <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 lg:grid-rows-2 gap-6">
          <div className="lg:col-span-2 lg:row-span-2">
            <TestimonialTile testimonial={safeTestimonials[0]} featured />
          </div>
          {safeTestimonials.slice(1, 5).map((t) => (
            <TestimonialTile key={t.author.name + t.quote.slice(0, 12)} testimonial={t} />
          ))}
        </div>

        {/* Client Logos */}
        <div className="mt-12 lg:mt-16">
          <div className="text-center text-sm text-slate-500 mb-6">Trusted by the community</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {logoBadges.map((badge) => (
              <div
                key={badge.label}
                className={`
                  px-3 py-2 rounded-xl
                  bg-gradient-to-r ${badge.gradient}
                  border border-white/10
                  text-center text-xs text-slate-300
                `}
              >
                {badge.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

function RatingStars({ rating }: { rating: number }) {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={14}
          className={i < full ? 'text-gold-400 fill-current' : 'text-white/20'}
        />
      ))}
    </div>
  );
}

function TestimonialTile({ testimonial, featured }: { testimonial: Testimonial; featured?: boolean }) {
  return (
    <GlassCard
      variant={featured ? 'lg' : 'md'}
      padding="xl"
      className={`h-full ${featured ? 'relative overflow-hidden' : ''}`}
    >
      {featured && (
        <div
          className="absolute -inset-10 bg-gradient-to-r from-accent-500/10 to-primary-600/10 blur-3xl"
          aria-hidden="true"
        />
      )}
      <div className="relative h-full flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <RatingStars rating={testimonial.rating} />
            {testimonial.category ? (
              <div className="mt-2 inline-flex px-2 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300">
                {testimonial.category}
              </div>
            ) : null}
          </div>

          {testimonial.stat ? (
            <div className="text-right">
              <div className="text-sm font-semibold text-white">{testimonial.stat}</div>
            </div>
          ) : null}
        </div>

        <blockquote className={`text-slate-300 leading-relaxed ${featured ? 'text-lg' : 'text-sm'}`}>
          “{testimonial.quote}”
        </blockquote>

        <div className="mt-6 pt-5 border-t border-white/10 flex items-center gap-3">
          {testimonial.author.photo ? (
            <img
              src={testimonial.author.photo}
              alt={testimonial.author.name}
              className="w-10 h-10 rounded-full object-cover border border-white/10"
              loading="lazy"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500/30 to-accent-500/30 border border-white/10 flex items-center justify-center text-white font-bold">
              {testimonial.author.name.charAt(0)}
            </div>
          )}
          <div>
            <div className="text-white font-semibold">{testimonial.author.name}</div>
            <div className="text-xs text-slate-500">
              {testimonial.author.title}
              {testimonial.author.company ? ` • ${testimonial.author.company}` : ''}
            </div>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

TestimonialsSection.displayName = 'TestimonialsSection';

export default TestimonialsSection;
