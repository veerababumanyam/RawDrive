import React from 'react';
import { Star, Quote } from 'lucide-react';
import { GlassCard } from './GlassCard';

/* =============================================================================
   TestimonialCard Component

   Displays customer testimonials with quote, author info, and rating.
   ============================================================================= */

interface TestimonialAuthor {
  name: string;
  title: string;
  avatar?: string;
}

interface TestimonialCardProps {
  /** Testimonial quote */
  quote: string;
  /** Author information */
  author: TestimonialAuthor;
  /** Star rating (1-5) */
  rating: number;
  /** Custom class name */
  className?: string;
}

export const TestimonialCard: React.FC<TestimonialCardProps> = ({
  quote,
  author,
  rating,
  className = '',
}) => {
  // Ensure rating is between 1 and 5
  const normalizedRating = Math.min(5, Math.max(1, Math.round(rating)));

  return (
    <GlassCard
      variant="md"
      padding="lg"
      className={`h-full flex flex-col ${className}`}
    >
      {/* Quote Icon */}
      <div className="mb-4">
        <Quote
          size={32}
          className="text-primary-400/50"
          aria-hidden="true"
        />
      </div>

      {/* Quote Text */}
      <blockquote className="flex-grow">
        <p className="text-lg text-white leading-relaxed italic mb-6">
          "{quote}"
        </p>
      </blockquote>

      {/* Rating */}
      <div
        className="flex items-center gap-1 mb-4"
        aria-label={`Rating: ${normalizedRating} out of 5 stars`}
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            size={16}
            className={
              star <= normalizedRating
                ? 'text-gold-400 fill-current'
                : 'text-slate-600'
            }
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Author */}
      <div className="flex items-center gap-3 pt-4 border-t border-white/10">
        {/* Avatar */}
        {author.avatar ? (
          <img
            src={author.avatar}
            alt={`${author.name}'s profile`}
            className="w-12 h-12 rounded-full object-cover border-2 border-white/10"
          />
        ) : (
          <div className="
            w-12 h-12 rounded-full
            bg-gradient-to-br from-primary-500 to-accent-500
            flex items-center justify-center
            text-white font-semibold text-lg
          ">
            {author.name.charAt(0)}
          </div>
        )}

        {/* Info */}
        <div>
          <cite className="text-white font-semibold not-italic block">
            {author.name}
          </cite>
          <span className="text-sm text-slate-400">
            {author.title}
          </span>
        </div>
      </div>
    </GlassCard>
  );
};

TestimonialCard.displayName = 'TestimonialCard';

export default TestimonialCard;
