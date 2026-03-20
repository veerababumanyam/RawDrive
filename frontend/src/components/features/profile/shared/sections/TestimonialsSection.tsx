/**
 * TestimonialsSection - Renders client testimonial quote cards.
 * Shows up to 3 testimonials with star ratings.
 */

import React from 'react';
import { m } from 'framer-motion';
import { Star } from 'lucide-react';
import { getTheme } from '../../ProfileThemeEngine';
import type { SectionProps } from '../SectionRegistry';
import type { Testimonial } from '@/types/personalProfile';

const StarRating: React.FC<{ rating: number }> = ({ rating }) => {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${
            i < rating
              ? 'text-yellow-400 fill-yellow-400'
              : 'text-gray-300'
          }`}
        />
      ))}
    </div>
  );
};

export const TestimonialsSection: React.FC<SectionProps> = ({ profileData }) => {
  const testimonials = (profileData.testimonials as Testimonial[]) || [];

  if (testimonials.length === 0) return null;

  const theme = getTheme();
  const displayTestimonials = testimonials.slice(0, 3);

  return (
    <div className="w-full mb-8">
      <div className="flex flex-col gap-4 md:grid md:grid-cols-3 md:gap-4">
        {displayTestimonials.map((testimonial, index) => (
          <m.div
            key={`testimonial-${index}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.1, duration: 0.4 }}
            className={`
              p-5 flex flex-col gap-3
              ${theme.colors.surface} border ${theme.colors.border}
              ${theme.effects.radius} ${theme.effects.shadow}
            `}
          >
            {/* Opening quote mark */}
            <span className={`text-4xl font-serif leading-none opacity-20 ${theme.colors.text}`}>
              &ldquo;
            </span>

            {/* Testimonial text */}
            <p className={`text-sm md:text-base italic line-clamp-3 ${theme.colors.text}`}>
              {testimonial.text}
            </p>

            {/* Client name and rating */}
            <div className="mt-auto flex flex-col gap-1">
              <span className={`text-sm font-semibold ${theme.colors.text}`}>
                {testimonial.client_name}
              </span>
              <StarRating rating={testimonial.rating} />
            </div>
          </m.div>
        ))}
      </div>
    </div>
  );
};
